import test from "node:test";
import assert from "node:assert/strict";

import {
  HIGHLIGHT_LAYER_MILESTONES,
  createCookingHighlightReplayCoordinator,
} from "../app/static/cooking-highlight-replay.mjs";
import { createReplayFrameBuffer } from "../app/static/cooking-replay-video.mjs";

function replayFrame(timestamp, value = timestamp) {
  return Object.freeze({
    rgba: new Uint8ClampedArray([value, 0, 0, 255]),
    width: 1,
    height: 1,
    timestamp,
  });
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await Promise.resolve();
  }
  assert.fail("condition did not become true");
}

function recorderHarness(initialFrames = []) {
  let availableFrames = initialFrames;
  const snapshotCalls = [];
  const exports = [];
  let cancelCalls = 0;
  return {
    recorder: {
      snapshotFrames(options = {}) {
        snapshotCalls.push(options);
        const from = Number(options.fromTimestamp ?? Number.NEGATIVE_INFINITY);
        const to = Number(options.toTimestamp ?? Number.POSITIVE_INFINITY);
        const duration = Number(options.maxDurationMs ?? Number.POSITIVE_INFINITY);
        let selected = availableFrames.filter(({ timestamp }) => timestamp >= from && timestamp <= to);
        if (selected.length && Number.isFinite(duration)) {
          selected = selected.filter(({ timestamp }) => (
            timestamp >= selected.at(-1).timestamp - duration
          ));
        }
        return Object.freeze([...selected]);
      },
      async exportVideo({ frames }) {
        exports.push(frames);
        return new Blob([frames.map(({ timestamp }) => timestamp).join(",")], {
          type: "video/webm",
        });
      },
      cancelVideoExport() { cancelCalls += 1; return true; },
    },
    exports,
    snapshotCalls,
    setFrames(frames) { availableFrames = frames; },
    cancelCalls: () => cancelCalls,
  };
}

function timerHarness() {
  let nextId = 1;
  const timers = new Map();
  return {
    set(callback, delay) {
      const id = nextId++;
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
    delays: () => [...timers.values()].map(({ delay }) => delay),
    count: () => timers.size,
  };
}

function urlHarness() {
  const created = [];
  const revoked = [];
  return {
    URLImpl: {
      createObjectURL(blob) {
        const url = `blob:highlight-${created.length + 1}`;
        created.push({ blob, url });
        return url;
      },
      revokeObjectURL(url) { revoked.push(url); },
    },
    created,
    revoked,
  };
}

function frameBufferDocument() {
  return {
    createElement() {
      let canvas;
      const context = {
        drawImage(source) { canvas.snapshotValue = source?.snapshotValue; },
        createImageData(width, height) {
          return { data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData() {},
      };
      canvas = { width: 0, height: 0, getContext: () => context };
      return canvas;
    },
  };
}

test("highlight coordinator latches every upward layer crossing and finish exactly once", async () => {
  const harness = recorderHarness([replayFrame(0), replayFrame(100)]);
  const urls = urlHarness();
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urls.URLImpl,
    now: () => 700,
    postEventMs: 0,
    maxClips: 5,
  });

  assert.deepEqual(HIGHLIGHT_LAYER_MILESTONES, [10, 20, 40, 60]);
  assert.deepEqual(coordinator.observe({ layerCount: 9 }), []);
  assert.deepEqual(coordinator.observe({ layerCount: 21 }), ["layers-10", "layers-20"]);
  assert.deepEqual(coordinator.observe({ layerCount: 8 }), []);
  assert.deepEqual(coordinator.observe({ layerCount: 41 }), ["layers-40"]);
  assert.deepEqual(coordinator.observe({ layerCount: 60, finished: true }), ["layers-60", "finish"]);
  assert.deepEqual(coordinator.observe({ layerCount: 5, finished: false }), []);
  assert.deepEqual(coordinator.observe({ layerCount: 60, finished: true }), []);
  await coordinator.whenIdle();

  assert.deepEqual(coordinator.clips().map(({ id }) => id), [
    "layers-10", "layers-20", "layers-40", "layers-60", "finish",
  ]);
  assert.equal(harness.exports.length, 5);
  assert.equal(harness.snapshotCalls.length, 3, "events from one observation share one frozen snapshot");
  coordinator.dispose();
});

test("highlight coordinator seeds latches from an already-progressed initial state", async () => {
  const harness = recorderHarness([replayFrame(0)]);
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    initialLayerCount: 20,
    initialFinished: true,
    postEventMs: 0,
  });

  coordinator.observe({ layerCount: 5, finished: false });
  assert.deepEqual(coordinator.observe({ layerCount: 20, finished: true }), []);
  await coordinator.whenIdle();
  assert.equal(harness.exports.length, 0);
  coordinator.dispose();
});

