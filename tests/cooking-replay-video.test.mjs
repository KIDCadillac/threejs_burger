import test from "node:test";
import assert from "node:assert/strict";

import {
  REPLAY_VIDEO_CANDIDATES,
  createReplayFrameBuffer,
  createReplayVideoExporter,
  extensionForReplayMimeType,
  selectReplayVideoFormat,
} from "../app/static/cooking-replay-video.mjs";

function createMediaRecorderClass({
  supported = [],
  chunks = ["encoded-video"],
  hangOnStop = false,
  constructFailures = [],
  startFailures = [],
} = {}) {
  return class FakeMediaRecorder {
    static instances = [];
    static constructorAttempts = [];

    static isTypeSupported(mimeType) {
      return supported.includes(mimeType);
    }

    constructor(stream, options) {
      this.constructor.constructorAttempts.push(options.mimeType);
      if (constructFailures.includes(options.mimeType)) {
        throw new Error(`constructor rejected ${options.mimeType}`);
      }
      this.stream = stream;
      this.options = options;
      this.state = "inactive";
      this.startCalls = 0;
      this.stopCalls = 0;
      this.constructor.instances.push(this);
    }

    start() {
      this.startCalls += 1;
      if (startFailures.includes(this.options.mimeType)) {
        throw new Error(`start rejected ${this.options.mimeType}`);
      }
      this.state = "recording";
    }

    stop() {
      this.stopCalls += 1;
      this.state = "inactive";
      if (hangOnStop) return;
      queueMicrotask(() => {
        for (const chunk of chunks) {
          this.ondataavailable?.({
            data: new Blob([chunk], { type: this.options.mimeType }),
          });
        }
        this.onstop?.();
      });
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
      let canvas;
      const context = {
        clearRect() {},
        drawImage(source, ...args) {
          draws.push({ source, args });
          canvas.snapshotValue = source?.snapshotValue;
        },
        createImageData(width, height) {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
        putImageData() {},
      };
      canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        captureStream(fps) {
          const track = {
            requestFrameCalls: 0,
            stopCalls: 0,
            requestFrame() { this.requestFrameCalls += 1; },
            stop() { this.stopCalls += 1; },
          };
          const stream = { getTracks: () => [track], track };
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
  assert.deepEqual(REPLAY_VIDEO_CANDIDATES.map(({ recorderMimeType }) => recorderMimeType), [
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
    assert.equal(format.recorderMimeType, expectedMimeType);
    assert.equal(format.mimeType, expectedMimeType.startsWith("video/webm")
      ? "video/webm"
      : "video/mp4");
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
  const harness = createCanvasHarness();
  const buffer = createReplayFrameBuffer({
    documentTarget: harness.documentTarget,
    outputWidth: 4,
    maxDurationMs: 250,
    maxFrames: 3,
  });
  const frame = (id) => ({ id, snapshotValue: id, width: 8, height: 4 });
  buffer.push(frame("zero"), 0);
  buffer.push(frame("one-hundred"), 100);
  buffer.push(frame("five-hundred"), 500);
  buffer.push(frame("three-fifty"), 350);
  buffer.push(frame("four-hundred"), 400);

  const ordered = buffer.snapshot();
  assert.deepEqual(ordered.map(({ frame, timestamp }) => [
    frame.source.snapshotValue,
    timestamp,
  ]), [
    ["three-fifty", 350],
    ["four-hundred", 400],
    ["five-hundred", 500],
  ]);
  ordered.release();
  assert.equal(buffer.size(), 3);
  assert.equal(buffer.durationMs(), 150);

  buffer.push(frame("too-old"), 10);
  const afterOldPush = buffer.snapshot();
  assert.deepEqual(afterOldPush.map(({ frame }) => frame.source.snapshotValue), [
    "three-fifty", "four-hundred", "five-hundred",
  ]);
  afterOldPush.release();
  buffer.dispose();
});

test("replay buffer supports time-window snapshots, clearing, and disposal", () => {
  const harness = createCanvasHarness();
  const buffer = createReplayFrameBuffer({
    documentTarget: harness.documentTarget,
    outputWidth: 4,
    maxDurationMs: 1_000,
    maxFrames: 10,
  });
  const frame = (id) => ({ id, snapshotValue: id, width: 8, height: 4 });
  buffer.push(frame("a"), 100);
  buffer.push(frame("b"), 200);
  buffer.push(frame("c"), 300);
  const retained = buffer.snapshot();
  const windowed = buffer.snapshot({ fromTimestamp: 150, toTimestamp: 250 });
  assert.deepEqual(windowed.map(({ frame }) => frame.source.snapshotValue), ["b"]);
  windowed.release();
  assert.equal(buffer.clear(), 3);
  assert.deepEqual(retained.map(({ frame }) => [frame.source.width, frame.source.height]), [
    [4, 2], [4, 2], [4, 2],
  ]);
  assert.equal(retained.release(), true);
  assert.equal(retained.release(), false);
  assert.deepEqual(retained.map(({ frame }) => [frame.source.width, frame.source.height]), [
    [0, 0], [0, 0], [0, 0],
  ]);
  assert.equal(buffer.size(), 0);
  buffer.push(frame("d"), 400);
  const disposedSnapshot = buffer.snapshot();
  const disposedFrame = disposedSnapshot[0].frame;
  buffer.dispose();
  assert.deepEqual([disposedFrame.source.width, disposedFrame.source.height], [4, 2]);
  disposedSnapshot.release();
  assert.deepEqual([disposedFrame.source.width, disposedFrame.source.height], [0, 0]);
  assert.equal(buffer.size(), 0);
  assert.equal(buffer.push(frame("ignored"), 500), false);
});

test("replay buffer snapshots mutable canvases at target size and releases evictions", () => {
  const harness = createCanvasHarness();
  const buffer = createReplayFrameBuffer({
    documentTarget: harness.documentTarget,
    outputWidth: 4,
    maxDurationMs: 1_000,
    maxFrames: 2,
  });
  const sharedCanvas = { width: 8, height: 4, snapshotValue: "first" };
  buffer.push(sharedCanvas, 0);
  const firstLease = buffer.snapshot();
  const firstSnapshot = firstLease[0].frame;

  sharedCanvas.snapshotValue = "second";
  buffer.push(sharedCanvas, 100);
  const twoSnapshotLease = buffer.snapshot();
  const twoSnapshots = twoSnapshotLease.map(({ frame }) => frame);
  firstLease.release();

  assert.notEqual(twoSnapshots[0].source, twoSnapshots[1].source);
  assert.deepEqual(twoSnapshots.map(({ source }) => source.snapshotValue), ["first", "second"]);
  assert.deepEqual(twoSnapshots.map(({ width, height }) => [width, height]), [[4, 2], [4, 2]]);

  sharedCanvas.snapshotValue = "third";
  buffer.push(sharedCanvas, 200);
  assert.deepEqual([firstSnapshot.source.width, firstSnapshot.source.height], [4, 2]);
  const current = buffer.snapshot();
  assert.deepEqual(
    current.map(({ frame }) => frame.source.snapshotValue),
    ["second", "third"],
  );
  current.release();
  twoSnapshotLease.release();
  assert.deepEqual([firstSnapshot.source.width, firstSnapshot.source.height], [0, 0]);
  buffer.dispose();
});

test("video exporter preserves exact source timestamp intervals instead of delaying to fps grid", async () => {
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
  const sourceA = { id: "a", videoWidth: 640, videoHeight: 320, width: 1, height: 1 };
  const sourceB = { id: "b", videoWidth: 640, videoHeight: 320, width: 1, height: 1 };
  const sourceC = { id: "c", videoWidth: 640, videoHeight: 320, width: 1, height: 1 };

  const result = await exporter.exportFrames([
    { frame: { source: sourceC, width: 9, height: 9 }, timestamp: 200 },
    { frame: { source: sourceA, width: 9, height: 9 }, timestamp: 0 },
    { frame: { source: sourceB, width: 9, height: 9 }, timestamp: 100 },
  ], {
    onProgress(value) { progress.push(value); },
  });

  assert.equal(result.blob.type, "video/webm");
  assert.ok(result.blob.size > 0);
  assert.equal(result.mimeType, "video/webm");
  assert.equal(result.containerMimeType, "video/webm");
  assert.equal(result.recorderMimeType, "video/webm;codecs=vp8");
  assert.equal(result.extension, "webm");
  assert.equal(result.fileName, "replay.webm");
  assert.equal(result.width, 480);
  assert.equal(result.height, 240);
  assert.equal(result.fps, 12);
  assert.ok(Math.abs(result.durationMs - (200 + (1000 / 12))) < 1e-8);
  assert.deepEqual(harness.draws.map(({ source }) => source.id), ["a", "b", "c"]);
  assert.deepEqual(waits.slice(0, 2), [100, 100]);
  assert.ok(Math.abs(waits[2] - (1000 / 12)) < 1e-8);
  assert.deepEqual(progress.at(-1), { completed: 3, total: 3, ratio: 1 });
  assert.equal(harness.streams[0].fps, 12);
  assert.equal(harness.streams[0].track.requestFrameCalls, 3);
  assert.equal(harness.streams[0].track.stopCalls, 1);
  assert.deepEqual(MediaRecorderImpl.instances[0].options, {
    mimeType: "video/webm;codecs=vp8",
    videoBitsPerSecond: 800_000,
  });
  exporter.dispose();
});

test("video exporter rejects overlong timestamp gaps with timeout armed before preparation", async () => {
  const order = [];
  const timers = createFakeTimers();
  const harness = createCanvasHarness();
  const originalCreateElement = harness.documentTarget.createElement;
  harness.documentTarget.createElement = (...args) => {
    const canvas = originalCreateElement(...args);
    const originalCaptureStream = canvas.captureStream;
    canvas.captureStream = (...captureArgs) => {
      order.push("capture-stream");
      return originalCaptureStream.apply(canvas, captureArgs);
    };
    return canvas;
  };
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl: createMediaRecorderClass({ supported: ["video/webm;codecs=vp8"] }),
    maxDurationMs: 8_000,
    timeoutMs: 20_000,
    setTimeoutImpl(callback, delay) {
      order.push("timeout-armed");
      return timers.set(callback, delay);
    },
    clearTimeoutImpl: timers.clear,
    sleepImpl: async () => {},
  });

  await assert.rejects(
    exporter.exportFrames([
      { frame: { source: { width: 4, height: 2 } }, timestamp: 0 },
      { frame: { source: { width: 4, height: 2 } }, timestamp: 60_000 },
    ]),
    (error) => error.code === "VIDEO_REPLAY_DURATION_LIMIT"
      && error.maxDurationMs === 8_000,
  );
  assert.deepEqual(order, ["timeout-armed"]);
  assert.equal(timers.count(), 0);
  exporter.dispose();
});

test("export owns a frozen buffer snapshot until completion and then releases retired frames", async () => {
  const harness = createCanvasHarness();
  const buffer = createReplayFrameBuffer({
    documentTarget: harness.documentTarget,
    outputWidth: 4,
    maxDurationMs: 100,
    maxFrames: 10,
  });
  buffer.push({ width: 8, height: 4, snapshotValue: "before-a" }, 0);
  buffer.push({ width: 8, height: 4, snapshotValue: "before-b" }, 50);
  const frozen = buffer.snapshot();

  buffer.push({ width: 8, height: 4, snapshotValue: "after" }, 200);
  assert.deepEqual(
    frozen.map(({ frame }) => [frame.source.width, frame.source.height]),
    [[4, 2], [4, 2]],
  );

  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl: createMediaRecorderClass({ supported: ["video/webm;codecs=vp8"] }),
    sleepImpl: async () => {},
  });
  await exporter.exportFrames(frozen);
  assert.deepEqual(
    [harness.canvases.at(-1).width, harness.canvases.at(-1).height],
    [0, 0],
  );
  assert.deepEqual(
    frozen.map(({ frame }) => [frame.source.width, frame.source.height]),
    [[0, 0], [0, 0]],
  );
  assert.equal(frozen.release(), false);
  buffer.dispose();
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
  assert.equal(result.recorderMimeType, "video/mp4");
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

test("invalid first-frame dimensions reject asynchronously instead of throwing", async () => {
  const exporter = createReplayVideoExporter({
    MediaRecorderImpl: createMediaRecorderClass({ supported: ["video/webm;codecs=vp8"] }),
    documentTarget: createCanvasHarness().documentTarget,
  });
  let synchronous = true;
  const pending = exporter.exportFrames([{
    frame: { source: { width: 0, height: 0 } }, timestamp: 0,
  }]).catch((error) => {
    assert.equal(synchronous, false);
    throw error;
  });
  synchronous = false;

  await assert.rejects(pending, (error) => error.code === "VIDEO_REPLAY_INVALID_FRAME");
  exporter.dispose();
});

test("video exporter falls through constructor and start failures to the next codec", async () => {
  const supported = REPLAY_VIDEO_CANDIDATES.map(({ recorderMimeType }) => recorderMimeType);
  const MediaRecorderImpl = createMediaRecorderClass({
    supported,
    constructFailures: ["video/webm;codecs=vp9"],
    startFailures: ["video/webm;codecs=vp8"],
  });
  const harness = createCanvasHarness();
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
    sleepImpl: async () => {},
  });

  const result = await exporter.exportFrames([{
    frame: { source: { width: 4, height: 2 } }, timestamp: 0,
  }]);

  assert.equal(result.recorderMimeType, "video/mp4;codecs=avc1.42E01E");
  assert.equal(result.mimeType, "video/mp4");
  assert.equal(result.extension, "mp4");
  assert.deepEqual(MediaRecorderImpl.constructorAttempts, [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/mp4;codecs=avc1.42E01E",
  ]);
  assert.equal(harness.streams.length, 3);
  assert.deepEqual(harness.streams.map(({ track }) => track.stopCalls), [1, 1, 1]);
  exporter.dispose();
});

test("video exporter reports all attempted codecs when every recorder fails to start", async () => {
  const supported = REPLAY_VIDEO_CANDIDATES.map(({ recorderMimeType }) => recorderMimeType);
  const MediaRecorderImpl = createMediaRecorderClass({ supported, startFailures: supported });
  const harness = createCanvasHarness();
  const exporter = createReplayVideoExporter({
    documentTarget: harness.documentTarget,
    MediaRecorderImpl,
  });

  await assert.rejects(
    exporter.exportFrames([{
      frame: { source: { width: 4, height: 2 } }, timestamp: 0,
    }]),
    (error) => error.code === "VIDEO_REPLAY_ENCODING_FAILED"
      && assert.deepEqual(error.attemptedRecorderMimeTypes, supported) === undefined,
  );
  assert.deepEqual(harness.streams.map(({ track }) => track.stopCalls), [1, 1, 1, 1]);
  exporter.dispose();
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
