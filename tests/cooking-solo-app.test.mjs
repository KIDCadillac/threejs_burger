import test from "node:test";
import assert from "node:assert/strict";

import { bootSoloCookingPage } from "../app/static/cooking-solo-app.mjs";
import {
  BURGER_TUNING_STORAGE_KEY,
  DEFAULT_BURGER_TUNING,
} from "../app/static/burger-tuning.mjs";

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
  constructor(action = null, { dataset = {}, type = "" } = {}) {
    super();
    this.dataset = action ? { action, ...dataset } : { ...dataset };
    this.type = type;
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.readOnly = false;
    this.tabIndex = 0;
    this.focusCalls = 0;
    this.attributes = new Map();
  }
  closest(selector) { return selector === "[data-action]" && this.dataset.action ? this : null; }
  focus() { this.focusCalls += 1; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
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
  canvas.width = 390;
  canvas.height = 844;
  canvas.toDataURL = () => "data:image/png;base64,test";
  const elements = {
    canvas,
    loading: add("#cooking-loading"),
    error: add("#cooking-error"),
    objective: add("#cooking-objective"),
    progress: add("#cooking-progress"),
    stock: add("#cooking-stock"),
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
    focusButton: add('[data-action="toggle-focus"]', "toggle-focus"),
    feedbackSheet: add("#feedback-sheet"),
    feedbackPreview: add("#feedback-preview"),
    feedbackMessage: add("#feedback-message"),
    feedbackStatus: add("#feedback-status"),
    tuningRoot: add("#tuning-sheet"),
    tuningOpenButton: add('[data-action="tuning-open"]', "tuning-open"),
    tuningCloseButton: add('[data-action="tuning-close"]', "tuning-close"),
    feedbackOpenButton: add('[data-action="feedback-open"]', "feedback-open"),
    feedbackCloseButton: add('[data-action="feedback-close"]', "feedback-close"),
    feedbackSubmitButton: add('[data-action="feedback-submit"]', "feedback-submit"),
    resetButton: add('[data-action="reset"]', "reset"),
    continueButton: add('[data-action="continue"]', "continue"),
  };
  const tuningTabs = [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun",
  ].map((ingredientId) => new Element(null, { dataset: { ingredientId } }));
  const tuningInputs = [
    "presentationScale", "scaleX", "scaleY", "scaleZ", "sinkY",
  ].flatMap((tuningKey) => ["range", "number"].map((type) => new Element(null, {
    dataset: { tuningKey },
    type,
  })));
  const tuningActions = Object.fromEntries([
    "tuning-copy", "tuning-reset-current", "tuning-reset-all",
  ].map((action) => [action, new Element(action)]));
  const tuningStatus = new Element();
  const tuningFallback = new Element();
  tuningFallback.hidden = true;
  tuningFallback.readOnly = true;
  elements.tuningRoot.querySelectorAll = (selector) => {
    if (selector === "[data-ingredient-id]") return tuningTabs;
    if (selector === "[data-tuning-key]") return tuningInputs;
    return [];
  };
  elements.tuningRoot.querySelector = (selector) => {
    const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
    if (action === "tuning-close") return elements.tuningCloseButton;
    if (action) return tuningActions[action] ?? null;
    if (selector === "[data-tuning-status]") return tuningStatus;
    if (selector === "[data-tuning-copy-fallback]") return tuningFallback;
    return null;
  };
  documentTarget.querySelector = (selector) => selectors.get(selector) ?? null;
  documentTarget.createElement = (tag) => {
    if (tag !== "canvas") return new Element();
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      }),
    };
  };
  const windowTarget = new Events();
  windowTarget.matchMediaCalls = [];
  windowTarget.matchMedia = (query) => {
    windowTarget.matchMediaCalls.push(query);
    return { matches: true };
  };
  windowTarget.setInterval = () => 1;
  windowTarget.clearInterval = () => {};
  windowTarget.location = { href: "http://example.test/cooking.html" };
  windowTarget.navigator = { userAgent: "test" };
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
    const highlightCalls = [];
    let tuning = configuration.tuning;
    const stage = {
      host: {
        resize() {},
        setVisible() {},
        onAfterFrame() { return () => {}; },
        readFramePixels() { return null; },
      },
      workbench: {
        highlightCalls,
        clearHighlights() { highlightCalls.push(["clear"]); },
        setHighlighted(...args) { highlightCalls.push(args); },
      },
      disposed: 0,
      calls: [],
      pauseCalls: [],
      getState: () => state,
      getTutorial: () => tutorial,
      getTuning: () => tuning,
      setTuning(next) {
        stage.calls.push(["tuning", next]);
        tuning = next;
        return tuning;
      },
      setInteractionPaused(value) {
        stage.pauseCalls.push(Boolean(value));
        return Boolean(value);
      },
      rotateSelected: () => stage.calls.push("rotate"),
      resetCamera: () => stage.calls.push("camera"),
      toggleExpanded: () => stage.calls.push("inspect"),
      toggleBurgerFocus: () => stage.calls.push("focus"),
      undo: () => stage.calls.push("undo"),
      reset: () => stage.calls.push("reset"),
      finish: () => stage.calls.push("finish"),
      continueEditing: () => stage.calls.push("continue"),
      skipTutorial: () => stage.calls.push("skip"),
      replayTutorial: () => stage.calls.push("replay"),
      dispose() { stage.disposed += 1; },
      emit({ dropIntent = null, ...changes } = {}) {
        Object.assign(state, changes);
        configuration.onChange({
          reason: changes.finished ? "finish" : "ready",
          state,
          tutorial,
          expanded: false,
          focused: Boolean(changes.focused),
          progress: `${state.assembledOrder.length}/20`,
          dropIntent,
        });
      },
    };
    stages.push({ stage, configuration });
    return stage;
  };
  return { factory, stages };
}