test("a pending milestone stays unique and becomes retryable after export failure", async () => {
  const harness = recorderHarness([replayFrame(0)]);
  let rejectFirstExport;
  let attempts = 0;
  harness.recorder.exportVideo = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Promise((resolve, reject) => { rejectFirstExport = reject; });
    }
    return new Blob(["retry"], { type: "video/webm" });
  };
  const errors = [];
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    now: () => 100,
    postEventMs: 0,
    onError(error, event) { errors.push([error.message, event.id]); },
  });

  assert.deepEqual(coordinator.observe({ layerCount: 10 }), ["layers-10"]);
  await waitFor(() => typeof rejectFirstExport === "function");
  assert.deepEqual(coordinator.observe({ layerCount: 10 }), []);
  rejectFirstExport(new Error("first export failed"));
  await coordinator.whenIdle();

  assert.deepEqual(coordinator.observe({ layerCount: 10 }), ["layers-10"]);
  await coordinator.whenIdle();
  assert.equal(attempts, 2);
  assert.deepEqual(errors, [["first export failed", "layers-10"]]);
  assert.deepEqual(coordinator.clips().map(({ id }) => id), ["layers-10"]);
  assert.deepEqual(coordinator.observe({ layerCount: 10 }), []);
  coordinator.dispose();
});

test("an older multi-event batch cannot clear the pending marker owned by a newer retry", async () => {
  const harness = recorderHarness([replayFrame(0)]);
  const pendingExports = [];
  harness.recorder.exportVideo = () => new Promise((resolve, reject) => {
    pendingExports.push({ resolve, reject });
  });
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    now: () => 100,
    postEventMs: 0,
  });

  assert.deepEqual(coordinator.observe({ layerCount: 20 }), ["layers-10", "layers-20"]);
  await waitFor(() => pendingExports.length === 1);
  pendingExports[0].reject(new Error("first layers-10 export failed"));
  await waitFor(() => pendingExports.length === 2);

  assert.deepEqual(coordinator.observe({ layerCount: 20 }), ["layers-10"]);
  pendingExports[1].resolve(new Blob(["layers-20"], { type: "video/webm" }));
  await waitFor(() => pendingExports.length === 3);
  await Promise.resolve();
  await Promise.resolve();

  const duplicate = coordinator.observe({ layerCount: 20 });
  pendingExports[2].resolve(new Blob(["layers-10 retry"], { type: "video/webm" }));
  if (duplicate.length) {
    await waitFor(() => pendingExports.length === 4);
    pendingExports[3].resolve(new Blob(["duplicate"], { type: "video/webm" }));
  }
  await coordinator.whenIdle();

  assert.deepEqual(duplicate, []);
  assert.equal(pendingExports.length, 3);
  assert.deepEqual(coordinator.clips().map(({ id }) => id), ["layers-20", "layers-10"]);
  coordinator.dispose();
});

test("a failed finish export becomes retryable while the state remains finished", async () => {
  const harness = recorderHarness([replayFrame(0)]);
  let attempts = 0;
  harness.recorder.exportVideo = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("first finish export failed");
    return new Blob(["finish-retry"], { type: "video/webm" });
  };
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    now: () => 100,
    postEventMs: 0,
  });

  assert.deepEqual(coordinator.observe({ finished: true }), ["finish"]);
  await coordinator.whenIdle();
  assert.deepEqual(coordinator.observe({ finished: true }), ["finish"]);
  await coordinator.whenIdle();

  assert.equal(attempts, 2);
  assert.deepEqual(coordinator.clips().map(({ id }) => id), ["finish"]);
  coordinator.dispose();
});

