import test from "node:test";
import assert from "node:assert/strict";

import { createCookingTuningPanel } from "../app/static/cooking-tuning-panel.mjs";
import {
  DEFAULT_BURGER_TUNING,
  serializeBurgerTuning,
} from "../app/static/burger-tuning.mjs";

const INGREDIENT_IDS = [
  "bottom-bun",
  "patty",
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "top-bun",
];

const TUNING_KEYS = [
  "presentationScale",
  "scaleX",
  "scaleY",
  "scaleZ",
  "sinkY",
];

class FakeElement {
  constructor({ documentTarget, type = "", dataset = {} } = {}) {
    this.ownerDocument = documentTarget;
    this.type = type;
    this.dataset = { ...dataset };
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.tabIndex = 0;
    this.readOnly = false;
    this.focusCalls = 0;
    this.selectCalls = 0;
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...init,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener.call(this, event);
    }
    return event;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  focus() {
    this.focusCalls += 1;
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  select() {
    this.selectCalls += 1;
  }
}

function makeDomHarness({ omit = [] } = {}) {
  const documentTarget = { activeElement: null };
  const root = new FakeElement({ documentTarget });
  root.id = "tuning-sheet";
  root.hidden = true;

  const tabs = INGREDIENT_IDS.map((ingredientId) => new FakeElement({
    documentTarget,
    dataset: { ingredientId },
  }));
  const inputs = TUNING_KEYS.flatMap((tuningKey) => ["range", "number"].map(
    (type) => new FakeElement({
      documentTarget,
      type,
      dataset: { tuningKey },
    }),
  ));
  const actions = Object.fromEntries([
    "tuning-copy",
    "tuning-reset-current",
    "tuning-reset-all",
  ].map((action) => [action, new FakeElement({
    documentTarget,
    dataset: { action },
  })]));
  const status = new FakeElement({ documentTarget });
  const fallback = new FakeElement({ documentTarget });
  const closeButton = new FakeElement({
    documentTarget,
    dataset: { action: "tuning-close" },
  });
  fallback.readOnly = true;
  fallback.hidden = true;

  root.querySelectorAll = (selector) => {
    if (selector === "[data-ingredient-id]") {
      return tabs.filter((tab) => !omit.includes(`tab:${tab.dataset.ingredientId}`));
    }
    if (selector === "[data-tuning-key]") {
      return inputs.filter((candidate) => !omit.includes(
        `input:${candidate.dataset.tuningKey}:${candidate.type}`,
      ));
    }
    return [];
  };
  root.querySelector = (selector) => {
    const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
    if (action === "tuning-close") {
      return omit.includes("action:tuning-close") ? null : closeButton;
    }
    if (action) return omit.includes(`action:${action}`) ? null : actions[action] ?? null;
    if (selector === "[data-tuning-status]") return omit.includes("status") ? null : status;
    if (selector === "[data-tuning-copy-fallback]") {
      return omit.includes("fallback") ? null : fallback;
    }
    return null;
  };

  const input = (key, type) => inputs.find((candidate) => (
    candidate.dataset.tuningKey === key && candidate.type === type
  ));

  return {
    root,
    documentTarget,
    tabs,
    inputs,
    input,
    actions,
    closeButton,
    status,
    fallback,
  };
}

function makeHarness({
  initialTuning,
  navigatorTarget,
  onChange,
  onRequestClose,
  omit,
} = {}) {
  const dom = makeDomHarness({ omit });
  const changes = [];
  const panel = createCookingTuningPanel({
    root: dom.root,
    documentTarget: dom.documentTarget,
    navigatorTarget,
    initialTuning,
    onChange: onChange ?? ((value) => changes.push(value)),
    onRequestClose,
  });

  return {
    ...dom,
    panel,
    changes,
  };
}

function assertFrozenTree(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertFrozenTree(child);
}

test("initialization normalizes tuning and synchronizes all seven ingredient tabs", () => {
  const harness = makeHarness({
    initialTuning: {
      version: 1,
      global: { presentationScale: 9 },
      ingredients: {
        "bottom-bun": { scaleX: 0.2 },
        cheese: { scaleY: 2.1 },
      },
    },
  });

  assert.equal(Object.isFrozen(harness.panel), true);
  assert.deepEqual(harness.tabs.map((tab) => tab.dataset.ingredientId), INGREDIENT_IDS);
  assert.deepEqual(
    harness.tabs.map((tab) => tab.getAttribute("aria-selected")),
    ["true", "false", "false", "false", "false", "false", "false"],
  );
  assert.deepEqual(harness.tabs.map((tab) => tab.tabIndex), [0, -1, -1, -1, -1, -1, -1]);
  assert.equal(harness.input("presentationScale", "range").value, "0.9");
  assert.equal(harness.input("presentationScale", "number").value, "0.9");
  assert.equal(harness.input("scaleX", "range").value, "0.6");
  assert.equal(harness.input("scaleX", "number").value, "0.6");
  assert.equal(harness.input("scaleY", "range").value, "1");
  assert.deepEqual(harness.changes, []);

  const tuning = harness.panel.getTuning();
  assert.equal(tuning.ingredients.cheese.scaleY, 2.1);
  assertFrozenTree(tuning);
  assert.equal(harness.root.hidden, true);
  assert.equal(harness.root.getAttribute("aria-hidden"), "true");
});

test("each ingredient tab becomes selected and reflects its values without notifying", () => {
  const ingredients = Object.fromEntries(INGREDIENT_IDS.map((id, index) => [
    id,
    { scaleX: 0.7 + index * 0.1 },
  ]));
  const harness = makeHarness({
    initialTuning: { version: 1, ingredients },
  });

  harness.tabs.forEach((tab, index) => {
    tab.dispatch("click");

    assert.equal(tab.getAttribute("aria-selected"), "true", tab.dataset.ingredientId);
    assert.equal(tab.tabIndex, 0, tab.dataset.ingredientId);
    assert.equal(
      harness.input("scaleX", "number").value,
      String(0.7 + index * 0.1),
      tab.dataset.ingredientId,
    );
    assert.equal(
      harness.tabs.filter((candidate) => candidate.getAttribute("aria-selected") === "true").length,
      1,
    );
  });

  assert.deepEqual(harness.changes, []);
});

test("ingredient tabs support wrapped arrow navigation plus Home and End", () => {
  const harness = makeHarness();
  harness.panel.open();

  const first = harness.tabs[0];
  const second = harness.tabs[1];
  const last = harness.tabs.at(-1);
  const right = first.dispatch("keydown", { key: "ArrowRight" });
  assert.equal(right.defaultPrevented, true);
  assert.equal(second.getAttribute("aria-selected"), "true");
  assert.strictEqual(harness.documentTarget.activeElement, second);

  const left = second.dispatch("keydown", { key: "ArrowLeft" });
  assert.equal(left.defaultPrevented, true);
  assert.equal(first.getAttribute("aria-selected"), "true");
  assert.strictEqual(harness.documentTarget.activeElement, first);

  first.dispatch("keydown", { key: "ArrowLeft" });
  assert.equal(last.getAttribute("aria-selected"), "true");
  assert.strictEqual(harness.documentTarget.activeElement, last);

  last.dispatch("keydown", { key: "Home" });
  assert.equal(first.getAttribute("aria-selected"), "true");
  first.dispatch("keydown", { key: "End" });
  assert.equal(last.getAttribute("aria-selected"), "true");
  assert.deepEqual(harness.changes, []);
});

test("open modal traps Tab focus between the selected tab and close button", () => {
  const harness = makeHarness();
  harness.panel.open();
  const first = harness.tabs[0];

  harness.documentTarget.activeElement = harness.closeButton;
  const forward = harness.root.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(forward.defaultPrevented, true);
  assert.strictEqual(harness.documentTarget.activeElement, first);

  harness.documentTarget.activeElement = first;
  const backward = harness.root.dispatch("keydown", { key: "Tab", shiftKey: true });
  assert.equal(backward.defaultPrevented, true);
  assert.strictEqual(harness.documentTarget.activeElement, harness.closeButton);

  const outside = new FakeElement({ documentTarget: harness.documentTarget });
  harness.documentTarget.activeElement = outside;
  const recovered = harness.root.dispatch("keydown", { key: "Tab" });
  assert.equal(recovered.defaultPrevented, true);
  assert.strictEqual(harness.documentTarget.activeElement, first);
});

test("Escape requests app-owned close only while the modal is open", () => {
  const requests = [];
  const harness = makeHarness({ onRequestClose: () => requests.push("close") });

  const closedEvent = harness.root.dispatch("keydown", { key: "Escape" });
  assert.equal(closedEvent.defaultPrevented, false);
  assert.deepEqual(requests, []);

  harness.panel.open();
  const openEvent = harness.root.dispatch("keydown", { key: "Escape" });
  assert.equal(openEvent.defaultPrevented, true);
  assert.equal(openEvent.propagationStopped, true);
  assert.deepEqual(requests, ["close"]);
  assert.equal(harness.root.hidden, false, "the controller must not bypass app closeTuning");
});

test("range and number inputs synchronize before one normalized ingredient change", () => {
  let harness;
  const observations = [];
  harness = makeHarness({
    onChange(value) {
      observations.push({
        value,
        rangeValue: harness.input("scaleY", "range").value,
        numberValue: harness.input("scaleY", "number").value,
      });
    },
  });
  harness.tabs.find((tab) => tab.dataset.ingredientId === "cheese").dispatch("click");

  harness.input("scaleY", "range").value = "2.2";
  harness.input("scaleY", "range").dispatch("input");

  assert.equal(observations.length, 1);
  assert.equal(observations[0].rangeValue, "2.2");
  assert.equal(observations[0].numberValue, "2.2");
  assert.equal(observations[0].value.ingredients.cheese.scaleY, 2.2);
  assert.equal(observations[0].value.ingredients["bottom-bun"].scaleY, 1);
  assertFrozenTree(observations[0].value);

  harness.input("scaleY", "number").value = "1.75";
  harness.input("scaleY", "number").dispatch("input");

  assert.equal(observations.length, 2);
  assert.equal(harness.input("scaleY", "range").value, "1.75");
  assert.equal(harness.input("scaleY", "number").value, "1.75");
  assert.equal(harness.panel.getTuning().ingredients.cheese.scaleY, 1.75);
});

test("presentation scale edits the global value without changing the selected ingredient", () => {
  const harness = makeHarness({
    initialTuning: {
      version: 1,
      ingredients: { patty: { scaleX: 1.25 } },
    },
  });
  harness.tabs.find((tab) => tab.dataset.ingredientId === "patty").dispatch("click");
  const beforeIngredients = harness.panel.getTuning().ingredients;

  harness.input("presentationScale", "number").value = "0.84";
  harness.input("presentationScale", "number").dispatch("input");

  assert.equal(harness.changes.length, 1);
  assert.equal(harness.changes[0].global.presentationScale, 0.84);
  assert.deepEqual(harness.changes[0].ingredients, beforeIngredients);
  assert.equal(harness.input("presentationScale", "range").value, "0.84");
  assert.equal(harness.input("presentationScale", "number").value, "0.84");
});

test("empty and non-finite input falls back safely while finite bounds are clamped", () => {
  const harness = makeHarness();
  harness.tabs.find((tab) => tab.dataset.ingredientId === "cheese").dispatch("click");

  harness.input("scaleY", "number").value = "";
  harness.input("scaleY", "number").dispatch("input");
  assert.equal(harness.panel.getTuning().ingredients.cheese.scaleY, 1.45);
  assert.equal(harness.input("scaleY", "range").value, "1.45");

  harness.input("scaleY", "range").value = "Infinity";
  harness.input("scaleY", "range").dispatch("input");
  assert.equal(harness.panel.getTuning().ingredients.cheese.scaleY, 1.45);

  for (const [key, rawValue, expected] of [
    ["scaleX", "-100", 0.6],
    ["scaleY", "99", 2.5],
    ["scaleZ", "99", 1.6],
    ["sinkY", "-5", 0],
    ["presentationScale", "9", 0.9],
  ]) {
    harness.input(key, "number").value = rawValue;
    harness.input(key, "number").dispatch("input");
    const actual = key === "presentationScale"
      ? harness.panel.getTuning().global[key]
      : harness.panel.getTuning().ingredients.cheese[key];
    assert.equal(actual, expected, key);
    assert.equal(harness.input(key, "range").value, String(expected), key);
    assert.equal(harness.input(key, "number").value, String(expected), key);
  }

  assert.equal(harness.changes.length, 7);
});

test("setTuning normalizes and synchronizes the selected tab without notifying", () => {
  const harness = makeHarness();
  const lettuceTab = harness.tabs.find((tab) => tab.dataset.ingredientId === "lettuce");
  lettuceTab.dispatch("click");
  const source = {
    version: 1,
    global: { presentationScale: 0.8 },
    ingredients: { lettuce: { scaleX: 99, scaleY: 2.2, sinkY: 0.04 } },
  };

  const result = harness.panel.setTuning(source);

  assert.strictEqual(result, harness.panel.getTuning());
  assertFrozenTree(result);
  assert.equal(result.global.presentationScale, 0.8);
  assert.equal(result.ingredients.lettuce.scaleX, 1.6);
  assert.equal(result.ingredients.lettuce.scaleY, 2.2);
  assert.equal(result.ingredients.lettuce.sinkY, 0.04);
  assert.equal(harness.input("presentationScale", "range").value, "0.8");
  assert.equal(harness.input("scaleX", "number").value, "1.6");
  assert.equal(harness.input("scaleY", "range").value, "2.2");
  assert.equal(lettuceTab.getAttribute("aria-selected"), "true");
  assert.deepEqual(harness.changes, []);
  assert.deepEqual(source.ingredients.lettuce, { scaleX: 99, scaleY: 2.2, sinkY: 0.04 });
});

test("reset current restores only the selected ingredient and notifies once", () => {
  const harness = makeHarness({
    initialTuning: {
      version: 1,
      global: { presentationScale: 0.85 },
      ingredients: {
        "bottom-bun": { scaleX: 1.2 },
        cheese: { scaleX: 1.3, scaleY: 2.2, scaleZ: 0.8, sinkY: 0.05 },
      },
    },
  });
  const cheeseTab = harness.tabs.find((tab) => tab.dataset.ingredientId === "cheese");
  cheeseTab.dispatch("click");

  harness.actions["tuning-reset-current"].dispatch("click");

  assert.equal(harness.changes.length, 1);
  assert.deepEqual(
    harness.changes[0].ingredients.cheese,
    DEFAULT_BURGER_TUNING.ingredients.cheese,
  );
  assert.equal(harness.changes[0].global.presentationScale, 0.85);
  assert.equal(harness.changes[0].ingredients["bottom-bun"].scaleX, 1.2);
  assert.equal(harness.input("scaleY", "range").value, "1.45");
  assert.equal(harness.input("sinkY", "number").value, "0.008");
  assert.equal(cheeseTab.getAttribute("aria-selected"), "true");
});

test("reset all restores the complete defaults, preserves the tab, and notifies once", () => {
  const harness = makeHarness({
    initialTuning: {
      version: 1,
      global: { presentationScale: 0.88 },
      ingredients: {
        patty: { scaleY: 2 },
        pickle: { scaleX: 1.4, scaleY: 1.8, scaleZ: 0.7, sinkY: 0.1 },
      },
    },
  });
  const pickleTab = harness.tabs.find((tab) => tab.dataset.ingredientId === "pickle");
  pickleTab.dispatch("click");

  harness.actions["tuning-reset-all"].dispatch("click");

  assert.equal(harness.changes.length, 1);
  assert.deepEqual(harness.changes[0], DEFAULT_BURGER_TUNING);
  assert.strictEqual(harness.panel.getTuning(), harness.changes[0]);
  assert.equal(pickleTab.getAttribute("aria-selected"), "true");
  assert.equal(harness.input("presentationScale", "number").value, "0.72");
  assert.equal(harness.input("scaleX", "range").value, "1");
  assert.equal(harness.input("sinkY", "number").value, "0");
});

test("open and close are idempotent, focus the selected tab, and restore prior focus", () => {
  const harness = makeHarness();
  const opener = new FakeElement({ documentTarget: harness.documentTarget });
  opener.focus();
  const tomatoTab = harness.tabs.find((tab) => tab.dataset.ingredientId === "tomato");
  tomatoTab.dispatch("click");

  assert.equal(harness.panel.open(), true);
  assert.equal(harness.panel.open(), false);
  assert.equal(harness.root.hidden, false);
  assert.equal(harness.root.getAttribute("aria-hidden"), "false");
  assert.equal(tomatoTab.focusCalls, 1);
  assert.strictEqual(harness.documentTarget.activeElement, tomatoTab);

  assert.equal(harness.panel.close(), true);
  assert.equal(harness.panel.close(), false);
  assert.equal(harness.root.hidden, true);
  assert.equal(harness.root.getAttribute("aria-hidden"), "true");
  assert.equal(opener.focusCalls, 2);
  assert.strictEqual(harness.documentTarget.activeElement, opener);
});

test("copy invokes clipboard immediately with stable JSON and reports success", async () => {
  const writes = [];
  let resolveWrite;
  const writeFinished = new Promise((resolve) => {
    resolveWrite = resolve;
  });
  const harness = makeHarness({
    initialTuning: {
      version: 1,
      global: { presentationScale: 0.82 },
      ingredients: { cheese: { scaleY: 1.9, sinkY: 0.03 } },
    },
    navigatorTarget: {
      clipboard: {
        writeText(value) {
          writes.push(value);
          return writeFinished;
        },
      },
    },
  });
  const expected = serializeBurgerTuning(harness.panel.getTuning());

  harness.panel.open();
  harness.actions["tuning-copy"].dispatch("click");

  assert.deepEqual(writes, [expected]);
  resolveWrite();
  await writeFinished;
  await Promise.resolve();
  assert.equal(harness.status.textContent, "参数已复制");
  assert.equal(harness.fallback.hidden, true);
});

test("copy rejection or a missing API reveals and selects the same stable JSON", async () => {
  for (const navigatorTarget of [
    { clipboard: { writeText: () => Promise.reject(new Error("denied")) } },
    {},
  ]) {
    const harness = makeHarness({
      initialTuning: {
        version: 1,
        global: { presentationScale: 0.79 },
        ingredients: { lettuce: { scaleY: 2.1 } },
      },
      navigatorTarget,
    });
    const expected = serializeBurgerTuning(harness.panel.getTuning());

    harness.panel.open();
    assert.doesNotThrow(() => harness.actions["tuning-copy"].dispatch("click"));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(harness.fallback.value, expected);
    assert.equal(harness.fallback.hidden, false);
    assert.equal(harness.fallback.focusCalls, 1);
    assert.equal(harness.fallback.selectCalls, 1);
    assert.strictEqual(harness.documentTarget.activeElement, harness.fallback);
    assert.equal(harness.status.textContent, "复制失败，请手动复制");
  }
});

test("late clipboard fulfillment or rejection cannot change DOM after disposal", async () => {
  for (const outcome of ["resolve", "reject"]) {
    let resolveWrite;
    let rejectWrite;
    const writeFinished = new Promise((resolve, reject) => {
      resolveWrite = resolve;
      rejectWrite = reject;
    });
    const harness = makeHarness({
      navigatorTarget: {
        clipboard: { writeText: () => writeFinished },
      },
    });
    harness.status.textContent = "等待复制";
    harness.panel.open();
    harness.actions["tuning-copy"].dispatch("click");

    harness.panel.dispose();
    harness.status.textContent = "已销毁";
    if (outcome === "resolve") resolveWrite();
    else rejectWrite(new Error("late rejection"));
    await writeFinished.catch(() => {});
    await Promise.resolve();

    assert.equal(harness.status.textContent, "已销毁", outcome);
    assert.equal(harness.fallback.hidden, true, outcome);
    assert.equal(harness.fallback.focusCalls, 0, outcome);
    assert.equal(harness.fallback.selectCalls, 0, outcome);
  }
});

test("only the latest overlapping copy request may update status or fallback", async () => {
  for (const staleOutcome of ["resolve", "reject"]) {
    const requests = [];
    const harness = makeHarness({
      navigatorTarget: {
        clipboard: {
          writeText() {
            let resolve;
            let reject;
            const promise = new Promise((resolvePromise, rejectPromise) => {
              resolve = resolvePromise;
              reject = rejectPromise;
            });
            requests.push({ promise, resolve, reject });
            return promise;
          },
        },
      },
    });
    harness.status.textContent = "等待最新请求";
    harness.panel.open();

    harness.actions["tuning-copy"].dispatch("click");
    harness.actions["tuning-copy"].dispatch("click");
    assert.equal(requests.length, 2);

    if (staleOutcome === "resolve") requests[0].resolve();
    else requests[0].reject(new Error("stale rejection"));
    await requests[0].promise.catch(() => {});
    await Promise.resolve();

    assert.equal(harness.status.textContent, "等待最新请求", staleOutcome);
    assert.equal(harness.fallback.hidden, true, staleOutcome);
    assert.equal(harness.fallback.focusCalls, 0, staleOutcome);
    assert.equal(harness.fallback.selectCalls, 0, staleOutcome);

    requests[1].resolve();
    await requests[1].promise;
    await Promise.resolve();
    assert.equal(harness.status.textContent, "参数已复制", staleOutcome);
  }
});

test("close invalidates a pending copy across reopen while a new copy still succeeds", async () => {
  for (const staleOutcome of ["resolve", "reject"]) {
    const requests = [];
    const harness = makeHarness({
      navigatorTarget: {
        clipboard: {
          writeText() {
            let resolve;
            let reject;
            const promise = new Promise((resolvePromise, rejectPromise) => {
              resolve = resolvePromise;
              reject = rejectPromise;
            });
            requests.push({ promise, resolve, reject });
            return promise;
          },
        },
      },
    });
    harness.panel.open();
    harness.actions["tuning-copy"].dispatch("click");
    assert.equal(harness.panel.close(), true);
    harness.status.textContent = "关闭后保持";
    assert.equal(harness.panel.open(), true);
    harness.actions["tuning-copy"].dispatch("click");
    assert.equal(requests.length, 2);

    if (staleOutcome === "resolve") requests[0].resolve();
    else requests[0].reject(new Error("closed session rejection"));
    await requests[0].promise.catch(() => {});
    await Promise.resolve();

    assert.equal(harness.status.textContent, "关闭后保持", staleOutcome);
    assert.equal(harness.fallback.hidden, true, staleOutcome);
    assert.equal(harness.fallback.focusCalls, 0, staleOutcome);
    assert.equal(harness.fallback.selectCalls, 0, staleOutcome);

    requests[1].resolve();
    await requests[1].promise;
    await Promise.resolve();
    assert.equal(harness.status.textContent, "参数已复制", staleOutcome);
  }
});

test("dispose is idempotent, removes every listener, hides, and never restores focus", () => {
  const writes = [];
  const harness = makeHarness({
    navigatorTarget: {
      clipboard: {
        writeText(value) {
          writes.push(value);
          return Promise.resolve();
        },
      },
    },
  });
  const opener = new FakeElement({ documentTarget: harness.documentTarget });
  opener.focus();
  harness.panel.open();
  const focusedTab = harness.documentTarget.activeElement;

  assert.ok(harness.tabs.every((tab) => tab.listenerCount("click") === 1));
  assert.ok(harness.inputs.every((input) => input.listenerCount("input") === 1));
  assert.ok(Object.values(harness.actions).every((action) => action.listenerCount("click") === 1));

  harness.panel.dispose();
  harness.panel.dispose();

  assert.equal(harness.root.hidden, true);
  assert.equal(harness.root.getAttribute("aria-hidden"), "true");
  assert.strictEqual(harness.documentTarget.activeElement, focusedTab);
  assert.equal(opener.focusCalls, 1);
  assert.ok(harness.tabs.every((tab) => tab.listenerCount("click") === 0));
  assert.ok(harness.inputs.every((input) => input.listenerCount("input") === 0));
  assert.ok(Object.values(harness.actions).every((action) => action.listenerCount("click") === 0));
  assert.equal(harness.panel.open(), false);
  assert.equal(harness.panel.close(), false);

  harness.tabs[1].dispatch("click");
  harness.input("scaleY", "number").value = "2";
  harness.input("scaleY", "number").dispatch("input");
  Object.values(harness.actions).forEach((action) => action.dispatch("click"));
  assert.deepEqual(harness.changes, []);
  assert.deepEqual(writes, []);
  assert.equal(harness.panel.getTuning().ingredients["bottom-bun"].scaleY, 1);
});

test("setTuning is inert after dispose and returns the existing frozen tuning", () => {
  const harness = makeHarness({
    initialTuning: {
      version: 1,
      global: { presentationScale: 0.8 },
      ingredients: { cheese: { scaleY: 1.8 } },
    },
  });
  const before = harness.panel.getTuning();
  const beforeDom = harness.inputs.map((input) => input.value);
  harness.panel.dispose();

  const result = harness.panel.setTuning({
    version: 1,
    global: { presentationScale: 0.6 },
    ingredients: { "bottom-bun": { scaleY: 2.4 } },
  });

  assert.strictEqual(result, before);
  assert.strictEqual(harness.panel.getTuning(), before);
  assert.deepEqual(harness.inputs.map((input) => input.value), beforeDom);
  assertFrozenTree(result);
});

test("construction rejects every missing required node before adding any listener", () => {
  const omissions = [
    ...INGREDIENT_IDS.map((id) => `tab:${id}`),
    ...TUNING_KEYS.flatMap((key) => [
      `input:${key}:range`,
      `input:${key}:number`,
    ]),
    "action:tuning-copy",
    "action:tuning-reset-current",
    "action:tuning-reset-all",
    "action:tuning-close",
    "status",
    "fallback",
  ];

  for (const omission of omissions) {
    const dom = makeDomHarness({ omit: [omission] });

    assert.throws(
      () => createCookingTuningPanel({ root: dom.root }),
      /Missing required tuning panel node/,
      omission,
    );
    assert.ok(dom.tabs.every((tab) => tab.listenerCount("click") === 0), omission);
    assert.ok(dom.inputs.every((input) => input.listenerCount("input") === 0), omission);
    assert.ok(
      Object.values(dom.actions).every((action) => action.listenerCount("click") === 0),
      omission,
    );
  }

  assert.throws(
    () => createCookingTuningPanel({ root: null }),
    /Missing required tuning panel root/,
  );
});
