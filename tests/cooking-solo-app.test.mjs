import test from "node:test";
import assert from "node:assert/strict";

import { bootSoloCookingPage } from "../app/static/cooking-solo-app.mjs";

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, event) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event);
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
}

class Element extends Events {
  constructor(action = null) {
    super();
    this.dataset = action ? { action } : {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.focusCalls = 0;
  }
  closest(selector) { return selector === "[data-action]" && this.dataset.action ? this : null; }
  focus() { this.focusCalls += 1; }
}

function pageHarness() {
  const documentTarget = new Events();
  const selectors = new Map();
  const add = (selector, action = null) => {
    const element = new Element(action);
    selectors.set(selector, element);
    return element;
  };
  const canvas = add("#cooking-canvas");
  const elements = {
    canvas,
    loading: add("#cooking-loading"),
    error: add("#cooking-error"),
    objective: add("#cooking-objective"),
    progress: add("#cooking-progress"),
    summary: add("#cooking-summary"),
    status: add("#cooking-status"),
    tutorial: add("#tutorial-coach"),
    tutorialTitle: add("#tutorial-title"),
    tutorialCopy: add("#tutorial-copy"),
    finishSheet: add("#finish-sheet"),
    finishSummary: add("#finish-summary"),
    finishButton: add('[data-action="finish"]', "finish"),
    undoButton: add('[data-action="undo"]', "undo"),
    inspectButton: add('[data-action="toggle-expanded"]', "toggle-expanded"),
    resetButton: add('[data-action="reset"]', "reset"),
    continueButton: add('[data-action="continue"]', "continue"),
  };
  documentTarget.querySelector = (selector) => selectors.get(selector) ?? null;
  const windowTarget = new Events();
  windowTarget.matchMediaCalls = [];
  windowTarget.matchMedia = (query) => {
    windowTarget.matchMediaCalls.push(query);
    return { matches: true };
  };
  return { documentTarget, windowTarget, elements };
}

function stageFactoryHarness() {
  const stages = [];
  const factory = (configuration) => {
    const state = {
      assembledOrder: [],
      locations: {},
      strokes: [],
      complete: false,
      finished: false,
      history: [],
    };
    const tutorial = { step: "pick" };
    const stage = {
      host: { resize() {}, setVisible() {} },
      workbench: { clearHighlights() {}, setHighlighted() {} },
      disposed: 0,
      calls: [],
      getState: () => state,
      getTutorial: () => tutorial,
      rotateSelected: () => stage.calls.push("rotate"),
      resetCamera: () => stage.calls.push("camera"),
      toggleExpanded: () => stage.calls.push("inspect"),
      undo: () => stage.calls.push("undo"),
      reset: () => stage.calls.push("reset"),
      finish: () => stage.calls.push("finish"),
      continueEditing: () => stage.calls.push("continue"),
      skipTutorial: () => stage.calls.push("skip"),
      replayTutorial: () => stage.calls.push("replay"),
      dispose() { stage.disposed += 1; },
      emit(changes = {}) {
        Object.assign(state, changes);
        configuration.onChange({
          reason: changes.finished ? "finish" : "ready",
          state,
          tutorial,
          expanded: false,
          progress: `${state.assembledOrder.length}/7`,
        });
      },
    };
    stages.push({ stage, configuration });
    return stage;
  };
  return { factory, stages };
}

test("boot uses the injected window, wires buttons, and renders the completion dialog", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });

  assert.equal(stages.stages[0].configuration.reducedMotion, true);
  assert.deepEqual(page.windowTarget.matchMediaCalls, ["(prefers-reduced-motion: reduce)"]);
  page.documentTarget.emit("click", { target: page.elements.resetButton });
  assert.deepEqual(stage.calls, ["reset"]);

  stage.emit({
    assembledOrder: ["bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun"],
    complete: true,
    finished: true,
  });
  assert.equal(page.elements.finishSheet.hidden, false);
  assert.equal(page.elements.finishSheet.focusCalls, 1);
});

test("a second boot disposes the old stage and leaves only the new click handler", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const first = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget, stageFactory: stages.factory,
  });
  const second = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget, stageFactory: stages.factory,
  });

  assert.equal(first.disposed, 1);
  assert.equal(page.documentTarget.count("click"), 1);
  page.documentTarget.emit("click", { target: page.elements.undoButton });
  assert.deepEqual(first.calls, []);
  assert.deepEqual(second.calls, ["undo"]);
});

test("render or lifecycle registration failure cleans the created stage and shows the error layer", () => {
  {
    const page = pageHarness();
    const stages = stageFactoryHarness();
    Object.defineProperty(page.elements.progress, "textContent", {
      configurable: true,
      set() { throw new Error("render failed"); },
    });
    const result = bootSoloCookingPage(page.documentTarget, {
      windowTarget: page.windowTarget, stageFactory: stages.factory,
    });
    assert.equal(result, null);
    assert.equal(stages.stages[0].stage.disposed, 1);
    assert.equal(page.elements.error.hidden, false);
    assert.match(page.elements.status.textContent, /render failed/);
  }

  {
    const page = pageHarness();
    const stages = stageFactoryHarness();
    const add = page.windowTarget.addEventListener.bind(page.windowTarget);
    page.windowTarget.addEventListener = (type, callback, options) => {
      if (type === "pagehide") throw new Error("listener failed");
      add(type, callback, options);
    };
    const result = bootSoloCookingPage(page.documentTarget, {
      windowTarget: page.windowTarget, stageFactory: stages.factory,
    });
    assert.equal(result, null);
    assert.equal(stages.stages[0].stage.disposed, 1);
    assert.equal(page.documentTarget.count("click"), 0);
    assert.equal(page.windowTarget.count("resize"), 0);
    assert.equal(page.elements.error.hidden, false);
    assert.match(page.elements.status.textContent, /listener failed/);
  }
});
