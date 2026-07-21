import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCookingReportMetadata,
  createCanvasReplayRecorder,
  createCookingFeedbackReporter,
  createGoogleDriveFeedbackUploader,
  encodeReplayGif,
} from "../app/static/cooking-feedback.mjs";

function element(overrides = {}) {
  return {
    hidden: false,
    textContent: "",
    value: "",
    src: "",
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
    ...overrides,
  };
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

test("GIF encoder returns an animated GIF byte stream", () => {
  const red = new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255,
    255, 0, 0, 255, 255, 0, 0, 255,
  ]);
  const blue = new Uint8ClampedArray([
    0, 0, 255, 255, 0, 0, 255, 255,
    0, 0, 255, 255, 0, 0, 255, 255,
  ]);
  const bytes = encodeReplayGif([
    { rgba: red, width: 2, height: 2 },
    { rgba: blue, width: 2, height: 2 },
  ], { delay: 250 });

  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
  assert.ok(bytes.length > 30);
  assert.equal(bytes.at(-1), 0x3b);
});

test("replay recorder snapshots the buffered 2D frame instead of a cleared WebGL canvas", () => {
  let afterRender = null;
  let unsubscribeCalls = 0;
  const frameCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(240 * 120 * 4) }),
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
  assert.equal(frameCanvas.width, 240);
  assert.equal(frameCanvas.height, 120);
  recorder.dispose();
  assert.equal(unsubscribeCalls, 1);
});

test("Google Drive uploader posts a browser-safe Apps Script payload", async () => {
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
    replay: new Blob(["GIF89a"], { type: "image/gif" }),
    screenshotDataUrl: "data:image/png;base64,c2NyZWVuc2hvdA==",
  });

  assert.equal(requests.length, 1);
  const [url, options] = requests[0];
  const payload = JSON.parse(options.body);
  assert.equal(url, "https://script.google.com/macros/s/example/exec");
  assert.equal(options.method, "POST");
  assert.equal(options.mode, "no-cors");
  assert.equal(options.headers["content-type"], "text/plain;charset=UTF-8");
  assert.equal(payload.uploadKey, "test-upload-key");
  assert.match(payload.id, /^FB-20260721100000-[a-f0-9]{8}$/);
  assert.match(payload.replayDataUrl, /^data:image\/gif;base64,/);
  assert.equal(payload.screenshotDataUrl, "data:image/png;base64,c2NyZWVuc2hvdA==");
  assert.deepEqual(result, { id: payload.id, destination: "google-drive" });
});

test("feedback reporter captures a preview and automatically uploads a GIF replay", async () => {
  const uploads = [];
  const canvas = element({
    toDataURL: () => "data:image/png;base64,abc123",
  });
  const dialog = element({ hidden: true });
  const preview = element({ hidden: true });
  const message = element({ value: "拖动第 12 层时镜头没有跟上" });
  const status = element();
  const windowTarget = {
    location: { href: "https://kidcadillac.github.io/threejs_burger/cooking.html" },
    navigator: { userAgent: "Mobile QA" },
  };
  const replay = new Blob(["GIF89a"], { type: "image/gif" });
  const recorder = {
    startCalls: 0,
    start() { this.startCalls += 1; },
    snapshotDataUrl: () => "data:image/png;base64,abc123",
    exportGif: async () => replay,
    dispose() {},
  };
  const reporter = createCookingFeedbackReporter({
    canvas,
    dialog,
    preview,
    message,
    status,
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

  const result = await reporter.submit();
  assert.equal(result.id, "RPT-20260721-001");
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].replay, replay);
  assert.equal(uploads[0].screenshotDataUrl, preview.src);
  assert.equal(uploads[0].metadata.stackLayers, 12);
  assert.match(status.textContent, /自动上传成功/);
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
