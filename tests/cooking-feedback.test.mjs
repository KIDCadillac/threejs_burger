import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCookingReportMetadata,
  createCanvasReplayRecorder,
  createCookingFeedbackReporter,
  createGoogleDriveFeedbackUploader,
  encodeReplayGif,
} from "../app/static/cooking-feedback.mjs";
import { MAX_SOLO_STACK_LAYERS } from "../app/static/cooking-solo-state.mjs";

function element(overrides = {}) {
  return {
    hidden: false,
    textContent: "",
    value: "",
    src: "",
    disabled: false,
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
    ...overrides,
  };
}

function createFakeTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    set(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clear(id) { timers.delete(id); },
    fire(delay) {
      const match = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(match, `expected a ${delay}ms timer`);
      const [id, timer] = match;
      timers.delete(id);
      timer.callback();
    },
    count: () => timers.size,
  };
}

class FakeAbortController {
  static last = null;

  constructor() {
    this.abortCalls = 0;
    this.signal = { aborted: false };
    FakeAbortController.last = this;
  }

  abort() {
    this.abortCalls += 1;
    this.signal.aborted = true;
  }
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await Promise.resolve();
  }
  assert.fail("condition did not become true");
}

test("report metadata contains the player's message and bounded cooking diagnostics", () => {
  const metadata = buildCookingReportMetadata({
    message: "第八层芝士放下后浮空",
    generatedAt: "2026-07-21T10:00:00.000Z",
    pageUrl: "https://kidcadillac.github.io/threejs_burger/cooking.html",
    userAgent: "Mobile QA",
    context: {
      focused: false,
      state: {
        assembledOrder: ["bottom-bun", "cheese#2"],
        instances: { "bottom-bun": "bottom-bun", "cheese#2": "cheese" },
        inventory: { cheese: 997 },
        strokes: [{ sauce: "mustard", layerId: "cheese#2" }],
      },
    },
  });

  assert.equal(metadata.message, "第八层芝士放下后浮空");
  assert.equal(metadata.stackLayers, 2);
  assert.equal(metadata.inventory.cheese, 997);
  assert.equal(metadata.sauceStrokes, 1);
  assert.deepEqual(metadata.assembledIngredients, ["bottom-bun", "cheese"]);
  assert.ok(JSON.stringify(metadata).length < 5000);
});

test("report metadata preserves all sixty maximum-stack ingredients", () => {
  const assembledOrder = Array.from(
    { length: MAX_SOLO_STACK_LAYERS },
    (_, index) => `layer-${index + 1}`,
  );
  const instances = Object.fromEntries(
    assembledOrder.map((id, index) => [id, `ingredient-${index + 1}`]),
  );

  const metadata = buildCookingReportMetadata({
    message: "最高汉堡的最后几层不见了",
    context: { state: { assembledOrder, instances } },
  });

  assert.equal(MAX_SOLO_STACK_LAYERS, 60);
  assert.equal(metadata.stackLayers, MAX_SOLO_STACK_LAYERS);
  assert.equal(metadata.assembledIngredients.length, MAX_SOLO_STACK_LAYERS);
  assert.deepEqual(metadata.assembledIngredients.slice(0, 2), [
    "ingredient-1",
    "ingredient-2",
  ]);
  assert.deepEqual(metadata.assembledIngredients.slice(-2), [
    "ingredient-59",
    "ingredient-60",
  ]);
});

test("GIF encoder returns an animated GIF byte stream", async () => {
  const red = new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255,
    255, 0, 0, 255, 255, 0, 0, 255,
  ]);
  const blue = new Uint8ClampedArray([
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
  ]);
  const bytes = await encodeReplayGif([
    { rgba: red, width: 2, height: 2 },
    { rgba: blue, width: 2, height: 2 },
  ], { delay: 250 });

  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
  assert.ok(bytes.length > 30);
  assert.equal(bytes.at(-1), 0x3b);
});

test("GIF encoder reports progress and yields between frames", async () => {
  const onePixelFrame = {
    rgba: new Uint8ClampedArray([255, 128, 0, 255]),
    width: 1,
    height: 1,
  };
  const progress = [];
  let yields = 0;

  const bytes = await encodeReplayGif(Array(18).fill(onePixelFrame), {
    delay: 333,
    onProgress({ completed, total }) { progress.push([completed, total]); },
    async yieldFrame() { yields += 1; },
  });

  assert.deepEqual(progress, Array.from({ length: 18 }, (_, index) => [index + 1, 18]));
  assert.equal(yields, 17);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
});

