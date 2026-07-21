import test from "node:test";
import assert from "node:assert/strict";

import { bootSoloCookingPage } from "../app/static/cooking-solo-app.mjs";
import {
  BURGER_TUNING_STORAGE_KEY,
  DEFAULT_BURGER_TUNING,
} from "../app/static/burger-tuning.mjs";
import { MAX_SOLO_STACK_LAYERS } from "../app/static/cooking-solo-state.mjs";
import {
  WORKBENCH_LOADOUT_STORAGE_KEY,
  createDefaultWorkbenchLoadout,
} from "../app/static/workbench-loadout.mjs";
import { SOLO_AUTOSAVE_STORAGE_KEY } from "../app/static/cooking-solo-autosave.mjs";

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
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this.attributes = new Map();
  }
  closest(selector) {
    if (selector === "[data-action]" && this.dataset.action) return this;
    if (selector === "[data-workbench-content]" && this.dataset.workbenchContent) return this;
    if (selector === "[data-workbench-close]" && "workbenchClose" in this.dataset) return this;
    if (selector === "[data-workbench-reset]" && "workbenchReset" in this.dataset) return this;
    return null;
  }
  focus() { this.focusCalls += 1; }
  play() { this.playCalls += 1; return Promise.resolve(); }
  pause() { this.pauseCalls += 1; }
  load() { this.loadCalls += 1; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "src") this.src = "";
  }
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
    highlightOpenButton: add('[data-action="highlight-open"]', "highlight-open"),
    highlightSheet: add("#highlight-sheet"),
    highlightVideo: add("#highlight-video"),
    highlightTitle: add("#highlight-title"),
    highlightMeta: add("#highlight-meta"),
    highlightDownload: add("#highlight-download"),
    highlightPreviousButton: add('[data-action="highlight-previous"]', "highlight-previous"),
    highlightNextButton: add('[data-action="highlight-next"]', "highlight-next"),
    highlightCloseButton: add('[data-action="highlight-close"]', "highlight-close"),
    resetButton: add('[data-action="reset"]', "reset"),
    continueButton: add('[data-action="continue"]', "continue"),
    recipeSelector: add("#recipe-selector"),
    recipeReference: add("#recipe-reference"),
    recipeReferenceName: add("#recipe-reference-name"),
    recipeReferenceSteps: add("#recipe-reference-steps"),
    recipeChangeButton: add('[data-action="recipe-change"]', "recipe-change"),
    workbenchPicker: add("#workbench-picker"),
  };
  elements.workbenchPicker.hidden = true;
  elements.highlightSheet.hidden = true;
  elements.highlightVideo.hidden = true;
  elements.highlightDownload.hidden = true;
  const workbenchTitle = new Element(null, { dataset: { workbenchTitle: "" } });
  const workbenchClose = new Element(null, { dataset: { workbenchClose: "" } });
  const workbenchReset = new Element(null, { dataset: { workbenchReset: "" } });
  const workbenchOptions = [
    ["bread", "bottom-bun"], ["bread", "middle-bun"], ["bread", "top-bun"],
    ["filling", "patty"], ["filling", "cheese"], ["filling", "tomato"],
    ["filling", "lettuce"], ["filling", "pickle"], ["filling", "onion"],
    ["sauce", "ketchup"], ["sauce", "mustard"], ["sauce", "house-sauce"],
  ].map(([workbenchRegion, workbenchContent]) => new Element(null, {
    dataset: { workbenchRegion, workbenchContent },
  }));
  elements.workbenchTitle = workbenchTitle;
  elements.workbenchClose = workbenchClose;
  elements.workbenchReset = workbenchReset;
  elements.workbenchOptions = workbenchOptions;
  elements.workbenchPicker.querySelector = (selector) => {
    if (selector === "[data-workbench-title]") return workbenchTitle;
    if (selector === "[data-workbench-close]") return workbenchClose;
    if (selector === "[data-workbench-reset]") return workbenchReset;
    return null;
  };
  elements.workbenchPicker.querySelectorAll = (selector) => (
    selector === "[data-workbench-content]" ? workbenchOptions : []
  );
  const recipeCards = [
    "", "classic-beef", "melty-cheese", "double-melty-cheese", "tower-double-beef",
  ].map((recipeId) => new Element("recipe-select", { dataset: { recipeId } }));
  elements.recipeCards = recipeCards;
  const tuningTabs = [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun",
    "onion", "middle-bun",
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
  documentTarget.querySelectorAll = (selector) => (
    selector === '[data-action="recipe-select"]' ? recipeCards : []
  );
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
  windowTarget.location = { href: "http://example.test/cooking.html?recipe=classic-beef" };
  windowTarget.navigator = { userAgent: "test" };
  return { documentTarget, windowTarget, elements };
}