function panelFactoryHarness({ factoryError = null, disposeError = null } = {}) {
  const panels = [];
  const factory = (configuration) => {
    if (factoryError) throw factoryError;
    const panel = {
      calls: [],
      open() { panel.calls.push("open"); return true; },
      close() { panel.calls.push("close"); return true; },
      dispose() {
        panel.calls.push("dispose");
        if (disposeError) throw disposeError;
      },
    };
    panels.push({ panel, configuration });
    return panel;
  };
  return { factory, panels };
}

function feedbackFactoryHarness({ disposeError = null } = {}) {
  const reporters = [];
  const factory = (configuration) => {
    const reporter = {
      calls: [],
      open() { reporter.calls.push("open"); },
      close() { reporter.calls.push("close"); },
      submit() { reporter.calls.push("submit"); },
      dispose() {
        reporter.calls.push("dispose");
        if (disposeError) throw disposeError;
      },
    };
    reporters.push({ reporter, configuration });
    return reporter;
  };
  return { factory, reporters };
}

test("loads persisted tuning before stage construction and seeds the panel from the stage", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness();
  const order = [];
  page.windowTarget.localStorage = {
    getItem(key) {
      order.push("load");
      assert.equal(key, BURGER_TUNING_STORAGE_KEY);
      return JSON.stringify({
        version: 1,
        global: { presentationScale: 0.84 },
        ingredients: { cheese: { scaleY: 2.1 } },
      });
    },
  };
  const factory = (configuration) => {
    order.push("stage");
    return stages.factory(configuration);
  };

  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: factory,
    tuningPanelFactory: panels.factory,
  });

  assert.deepEqual(order, ["load", "stage"]);
  assert.equal(stages.stages[0].configuration.tuning.global.presentationScale, 0.84);
  assert.equal(stages.stages[0].configuration.tuning.ingredients.cheese.scaleY, 2.1);
  assert.strictEqual(panels.panels[0].configuration.root, page.elements.tuningRoot);
  assert.strictEqual(panels.panels[0].configuration.documentTarget, page.documentTarget);
  assert.strictEqual(panels.panels[0].configuration.navigatorTarget, page.windowTarget.navigator);
  assert.strictEqual(panels.panels[0].configuration.initialTuning, stage.getTuning());
});

