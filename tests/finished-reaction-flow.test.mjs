import test from "node:test";
import assert from "node:assert/strict";

import { createFinishedReactionFlow } from "../app/static/finished-reaction-flow.mjs";

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(...classes) {
    this.classList = new FakeClassList(...classes);
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.scrollCount = 0;
    this.focusCount = 0;
    this.focusOptions = [];
    this.container = null;
  }

  closest(selector) {
    return selector === ".reaction-stage" ? this.container : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  scrollIntoView() {
    this.scrollCount += 1;
  }

  focus(options) {
    this.focusCount += 1;
    this.focusOptions.push(options);
  }
}

function fixture() {
  const stageContainer = new FakeElement("reaction-stage");
  const stage = new FakeElement();
  stage.container = stageContainer;
  const replay = new FakeElement("deployment-replay");
  const result = new FakeElement("result-card", "result-card--delayed");
  result.hidden = true;
  result.setAttribute("aria-hidden", "true");
  result.setAttribute("inert", "");

  const elements = new Map([
    ["[data-character-reaction]", stage],
    ["#deployment-replay", replay],
    ["#result-card", result],
  ]);
  const timers = [];
  const frames = [];
  const playbacks = [];
  const reactionPhases = [];
  const flow = createFinishedReactionFlow({
    querySelector: (selector) => elements.get(selector) ?? null,
    playReaction: (root, sauces, options) => {
      const playback = {
        root,
        sauces,
        options,
        cancelled: false,
        cancel() {
          this.cancelled = true;
        },
      };
      playbacks.push(playback);
      return playback;
    },
    scheduleTimeout: (callback, delay) => {
      const handle = { callback, delay, cancelled: false };
      timers.push(handle);
      return handle;
    },
    cancelTimeout: (handle) => {
      handle.cancelled = true;
    },
    scheduleFrame: (callback) => {
      const handle = { callback, cancelled: false };
      frames.push(handle);
      return handle;
    },
    cancelFrame: (handle) => {
      handle.cancelled = true;
    },
    onReactionPhase: (phase, plan) => reactionPhases.push({ phase, plan }),
  });

  return {
    flow,
    stageContainer,
    stage,
    replay,
    result,
    timers,
    frames,
    playbacks,
    reactionPhases,
  };
}

test("fresh playback and replay both forward phase feedback", () => {
  const { flow, playbacks, reactionPhases } = fixture();
  const plan = { primary: "chili", primaryIntensity: 2 };

  flow.beginOutcome("round-1", ["chili", "chili"], { snackKind: "nugget" });
  playbacks[0].options.onPhase("bite", plan);
  flow.replay(["chili", "chili"], { snackKind: "nugget" });
  playbacks[1].options.onPhase("burst", plan);

  assert.deepEqual(reactionPhases, [
    { phase: "bite", plan },
    { phase: "burst", plan },
  ]);
});

test("same-outcome websocket updates preserve the mounted playback", () => {
  const { flow, playbacks } = fixture();
  let renders = 0;

  function renderFinished(outcomeKey) {
    if (flow.isCurrentOutcome(outcomeKey)) return "synced";
    renders += 1;
    flow.beginOutcome(outcomeKey, ["chili"], { snackKind: "nugget" });
    return "mounted";
  }

  assert.equal(renderFinished("round-1-poison-p2"), "mounted");
  assert.equal(renderFinished("round-1-poison-p2"), "synced");
  assert.equal(renders, 1);
  assert.equal(playbacks.length, 1);
  assert.equal(playbacks[0].cancelled, false);
});

test("skip cancels playback and immediately exposes an accessible result", () => {
  const { flow, stageContainer, replay, result, playbacks, timers, frames } = fixture();
  flow.beginOutcome("round-1", ["chili"], { snackKind: "nugget" });

  flow.skip();

  assert.equal(playbacks[0].cancelled, true);
  assert.equal(stageContainer.classList.contains("reaction-stage--hidden"), true);
  assert.equal(stageContainer.getAttribute("aria-hidden"), "true");
  assert.equal(stageContainer.getAttribute("inert"), "");
  assert.equal(replay.classList.contains("deployment-replay--active"), true);
  assert.equal(result.hidden, false);
  assert.equal(result.getAttribute("aria-hidden"), "false");
  assert.equal(result.getAttribute("inert"), null);
  assert.equal(result.classList.contains("result-card--visible"), false);
  assert.equal(timers.length, 0);
  assert.equal(frames.length, 1);
  assert.equal(result.focusCount, 1);
  assert.deepEqual(result.focusOptions, [{ preventScroll: true }]);

  frames[0].callback();
  assert.equal(result.classList.contains("result-card--visible"), false);
  assert.equal(frames.length, 2);
  frames[1].callback();
  assert.equal(result.classList.contains("result-card--visible"), true);
});