function stageFactoryHarness() {
  const stages = [];
  const factory = (configuration) => {
    const state = configuration.initialState
      ? {
          ...configuration.initialState,
          assembledOrder: [...configuration.initialState.assembledOrder],
          history: [...(configuration.initialState.history ?? [])],
        }
      : {
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
      referenceCalls: [],
      slotCalls: [],
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
      selectReferenceRecipe(recipeId) {
        stage.referenceCalls.push(recipeId);
        state.referenceRecipeId = recipeId;
        return state;
      },
      setSlotContent(slotId, contentId) {
        stage.slotCalls.push([slotId, contentId]);
        return true;
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
          progress: `${state.assembledOrder.length}/${MAX_SOLO_STACK_LAYERS}`,
          dropIntent,
        });
      },
    };
    stages.push({ stage, configuration });
    return stage;
  };
  return { factory, stages };
}

test("a valid neutral recipe deep link selects its public reference and enters directly", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  page.windowTarget.location.href = "http://example.test/cooking.html?recipe=tower-double-beef";

  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });

  assert.deepEqual(stage.referenceCalls, ["tower-double-beef"]);
  assert.equal(page.elements.recipeSelector.hidden, true);
  assert.equal(page.elements.recipeReferenceName.textContent, "三层高塔双牛堡");
  assert.match(page.elements.recipeReferenceSteps.innerHTML, /中层面包/);
  assert.deepEqual(stage.pauseCalls, []);
});

test("missing or invalid recipe links keep the selector open and pause the 3d stage", () => {
  for (const href of [
    "http://example.test/cooking.html",
    "http://example.test/cooking.html?recipe=not-a-recipe",
  ]) {
    const page = pageHarness();
    const stages = stageFactoryHarness();
    page.windowTarget.location.href = href;

    const stage = bootSoloCookingPage(page.documentTarget, {
      windowTarget: page.windowTarget,
      stageFactory: stages.factory,
    });

    assert.equal(page.elements.recipeSelector.hidden, false, href);
    assert.deepEqual(stage.referenceCalls, [], href);
    assert.deepEqual(stage.pauseCalls, [true], href);
  }
});

test("choosing or changing a reference resumes interaction without clearing the current stack", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  page.windowTarget.location.href = "http://example.test/cooking.html";
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });
  stage.emit({
    assembledOrder: ["bottom-bun", "patty"],
    instances: { "bottom-bun": "bottom-bun", patty: "patty" },
  });

  page.documentTarget.emit("click", { target: page.elements.recipeCards[3] });

  assert.deepEqual(stage.referenceCalls, ["double-melty-cheese"]);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.equal(page.elements.recipeSelector.hidden, true);
  assert.equal(page.elements.recipeReferenceName.textContent, "双层融金芝士堡");
  assert.deepEqual(stage.pauseCalls, [true, false]);

  page.documentTarget.emit("click", { target: page.elements.recipeChangeButton });
  page.documentTarget.emit("click", { target: page.elements.recipeCards[1] });

  assert.deepEqual(stage.referenceCalls, ["double-melty-cheese", "classic-beef"]);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.deepEqual(stage.pauseCalls, [true, false, true, false]);
});

test("the free-cooking card clears the reference and keeps unrestricted guidance", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  page.windowTarget.location.href = "http://example.test/cooking.html";
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });

  page.documentTarget.emit("click", { target: page.elements.recipeCards[0] });

  assert.deepEqual(stage.referenceCalls, [null]);
  assert.equal(page.elements.recipeReferenceName.textContent, "自由料理");
  assert.match(page.elements.recipeReferenceSteps.innerHTML, /自由搭配|不限制顺序/);
});

