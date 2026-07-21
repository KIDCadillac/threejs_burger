import test from "node:test";
import assert from "node:assert/strict";

import {
  REPLAY_VIDEO_CANDIDATES,
  createReplayFrameBuffer,
  createReplayVideoExporter,
  extensionForReplayMimeType,
  selectReplayVideoFormat,
} from "../app/static/cooking-replay-video.mjs";

function createMediaRecorderClass({ supported = [], chunks = ["encoded-video"], hangOnStop = false } = {}) {
  return class FakeMediaRecorder {
    static instances = [];

    static isTypeSupported(mimeType) {
      return supported.includes(mimeType);
    }

    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = "inactive";
      this.startCalls = 0;
      this.stopCalls = 0;
      this.constructor.instances.push(this);
    }

    start() {
      this.startCalls += 1;
      this.state = "recording";
    }

    stop() {
      this.stopCalls += 1;
      this.state = "inactive";
      if (hangOnStop) return;
      for (const chunk of chunks) {
        this.ondataavailable?.({
          data: new Blob([chunk], { type: this.options.mimeType }),
        });
      }
      this.onstop?.();
    }
  };
}

function createCanvasHarness() {
  const draws = [];
  const streams = [];
  const canvases = [];
  const documentTarget = {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      const context = {
        clearRect() {},
        drawImage(source, ...args) { draws.push({ source, args }); },
        createImageData(width, height) {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
        putImageData() {},
      };
      const track = {
        requestFrameCalls: 0,
        stopCalls: 0,
        requestFrame() { this.requestFrameCalls += 1; },
        stop() { this.stopCalls += 1; },
      };
      const stream = { getTracks: () => [track], track };
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        captureStream(fps) {
          stream.fps = fps;
          streams.push(stream);
          return stream;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  return { canvases, documentTarget, draws, streams };
}

function createFakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    set(callback, delay) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
    clear(id) { pending.delete(id); },
    fire(delay) {
      const found = [...pending.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(found, `expected ${delay}ms timer`);
      const [id, timer] = found;
      pending.delete(id);
      timer.callback();
    },
    count: () => pending.size,
  };
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (check()) return;
    await Promise.resolve();
  }
  assert.fail("condition did not become true");
}

test("video format selection prefers VP9, VP8, AVC MP4, then plain MP4", () => {
  assert.deepEqual(REPLAY_VIDEO_CANDIDATES.map(({ mimeType }) => mimeType), [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
  ]);

  for (const [supported, expectedMimeType, expectedExtension] of [
    [["video/webm;codecs=vp9", "video/mp4"], "video/webm;codecs=vp9", "webm"],
    [["video/webm;codecs=vp8", "video/mp4"], "video/webm;codecs=vp8", "webm"],
    [["video/mp4;codecs=avc1.42E01E", "video/mp4"], "video/mp4;codecs=avc1.42E01E", "mp4"],
    [["video/mp4"], "video/mp4", "mp4"],
  ]) {
    const MediaRecorderImpl = createMediaRecorderClass({ supported });
    const format = selectReplayVideoFormat({ MediaRecorderImpl });
    assert.equal(format.mimeType, expectedMimeType);
    assert.equal(format.extension, expectedExtension);
  }
});

test("video format selection uses feature detection and returns null when unsupported", () => {
  assert.equal(selectReplayVideoFormat({ MediaRecorderImpl: undefined }), null);
  assert.equal(selectReplayVideoFormat({ MediaRecorderImpl: class {} }), null);
  assert.equal(
    selectReplayVideoFormat({ MediaRecorderImpl: createMediaRecorderClass({ supported: [] }) }),
    null,
  );
  assert.equal(extensionForReplayMimeType("video/webm;codecs=vp8"), "webm");
  assert.equal(extensionForReplayMimeType("video/mp4;codecs=avc1.42E01E"), "mp4");
  assert.equal(extensionForReplayMimeType("image/gif"), null);
});

test("timestamped replay buffer is ordered and bounded by duration and frame count", () => {
  const buffer = createReplayFrameBuffer({ maxDurationMs: 250, maxFrames: 3 });
  buffer.push({ id: "zero" }, 0);
  buffer.push({ id: "one-hundred" }, 100);
  buffer.push({ id: "five-hundred" }, 500);
  buffer.push({ id: "three-fifty" }, 350);
  buffer.push({ id: "four-hundred" }, 400);

  assert.deepEqual(buffer.snapshot().map(({ frame, timestamp }) => [frame.id, timestamp]), [
    ["three-fifty", 350],
    ["four-hundred", 400],
    ["five-hundred", 500],
  ]);
  assert.equal(buffer.size(), 3);
  assert.equal(buffer.durationMs(), 150);

  buffer.push({ id: "too-old" }, 10);
  assert.deepEqual(buffer.snapshot().map(({ frame }) => frame.id), [
    "three-fifty", "four-hundred", "five-hundred",
  ]);
});

test("replay buffer supports time-window snapshots, clearing, and disposal", () => {
  const buffer = createReplayFrameBuffer({ maxDurationMs: 1_000, maxFrames: 10 });
  buffer.push({ id: "a" }, 100);
  buffer.push({ id: "b" }, 200);
  buffer.push({ id: "c" }, 300);
  assert.deepEqual(
    buffer.snapshot({ fromTimestamp: 150, toTimestamp: 250 }).map(({ frame }) => frame.id),
    ["b"],
  );
  assert.equal(buffer.clear(), 3);
  assert.equal(buffer.size(), 0);
  buffer.push({ id: "d" }, 400);
  buffer.dispose();
  assert.equal(buffer.size(), 0);
  assert.equal(buffer.push({ id: "ignored" }, 500), false);
});

test("video exporter renders timestamp order at 480px and 12fps with progress", async () => {
  const supported = ["video/webm;codecs=vp8"];
  const MediaRecorderImpl = createMediaRecorderClass({ supported });
  const harness = createCanvasHarness();
  const waits = [];
  const progress = [];
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
    sleepImpl: async (delay) => { waits.push(delay); },
    timeoutMs: 5_000,
  });
  const sourceA = { id: "a", width: 640, height: 320 };
  const sourceB = { id: "b", width: 640, height: 320 };
  const sourceC = { id: "c", width: 640, height: 320 };

  const result = await exporter.exportFrames([
    { frame: { source: sourceC, width: 640, height: 320 }, timestamp: 200 },
    { frame: { source: sourceA, width: 640, height: 320 }, timestamp: 0 },
    { frame: { source: sourceB, width: 640, height: 320 }, timestamp: 100 },
  ], {
    onProgress(value) { progress.push(value); },
  });

  assert.equal(result.blob.type, "video/webm;codecs=vp8");
  assert.ok(result.blob.size > 0);
  assert.equal(result.mimeType, "video/webm;codecs=vp8");
  assert.equal(result.extension, "webm");
  assert.equal(result.width, 480);
  assert.equal(result.height, 240);
  assert.equal(result.fps, 12);
  assert.deepEqual(harness.draws.map(({ source }) => source.id), ["a", "b", "c"]);
  assert.deepEqual(waits, [1000 / 12, 1000 / 12, 1000 / 12]);
  assert.deepEqual(progress, [
    { completed: 1, total: 3, ratio: 1 / 3 },
    { completed: 2, total: 3, ratio: 2 / 3 },
    { completed: 3, total: 3, ratio: 1 },
  ]);
  assert.equal(harness.streams[0].fps, 12);
  assert.equal(harness.streams[0].track.requestFrameCalls, 3);
  assert.equal(harness.streams[0].track.stopCalls, 1);
  assert.equal(MediaRecorderImpl.instances[0].options.videoBitsPerSecond, 800_000);
  exporter.dispose();
});