test("panel changes apply through the stage and persist its canonical result", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness();
  const writes = [];
  page.windowTarget.localStorage = {
    getItem: () => null,
    setItem(key, value) { writes.push([key, value]); },
  };
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });
  const requested = {
    version: 1,
    global: { presentationScale: 0.88 },
    ingredients: { cheese: { scaleY: 2.2 } },
  };
  let received = null;
  stage.setTuning = (next) => {
    received = next;
    return DEFAULT_BURGER_TUNING;
  };

  panels.panels[0].configuration.onChange(requested);

  assert.strictEqual(received, requested);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], BURGER_TUNING_STORAGE_KEY);
  assert.deepEqual(JSON.parse(writes[0][1]), DEFAULT_BURGER_TUNING);
});

test("a blocked localStorage getter falls back without preventing boot", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness();
  let getterReads = 0;
  Object.defineProperty(page.windowTarget, "localStorage", {
    get() {
      getterReads += 1;
      throw new DOMException("denied", "SecurityError");
    },
  });

  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });

  assert.ok(stage);
  assert.equal(getterReads, 1);
  assert.strictEqual(stages.stages[0].configuration.tuning, DEFAULT_BURGER_TUNING);
  assert.equal(panels.panels.length, 1);
});

test("tuning open pauses stage interaction and close always resumes it", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });

  page.documentTarget.emit("click", { target: page.elements.tuningOpenButton });
  page.documentTarget.emit("click", { target: page.elements.tuningCloseButton });

  assert.deepEqual(panels.panels[0].panel.calls, ["open", "close"]);
  assert.deepEqual(stage.pauseCalls, [true, false]);
});

test("panel close requests route through closeTuning and resume stage interaction", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });

  page.documentTarget.emit("click", { target: page.elements.tuningOpenButton });
  assert.equal(typeof panels.panels[0].configuration.onRequestClose, "function");
  panels.panels[0].configuration.onRequestClose();

  assert.deepEqual(panels.panels[0].panel.calls, ["open", "close"]);
  assert.deepEqual(stage.pauseCalls, [true, false]);
});

test("a failed or throwing tuning open restores stage interaction", () => {
  for (const outcome of ["false", "throw"]) {
    const page = pageHarness();
    const stages = stageFactoryHarness();
    const panels = panelFactoryHarness();
    const stage = bootSoloCookingPage(page.documentTarget, {
      windowTarget: page.windowTarget,
      stageFactory: stages.factory,
      tuningPanelFactory: panels.factory,
    });
    panels.panels[0].panel.open = () => {
      if (outcome === "throw") throw new Error("open failed");
      return false;
    };

    if (outcome === "throw") {
      assert.throws(
        () => page.documentTarget.emit("click", { target: page.elements.tuningOpenButton }),
        /open failed/,
      );
    } else {
      page.documentTarget.emit("click", { target: page.elements.tuningOpenButton });
    }

    assert.deepEqual(stage.pauseCalls, [true, false], outcome);
  }
});

test("a throwing tuning close still resumes stage interaction", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });
  panels.panels[0].panel.close = () => { throw new Error("close failed"); };

  assert.throws(
    () => page.documentTarget.emit("click", { target: page.elements.tuningCloseButton }),
    /close failed/,
  );
  assert.deepEqual(stage.pauseCalls, [false]);
});

test("panel construction failure restores and disposes the created stage", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness({ factoryError: new Error("panel failed") });

  const result = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });

  assert.equal(result, null);
  assert.deepEqual(stages.stages[0].stage.pauseCalls, [false]);
  assert.equal(stages.stages[0].stage.disposed, 1);
  assert.equal(page.elements.error.hidden, false);
  assert.match(page.elements.status.textContent, /panel failed/);
});

test("registration failure best-effort cleans panel, stage pause, and feedback", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness({ disposeError: new Error("panel cleanup failed") });
  const feedback = feedbackFactoryHarness();
  const add = page.windowTarget.addEventListener.bind(page.windowTarget);
  page.windowTarget.addEventListener = (type, callback, options) => {
    if (type === "pagehide") throw new Error("listener failed");
    add(type, callback, options);
  };

  const result = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
    feedbackFactory: feedback.factory,
  });

  assert.equal(result, null);
  assert.deepEqual(panels.panels[0].panel.calls, ["dispose"]);
  assert.deepEqual(stages.stages[0].stage.pauseCalls, [false]);
  assert.deepEqual(feedback.reporters[0].reporter.calls, ["dispose"]);
  assert.equal(stages.stages[0].stage.disposed, 1);
  assert.equal(page.documentTarget.count("click"), 0);
  assert.equal(page.windowTarget.count("resize"), 0);
  assert.match(page.elements.status.textContent, /listener failed/);
});