test("a 3d slot selector opens the physical-slot picker and persists its replacement", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stored = new Map([
    [WORKBENCH_LOADOUT_STORAGE_KEY, JSON.stringify({ "filling-back-2": "pickle" })],
  ]);
  page.windowTarget.localStorage = {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, String(value)); },
  };
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });
  stage.emit({
    assembledOrder: ["bottom-bun", "patty"],
    instances: { "bottom-bun": "bottom-bun", patty: "patty" },
  });

  assert.equal(stages.stages[0].configuration.loadout["filling-back-2"], "pickle");
  assert.equal(typeof stages.stages[0].configuration.onStationSelector, "function");
  stages.stages[0].configuration.onStationSelector({
    slotId: "filling-back-2",
    region: "filling",
  });

  assert.equal(page.elements.workbenchPicker.hidden, false);
  assert.equal(page.elements.workbenchTitle.textContent, "后排配料 · 2号槽");
  assert.deepEqual(stage.pauseCalls, [true]);
  const onion = page.elements.workbenchOptions.find(
    ({ dataset }) => dataset.workbenchContent === "onion",
  );
  page.elements.workbenchPicker.emit("click", { target: onion });

  assert.deepEqual(stage.slotCalls, [["filling-back-2", "onion"]]);
  assert.equal(
    JSON.parse(stored.get(WORKBENCH_LOADOUT_STORAGE_KEY))["filling-back-2"],
    "onion",
  );
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.equal(page.elements.workbenchPicker.hidden, true);
  assert.deepEqual(stage.pauseCalls, [true, false]);
});

test("restores a valid autosave before stage construction and saves later state changes", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const loadout = {
    ...createDefaultWorkbenchLoadout(),
    "filling-back-2": "pickle",
  };
  const restored = Object.freeze({
    assembledOrder: Object.freeze(["bottom-bun", "patty"]),
    instances: Object.freeze({ "bottom-bun": "bottom-bun", patty: "patty" }),
    locations: Object.freeze({}),
    strokes: Object.freeze([]),
    complete: true,
    finished: false,
    history: Object.freeze([]),
    stationContents: Object.freeze(loadout),
  });
  const saved = [];
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    autosaveFactory() {
      return {
        load: () => restored,
        save: (state) => { saved.push([...state.assembledOrder]); return true; },
      };
    },
  });

  assert.strictEqual(stages.stages[0].configuration.initialState, restored);
  assert.equal(stages.stages[0].configuration.loadout["filling-back-2"], "pickle");
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.deepEqual(saved, [["bottom-bun", "patty"]]);

  stage.emit({ assembledOrder: ["bottom-bun", "patty", "cheese"], complete: true });
  assert.deepEqual(saved.at(-1), ["bottom-bun", "patty", "cheese"]);
});

test("dismissing the workbench picker resumes interaction without changing its slot", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });

  stages.stages[0].configuration.onStationSelector({
    slotId: "bread-left-1",
    region: "bread",
  });
  page.elements.workbenchPicker.emit("click", { target: page.elements.workbenchClose });

  assert.deepEqual(stage.slotCalls, []);
  assert.deepEqual(stage.pauseCalls, [true, false]);
  assert.equal(page.elements.workbenchPicker.hidden, true);
});

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
      order.push(
        key === BURGER_TUNING_STORAGE_KEY
          ? "load-tuning"
          : key === SOLO_AUTOSAVE_STORAGE_KEY
            ? "load-autosave"
            : "load-loadout",
      );
      if (key !== BURGER_TUNING_STORAGE_KEY) return null;
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

  assert.deepEqual(order, ["load-tuning", "load-autosave", "load-loadout", "stage"]);
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
  assert.equal(page.elements.progress.textContent, `2/${MAX_SOLO_STACK_LAYERS}`);
});

test("HUD and free-recipe guidance expose the single sixty-layer limit", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });

  assert.equal(page.elements.progress.textContent, `0/${MAX_SOLO_STACK_LAYERS}`);
  assert.match(page.elements.objective.textContent, /最多 60 层/);

  stage.emit({
    assembledOrder: ["bottom-bun", "patty"],
    complete: true,
  });
  assert.match(page.elements.objective.textContent, /还能继续叠 58 层/);

  const maximumStack = Array.from(
    { length: MAX_SOLO_STACK_LAYERS },
    (_, index) => `patty#${index + 1}`,
  );
  stage.emit({ assembledOrder: maximumStack, complete: true });
  assert.equal(page.elements.progress.textContent, `${MAX_SOLO_STACK_LAYERS}/${MAX_SOLO_STACK_LAYERS}`);
  assert.match(page.elements.objective.textContent, /已经叠满 60 层/);

  page.documentTarget.emit("click", { target: page.elements.recipeCards[0] });
  assert.match(page.elements.recipeReferenceSteps.innerHTML, /最多 60 层/);
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

