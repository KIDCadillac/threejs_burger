import test from "node:test";
import assert from "node:assert/strict";

import { createWorkbenchSlotControls } from "../app/static/workbench-slot-controls.mjs";
import {
  createDefaultWorkbenchLoadout,
  WORKBENCH_SLOTS,
} from "../app/static/workbench-loadout.mjs";

class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const next = force ?? !this.values.has(value);
    if (next) this.values.add(value);
    else this.values.delete(value);
    return next;
  }
}

class Style {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) ?? ""; }
}

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new ClassList();
    this.style = new Style();
    this.hidden = false;
    this.textContent = "";
    this.tabIndex = 0;
    this.focusCalls = 0;
    this.captured = [];
    this.released = [];
  }
  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) {
    const payload = {
      target: this,
      currentTarget: this,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      ...event,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(payload);
    return payload;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  setPointerCapture(pointerId) { this.captured.push(pointerId); }
  releasePointerCapture(pointerId) { this.released.push(pointerId); }
  focus() { this.focusCalls += 1; }
}

class Document {
  createElement(tagName) { return new Element(tagName); }
  createElementNS(_namespace, tagName) { return new Element(tagName); }
}

class Timers {
  constructor() { this.nextId = 1; this.pending = new Map(); }
  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.pending.set(id, { callback, delay });
    return id;
  }
  clearTimeout(id) { this.pending.delete(id); }
  advance(delay = Infinity) {
    for (const [id, timer] of [...this.pending]) {
      if (timer.delay <= delay) {
        this.pending.delete(id);
        timer.callback();
      }
    }
  }
}

function projectedAnchors() {
  const positions = {
    bread: [[34, 270], [34, 390], [34, 510]],
    filling: [[90, 86], [160, 86], [230, 86], [300, 86]],
    sauce: [[356, 270], [356, 390], [356, 510]],
  };
  const seen = { bread: 0, filling: 0, sauce: 0 };
  return WORKBENCH_SLOTS.map(({ slotId, region }) => {
    const [x, y] = positions[region][seen[region]++];
    return { slotId, region, x, y, visible: true };
  });
}

function harness({ width = 390, anchors = projectedAnchors(), reducedMotion = false } = {}) {
  const document = new Document();
  const root = new Element();
  root.ownerDocument = document;
  const lines = new Element("svg");
  const buttons = new Element();
  const regions = new Element();
  const menu = new Element();
  const hint = new Element("p");
  root.querySelector = (selector) => ({
    "[data-slot-lines]": lines,
    "[data-slot-buttons]": buttons,
    "[data-slot-regions]": regions,
    "[data-slot-region-menu]": menu,
    "[data-slot-hint]": hint,
  })[selector] ?? null;
  const canvas = new Element("canvas");
  canvas.getBoundingClientRect = () => ({ width, height: 844, left: 0, top: 0 });
  const timers = new Timers();
  const afterFrame = [];
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
  };
  const calls = { cycle: [], preview: [], picker: [], highlight: [] };
  const controls = createWorkbenchSlotControls({
    root,
    canvas,
    initialLoadout: createDefaultWorkbenchLoadout(),
    getProjectedAnchors: () => anchors,
    subscribeAfterFrame(callback) { afterFrame.push(callback); return () => afterFrame.pop(); },
    onCycle: (detail) => calls.cycle.push(detail),
    onPreview: (detail) => calls.preview.push(detail),
    onOpenPicker: (detail) => calls.picker.push(detail),
    onHighlight: (...detail) => calls.highlight.push(detail),
    storage,
    timers,
    matchMedia: () => ({ matches: reducedMotion }),
  });
  return {
    controls, root, canvas, lines, buttons, regions, menu, hint,
    timers, calls, afterFrame, storageValues,
  };
}

test("renders ten readable controls and refreshes positions and guide lines every frame", () => {
  const ui = harness();

  assert.equal(ui.buttons.children.length, 10);
  assert.equal(ui.lines.children.length, 10);
  assert.equal(ui.regions.children.length, 0);
  const patty = ui.buttons.children.find(({ dataset }) => dataset.slotId === "filling-back-1");
  assert.equal(patty.dataset.region, "filling");
  assert.equal(patty.style.getPropertyValue("--slot-x"), "90px");
  assert.equal(patty.style.getPropertyValue("--slot-y"), "34px");
  assert.match(patty.getAttribute("aria-label"), /后排配料 1.*牛肉饼.*芝士.*长按/);
  assert.equal(patty.getAttribute("type"), "button");

  const before = ui.lines.children;
  ui.afterFrame[0]();
  assert.notStrictEqual(ui.lines.children, before);
  assert.equal(ui.lines.children.length, 10);
});

test("keeps ten rail controls but omits guide lines when projected anchors are hidden", () => {
  const anchors = projectedAnchors().map((anchor) => ({ ...anchor, visible: false }));
  const ui = harness({ anchors });

  assert.equal(ui.buttons.children.length, 10);
  assert.equal(ui.regions.children.length, 0);
  assert.equal(ui.lines.children.length, 0);
  ui.controls.dispose();
});