test("lifecycle disposal continues after panel cleanup throws", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness({ disposeError: new Error("panel cleanup failed") });
  const feedback = feedbackFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
    feedbackFactory: feedback.factory,
  });

  assert.throws(
    () => page.windowTarget.emit("pagehide", { persisted: false }),
    /panel cleanup failed/,
  );
  assert.deepEqual(panels.panels[0].panel.calls, ["dispose"]);
  assert.deepEqual(stage.pauseCalls, [false]);
  assert.deepEqual(feedback.reporters[0].reporter.calls, ["dispose"]);
  assert.equal(stage.disposed, 1);
  assert.equal(page.documentTarget.count("click"), 0);
});

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

test("renders cooking state without a text drop-intent control", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });
  const highlightCallsBeforeIntent = [...stage.workbench.highlightCalls];

  stage.emit({
    dropIntent: { kind: "prep", intent: "top", id: "patty", targetIndex: 2 },
  });
  assert.equal(page.documentTarget.querySelector("#cooking-drop-intent"), null);
  assert.deepEqual(stage.workbench.highlightCalls, highlightCallsBeforeIntent);
});

test("renders replenishing stock counts and repeated ingredient instance names", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });

  stage.emit({
    assembledOrder: ["patty", "patty#2"],
    instances: { patty: "patty", "patty#2": "patty" },
    inventory: { patty: 997 },
  });

  assert.match(page.elements.stock.textContent, /997/);
  assert.doesNotMatch(page.elements.summary.innerHTML, /undefined/);
  assert.equal(page.elements.progress.textContent, "2/20");
});

test("focus control follows stage view state and toggles the isolated burger view", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });
  page.documentTarget.emit("click", { target: page.elements.focusButton });
  assert.deepEqual(stage.calls, ["focus"]);

  stage.emit({ assembledOrder: ["bottom-bun"], focused: true });
  assert.equal(page.elements.focusButton.disabled, false);
  assert.equal(page.elements.focusButton.textContent, "返回料理台");
  assert.equal(page.elements.focusButton.dataset.focused, "true");
});

test("feedback actions open, submit, and close the injected reporter", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const calls = [];
  bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    feedbackFactory(configuration) {
      assert.equal(configuration.canvas, page.elements.canvas);
      assert.equal(configuration.submitButton, page.elements.feedbackSubmitButton);
      assert.equal(typeof configuration.subscribeFrame, "function");
      assert.equal(typeof configuration.readFramePixels, "function");
      assert.deepEqual(configuration.getContext().state.assembledOrder, []);
      return {
        open: () => calls.push("open"),
        submit: () => calls.push("submit"),
        close: () => calls.push("close"),
      };
    },
  });

  page.documentTarget.emit("click", { target: page.elements.feedbackOpenButton });
  page.documentTarget.emit("click", { target: page.elements.feedbackSubmitButton });
  page.documentTarget.emit("click", { target: page.elements.feedbackCloseButton });
  assert.deepEqual(calls, ["open", "submit", "close"]);
});

test("a second boot disposes the old stage and leaves only the new click handler", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const panels = panelFactoryHarness();
  const first = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget, stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });
  const second = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget, stageFactory: stages.factory,
    tuningPanelFactory: panels.factory,
  });

  assert.equal(first.disposed, 1);
  assert.deepEqual(first.pauseCalls, [false]);
  assert.deepEqual(panels.panels[0].panel.calls, ["dispose"]);
  assert.deepEqual(panels.panels[1].panel.calls, []);
  assert.equal(page.documentTarget.count("click"), 1);
  page.documentTarget.emit("click", { target: page.elements.undoButton });
  assert.deepEqual(first.calls, []);
  assert.deepEqual(second.calls, ["undo"]);
});

test("an external loader can keep the loading overlay until the first rendered frame", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    manageLoading: false,
  });

  assert.ok(stage);
  assert.equal(page.elements.loading.hidden, false);
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