test("replay recorder snapshots the buffered 2D frame instead of a cleared WebGL canvas", () => {
  let afterRender = null;
  let unsubscribeCalls = 0;
  const frameCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(480 * 240 * 4) }),
    }),
    toDataURL: () => "data:image/png;base64,visible-frame",
  };
  const sourceCanvas = {
    width: 480,
    height: 240,
    toDataURL: () => "data:image/png;base64,cleared-webgl-buffer",
  };
  const recorder = createCanvasReplayRecorder({
    canvas: sourceCanvas,
    documentTarget: { createElement: () => frameCanvas },
    windowTarget: {
      setInterval: () => 1,
      clearInterval() {},
    },
    subscribeFrame(callback) {
      afterRender = callback;
      return () => { unsubscribeCalls += 1; };
    },
  });

  assert.equal(recorder.start(), true);
  afterRender(250);
  assert.equal(recorder.snapshotDataUrl(), "data:image/png;base64,visible-frame");
  assert.equal(frameCanvas.width, 480);
  assert.equal(frameCanvas.height, 240);
  recorder.dispose();
  assert.equal(unsubscribeCalls, 1);
});

test("replay recorder uses the signed six-second 480p video defaults and resumes after stop", () => {
  let afterRender = null;
  let unsubscribeCalls = 0;
  let subscribeCalls = 0;
  const exporterConfigurations = [];
  const frameCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(480 * 240 * 4) }),
    }),
  };
  const recorder = createCanvasReplayRecorder({
    canvas: { width: 480, height: 240 },
    documentTarget: { createElement: () => frameCanvas },
    subscribeFrame(callback) {
      subscribeCalls += 1;
      afterRender = callback;
      return () => { unsubscribeCalls += 1; };
    },
    createVideoExporter(configuration) {
      exporterConfigurations.push(configuration);
      return { exportFrames() {}, dispose() {} };
    },
  });

  recorder.start();
  for (let index = 0; index < 100; index += 1) afterRender(index * 84);
  assert.equal(frameCanvas.width, 480);
  assert.equal(frameCanvas.height, 240);
  assert.equal(recorder.frameCount(), 72);
  assert.deepEqual(exporterConfigurations.map((configuration) => ({
    outputWidth: configuration.outputWidth,
    fps: configuration.fps,
    videoBitsPerSecond: configuration.videoBitsPerSecond,
    maxDurationMs: configuration.maxDurationMs,
  })), [{
    outputWidth: 480,
    fps: 12,
    videoBitsPerSecond: 750_000,
    maxDurationMs: 6_000,
  }]);

  assert.equal(recorder.stop(), true);
  assert.equal(unsubscribeCalls, 1);
  assert.equal(recorder.frameCount(), 72);
  assert.equal(recorder.start(), true);
  assert.equal(subscribeCalls, 2);
  recorder.dispose();
});

test("replay recorder falls back to bounded defaults for invalid dimensions and timing", () => {
  let intervalCallback = null;
  let intervalDelay = null;
  let exporterConfiguration = null;
  const frameCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(480 * 240 * 4) }),
    }),
  };
  const recorder = createCanvasReplayRecorder({
    canvas: { width: 480, height: 240 },
    fps: Number.NaN,
    seconds: Number.POSITIVE_INFINITY,
    width: -1,
    documentTarget: { createElement: () => frameCanvas },
    windowTarget: {
      setInterval(callback, delay) {
        intervalCallback = callback;
        intervalDelay = delay;
        return 1;
      },
      clearInterval() {},
    },
    createVideoExporter(configuration) {
      exporterConfiguration = configuration;
      return { exportFrames() {}, dispose() {} };
    },
  });

  recorder.start();
  for (let index = 0; index < 100; index += 1) intervalCallback();

  assert.equal(intervalDelay, 83);
  assert.equal(frameCanvas.width, 480);
  assert.equal(frameCanvas.height, 240);
  assert.equal(recorder.frameCount(), 72);
  assert.deepEqual({
    outputWidth: exporterConfiguration.outputWidth,
    fps: exporterConfiguration.fps,
    videoBitsPerSecond: exporterConfiguration.videoBitsPerSecond,
    maxDurationMs: exporterConfiguration.maxDurationMs,
  }, {
    outputWidth: 480,
    fps: 12,
    videoBitsPerSecond: 750_000,
    maxDurationMs: 6_000,
  });
  recorder.dispose();
});

test("replay recorder returns detached timestamped snapshots in monotonic order", () => {
  let afterRender = null;
  let fill = 1;
  const recorder = createCanvasReplayRecorder({
    canvas: { width: 4, height: 2 },
    width: 4,
    fps: 10,
    seconds: 1,
    now: () => 90,
    documentTarget: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage() {},
          getImageData() {
            return { data: new Uint8ClampedArray(4 * 2 * 4).fill(fill++) };
          },
        }),
      }),
    },
    subscribeFrame(callback) {
      afterRender = callback;
      return () => {};
    },
  });

  recorder.start();
  afterRender(200);
  afterRender(150);
  afterRender(310);
  const first = recorder.snapshotFrames();
  const firstPixel = first[0].rgba[0];
  recorder.capture(450);
  first[0].rgba[0] = 255;
  const second = recorder.snapshotFrames();

  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.every(Object.isFrozen), true);
  assert.ok(first.every((frame, index) => index === 0 || frame.timestamp > first[index - 1].timestamp));
  assert.equal(second[0].rgba[0], firstPixel);
  assert.equal(second.length, first.length + 1);
  recorder.dispose();
});

