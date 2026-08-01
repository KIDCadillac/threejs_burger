import assert from "node:assert/strict";
import test from "node:test";

import {
  SAUCE_CAPSULE_HOLD_MS,
  SAUCE_CAPSULE_RETURN_MS,
  createSauceCapsuleGesture,
} from "../cooking-sauce-capsule.mjs";

class FakeStyle {
  values = new Map();

  setProperty(name, value) { this.values.set(name, String(value)); }

  removeProperty(name) { this.values.delete(name); }
}

class FakeClassList {
  values = new Set();

  add(...values) { values.forEach((value) => this.values.add(value)); }
}

class FakeTarget {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.listeners = new Map();
    this.dataset = {};
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.children = [];
    this.captured = new Set();
    this.hidden = false;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }

  dispatch(type, event = {}) {
    event.type ??= type;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  append(...children) { this.children.push(...children); }

  replaceChildren(...children) { this.children = children; }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  getAttribute(name) { return this.attributes.get(name) ?? null; }

  setPointerCapture(pointerId) { this.captured.add(pointerId); }

  hasPointerCapture(pointerId) { return this.captured.has(pointerId); }

  releasePointerCapture(pointerId) { this.captured.delete(pointerId); }
}

class FakeDocument extends FakeTarget {
  createElement() { return new FakeTarget(this); }
}

function createTimers() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      tasks.set(id, { callback, at: now + Number(delay || 0) });
      return id;
    },
    clearTimeout(id) { tasks.delete(id); },
    advance(ms) {
      now += ms;
      let due;
      do {
        due = [...tasks.entries()]
          .filter(([, task]) => task.at <= now)
          .sort((left, right) => left[1].at - right[1].at);
        for (const [id, task] of due) {
          tasks.delete(id);
          task.callback();
        }
      } while (due.length);
    },
  };
}

function pointer(pointerId, clientX, clientY) {
  return {
    pointerId,
    clientX,
    clientY,
    button: 0,
    isPrimary: true,
    preventDefault() {},
    stopPropagation() {},
  };
}

function createHarness(overrides = {}) {
  const documentTarget = new FakeDocument();
  const element = new FakeTarget(documentTarget);
  const timers = createTimers();
  const selections = [];
  const starts = [];
  const moves = [];
  const commits = [];
  const cancels = [];
  const feedback = [];
  const capsule = createSauceCapsuleGesture({
    element,
    timers,
    sauceIds: ["ketchup", "mustard", "house-sauce"],
    onSelect: (detail) => selections.push(detail),
    onPickupStart: (detail) => {
      starts.push(detail);
      return true;
    },
    onPickupMove: (detail) => moves.push(detail),
    onPickupCommit: (detail) => {
      commits.push(detail);
      return { handled: true, committed: true };
    },
    onPickupCancel: (detail) => cancels.push(detail),
    onFeedback: (kind) => feedback.push(kind),
    ...overrides,
  });
  return {
    capsule,
    documentTarget,
    element,
    timers,
    selections,
    starts,
    moves,
    commits,
    cancels,
    feedback,
  };
}

function liftBottle(harness, pointerId = 20) {
  harness.element.dispatch("pointerdown", pointer(pointerId, 150, 80));
  harness.timers.advance(SAUCE_CAPSULE_HOLD_MS);
  harness.element.dispatch("pointermove", pointer(pointerId, 150, 35));
  assert.equal(harness.capsule.getState(), "carrying");
  assert.equal(harness.element.captured.has(pointerId), true);
  return pointerId;
}

test("horizontal swipe changes the centered condiment without picking it up", (t) => {
  const harness = createHarness();
  t.after(() => harness.capsule.dispose());

  assert.equal(harness.capsule.getSelectedSauceId(), "ketchup");
  harness.element.dispatch("pointerdown", pointer(1, 160, 20));
  harness.element.dispatch("pointermove", pointer(1, 100, 20));
  harness.element.dispatch("pointerup", pointer(1, 100, 20));

  assert.equal(harness.capsule.getSelectedSauceId(), "mustard");
  assert.equal(harness.element.dataset.selectedSauce, "mustard");
  assert.equal(harness.starts.length, 0);
  assert.equal(harness.selections.at(-1)?.reason, "swipe");
});

test("long press only arms; an upward-dominant lift starts the real bottle gesture", (t) => {
  const harness = createHarness();
  t.after(() => harness.capsule.dispose());

  harness.element.dispatch("pointerdown", pointer(2, 150, 80));
  harness.timers.advance(SAUCE_CAPSULE_HOLD_MS);
  assert.equal(harness.capsule.getState(), "armed");

  harness.element.dispatch("pointermove", pointer(2, 115, 46));
  assert.equal(harness.capsule.getState(), "armed", "diagonal movement must not count as an upward lift");

  harness.element.dispatch("pointermove", pointer(2, 140, 35));
  assert.equal(harness.capsule.getState(), "carrying");
  assert.equal(harness.starts.length, 1);
  assert.equal(harness.moves.length, 1);

  harness.element.dispatch("pointerup", pointer(2, 150, 15));
  assert.equal(harness.commits.length, 1);
  assert.equal(harness.capsule.getState(), "settling");
  harness.timers.advance(SAUCE_CAPSULE_RETURN_MS);
  assert.equal(harness.capsule.getState(), "idle");
});

