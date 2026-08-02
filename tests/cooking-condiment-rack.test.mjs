import assert from "node:assert/strict";
import test from "node:test";

import {
  CONDIMENT_RACK_HOLD_MS,
  CONDIMENT_RACK_HOLD_TOLERANCE_PX,
  CONDIMENT_RACK_ROULETTE_STEP_PX,
  createCondimentRackControls,
} from "../cooking-condiment-rack.mjs";
import { createDefaultWorkbenchLoadout } from "../workbench-loadout.mjs";

class FakeStyle {
  values = new Map();

  setProperty(name, value) { this.values.set(name, String(value)); }

  getPropertyValue(name) { return this.values.get(name) ?? ""; }
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
    this.parentNode = null;
    this.textContent = "";
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

  append(...children) {
    children.forEach((child) => { child.parentNode = this; });
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    children.forEach((child) => { child.parentNode = this; });
    this.children = children;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  getAttribute(name) { return this.attributes.get(name) ?? null; }

  setPointerCapture(pointerId) { this.captured.add(pointerId); }

  hasPointerCapture(pointerId) { return this.captured.has(pointerId); }

  releasePointerCapture(pointerId) { this.captured.delete(pointerId); }

  focus() { this.focused = true; }
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

function createHarness({ initialLoadout = createDefaultWorkbenchLoadout(), ...overrides } = {}) {
  const documentTarget = new FakeDocument();
  const root = new FakeTarget(documentTarget);
  const canvas = new FakeTarget(documentTarget);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480 });
  const lines = new FakeTarget(documentTarget);
  const buttons = new FakeTarget(documentTarget);
  const regions = new FakeTarget(documentTarget);
  const regionMenu = new FakeTarget(documentTarget);
  const picker = new FakeTarget(documentTarget);
  const hint = new FakeTarget(documentTarget);
  const nodes = new Map([
    ["[data-slot-lines]", lines],
    ["[data-slot-buttons]", buttons],
    ["[data-slot-regions]", regions],
    ["[data-slot-region-menu]", regionMenu],
    ["[data-slot-capsule]", picker],
    ["[data-slot-hint]", hint],
  ]);
  root.querySelector = (selector) => nodes.get(selector) ?? null;
  const timers = createTimers();
  const cycles = [];
  const choices = [];
  const starts = [];
  const moves = [];
  const commits = [];
  const cancels = [];
  const controls = createCondimentRackControls({
    root,
    canvas,
    initialLoadout,
    timers,
    getProjectedAnchors: () => [
      { slotId: "sauce-right-1", region: "sauce", x: 520, y: 190, visible: true },
      { slotId: "sauce-right-2", region: "sauce", x: 535, y: 270, visible: true },
      { slotId: "sauce-right-3", region: "sauce", x: 550, y: 350, visible: true },
    ],
    onCycle: (detail) => { cycles.push(detail); },
    onChoose: (detail) => { choices.push(detail); },
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
    ...overrides,
  });
  return {
    root,
    documentTarget,
    buttonsRoot: buttons,
    picker,
    hint,
    timers,
    controls,
    cycles,
    choices,
    starts,
    moves,
    commits,
    cancels,
  };
}

test("right swipe cycles only the touched physical bottle slot", (t) => {
  const harness = createHarness();
  t.after(() => harness.controls.dispose());
  const secondBottle = harness.buttonsRoot.children[1];

  secondBottle.dispatch("pointerdown", pointer(1, 535, 270));
  harness.documentTarget.dispatch("pointermove", pointer(1, 570, 271));
  harness.documentTarget.dispatch("pointerup", pointer(1, 570, 271));

  assert.deepEqual(
    harness.cycles.map(({ slotId, contentId, reason }) => ({ slotId, contentId, reason })),
    [{ slotId: "sauce-right-2", contentId: "house-sauce", reason: "swipe" }],
  );
  assert.equal(harness.starts.length, 0);
  assert.equal(harness.controls.getLoadout()["sauce-right-1"], "ketchup");
  assert.equal(harness.controls.getLoadout()["sauce-right-2"], "house-sauce");
});