test("replay recorder exports a timestamped video snapshot through the injected exporter", async () => {
  const exports = [];
  const progress = [];
  let stopCalls = 0;
  const video = new Blob(["compact-video"], { type: "video/webm" });
  const recorder = createCanvasReplayRecorder({
    canvas: { width: 4, height: 2 },
    width: 4,
    now: () => 100,
    documentTarget: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray(4 * 2 * 4) }),
        }),
      }),
    },
    windowTarget: { setInterval: () => 1, clearInterval() {} },
    videoExporter: {
      async exportFrames(frames, options) {
        exports.push(frames);
        options.onProgress({ completed: 1, total: frames.length });
        return { blob: video };
      },
      stop() { stopCalls += 1; return true; },
      dispose() {},
    },
  });
  recorder.start();

  const result = await recorder.exportVideo({
    onProgress(value) { progress.push(value); },
  });

  assert.strictEqual(result, video);
  assert.equal(exports.length, 1);
  assert.equal(Object.isFrozen(exports[0]), true);
  assert.equal(exports[0].length, 1);
  assert.equal(Number.isFinite(exports[0][0].timestamp), true);
  assert.deepEqual(progress, [{ completed: 1, total: 1 }]);
  assert.equal(recorder.cancelVideoExport(), true);
  assert.equal(stopCalls, 1);
  recorder.dispose();
});

test("replay recorder serializes public video exports in call order and continues after failure", async () => {
  const started = [];
  let rejectFirstExport;
  const secondVideo = new Blob(["second-video"], { type: "video/webm" });
  const recorder = createCanvasReplayRecorder({
    canvas: { width: 4, height: 2 },
    width: 4,
    documentTarget: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray(4 * 2 * 4) }),
        }),
      }),
    },
    videoExporter: {
      exportFrames(frames) {
        started.push(frames[0].label);
        if (started.length === 1) {
          return new Promise((resolve, reject) => { rejectFirstExport = reject; });
        }
        return Promise.resolve({ blob: secondVideo });
      },
      dispose() {},
    },
  });
  const frames = (label, timestamp) => Object.freeze([Object.freeze({
    label,
    rgba: new Uint8ClampedArray([0, 0, 0, 255]),
    width: 1,
    height: 1,
    timestamp,
  })]);

  const first = recorder.exportVideo({ frames: frames("highlight", 100) });
  const firstFailure = assert.rejects(first, (error) => (
    error.code === "VIDEO_REPLAY_ENCODING_FAILED"
    && error.cause?.message === "first export failed"
  ));
  const second = recorder.exportVideo({ frames: frames("feedback", 200) });
  await waitFor(() => typeof rejectFirstExport === "function");
  await Promise.resolve();
  const startedBeforeFirstSettled = [...started];

  rejectFirstExport(new Error("first export failed"));
  await firstFailure;
  assert.strictEqual(await second, secondVideo);

  assert.deepEqual(startedBeforeFirstSettled, ["highlight"]);
  assert.deepEqual(started, ["highlight", "feedback"]);
  recorder.dispose();
});

test("disposing the recorder releases a queued leased snapshot without starting its export", async () => {
  let rejectActiveExport;
  let leasedReleases = 0;
  const started = [];
  const recorder = createCanvasReplayRecorder({
    canvas: { width: 4, height: 2 },
    width: 4,
    documentTarget: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray(4 * 2 * 4) }),
        }),
      }),
    },
    videoExporter: {
      exportFrames(frames) {
        started.push(frames[0].label);
        return new Promise((resolve, reject) => { rejectActiveExport = reject; });
      },
      dispose() {
        rejectActiveExport?.(Object.assign(new Error("disposed"), {
          code: "VIDEO_REPLAY_DISPOSED",
        }));
      },
    },
  });
  const frame = (label) => Object.freeze({
    label,
    rgba: new Uint8ClampedArray([0, 0, 0, 255]),
    width: 1,
    height: 1,
    timestamp: 100,
  });
  const queuedFrames = [frame("queued")];
  Object.defineProperty(queuedFrames, "release", {
    value() { leasedReleases += 1; },
  });
  Object.freeze(queuedFrames);

  const activeResult = recorder.exportVideo({ frames: Object.freeze([frame("active")]) })
    .catch((error) => error);
  const queuedResult = recorder.exportVideo({ frames: queuedFrames })
    .catch((error) => error);
  await waitFor(() => started.length === 1);
  recorder.dispose();
  const [activeError, queuedError] = await Promise.all([activeResult, queuedResult]);

  assert.equal(activeError.code, "VIDEO_REPLAY_DISPOSED");
  assert.equal(queuedError.code, "VIDEO_REPLAY_DISPOSED");
  assert.deepEqual(started, ["active"]);
  assert.equal(leasedReleases, 1);
});

