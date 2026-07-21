import test from "node:test";
import assert from "node:assert/strict";

import { createWorkbenchSlotPicker } from "../app/static/cooking-workbench-picker.mjs";
import { createDefaultWorkbenchLoadout } from "../app/static/workbench-loadout.mjs";

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, event = {}) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event);
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
}

class Element extends Events {
  constructor(dataset = {}) {
    super();
    this.dataset = { ...dataset };
    this.hidden = false;
    this.textContent = "";
    this.attributes = new Map();
    this.focusCalls = 0;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { this.focusCalls += 1; }
  closest(selector) {
    if (selector === "[data-workbench-content]" && this.dataset.workbenchContent) return this;
    if (selector === "[data-workbench-close]" && "workbenchClose" in this.dataset) return this;
    if (selector === "[data-workbench-reset]" && "workbenchReset" in this.dataset) return this;
    return null;
  }
}

function harness() {
  const root = new Element();
  root.hidden = true;
  const title = new Element();
  const close = new Element({ workbenchClose: "" });
  const reset = new Element({ workbenchReset: "" });
  const options = [
    ["bread", "bottom-bun"], ["bread", "middle-bun"], ["bread", "top-bun"],
    ["filling", "patty"], ["filling", "cheese"], ["filling", "tomato"],
    ["filling", "lettuce"], ["filling", "pickle"], ["filling", "onion"],
    ["sauce", "ketchup"], ["sauce", "mustard"], ["sauce", "house-sauce"],
  ].map(([workbenchRegion, workbenchContent]) => new Element({
    workbenchRegion,
    workbenchContent,
  }));
  root.querySelector = (selector) => {
    if (selector === "[data-workbench-title]") return title;
    if (selector === "[data-workbench-close]") return close;
    if (selector === "[data-workbench-reset]") return reset;
    return null;
  };
  root.querySelectorAll = (selector) => (
    selector === "[data-workbench-content]" ? options : []
  );
  return { root, title, close, reset, options };
}

test("opens the exact physical slot and exposes only candidates from its region", () => {
  const ui = harness();
  const picker = createWorkbenchSlotPicker({
    root: ui.root,
    initialLoadout: createDefaultWorkbenchLoadout(),
  });

  assert.equal(picker.open({ slotId: "filling-back-2", region: "filling" }), true);

  assert.equal(ui.root.hidden, false);
  assert.equal(ui.root.getAttribute("aria-hidden"), "false");
  assert.equal(ui.root.dataset.slotId, "filling-back-2");
  assert.equal(ui.title.textContent, "后排配料 · 2号槽");
  assert.equal(ui.root.focusCalls, 1);
  for (const option of ui.options) {
    assert.equal(option.hidden, option.dataset.workbenchRegion !== "filling");
  }
  const cheese = ui.options.find(({ dataset }) => dataset.workbenchContent === "cheese");
  assert.equal(cheese.getAttribute("aria-pressed"), "true");
  assert.equal(cheese.dataset.current, "true");
});

test("selecting a candidate updates only that slot, emits once, and closes", () => {
  const ui = harness();
  const changes = [];
  const closes = [];
  const picker = createWorkbenchSlotPicker({
    root: ui.root,
    initialLoadout: createDefaultWorkbenchLoadout(),
    onChange: (loadout, detail) => changes.push([loadout, detail]),
    onRequestClose: (reason) => closes.push(reason),
  });
  picker.open({ slotId: "filling-back-2", region: "filling" });
  const onion = ui.options.find(({ dataset }) => dataset.workbenchContent === "onion");

  ui.root.emit("click", { target: onion });

  assert.equal(changes.length, 1);
  assert.equal(changes[0][0]["filling-back-2"], "onion");
  assert.equal(changes[0][0]["filling-back-1"], "patty");
  assert.deepEqual(changes[0][1], {
    slotId: "filling-back-2",
    region: "filling",
    contentId: "onion",
  });
  assert.equal(ui.root.hidden, true);
  assert.deepEqual(closes, ["selected"]);
  assert.equal(picker.getLoadout()["filling-back-2"], "onion");
});

test("a rejected application leaves the current loadout and sheet unchanged", () => {
  const ui = harness();
  const picker = createWorkbenchSlotPicker({
    root: ui.root,
    initialLoadout: createDefaultWorkbenchLoadout(),
    onChange() { throw new Error("stage rejected"); },
  });
  picker.open({ slotId: "bread-left-1", region: "bread" });
  const topBun = ui.options.find(({ dataset }) => dataset.workbenchContent === "top-bun");

  assert.throws(() => ui.root.emit("click", { target: topBun }), /stage rejected/);
  assert.equal(picker.getLoadout()["bread-left-1"], "bottom-bun");
  assert.equal(ui.root.hidden, false);
});

test("reset restores only the selected slot default and supports duplicate materials", () => {
  const ui = harness();
  const changes = [];
  const picker = createWorkbenchSlotPicker({
    root: ui.root,
    initialLoadout: {
      ...createDefaultWorkbenchLoadout(),
      "filling-back-1": "patty",
      "filling-back-2": "patty",
    },
    onChange: (loadout, detail) => changes.push([loadout, detail]),
  });
  picker.open({ slotId: "filling-back-2", region: "filling" });

  ui.root.emit("click", { target: ui.reset });

  assert.equal(changes.length, 1);
  assert.equal(changes[0][0]["filling-back-1"], "patty");
  assert.equal(changes[0][0]["filling-back-2"], "cheese");
  assert.equal(changes[0][1].contentId, "cheese");
  assert.equal(changes[0][1].reset, true);
});

test("backdrop, close button, and Escape close without changing the loadout", () => {
  for (const mode of ["backdrop", "button", "escape"]) {
    const ui = harness();
    const closes = [];
    const picker = createWorkbenchSlotPicker({
      root: ui.root,
      initialLoadout: createDefaultWorkbenchLoadout(),
      onRequestClose: (reason) => closes.push(reason),
    });
    picker.open({ slotId: "sauce-right-2", region: "sauce" });
    if (mode === "backdrop") ui.root.emit("click", { target: ui.root });
    if (mode === "button") ui.root.emit("click", { target: ui.close });
    if (mode === "escape") ui.root.emit("keydown", { key: "Escape", preventDefault() {} });
    assert.equal(ui.root.hidden, true, mode);
    assert.deepEqual(closes, [mode === "escape" ? "escape" : "dismissed"], mode);
    assert.equal(picker.getLoadout()["sauce-right-2"], "mustard", mode);
  }
});

test("invalid selector payloads fail closed and dispose removes delegated listeners", () => {
  const ui = harness();
  const picker = createWorkbenchSlotPicker({ root: ui.root });

  assert.equal(picker.open({ slotId: "missing", region: "filling" }), false);
  assert.equal(picker.open({ slotId: "bread-left-1", region: "sauce" }), false);
  assert.equal(ui.root.hidden, true);
  assert.equal(ui.root.count("click"), 1);
  assert.equal(ui.root.count("keydown"), 1);

  picker.dispose();
  assert.equal(ui.root.count("click"), 0);
  assert.equal(ui.root.count("keydown"), 0);
  assert.equal(picker.open({ slotId: "bread-left-1", region: "bread" }), false);
});

test("constructor rolls back its first listener if the second listener cannot attach", () => {
  const ui = harness();
  const originalAdd = ui.root.addEventListener.bind(ui.root);
  ui.root.addEventListener = (type, callback) => {
    if (type === "keydown") throw new Error("keydown listener rejected");
    originalAdd(type, callback);
  };

  assert.throws(
    () => createWorkbenchSlotPicker({ root: ui.root }),
    /keydown listener rejected/,
  );
  assert.equal(ui.root.count("click"), 0);
  assert.equal(ui.root.count("keydown"), 0);
});

test("closing the picker returns focus to the supplied cooking surface", () => {
  const ui = harness();
  const returnTarget = new Element();
  const picker = createWorkbenchSlotPicker({ root: ui.root, returnTarget });

  picker.open({ slotId: "bread-left-1", region: "bread" });
  ui.root.emit("click", { target: ui.close });

  assert.equal(returnTarget.focusCalls, 1);
});