test("video exporter accepts RGBA frames through an offscreen scratch canvas", async () => {
  const MediaRecorderImpl = createMediaRecorderClass({ supported: ["video/mp4"] });
  const harness = createCanvasHarness();
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
    sleepImpl: async () => {},
  });
  const rgba = new Uint8ClampedArray(4 * 2 * 4).fill(127);

  const result = await exporter.exportFrames([
    { frame: { rgba, width: 4, height: 2 }, timestamp: 1 },
  ]);

  assert.equal(result.mimeType, "video/mp4");
  assert.equal(result.extension, "mp4");
  assert.equal(harness.canvases.length, 2);
  assert.equal(harness.draws.length, 1);
  exporter.dispose();
});

test("unsupported video export returns an explicit fallback error", async () => {
  const exporter = createReplayVideoExporter({
    MediaRecorderImpl: createMediaRecorderClass({ supported: [] }),
    documentTarget: createCanvasHarness().documentTarget,
  });

  await assert.rejects(
    exporter.exportFrames([{ frame: { source: { width: 2, height: 2 } }, timestamp: 0 }]),
    (error) => error.code === "VIDEO_REPLAY_UNSUPPORTED" && error.fallback === "gif",
  );
});

test("video exporter rejects no frames and empty encoder output", async () => {
  const harness = createCanvasHarness();
  const MediaRecorderImpl = createMediaRecorderClass({
    supported: ["video/webm;codecs=vp9"],
    chunks: [],
  });
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
    sleepImpl: async () => {},
  });

  await assert.rejects(exporter.exportFrames([]), (error) => error.code === "NO_REPLAY_FRAMES");
  await assert.rejects(
    exporter.exportFrames([{
      frame: { source: { width: 2, height: 2 } }, timestamp: 0,
    }]),
    (error) => error.code === "VIDEO_REPLAY_EMPTY",
  );
  exporter.dispose();
});