test("Google Drive uploader posts a browser-safe Apps Script payload for any replay Blob MIME", async () => {
  const requests = [];
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    uploadKey: "test-upload-key",
    fetchImpl: async (...args) => requests.push(args),
  });

  const result = await uploader.submit({
    metadata: {
      generatedAt: "2026-07-21T10:00:00.000Z",
      message: "汉堡第十二层浮空",
    },
    replay: new Blob(["compact-video"], { type: "video/webm" }),
    screenshotDataUrl: "data:image/png;base64,c2NyZWVuc2hvdA==",
  });

  assert.equal(requests.length, 1);
  const [url, options] = requests[0];
  const payload = JSON.parse(options.body);
  assert.equal(url, "https://script.google.com/macros/s/example/exec");
  assert.equal(options.method, "POST");
  assert.equal(options.mode, "no-cors");
  assert.equal(options.headers["content-type"], "text/plain;charset=UTF-8");
  assert.match(payload.replayDataUrl, /^data:video\/webm;base64,/);
  assert.equal(payload.uploadKey, "test-upload-key");
  assert.match(payload.id, /^FB-20260721100000-[a-f0-9]{8}$/);
  assert.equal(payload.screenshotDataUrl, "data:image/png;base64,c2NyZWVuc2hvdA==");
  assert.deepEqual(result, { id: payload.id, destination: "google-drive" });
});

test("Google Drive uploader aborts a hanging request after 20 seconds", async () => {
  const timers = createFakeTimers();
  const requests = [];
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    fetchImpl: (...args) => {
      requests.push(args);
      return new Promise(() => {});
    },
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
    AbortControllerImpl: FakeAbortController,
  });
  const pending = uploader.submit({
    metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
    replay: new Blob(["GIF89a"], { type: "image/gif" }),
    screenshotDataUrl: "",
  });
  await waitFor(() => requests.length === 1);

  assert.equal(requests[0][1].signal, FakeAbortController.last.signal);
  timers.fire(20_000);
  await assert.rejects(pending, (error) => error.code === "UPLOAD_TIMEOUT");
  assert.equal(FakeAbortController.last.abortCalls, 1);
  assert.equal(timers.count(), 0);
});

test("Google Drive uploader times out without AbortController and consumes a late rejection", async () => {
  const timers = createFakeTimers();
  let rejectFetch;
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    fetchImpl: () => new Promise((resolve, reject) => { rejectFetch = reject; }),
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
    AbortControllerImpl: null,
  });
  const pending = uploader.submit({
    metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
    replay: new Blob(["GIF89a"], { type: "image/gif" }),
    screenshotDataUrl: "",
  });
  await waitFor(() => typeof rejectFetch === "function");

  timers.fire(20_000);
  await assert.rejects(pending, (error) => error.code === "UPLOAD_TIMEOUT");
  rejectFetch(new Error("late network failure"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.count(), 0);
});

test("Google Drive uploader clears its timeout after success and failure", async () => {
  for (const { fetchImpl, expectedErrorCode } of [
    { fetchImpl: async () => ({ type: "opaque" }), expectedErrorCode: null },
    {
      fetchImpl: async () => { throw new Error("offline"); },
      expectedErrorCode: "UPLOAD_FAILED",
    },
  ]) {
    const timers = createFakeTimers();
    const uploader = createGoogleDriveFeedbackUploader({
      endpoint: "https://script.google.com/macros/s/example/exec",
      fetchImpl,
      setTimeoutImpl: timers.set,
      clearTimeoutImpl: timers.clear,
      AbortControllerImpl: FakeAbortController,
    });
    const submission = uploader.submit({
      metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
      replay: new Blob(["GIF89a"], { type: "image/gif" }),
      screenshotDataUrl: "",
    });
    if (expectedErrorCode) {
      await assert.rejects(submission, (error) => error.code === expectedErrorCode);
    } else {
      await submission;
    }
    assert.equal(timers.count(), 0);
  }
});

test("Google Drive uploader classifies replay preparation failures before fetch", async () => {
  let fetchCalls = 0;
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    fetchImpl: async () => { fetchCalls += 1; },
  });

  await assert.rejects(uploader.submit({
    metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
    replay: { type: "image/gif", async arrayBuffer() { throw new Error("broken blob"); } },
    screenshotDataUrl: "",
  }), (error) => error.code === "REPLAY_PREPARATION_FAILED");
  assert.equal(fetchCalls, 0);
});

test("Google Drive uploader makes one request and supports explicit cancellation", async () => {
  const timers = createFakeTimers();
  let fetchCalls = 0;
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    fetchImpl: () => {
      fetchCalls += 1;
      return new Promise(() => {});
    },
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
    AbortControllerImpl: FakeAbortController,
  });
  const pending = uploader.submit({
    metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
    replay: new Blob(["GIF89a"], { type: "image/gif" }),
    screenshotDataUrl: "",
  });
  await waitFor(() => fetchCalls === 1);

  assert.equal(uploader.cancel(), true);
  await assert.rejects(pending, (error) => error.code === "UPLOAD_CANCELLED");
  assert.equal(fetchCalls, 1);
  assert.equal(FakeAbortController.last.abortCalls, 1);
  assert.equal(timers.count(), 0);
});