test("release outside the burger returns the capsule instead of reporting success", (t) => {
  const harness = createHarness({
    onPickupCommit: () => ({ handled: true, committed: false, reason: "release-outside-burger" }),
  });
  t.after(() => harness.capsule.dispose());

  harness.element.dispatch("pointerdown", pointer(3, 150, 80));
  harness.timers.advance(SAUCE_CAPSULE_HOLD_MS);
  harness.element.dispatch("pointermove", pointer(3, 150, 40));
  harness.element.dispatch("pointerup", pointer(3, 20, 20));

  assert.equal(harness.capsule.getState(), "returning");
  assert.equal(harness.feedback.at(-1), "cancel");
  harness.timers.advance(SAUCE_CAPSULE_RETURN_MS);
  assert.equal(harness.capsule.getState(), "idle");
});

test("Escape cancels an active lifted bottle and always releases pointer capture", (t) => {
  const harness = createHarness();
  t.after(() => harness.capsule.dispose());

  harness.element.dispatch("pointerdown", pointer(4, 150, 80));
  harness.timers.advance(SAUCE_CAPSULE_HOLD_MS);
  harness.element.dispatch("pointermove", pointer(4, 150, 35));
  assert.equal(harness.element.captured.has(4), true);

  harness.documentTarget.dispatch("keydown", {
    key: "Escape",
    preventDefault() {},
    stopPropagation() {},
  });

  assert.equal(harness.cancels.at(-1)?.reason, "escape");
  assert.equal(harness.element.captured.has(4), false);
  assert.equal(harness.capsule.getState(), "returning");
});

test("document-level pointer fallback completes a lift after the pointer leaves the capsule", (t) => {
  const harness = createHarness();
  t.after(() => harness.capsule.dispose());

  harness.element.dispatch("pointerdown", pointer(5, 150, 80));
  harness.timers.advance(SAUCE_CAPSULE_HOLD_MS);
  harness.documentTarget.dispatch("pointermove", pointer(5, 150, 35));
  assert.equal(harness.capsule.getState(), "carrying");
  harness.documentTarget.dispatch("pointerup", pointer(5, 150, 15));

  assert.equal(harness.commits.length, 1);
  assert.equal(harness.capsule.getState(), "settling");
  assert.equal(harness.element.captured.has(5), false);
});

const cancellationScenarios = [
  {
    name: "document visibility hidden",
    reason: "document-hidden",
    trigger(harness) {
      harness.documentTarget.hidden = true;
      harness.documentTarget.dispatch("visibilitychange");
    },
  },
  {
    name: "setDisabled pause",
    reason: "disabled",
    trigger(harness) {
      assert.equal(harness.capsule.setDisabled(true), true);
      assert.equal(harness.element.dataset.disabled, "true");
      assert.equal(harness.element.getAttribute("aria-disabled"), "true");
    },
  },
  {
    name: "pointercancel",
    reason: "pointer-cancel",
    trigger(harness, pointerId) {
      harness.element.dispatch("pointercancel", pointer(pointerId, 150, 35));
    },
  },
  {
    name: "lostpointercapture",
    reason: "lost-pointer-capture",
    trigger(harness, pointerId) {
      harness.element.dispatch("lostpointercapture", pointer(pointerId, 150, 35));
    },
  },
];

for (const [index, scenario] of cancellationScenarios.entries()) {
  test(`${scenario.name} cancels a lifted bottle without applying sauce`, (t) => {
    const harness = createHarness();
    t.after(() => harness.capsule.dispose());
    const pointerId = liftBottle(harness, 20 + index);

    scenario.trigger(harness, pointerId);

    assert.equal(harness.cancels.length, 1);
    assert.deepEqual(
      {
        sauceId: harness.cancels[0].sauceId,
        pointerId: harness.cancels[0].pointerId,
        reason: harness.cancels[0].reason,
      },
      { sauceId: "ketchup", pointerId, reason: scenario.reason },
    );
    assert.equal(harness.commits.length, 0);
    assert.equal(harness.capsule.getState(), "returning");
    assert.equal(harness.element.dataset.gestureState, "returning");
    assert.equal(harness.element.captured.has(pointerId), false);

    harness.documentTarget.dispatch("pointerup", pointer(pointerId, 150, 15));
    assert.equal(harness.commits.length, 0, "a late pointerup must not commit a cancelled bottle");
    assert.equal(harness.cancels.length, 1, "the cancelled gesture must finish exactly once");

    harness.timers.advance(SAUCE_CAPSULE_RETURN_MS);
    assert.equal(harness.capsule.getState(), "idle");
    assert.equal(harness.element.dataset.gestureState, "idle");
  });
}

test("setDisabled blocks new gestures until the paused capsule is enabled again", (t) => {
  const harness = createHarness();
  t.after(() => harness.capsule.dispose());

  harness.capsule.setDisabled(true);
  harness.element.dispatch("pointerdown", pointer(30, 150, 80));
  harness.timers.advance(SAUCE_CAPSULE_HOLD_MS);
  assert.equal(harness.capsule.getState(), "idle");
  assert.equal(harness.starts.length, 0);
  assert.equal(harness.element.captured.has(30), false);

  harness.capsule.setDisabled(false);
  liftBottle(harness, 31);
  assert.equal(harness.starts.length, 1);
});