test("video exporter times out, stops recording, and releases the stream", async () => {
  const timers = createFakeTimers();
  const MediaRecorderImpl = createMediaRecorderClass({
    supported: ["video/webm;codecs=vp8"],
    hangOnStop: true,
  });
  const harness = createCanvasHarness();
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
    sleepImpl: () => new Promise(() => {}),
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
    timeoutMs: 1_234,
  });
  const pending = exporter.exportFrames([{
    frame: { source: { width: 2, height: 2 } }, timestamp: 0,
  }]);
  await waitFor(() => MediaRecorderImpl.instances.length === 1);

  timers.fire(1_234);
  await assert.rejects(pending, (error) => error.code === "VIDEO_REPLAY_TIMEOUT");
  assert.equal(MediaRecorderImpl.instances[0].stopCalls, 1);
  assert.equal(harness.streams[0].track.stopCalls, 1);
  assert.equal(timers.count(), 0);
  assert.equal(exporter.stop(), false);
  exporter.dispose();
});

test("video exporter stops an active recorder after an encoder error", async () => {
  const MediaRecorderImpl = createMediaRecorderClass({
    supported: ["video/webm;codecs=vp8"],
    hangOnStop: true,
  });
  const harness = createCanvasHarness();
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
    sleepImpl: () => new Promise(() => {}),
  });
  const pending = exporter.exportFrames([{
    frame: { source: { width: 2, height: 2 } }, timestamp: 0,
  }]);
  await waitFor(() => MediaRecorderImpl.instances.length === 1);

  MediaRecorderImpl.instances[0].onerror({ error: new Error("codec crashed") });
  await assert.rejects(
    pending,
    (error) => error.code === "VIDEO_REPLAY_ENCODING_FAILED"
      && error.cause?.message === "codec crashed",
  );
  assert.equal(MediaRecorderImpl.instances[0].stopCalls, 1);
  assert.equal(harness.streams[0].track.stopCalls, 1);
  exporter.dispose();
});

test("stop cancels an active export and dispose revokes all managed URLs", async () => {
  const MediaRecorderImpl = createMediaRecorderClass({
    supported: ["video/mp4"],
    hangOnStop: true,
  });
  const harness = createCanvasHarness();
  const created = [];
  const revoked = [];
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
    sleepImpl: () => new Promise(() => {}),
    URLImpl: {
      createObjectURL(blob) { const url = `blob:replay-${created.length}`; created.push([url, blob]); return url; },
      revokeObjectURL(url) { revoked.push(url); },
    },
  });
  const firstUrl = exporter.createObjectUrl(new Blob(["one"], { type: "video/mp4" }));
  const secondUrl = exporter.createObjectUrl(new Blob(["two"], { type: "video/mp4" }));
  assert.equal(exporter.revokeObjectUrl(firstUrl), true);
  assert.equal(exporter.revokeObjectUrl(firstUrl), false);

  const pending = exporter.exportFrames([{
    frame: { source: { width: 2, height: 2 } }, timestamp: 0,
  }]);
  await waitFor(() => MediaRecorderImpl.instances.length === 1);
  assert.equal(exporter.stop(), true);
  await assert.rejects(pending, (error) => error.code === "VIDEO_REPLAY_CANCELLED");
  assert.equal(harness.streams[0].track.stopCalls, 1);

  exporter.dispose();
  assert.deepEqual(revoked, [firstUrl, secondUrl]);
  assert.throws(
    () => exporter.createObjectUrl(new Blob(["three"])),
    (error) => error.code === "VIDEO_REPLAY_DISPOSED",
  );
  await assert.rejects(
    exporter.exportFrames([{ frame: { source: { width: 2, height: 2 } }, timestamp: 0 }]),
    (error) => error.code === "VIDEO_REPLAY_DISPOSED",
  );
});