test("Google Drive uploader cancels during replay preparation without starting fetch", async () => {
  let resolveReplay;
  let fetchCalls = 0;
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    fetchImpl: async () => { fetchCalls += 1; },
  });
  const replay = {
    type: "image/gif",
    arrayBuffer() {
      return new Promise((resolve) => { resolveReplay = resolve; });
    },
  };
  const pending = uploader.submit({
    metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
    replay,
    screenshotDataUrl: "",
  });
  await waitFor(() => typeof resolveReplay === "function");

  assert.equal(uploader.cancel(), true);
  await assert.rejects(pending, (error) => error.code === "UPLOAD_CANCELLED");
  resolveReplay(new TextEncoder().encode("GIF89a").buffer);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 0);
});

test("Google Drive uploader cannot cancel after a completed network request", async () => {
  let fetchCalls = 0;
  let resolveFetch;
  const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    fetchImpl: () => {
      fetchCalls += 1;
      return fetchPromise;
    },
  });
  const pending = uploader.submit({
    metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
    replay: new Blob(["GIF89a"], { type: "image/gif" }),
    screenshotDataUrl: "",
  });
  await waitFor(() => fetchCalls === 1);
  resolveFetch({ type: "opaque" });
  await fetchPromise;

  assert.equal(uploader.cancel(), false);
  assert.equal((await pending).destination, "google-drive");
});

test("cancelling from upload-start feedback prevents fetch without AbortController", async () => {
  let fetchCalls = 0;
  let cancelResult = null;
  const uploader = createGoogleDriveFeedbackUploader({
    endpoint: "https://script.google.com/macros/s/example/exec",
    fetchImpl: async () => { fetchCalls += 1; },
    AbortControllerImpl: null,
  });
  const pending = uploader.submit({
    metadata: { generatedAt: "2026-07-21T10:00:00.000Z" },
    replay: new Blob(["GIF89a"], { type: "image/gif" }),
    screenshotDataUrl: "",
  }, {
    onUploadStart() { cancelResult = uploader.cancel(); },
  });

  await assert.rejects(pending, (error) => error.code === "UPLOAD_CANCELLED");
  assert.equal(cancelResult, true);
  assert.equal(fetchCalls, 0);
});

test("replay recorder classifies GIF encoding failures", async () => {
  const recorder = createCanvasReplayRecorder({
    canvas: { width: 2, height: 2 },
    documentTarget: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        }),
      }),
    },
    windowTarget: {
      setInterval() { return 1; },
      clearInterval() {},
    },
    async encodeGif() {
      const error = new Error("encoder exploded");
      error.code = 11;
      throw error;
    },
  });
  recorder.start();

  await assert.rejects(
    recorder.exportGif(),
    (error) => error.code === "REPLAY_ENCODING_FAILED" && error.cause?.message === "encoder exploded",
  );
  recorder.dispose();
});

test("feedback reporter captures a preview and automatically uploads a compact video replay", async () => {
  const uploads = [];
  const canvas = element({
    toDataURL: () => "data:image/png;base64,abc123",
  });
  const dialog = element({ hidden: true });
  const preview = element({ hidden: true });
  const message = element({ value: "拖动第 12 层时镜头没有跟上" });
  const status = element();
  const submitButton = element({ textContent: "自动上传反馈" });
  const windowTarget = {
    location: { href: "https://kidcadillac.github.io/threejs_burger/cooking.html" },
    navigator: { userAgent: "Mobile QA" },
  };
  const replay = new Blob(["compact-video"], { type: "video/webm" });
  const recorder = {
    startCalls: 0,
    gifExports: 0,
    start() { this.startCalls += 1; },
    snapshotDataUrl: () => "data:image/png;base64,abc123",
    exportVideo: async () => replay,
    exportGif() { this.gifExports += 1; return Promise.resolve(new Blob([], { type: "image/gif" })); },
    dispose() {},
  };
  const reporter = createCookingFeedbackReporter({
    canvas,
    dialog,
    preview,
    message,
    status,
    submitButton,
    windowTarget,
    recorder,
    uploader: {
      async submit(payload) {
        uploads.push(payload);
        return { id: "RPT-20260721-001", destination: "github" };
      },
    },
    now: () => new Date("2026-07-21T10:00:00.000Z"),
    getContext: () => ({ state: { assembledOrder: Array(12).fill("patty"), inventory: {}, strokes: [] } }),
  });

  assert.equal(recorder.startCalls, 1);
  assert.equal(reporter.open(), true);
  assert.equal(dialog.hidden, false);
  assert.equal(preview.hidden, false);
  assert.equal(preview.src, "data:image/png;base64,abc123");
  assert.equal(message.focusCalls, 1);
  assert.match(status.textContent, /6/);

  const result = await reporter.submit();
  assert.equal(result.id, "RPT-20260721-001");
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].replay, replay);
  assert.equal(uploads[0].replay.type, "video/webm");
  assert.equal(recorder.gifExports, 0);
  assert.equal(uploads[0].screenshotDataUrl, preview.src);
  assert.equal(uploads[0].metadata.stackLayers, 12);
  assert.match(status.textContent, /反馈已提交/);
});