test("highlight coordinator defaults span about five seconds before and three seconds after", async () => {
  const timers = timerHarness();
  const harness = recorderHarness(
    Array.from(
      { length: 97 },
      (_, index) => replayFrame(1_000 + (index * 1_000 / 12)),
    ),
  );
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    now: () => 6_000,
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
  });

  coordinator.observe({ layerCount: 10 });
  assert.deepEqual(timers.delays(), [3_000]);
  assert.deepEqual(harness.snapshotCalls[0], {
    fromTimestamp: 1_000,
    toTimestamp: 6_000,
    maxDurationMs: 5_000,
  });
  timers.fire(3_000);
  await coordinator.whenIdle();

  assert.equal(harness.exports[0].length, 96);
  assert.ok(Math.abs(harness.exports[0][0].timestamp - (1_000 + (1_000 / 12))) < 0.001);
  assert.equal(harness.exports[0].at(-1).timestamp, 9_000);
  coordinator.dispose();
});

test("highlight pre-event bounds work with createReplayFrameBuffer snapshots", async () => {
  const buffer = createReplayFrameBuffer({
    documentTarget: frameBufferDocument(),
    outputWidth: 4,
    maxDurationMs: 8_000,
    maxFrames: 96,
  });
  for (const timestamp of [0, 4_000, 4_500, 5_000]) {
    buffer.push({ width: 8, height: 4, snapshotValue: timestamp }, timestamp);
  }
  const exportedTimestamps = [];
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: {
      snapshotFrames: (options) => buffer.snapshot(options),
      async exportVideo({ frames }) {
        exportedTimestamps.push(frames.map(({ timestamp }) => timestamp));
        return new Blob(["video"], { type: "video/webm" });
      },
    },
    URLImpl: urlHarness().URLImpl,
    now: () => 5_000,
    preEventMs: 1_000,
    postEventMs: 0,
  });

  coordinator.observe({ layerCount: 10 });
  await coordinator.whenIdle();

  assert.deepEqual(exportedTimestamps, [[4_000, 4_500, 5_000]]);
  coordinator.dispose();
  buffer.dispose();
});

test("highlight coordinator freezes pre-event frames and appends only a clamped post window", async () => {
  const timers = timerHarness();
  const harness = recorderHarness([replayFrame(0), replayFrame(100)]);
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    now: () => 200,
    preEventMs: 1_000,
    postEventMs: 5_000,
    maxPostEventMs: 600,
    maxSnapshotFrames: 4,
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
  });

  assert.deepEqual(coordinator.observe({ layerCount: 10 }), ["layers-10"]);
  assert.deepEqual(timers.delays(), [600]);
  harness.setFrames([
    replayFrame(0), replayFrame(100), replayFrame(300), replayFrame(650), replayFrame(900),
  ]);
  timers.fire(600);
  await coordinator.whenIdle();

  assert.equal(harness.exports.length, 1);
  assert.deepEqual(harness.exports[0].map(({ timestamp }) => timestamp), [0, 100, 300, 650]);
  assert.equal(Object.isFrozen(harness.exports[0]), true);
  assert.equal(harness.snapshotCalls[0].maxDurationMs, 1_000);
  assert.equal(harness.snapshotCalls[0].fromTimestamp, -800);
  assert.equal(harness.snapshotCalls[0].toTimestamp, 200);
  assert.ok(harness.snapshotCalls[1].fromTimestamp > 200);
  assert.equal(harness.snapshotCalls[1].toTimestamp, 800);
  coordinator.dispose();
});

test("highlight coordinator enforces a three-second absolute post-event wait cap", () => {
  const timers = timerHarness();
  const harness = recorderHarness([replayFrame(0)]);
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    now: () => 0,
    postEventMs: 60_000,
    maxPostEventMs: 60_000,
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
  });

  coordinator.observe({ layerCount: 10 });
  assert.deepEqual(timers.delays(), [3_000]);
  coordinator.dispose();
});