test("a short press previews then cycles once and clears every transient effect", () => {
  const ui = harness();
  const button = ui.buttons.children.find(({ dataset }) => dataset.slotId === "filling-back-1");

  button.dispatch("pointerdown", { pointerId: 7, clientX: 30, clientY: 40, isPrimary: true });
  assert.deepEqual(button.captured, [7]);
  assert.equal(button.dataset.active, "true");
  assert.deepEqual(ui.calls.preview, [{ slotId: "filling-back-1", contentId: "cheese" }]);
  assert.deepEqual(ui.calls.highlight, [["filling-back-1", true]]);

  button.dispatch("pointerup", { pointerId: 7, clientX: 31, clientY: 41, isPrimary: true });
  assert.deepEqual(ui.calls.cycle, [{ slotId: "filling-back-1", contentId: "cheese" }]);
  assert.deepEqual(ui.calls.preview.at(-1), null);
  assert.deepEqual(ui.calls.highlight.at(-1), ["filling-back-1", false]);
  assert.equal(button.dataset.active, undefined);
  assert.deepEqual(ui.calls.picker, []);
});

test("a 350ms hold opens the full picker and never cycles on release", () => {
  const ui = harness();
  const button = ui.buttons.children.find(({ dataset }) => dataset.slotId === "sauce-right-2");

  button.dispatch("pointerdown", { pointerId: 8, clientX: 12, clientY: 14, isPrimary: true });
  ui.timers.advance(350);
  assert.deepEqual(ui.calls.picker, [{ slotId: "sauce-right-2", region: "sauce" }]);
  assert.deepEqual(ui.calls.preview.at(-1), null);
  button.dispatch("pointerup", { pointerId: 8, clientX: 12, clientY: 14, isPrimary: true });
  assert.deepEqual(ui.calls.cycle, []);
});

test("drag slop, a second pointer, cancellation, and dispose abort the armed gesture", () => {
  for (const mode of ["move", "second", "cancel", "dispose"]) {
    const ui = harness();
    const button = ui.buttons.children[0];
    button.dispatch("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, isPrimary: true });
    if (mode === "move") button.dispatch("pointermove", { pointerId: 1, clientX: 19, clientY: 10 });
    if (mode === "second") button.dispatch("pointerdown", { pointerId: 2, clientX: 10, clientY: 10, isPrimary: false });
    if (mode === "cancel") button.dispatch("pointercancel", { pointerId: 1 });
    if (mode === "dispose") ui.controls.dispose();
    ui.timers.advance(350);
    if (mode !== "dispose") button.dispatch("pointerup", { pointerId: 1, clientX: 19, clientY: 10 });
    assert.deepEqual(ui.calls.cycle, [], mode);
    assert.deepEqual(ui.calls.picker, [], mode);
    assert.deepEqual(ui.calls.preview.at(-1), null, mode);
  }
});

test("keyboard controls cycle, open the picker, and expose compact region menus", () => {
  const ui = harness({ width: 320 });
  assert.equal(ui.buttons.children.length, 0);
  assert.equal(ui.regions.children.length, 3);
  assert.match(ui.regions.children[1].getAttribute("aria-label"), /配料.*4/);

  ui.regions.children[1].dispatch("click");
  assert.equal(ui.menu.hidden, false);
  assert.equal(ui.menu.children.length, 4);
  const slotButton = ui.menu.children[0];
  slotButton.dispatch("keydown", { key: "Enter" });
  assert.deepEqual(ui.calls.cycle.at(-1), { slotId: "filling-back-1", contentId: "cheese" });
  slotButton.dispatch("keydown", { key: "ArrowDown" });
  assert.deepEqual(ui.calls.picker.at(-1), { slotId: "filling-back-1", region: "filling" });
  slotButton.dispatch("keydown", { key: "Escape" });
  assert.equal(ui.menu.hidden, true);
  assert.equal(ui.regions.children[1].focusCalls, 1);
});

test("onboarding is stored once, reduced motion disables pulses, and hiding clears UI", () => {
  const ui = harness();
  assert.equal(ui.hint.hidden, false);
  assert.equal(ui.storageValues.get("workbench-slot-controls-onboarded:v1"), "1");
  assert.equal(ui.root.classList.contains("is-onboarding"), true);

  ui.controls.setHidden(true);
  assert.equal(ui.root.hidden, true);
  ui.controls.setHidden(false);
  assert.equal(ui.root.hidden, false);

  const reduced = harness({ reducedMotion: true });
  assert.equal(reduced.root.classList.contains("is-onboarding"), false);
  reduced.controls.dispose();
  assert.equal(reduced.root.hidden, true);
});

test("projection failure degrades to three usable region entrances", () => {
  const document = new Document();
  const root = new Element();
  root.ownerDocument = document;
  const nodes = Object.fromEntries([
    "lines", "buttons", "regions", "region-menu", "hint",
  ].map((name) => [name, new Element()]));
  root.querySelector = (selector) => {
    const key = selector.match(/data-slot-([^\]]+)/)?.[1];
    return nodes[key] ?? null;
  };
  const canvas = new Element("canvas");
  canvas.getBoundingClientRect = () => ({ width: 390, height: 844 });
  const controls = createWorkbenchSlotControls({
    root,
    canvas,
    getProjectedAnchors() { throw new Error("webgl lost"); },
  });

  assert.equal(nodes.buttons.children.length, 0);
  assert.equal(nodes.regions.children.length, 3);
  controls.dispose();
});