test("feedback reporter falls back to GIF only for the exact unsupported-video error", async () => {
  for (const [videoCode, expected] of [
    ["VIDEO_REPLAY_UNSUPPORTED", { result: "RPT-GIF", gifExports: 1, uploads: 1 }],
    ["VIDEO_REPLAY_ENCODING_FAILED", { result: false, gifExports: 0, uploads: 0 }],
  ]) {
    let gifExports = 0;
    let uploads = 0;
    const status = element();
    const reporter = createCookingFeedbackReporter({
      canvas: element(), dialog: element(), preview: element(), message: element({ value: "浮空" }),
      status, submitButton: element({ textContent: "自动上传反馈" }),
      windowTarget: { navigator: {}, location: {} },
      recorder: {
        start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,abc",
        async exportVideo() {
          throw Object.assign(new Error(videoCode), { code: videoCode });
        },
        async exportGif() {
          gifExports += 1;
          return new Blob(["GIF89a"], { type: "image/gif" });
        },
        dispose() {},
      },
      uploader: {
        async submit({ replay }) {
          uploads += 1;
          assert.equal(replay.type, "image/gif");
          return { id: "RPT-GIF" };
        },
      },
    });

    const result = await reporter.submit();

    assert.equal(result?.id ?? result, expected.result, videoCode);
    assert.equal(gifExports, expected.gifExports, videoCode);
    assert.equal(uploads, expected.uploads, videoCode);
    if (videoCode === "VIDEO_REPLAY_ENCODING_FAILED") {
      assert.equal(status.textContent, "操作视频生成失败，截图和问题说明已保留，请稍后重试。");
    }
    reporter.dispose();
  }
});

test("feedback reporter keeps the dialog open when the problem description is empty", async () => {
  const uploads = [];
  const message = element({ value: "   " });
  const reporter = createCookingFeedbackReporter({
    canvas: element({ toDataURL: () => "data:image/png;base64,abc123" }),
    dialog: element(),
    preview: element(),
    message,
    status: element(),
    submitButton: element({ textContent: "自动上传反馈" }),
    windowTarget: { navigator: {}, location: {} },
    recorder: {
      start() {}, snapshotDataUrl: () => "data:image/png;base64,abc123",
      exportGif: async () => new Blob([], { type: "image/gif" }), dispose() {},
    },
    uploader: { submit: (...args) => uploads.push(args) },
  });

  assert.equal(await reporter.submit(), false);
  assert.equal(uploads.length, 0);
  assert.equal(message.focusCalls, 1);
});

test("feedback reporter exposes exact phases, locks the button, and rejects concurrent submit", async () => {
  let finishUpload;
  let uploadEntered = false;
  const phases = [];
  const status = element();
  const submitButton = element({ textContent: "自动上传反馈" });
  const replay = new Blob(["compact-video"], { type: "video/webm" });
  const reporter = createCookingFeedbackReporter({
    canvas: element(), dialog: element(), preview: element(), message: element({ value: "浮空" }),
    status, submitButton, windowTarget: { navigator: {}, location: {} },
    recorder: {
      start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,abc",
      async exportVideo({ onProgress }) {
        assert.equal(submitButton.disabled, true);
        onProgress({ completed: 1, total: 2 });
        phases.push(status.textContent);
        onProgress({ completed: 2, total: 2 });
        phases.push(status.textContent);
        return replay;
      },
      dispose() {},
    },
    uploader: {
      async submit(payload, { onUploadStart }) {
        assert.equal(payload.replay, replay);
        phases.push(status.textContent);
        onUploadStart();
        phases.push(status.textContent);
        uploadEntered = true;
        return new Promise((resolve) => { finishUpload = resolve; });
      },
    },
  });

  const pending = reporter.submit();
  await waitFor(() => uploadEntered);
  assert.equal(await reporter.submit(), false);
  assert.equal(submitButton.disabled, true);
  assert.deepEqual(phases, [
    "正在生成高清操作视频 1/2",
    "正在生成高清操作视频 2/2",
    "正在准备上传数据",
    "正在上传到反馈云盘，最多等待 20 秒",
  ]);

  finishUpload({ id: "RPT-PHASES" });
  assert.equal((await pending).id, "RPT-PHASES");
  assert.equal(status.textContent, "反馈已提交，编号 RPT-PHASES。");
  assert.equal(submitButton.disabled, false);
  assert.equal(submitButton.textContent, "自动上传反馈");
});

test("feedback reporter retries a failed upload with the cached video Blob", async () => {
  const replay = new Blob(["compact-video"], { type: "video/webm" });
  const uploadedReplays = [];
  let exports = 0;
  let attempts = 0;
  const reporter = createCookingFeedbackReporter({
    canvas: element(), dialog: element(), preview: element(), message: element({ value: "浮空" }),
    status: element(), submitButton: element({ textContent: "自动上传反馈" }),
    windowTarget: { navigator: {}, location: {} },
    recorder: {
      start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,abc",
      async exportVideo() { exports += 1; return replay; },
      async exportGif() { throw new Error("GIF fallback must not run"); },
      dispose() {},
    },
    uploader: {
      async submit(payload, { onUploadStart }) {
        attempts += 1;
        uploadedReplays.push(payload.replay);
        onUploadStart();
        if (attempts === 1) {
          const error = new Error("timeout");
          error.code = "UPLOAD_TIMEOUT";
          throw error;
        }
        return { id: "RPT-RETRY" };
      },
    },
  });

  assert.equal(await reporter.submit(), false);
  assert.equal((await reporter.submit()).id, "RPT-RETRY");
  assert.equal(exports, 1);
  assert.equal(uploadedReplays.length, 2);
  assert.equal(uploadedReplays[0], uploadedReplays[1]);
});