test("long press then upward roulette motion assigns the release selection", (t) => {
  const harness = createHarness();
  t.after(() => harness.controls.dispose());
  const firstBottle = harness.buttonsRoot.children[0];

  firstBottle.dispatch("pointerdown", pointer(2, 520, 190));
  harness.timers.advance(CONDIMENT_RACK_HOLD_MS);

  assert.equal(harness.controls.getState(), "choosing");
  assert.equal(harness.controls.getOpenSlotId(), "sauce-right-1");
  assert.equal(harness.picker.hidden, false);
  assert.equal(harness.picker.children.length, 3);
  assert.equal(harness.picker.dataset.activeContentId, "ketchup");

  harness.documentTarget.dispatch(
    "pointermove",
    pointer(2, 520, 190 - CONDIMENT_RACK_ROULETTE_STEP_PX * 2),
  );
  assert.equal(harness.picker.dataset.activeContentId, "house-sauce");
  assert.equal(
    harness.picker.children.find(({ dataset }) => dataset.contentId === "house-sauce")
      .getAttribute("aria-selected"),
    "true",
  );
  harness.documentTarget.dispatch(
    "pointerup",
    pointer(2, 520, 190 - CONDIMENT_RACK_ROULETTE_STEP_PX * 2),
  );

  assert.deepEqual(
    harness.choices.map(({ slotId, contentId, reason }) => ({ slotId, contentId, reason })),
    [{ slotId: "sauce-right-1", contentId: "house-sauce", reason: "roulette" }],
  );
  assert.equal(harness.controls.getLoadout()["sauce-right-1"], "house-sauce");
  assert.equal(harness.picker.hidden, true);
});

test("left drag grabs the exact slot, forwards motion, and commits on release", (t) => {
  const harness = createHarness();
  t.after(() => harness.controls.dispose());
  const thirdBottle = harness.buttonsRoot.children[2];

  thirdBottle.dispatch("pointerdown", pointer(3, 550, 350));
  harness.documentTarget.dispatch("pointermove", pointer(3, 520, 351));
  harness.documentTarget.dispatch("pointermove", pointer(3, 470, 220));
  harness.documentTarget.dispatch("pointerup", pointer(3, 460, 200));

  assert.equal(harness.starts.length, 1);
  assert.equal(harness.starts[0].slotId, "sauce-right-3");
  assert.equal(harness.starts[0].sauceId, "house-sauce");
  assert.equal(harness.moves.length, 1);
  assert.equal(harness.commits.length, 1);
  assert.equal(harness.controls.getState(), "idle");
  assert.equal(thirdBottle.captured.has(3), false);
});

test("a tap leaves the mapping unchanged and only gives the gesture hint", (t) => {
  const statuses = [];
  const harness = createHarness({ onStatus: (message) => statuses.push(message) });
  t.after(() => harness.controls.dispose());
  const firstBottle = harness.buttonsRoot.children[0];

  firstBottle.dispatch("pointerdown", pointer(4, 520, 190));
  harness.documentTarget.dispatch("pointerup", pointer(4, 521, 191));

  assert.equal(harness.cycles.length, 0);
  assert.equal(harness.choices.length, 0);
  assert.equal(harness.starts.length, 0);
  assert.match(statuses.at(-1), /左拖拿瓶挤酱/);
});

test("long press without turning the roulette does not remap the bottle", (t) => {
  const harness = createHarness();
  t.after(() => harness.controls.dispose());
  const firstBottle = harness.buttonsRoot.children[0];

  firstBottle.dispatch("pointerdown", pointer(6, 520, 190));
  harness.timers.advance(CONDIMENT_RACK_HOLD_MS);
  harness.documentTarget.dispatch("pointerup", pointer(6, 520, 190));

  assert.equal(harness.choices.length, 0);
  assert.equal(harness.controls.getLoadout()["sauce-right-1"], "ketchup");
  assert.equal(harness.picker.hidden, true);
  assert.equal(harness.controls.getState(), "idle");
});