test("natural completion reveals the live result without stealing focus", () => {
  const { flow, result, playbacks, timers } = fixture();
  flow.beginOutcome("round-1", ["chili"], { snackKind: "nugget" });
  playbacks[0].options.onComplete();
  timers[0].callback();
  assert.equal(result.hidden, false);
  assert.equal(result.focusCount, 0);
});

test("skip safely tolerates a result card without focus support", () => {
  const setup = fixture();
  setup.result.focus = undefined;
  assert.doesNotThrow(() => setup.flow.skip());

  const throwing = fixture();
  throwing.result.focus = () => { throw new Error("embedded browser focus failure"); };
  assert.doesNotThrow(() => throwing.flow.skip());
});

test("replay resets the bite, hides inert result content, and starts fresh playback", () => {
  const { flow, stageContainer, stage, replay, result, playbacks, timers, frames } = fixture();
  flow.beginOutcome("round-1", ["chili"], { snackKind: "nugget" });
  flow.skip();

  assert.equal(flow.replay(["chili"], { snackKind: "nugget" }), true);

  assert.equal(playbacks.length, 2);
  assert.equal(frames[0].cancelled, true);
  assert.equal(stage.dataset.phase, "notice");
  assert.equal(stage.dataset.foodBitten, "false");
  assert.equal(stageContainer.classList.contains("reaction-stage--hidden"), false);
  assert.equal(stageContainer.getAttribute("aria-hidden"), "false");
  assert.equal(stageContainer.getAttribute("inert"), null);
  assert.equal(replay.classList.contains("deployment-replay--active"), false);
  assert.equal(result.hidden, true);
  assert.equal(result.getAttribute("aria-hidden"), "true");
  assert.equal(result.getAttribute("inert"), "");
  assert.equal(result.classList.contains("result-card--visible"), false);
  assert.equal(stage.scrollCount, 1);

  playbacks[1].options.onComplete();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 1900);
  timers[0].callback();
  assert.equal(result.hidden, false);
  assert.equal(result.getAttribute("aria-hidden"), "false");
  assert.equal(result.classList.contains("result-card--visible"), false);
  frames[1].callback();
  frames[2].callback();
  assert.equal(result.classList.contains("result-card--visible"), true);
});

test("route transition cancels both playback and delayed reveal", () => {
  const { flow, playbacks, timers } = fixture();
  flow.beginOutcome("round-1", ["chili"], { snackKind: "nugget" });

  flow.leaveRoute();

  assert.equal(playbacks[0].cancelled, true);
  assert.equal(flow.isCurrentOutcome("round-1"), false);

  flow.beginOutcome("round-2", ["chili"], { snackKind: "nugget" });
  assert.equal(playbacks.length, 2);
  playbacks[1].options.onComplete();
  assert.equal(timers.length, 1);

  flow.leaveRoute();

  assert.equal(timers[0].cancelled, true);
  assert.equal(flow.isCurrentOutcome("round-2"), false);
});

test("route transition cancels a result reveal waiting on animation frames", () => {
  const { flow, result, frames } = fixture();
  flow.beginOutcome("round-1", ["chili"], { snackKind: "nugget" });
  flow.skip();

  assert.equal(frames.length, 1);
  assert.equal(result.classList.contains("result-card--visible"), false);

  flow.leaveRoute();

  assert.equal(frames[0].cancelled, true);
  frames[0].callback();
  assert.equal(frames.length, 1);
  assert.equal(result.classList.contains("result-card--visible"), false);
});

test("missing result, replay, or stage nodes are safe during teardown", () => {
  const flow = createFinishedReactionFlow({
    querySelector: () => null,
    playReaction: () => assert.fail("missing stage must not start playback"),
  });

  assert.doesNotThrow(() => flow.beginOutcome("round-1", ["chili"], null));
  assert.doesNotThrow(() => flow.skip());
  assert.equal(flow.replay(["chili"], { snackKind: "nugget" }), false);
  assert.doesNotThrow(() => flow.leaveRoute());
});