test("feedback reporter exports only the newest six seconds from a longer shared recorder", async () => {
  const frames = [
    { timestamp: 1_000 },
    { timestamp: 3_999 },
    { timestamp: 4_000 },
    { timestamp: 10_000 },
  ];
  let snapshotOptions;
  let exportedFrames;
  const replay = new Blob(["six-seconds"], { type: "video/webm" });
  const reporter = createCookingFeedbackReporter({
    canvas: element(), dialog: element(), preview: element(), message: element({ value: "浮空" }),
    status: element(), submitButton: element({ textContent: "自动上传反馈" }),
    windowTarget: { navigator: {}, location: {} },
    recorder: {
      start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,abc",
      snapshotFrames(options) {
        snapshotOptions = options;
        return Object.freeze(frames.filter(({ timestamp }) => timestamp >= 4_000));
      },
      async exportVideo({ frames: requestedFrames }) {
        exportedFrames = requestedFrames;
        return replay;
      },
      dispose() {},
    },
    uploader: {
      async submit(payload) {
        assert.equal(payload.replay, replay);
        return { id: "RPT-SIX-SECONDS" };
      },
    },
  });

  assert.equal((await reporter.submit()).id, "RPT-SIX-SECONDS");
  assert.deepEqual(snapshotOptions, { maxDurationMs: 6_000 });
  assert.deepEqual(exportedFrames.map(({ timestamp }) => timestamp), [4_000, 10_000]);
});

test("feedback dialog freezes recording, resumes on close, and starts a fresh replay session", async () => {
  const calls = [];
  let exports = 0;
  const reporter = createCookingFeedbackReporter({
    canvas: element(), dialog: element({ hidden: true }), preview: element(),
    message: element({ value: "浮空" }), status: element(),
    submitButton: element({ textContent: "自动上传反馈" }),
    windowTarget: { navigator: {}, location: {} },
    recorder: {
      start() { calls.push("start"); },
      stop() { calls.push("stop"); },
      snapshotDataUrl() { calls.push("snapshot"); return "data:image/png;base64,abc"; },
      async exportVideo() { exports += 1; return new Blob([String(exports)], { type: "video/webm" }); },
      dispose() {},
    },
    uploader: { async submit() { return { id: `RPT-${exports}` }; } },
  });

  reporter.open();
  await reporter.submit();
  reporter.close();
  reporter.open();
  await reporter.submit();

  assert.deepEqual(calls, ["start", "snapshot", "stop", "start", "snapshot", "stop"]);
  assert.equal(exports, 2);
});

test("reopening during video encoding cannot mix the old replay with the new screenshot", async () => {
  let resolveFirstExport;
  let resolveSecondExport;
  let exportCalls = 0;
  let screenshotCalls = 0;
  const uploads = [];
  const oldReplay = new Blob(["old"], { type: "video/webm" });
  const newReplay = new Blob(["new"], { type: "video/webm" });
  const dialog = element({ hidden: true });
  const submitButton = element({ textContent: "自动上传反馈" });
  const reporter = createCookingFeedbackReporter({
    canvas: element(), dialog, preview: element(), message: element({ value: "浮空" }),
    status: element(), submitButton,
    windowTarget: { navigator: {}, location: {} },
    recorder: {
      start() {}, stop() {},
      snapshotDataUrl() {
        screenshotCalls += 1;
        return `data:image/png;base64,session-${screenshotCalls}`;
      },
      exportVideo() {
        exportCalls += 1;
        if (exportCalls === 1) {
          return new Promise((resolve) => { resolveFirstExport = resolve; });
        }
        return new Promise((resolve) => { resolveSecondExport = resolve; });
      },
      dispose() {},
    },
    uploader: {
      async submit(payload) { uploads.push(payload); return { id: "RPT-NEW" }; },
    },
  });

  reporter.open();
  const oldSubmission = reporter.submit();
  await waitFor(() => typeof resolveFirstExport === "function");
  reporter.close();
  reporter.open();
  const newSubmission = reporter.submit();
  await waitFor(() => typeof resolveSecondExport === "function");
  assert.equal(submitButton.disabled, true);

  resolveFirstExport(oldReplay);
  assert.equal(await oldSubmission, false);
  assert.equal(uploads.length, 0);
  assert.equal(submitButton.disabled, true);

  resolveSecondExport(newReplay);
  assert.equal((await newSubmission).id, "RPT-NEW");
  assert.equal(exportCalls, 2);
  assert.equal(uploads[0].replay, newReplay);
  assert.equal(uploads[0].screenshotDataUrl, "data:image/png;base64,session-2");
});