test("movement beyond the stationary tolerance cancels long-press roulette eligibility", (t) => {
  const harness = createHarness();
  t.after(() => harness.controls.dispose());
  const firstBottle = harness.buttonsRoot.children[0];

  firstBottle.dispatch("pointerdown", pointer(7, 520, 190));
  harness.documentTarget.dispatch(
    "pointermove",
    pointer(
      7,
      520 + CONDIMENT_RACK_HOLD_TOLERANCE_PX,
      190 - CONDIMENT_RACK_HOLD_TOLERANCE_PX,
    ),
  );
  harness.timers.advance(CONDIMENT_RACK_HOLD_MS);

  assert.equal(harness.controls.getState(), "pressing");
  assert.equal(harness.controls.getOpenSlotId(), null);
  assert.equal(harness.picker.hidden, true);
  assert.equal(harness.cycles.length, 0);
  assert.equal(harness.starts.length, 0);
  harness.documentTarget.dispatch("pointerup", pointer(7, 530, 180));
});

test("keyboard exposes right-cycle and vertical roulette without remapping ArrowLeft", (t) => {
  const harness = createHarness();
  t.after(() => harness.controls.dispose());
  const firstBottle = harness.buttonsRoot.children[0];

  firstBottle.dispatch("keydown", { key: "ArrowLeft", preventDefault() {} });
  assert.equal(harness.cycles.length, 0);
  firstBottle.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.equal(harness.controls.getLoadout()["sauce-right-1"], "mustard");
  firstBottle.dispatch("keydown", { key: "Enter", preventDefault() {} });
  harness.picker.dispatch("keydown", { key: "ArrowUp", preventDefault() {} });
  assert.equal(harness.picker.dataset.activeContentId, "house-sauce");
  harness.picker.dispatch("keydown", { key: "Enter", preventDefault() {} });

  assert.deepEqual(
    harness.choices.map(({ slotId, contentId, reason }) => ({ slotId, contentId, reason })),
    [{ slotId: "sauce-right-1", contentId: "house-sauce", reason: "keyboard-roulette" }],
  );
  assert.equal(harness.picker.hidden, true);
});

test("duplicate sauces remain slot-addressed during pickup", (t) => {
  const initialLoadout = {
    ...createDefaultWorkbenchLoadout(),
    "sauce-right-1": "ketchup",
    "sauce-right-2": "ketchup",
    "sauce-right-3": "ketchup",
  };
  const harness = createHarness({ initialLoadout });
  t.after(() => harness.controls.dispose());
  const secondBottle = harness.buttonsRoot.children[1];

  secondBottle.dispatch("pointerdown", pointer(5, 535, 270));
  harness.documentTarget.dispatch("pointermove", pointer(5, 505, 270));

  assert.equal(harness.starts[0].slotId, "sauce-right-2");
  assert.equal(harness.starts[0].sauceId, "ketchup");
});

for (const scenario of [
  {
    name: "pointercancel",
    reason: "pointer-cancel",
    trigger(harness, pointerId) {
      harness.documentTarget.dispatch("pointercancel", pointer(pointerId, 520, 150));
    },
  },
  {
    name: "document hidden",
    reason: "document-hidden",
    trigger(harness) {
      harness.documentTarget.hidden = true;
      harness.documentTarget.dispatch("visibilitychange");
    },
  },
  {
    name: "interaction disabled",
    reason: "disabled",
    trigger(harness) { harness.controls.setDisabled(true); },
  },
]) {
  test(`${scenario.name} cancels a carried bottle exactly once`, (t) => {
    const harness = createHarness();
    t.after(() => harness.controls.dispose());
    const firstBottle = harness.buttonsRoot.children[0];
    const pointerId = 10;
    firstBottle.dispatch("pointerdown", pointer(pointerId, 520, 190));
    harness.documentTarget.dispatch("pointermove", pointer(pointerId, 490, 190));

    scenario.trigger(harness, pointerId);
    harness.documentTarget.dispatch("pointerup", pointer(pointerId, 460, 200));

    assert.equal(harness.cancels.length, 1);
    assert.equal(harness.cancels[0].slotId, "sauce-right-1");
    assert.equal(harness.cancels[0].reason, scenario.reason);
    assert.equal(harness.commits.length, 0);
    assert.equal(harness.controls.getState(), "idle");
    assert.equal(firstBottle.captured.has(pointerId), false);
  });
}