test("shares one replay recorder with feedback and exposes generated highlight clips", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const feedback = feedbackFactoryHarness();
  const recorder = {
    startCalls: 0,
    start() { this.startCalls += 1; return true; },
  };
  let recorderConfiguration = null;
  const highlightRecords = [];
  const highlightFactory = (configuration) => {
    const clips = [];
    const coordinator = {
      observed: [],
      disposed: 0,
      observe(value) { this.observed.push({ ...value }); return []; },
      clips: () => Object.freeze([...clips]),
      dispose() { this.disposed += 1; return true; },
      emitClip(clip) {
        clips.push(clip);
        configuration.onClip(clip);
      },
    };
    highlightRecords.push({ configuration, coordinator });
    return coordinator;
  };

  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
    feedbackFactory: feedback.factory,
    replayRecorderFactory(configuration) {
      recorderConfiguration = configuration;
      return recorder;
    },
    highlightFactory,
  });

  assert.equal(recorder.startCalls, 1);
  assert.equal(recorderConfiguration.width, 480);
  assert.equal(recorderConfiguration.fps, 12);
  assert.equal(recorderConfiguration.seconds, 8);
  assert.strictEqual(feedback.reporters[0].configuration.recorder, recorder);
  assert.strictEqual(highlightRecords[0].configuration.recorder, recorder);
  assert.equal(highlightRecords[0].configuration.initialLayerCount, 0);
  assert.equal(highlightRecords[0].configuration.initialFinished, false);
  assert.equal(highlightRecords[0].configuration.maxSnapshotFrames, 96);
  assert.equal(page.elements.highlightOpenButton.disabled, false);
  page.documentTarget.emit("click", { target: page.elements.highlightOpenButton });
  assert.equal(page.elements.highlightSheet.hidden, false);
  assert.equal(page.elements.highlightVideo.hidden, true);
  assert.match(page.elements.highlightMeta.textContent, /10/);
  assert.equal(page.elements.highlightCloseButton.focusCalls, 1);
  page.documentTarget.emit("click", { target: page.elements.highlightSheet });
  assert.equal(page.elements.highlightSheet.hidden, true);

  page.documentTarget.emit("click", { target: page.elements.highlightOpenButton });
  page.documentTarget.emit("keydown", { key: "Escape" });
  assert.equal(page.elements.highlightSheet.hidden, true);

  stage.emit({
    assembledOrder: Array.from({ length: 10 }, (_, index) => `layer-${index}`),
    instances: Object.fromEntries(Array.from(
      { length: 10 },
      (_, index) => [`layer-${index}`, "patty"],
    )),
  });
  assert.deepEqual(highlightRecords[0].coordinator.observed.at(-1), {
    layerCount: 10,
    finished: false,
  });

  highlightRecords[0].coordinator.emitClip({
    id: "layers-10",
    kind: "layers",
    layerCount: 10,
    url: "blob:highlight-10",
    mimeType: "video/webm",
  });
  assert.equal(page.elements.highlightOpenButton.disabled, false);
  assert.match(page.elements.highlightOpenButton.textContent, /1/);

  page.documentTarget.emit("click", { target: page.elements.highlightOpenButton });
  assert.equal(page.elements.highlightSheet.hidden, false);
  assert.equal(page.elements.highlightVideo.src, "blob:highlight-10");
  assert.equal(page.elements.highlightTitle.textContent, "10 层高光回放");
  assert.equal(page.elements.highlightVideo.playCalls, 1);
  assert.equal(page.elements.highlightDownload.href, "blob:highlight-10");

  page.documentTarget.emit("click", { target: page.elements.highlightCloseButton });
  assert.equal(page.elements.highlightSheet.hidden, true);
  assert.equal(page.elements.highlightVideo.pauseCalls, 1);
  assert.equal(page.elements.canvas.focusCalls, 3);
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