test("feedback reporter maps capture and upload failures without discarding a cached replay", async () => {
  const errorCopy = {
    NO_REPLAY_FRAMES: "暂时没有录到操作画面，请继续操作几秒后再提交",
    REPLAY_ENCODING_FAILED: "操作回放生成失败，截图和问题说明已保留，请稍后重试。",
    REPLAY_PREPARATION_FAILED: "回放数据准备失败，截图和问题说明已保留，请稍后重试。",
    UPLOAD_TIMEOUT: "网络或 Google 服务响应超时，回放已保留，可直接重试",
    UPLOAD_FAILED: "网络请求失败，回放已保留，可直接重试",
    UPLOAD_CANCELLED: "反馈提交已取消。",
  };

  for (const [code, copy] of Object.entries(errorCopy)) {
    let uploads = 0;
    const status = element();
    const reporter = createCookingFeedbackReporter({
      canvas: element(), dialog: element(), preview: element(), message: element({ value: "浮空" }),
      status, submitButton: element({ textContent: "自动上传反馈" }),
      windowTarget: { navigator: {}, location: {} },
      recorder: {
        start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,abc",
        async exportGif() {
          if (code === "NO_REPLAY_FRAMES" || code === "REPLAY_ENCODING_FAILED") {
            const error = new Error(code); error.code = code; throw error;
          }
          return new Blob(["GIF89a"], { type: "image/gif" });
        },
        dispose() {},
      },
      uploader: {
        async submit() {
          uploads += 1;
          const error = new Error(code); error.code = code; throw error;
        },
      },
    });

    assert.equal(await reporter.submit(), false);
    assert.equal(status.textContent, copy);
    assert.equal(uploads, ["NO_REPLAY_FRAMES", "REPLAY_ENCODING_FAILED"].includes(code) ? 0 : 1);
  }
});

test("closing keeps an upload alive while dispose cancels and kills the reporter", async () => {
  let resolveUpload;
  let rejectUpload;
  let cancelCalls = 0;
  let disposeCalls = 0;
  let uploadCalls = 0;
  const dialog = element();
  const reporter = createCookingFeedbackReporter({
    canvas: element(), dialog, preview: element(), message: element({ value: "浮空" }),
    status: element(), submitButton: element({ textContent: "自动上传反馈" }),
    windowTarget: { navigator: {}, location: {} },
    recorder: {
      start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,abc",
      async exportGif() { return new Blob(["GIF89a"], { type: "image/gif" }); },
      dispose() { disposeCalls += 1; },
    },
    uploader: {
      submit() {
        uploadCalls += 1;
        return new Promise((resolve, reject) => { resolveUpload = resolve; rejectUpload = reject; });
      },
      cancel() {
        cancelCalls += 1;
        const error = new Error("cancelled"); error.code = "UPLOAD_CANCELLED";
        rejectUpload?.(error);
        return true;
      },
    },
  });

  const first = reporter.submit();
  await waitFor(() => uploadCalls === 1);
  reporter.close();
  assert.equal(dialog.hidden, true);
  assert.equal(cancelCalls, 0);
  resolveUpload({ id: "RPT-CLOSE" });
  assert.equal((await first).id, "RPT-CLOSE");

  const second = reporter.submit();
  await waitFor(() => uploadCalls === 2);
  reporter.dispose();
  assert.equal(await second, false);
  assert.equal(cancelCalls, 1);
  assert.equal(disposeCalls, 1);
  assert.equal(await reporter.submit(), false);
});

test("a disposed reporter cannot overwrite a replacement reporter using the same DOM", async () => {
  let rejectOldUpload;
  const status = element();
  const submitButton = element({ textContent: "自动上传反馈" });
  const reporterOptions = {
    canvas: element(), dialog: element(), preview: element(), message: element({ value: "浮空" }),
    status, submitButton, windowTarget: { navigator: {}, location: {} },
  };
  const oldReporter = createCookingFeedbackReporter({
    ...reporterOptions,
    recorder: {
      start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,old",
      async exportGif() { return new Blob(["old"], { type: "image/gif" }); }, dispose() {},
    },
    uploader: {
      submit() { return new Promise((resolve, reject) => { rejectOldUpload = reject; }); },
      cancel() { return true; },
    },
  });
  const pending = oldReporter.submit();
  await waitFor(() => typeof rejectOldUpload === "function");
  oldReporter.dispose();

  createCookingFeedbackReporter({
    ...reporterOptions,
    recorder: {
      start() {}, stop() {}, snapshotDataUrl: () => "data:image/png;base64,new",
      async exportGif() { return new Blob(["new"], { type: "image/gif" }); }, dispose() {},
    },
    uploader: { async submit() { return { id: "RPT-NEW" }; } },
  });
  status.textContent = "新反馈界面已就绪";
  rejectOldUpload(Object.assign(new Error("cancelled"), { code: "UPLOAD_CANCELLED" }));
  assert.equal(await pending, false);

  assert.equal(status.textContent, "新反馈界面已就绪");
  assert.equal(submitButton.disabled, false);
  assert.equal(submitButton.textContent, "自动上传反馈");
});
