import test from "node:test";
import assert from "node:assert/strict";

import {
  HIGHLIGHT_LAYER_MILESTONES,
  createCookingHighlightReplayCoordinator,
} from "../app/static/cooking-highlight-replay.mjs";

function replayFrame(timestamp, value = timestamp) {
  return Object.freeze({
    rgba: new Uint8ClampedArray([value, 0, 0, 255]),
    width: 1,
    height: 1,
    timestamp,
  });
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
  assert.ok(harness.snapshotCalls[1].fromTimestamp > 200);
  assert.equal(harness.snapshotCalls[1].toTimestamp, 800);
  coordinator.dispose();
});

test("highlight coordinator enforces an absolute post-event wait cap", () => {
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
  assert.deepEqual(timers.delays(), [2_000]);
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

test("disposing a highlight coordinator cancels post waits and active export ownership", async () => {
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
  assert.equal(harness.cancelCalls(), 1);
  await coordinator.whenIdle();
  assert.equal(harness.exports.length, 0);
  assert.deepEqual(coordinator.clips(), []);
  assert.deepEqual(coordinator.observe({ layerCount: 20 }), []);
});