test("highlight coordinator releases leased snapshots immediately after their exports settle", async () => {
  const frames = [replayFrame(0), replayFrame(100)];
  let releases = 0;
  const harness = recorderHarness();
  harness.recorder.snapshotFrames = () => {
    const snapshot = [...frames];
    Object.defineProperty(snapshot, "release", {
      value() { releases += 1; },
    });
    return Object.freeze(snapshot);
  };
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urlHarness().URLImpl,
    now: () => 100,
    postEventMs: 0,
  });

  coordinator.observe({ layerCount: 10 });
  assert.equal(releases, 0);
  await coordinator.whenIdle();
  assert.equal(releases, 1);
  coordinator.dispose();
});

test("highlight clips are playable, immutable, and bounded with eager URL revocation", async () => {
  const harness = recorderHarness(Array.from({ length: 8 }, (_, index) => replayFrame(index * 100)));
  const urls = urlHarness();
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urls.URLImpl,
    postEventMs: 0,
    maxSnapshotFrames: 3,
    now: () => 700,
    maxClips: 2,
  });

  for (const layerCount of [10, 20, 40]) {
    coordinator.observe({ layerCount });
    await coordinator.whenIdle();
  }

  const clips = coordinator.clips();
  assert.equal(Object.isFrozen(clips), true);
  assert.equal(clips.every(Object.isFrozen), true);
  assert.deepEqual(clips.map(({ id }) => id), ["layers-20", "layers-40"]);
  assert.equal(clips.every(({ blob, url }) => blob.type === "video/webm" && blob.size > 0 && url), true);
  assert.deepEqual(harness.exports.map((frames) => frames.length), [3, 3, 3]);
  assert.deepEqual(urls.revoked, ["blob:highlight-1"]);

  assert.equal(coordinator.removeClip("layers-20"), true);
  assert.deepEqual(urls.revoked, ["blob:highlight-1", "blob:highlight-2"]);
  assert.deepEqual(coordinator.clips().map(({ id }) => id), ["layers-40"]);
  coordinator.dispose();
  assert.deepEqual(urls.revoked, ["blob:highlight-1", "blob:highlight-2", "blob:highlight-3"]);
});

test("disposing a highlight coordinator cancels post waits without cancelling the shared exporter", async () => {
  const timers = timerHarness();
  const harness = recorderHarness([replayFrame(0)]);
  const urls = urlHarness();
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder: harness.recorder,
    URLImpl: urls.URLImpl,
    postEventMs: 500,
    setTimeoutImpl: timers.set,
    clearTimeoutImpl: timers.clear,
  });

  coordinator.observe({ layerCount: 10 });
  assert.equal(timers.count(), 1);
  assert.equal(coordinator.dispose(), true);
  assert.equal(coordinator.dispose(), false);
  assert.equal(timers.count(), 0);
  assert.equal(harness.cancelCalls(), 0);
  await coordinator.whenIdle();
  assert.equal(harness.exports.length, 0);
  assert.deepEqual(coordinator.clips(), []);
  assert.deepEqual(coordinator.observe({ layerCount: 20 }), []);
});

test("disposing a highlight coordinator does not cancel another caller's recorder export", async () => {
  let resolveFeedback;
  let rejectFeedback;
  let cancelCalls = 0;
  const feedbackVideo = new Blob(["feedback"], { type: "video/webm" });
  const recorder = {
    snapshotFrames: () => Object.freeze([]),
    exportVideo() {
      return new Promise((resolve, reject) => {
        resolveFeedback = resolve;
        rejectFeedback = reject;
      });
    },
    cancelVideoExport() {
      cancelCalls += 1;
      rejectFeedback(new Error("feedback export was cancelled"));
      return true;
    },
  };
  const feedbackExport = recorder.exportVideo().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const coordinator = createCookingHighlightReplayCoordinator({
    recorder,
    URLImpl: urlHarness().URLImpl,
  });

  coordinator.dispose();
  resolveFeedback(feedbackVideo);
  const outcome = await feedbackExport;

  assert.equal(cancelCalls, 0);
  assert.strictEqual(outcome.value, feedbackVideo);
  assert.equal(outcome.error, undefined);
});
