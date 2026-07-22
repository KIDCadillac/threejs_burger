import * as THREE from "./vendor/three.module.min.js";
import { createSoloCookingStage } from "./cooking-solo-stage.mjs";
import {
  disposeActiveSoloCookingPage,
  mountSoloCookingLifecycle,
} from "./cooking-solo-lifecycle.mjs";
import { createFinishFocusManager } from "./cooking-solo-focus.mjs";
import {
  createCanvasReplayRecorder,
  createCookingFeedbackReporter,
} from "./cooking-feedback.mjs";
import { createCookingHighlightReplayCoordinator } from "./cooking-highlight-replay.mjs";
import { createCookingTuningPanel } from "./cooking-tuning-panel.mjs";
import { loadBurgerTuning, saveBurgerTuning } from "./burger-tuning.mjs";
import { BURGER_RECIPES } from "./burger-recipes.mjs";
import { MAX_SOLO_STACK_LAYERS } from "./cooking-solo-state.mjs";
import { createWorkbenchSlotPicker } from "./cooking-workbench-picker.mjs";
import { createWorkbenchSlotControls } from "./workbench-slot-controls.mjs";
import {
  loadWorkbenchLoadout,
  saveWorkbenchLoadout,
  setWorkbenchSlotContent,
} from "./workbench-loadout.mjs";
import { createSoloAutosave } from "./cooking-solo-autosave.mjs";

const LAYER_NAMES = Object.freeze({
  "bottom-bun": "下层面包",
  patty: "牛肉饼",
  cheese: "芝士",
  tomato: "番茄",
  lettuce: "生菜",
  pickle: "酸黄瓜",
  "top-bun": "上层面包",
  onion: "洋葱碎",
  "middle-bun": "中层面包",
});

const SAUCE_NAMES = Object.freeze({
  ketchup: "番茄酱",
  mustard: "芥末酱",
  "house-sauce": "小馆特调酱",
});

const TUTORIAL_COPY = Object.freeze({
  pick: ["第一步：拿起食材", "按住任意一层食材，把它从料盒里拖出来。"],
  drop: ["放到中央餐盘", "拖到餐盘中央再松手，食材会自动吸附。"],
  rotate: ["转一转看看", "选中食材后，点下面的大旋转按钮，或双指扭转。"],
  sauce: ["亲手挤一条酱", "抓住前排任意调料瓶，倾斜并划过食材表面。"],
  assemble: ["继续自由组合", "把剩余食材按你喜欢的顺序装盘；也能拖回料盒重排。"],
  finish: ["完成料理", "至少两层食材已经装好，点最下方的完成料理。"],
});

const RECIPE_BY_ID = new Map(BURGER_RECIPES.map((recipe) => [recipe.id, recipe]));

function recipeIdFromLocation(location) {
  try {
    return new URL(location?.href).searchParams.get("recipe");
  } catch {
    return null;
  }
}

function recipeStepItems(recipe) {
  if (!recipe) {
    return [`自由搭配，不限制顺序，最少 2 层即可完成，最多 ${MAX_SOLO_STACK_LAYERS} 层`];
  }
  return recipe.steps.map((step) => (
    step.kind === "layer"
      ? LAYER_NAMES[step.ingredientId] ?? step.ingredientId
      : `挤 ${SAUCE_NAMES[step.sauceId] ?? step.sauceId}`
  ));
}

function sauceSummary(strokes, instances = {}) {
  const counts = new Map();
  for (const { sauce, layerId } of strokes) {
    const key = `${layerId}\0${sauce}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => {
    const [layerId, sauce] = key.split("\0");
    return `${LAYER_NAMES[instances[layerId] ?? layerId]}：${SAUCE_NAMES[sauce]}×${count}`;
  });
}

export function bootSoloCookingPage(
  documentTarget = globalThis.document,
  {
    windowTarget = globalThis,
    stageFactory = createSoloCookingStage,
    feedbackFactory = createCookingFeedbackReporter,
    replayRecorderFactory = createCanvasReplayRecorder,
    highlightFactory = createCookingHighlightReplayCoordinator,
    tuningPanelFactory = createCookingTuningPanel,
    workbenchPickerFactory = createWorkbenchSlotPicker,
    slotControlsFactory = createWorkbenchSlotControls,
    autosaveFactory = createSoloAutosave,
    manageLoading = true,
  } = {},
) {
  const canvas = documentTarget?.querySelector?.("#cooking-canvas");
  if (!canvas) throw new Error("Missing #cooking-canvas");
  disposeActiveSoloCookingPage(documentTarget);
  const elements = {
    loading: documentTarget.querySelector("#cooking-loading"),
    error: documentTarget.querySelector("#cooking-error"),
    objective: documentTarget.querySelector("#cooking-objective"),
    progress: documentTarget.querySelector("#cooking-progress"),
    stock: documentTarget.querySelector("#cooking-stock"),
    summary: documentTarget.querySelector("#cooking-summary"),
    status: documentTarget.querySelector("#cooking-status"),
    tutorial: documentTarget.querySelector("#tutorial-coach"),
    tutorialTitle: documentTarget.querySelector("#tutorial-title"),
    tutorialCopy: documentTarget.querySelector("#tutorial-copy"),
    finishSheet: documentTarget.querySelector("#finish-sheet"),
    finishSummary: documentTarget.querySelector("#finish-summary"),
    finishButton: documentTarget.querySelector('[data-action="finish"]'),
    undoButton: documentTarget.querySelector('[data-action="undo"]'),
    inspectButton: documentTarget.querySelector('[data-action="toggle-expanded"]'),
    focusButton: documentTarget.querySelector('[data-action="toggle-focus"]'),
    focusLayerToolbar: documentTarget.querySelector("#focus-layer-toolbar"),
    focusLayerUpButton: documentTarget.querySelector('[data-action="focus-layer-up"]'),
    focusLayerDownButton: documentTarget.querySelector('[data-action="focus-layer-down"]'),
    focusLayerRotateButton: documentTarget.querySelector('[data-action="focus-layer-rotate"]'),
    focusDeleteButton: documentTarget.querySelector('[data-action="delete-focused-layer"]'),
    focusLayerHint: documentTarget.querySelector("#focus-layer-hint"),
    feedbackSheet: documentTarget.querySelector("#feedback-sheet"),
    feedbackPreview: documentTarget.querySelector("#feedback-preview"),
    feedbackMessage: documentTarget.querySelector("#feedback-message"),
    feedbackStatus: documentTarget.querySelector("#feedback-status"),
    feedbackSubmitButton: documentTarget.querySelector('[data-action="feedback-submit"]'),
    highlightOpenButton: documentTarget.querySelector('[data-action="highlight-open"]'),
    highlightSheet: documentTarget.querySelector("#highlight-sheet"),
    highlightVideo: documentTarget.querySelector("#highlight-video"),
    highlightTitle: documentTarget.querySelector("#highlight-title"),
    highlightMeta: documentTarget.querySelector("#highlight-meta"),
    highlightDownload: documentTarget.querySelector("#highlight-download"),
    highlightPreviousButton: documentTarget.querySelector('[data-action="highlight-previous"]'),
    highlightNextButton: documentTarget.querySelector('[data-action="highlight-next"]'),
    highlightCloseButton: documentTarget.querySelector('[data-action="highlight-close"]'),
    tuningSheet: documentTarget.querySelector("#tuning-sheet"),
    recipeSelector: documentTarget.querySelector("#recipe-selector"),
    recipeReference: documentTarget.querySelector("#recipe-reference"),
    recipeReferenceName: documentTarget.querySelector("#recipe-reference-name"),
    recipeReferenceSteps: documentTarget.querySelector("#recipe-reference-steps"),
    recipeCards: [...(documentTarget.querySelectorAll?.('[data-action="recipe-select"]') ?? [])],
    workbenchPicker: documentTarget.querySelector("#workbench-picker"),
    slotControlsRoot: documentTarget.querySelector("#workbench-slot-controls"),
  };
  const focusManager = createFinishFocusManager({
    dialog: elements.finishSheet,
    returnTarget: canvas,
  });

  let stage = null;
  let feedback = null;
  let replayRecorder = null;
  let highlights = null;
  let highlightIndex = 0;
  let tuningPanel = null;
  let workbenchPicker = null;
  let slotControls = null;
  let autosave = null;
  let openWorkbenchPicker = () => false;
  let latest = null;
  const currentHighlightClips = () => highlights?.clips?.() ?? Object.freeze([]);
  const syncHighlightButton = () => {
    const count = currentHighlightClips().length;
    if (!elements.highlightOpenButton) return count;
    elements.highlightOpenButton.disabled = false;
    elements.highlightOpenButton.textContent = `高光 ${count}`;
    return count;
  };
  const showHighlightClip = (requestedIndex = highlightIndex) => {
    const clips = currentHighlightClips();
    if (!elements.highlightSheet || !elements.highlightVideo) return false;
    if (!clips.length) {
      elements.highlightTitle.textContent = "高光回放";
      elements.highlightMeta.textContent = "继续料理：堆到 10、20、40、60 层或完成时会自动生成。";
      if (!elements.highlightVideo.hidden) elements.highlightVideo.pause?.();
      elements.highlightVideo.hidden = true;
      elements.highlightDownload.hidden = true;
      elements.highlightPreviousButton.disabled = true;
      elements.highlightNextButton.disabled = true;
      elements.highlightSheet.hidden = false;
      elements.highlightCloseButton?.focus?.();
      return true;
    }
    highlightIndex = ((Number(requestedIndex) % clips.length) + clips.length) % clips.length;
    const clip = clips[highlightIndex];
    elements.highlightTitle.textContent = clip.kind === "finish"
      ? "完成料理高光回放"
      : `${clip.layerCount} 层高光回放`;
    elements.highlightMeta.textContent = `第 ${highlightIndex + 1}/${clips.length} 段 · 事件前后自动回放`;
    elements.highlightVideo.src = clip.url;
    elements.highlightVideo.hidden = false;
    elements.highlightVideo.load?.();
    elements.highlightDownload.href = clip.url;
    const extension = clip.mimeType?.includes("mp4") ? "mp4" : "webm";
    elements.highlightDownload.download = `burger-highlight-${clip.id}.${extension}`;
    elements.highlightDownload.hidden = false;
    elements.highlightPreviousButton.disabled = clips.length < 2;
    elements.highlightNextButton.disabled = clips.length < 2;
    elements.highlightSheet.hidden = false;
    elements.highlightCloseButton?.focus?.();
    Promise.resolve(elements.highlightVideo.play?.()).catch(() => {});
    return true;
  };
  const closeHighlightSheet = () => {
    if (!elements.highlightSheet || elements.highlightSheet.hidden) return false;
    if (elements.highlightVideo && !elements.highlightVideo.hidden) {
      elements.highlightVideo.pause?.();
    }
    elements.highlightSheet.hidden = true;
    canvas.focus?.();
    return true;
  };
  const render = (detail) => {
    latest = detail;
    autosave?.save?.(detail.state);
    if (!stage) return;
    const {
      state,
      tutorial,
      expanded,
      focused = false,
      selectedLayerId = null,
      progress,
      dropIntent = null,
    } = detail;
    highlights?.observe?.({
      layerCount: state.assembledOrder.length,
      finished: state.finished,
    });
    elements.progress.textContent = progress;
    const inventoryEntries = Object.entries(state.inventory ?? {});
    elements.stock.textContent = inventoryEntries.length
      ? inventoryEntries.map(([id, count]) => `${LAYER_NAMES[id] ?? id} ×${count}`).join(" · ")
      : "每种原料库存 ×999";
    elements.objective.textContent = state.finished
      ? "料理完成，可以继续调整或重新做"
      : state.assembledOrder.length >= MAX_SOLO_STACK_LAYERS
        ? `已经叠满 ${MAX_SOLO_STACK_LAYERS} 层，现在可以完成料理`
        : state.complete
          ? `已经可以完成料理，还能继续叠 ${MAX_SOLO_STACK_LAYERS - state.assembledOrder.length} 层`
        : state.assembledOrder.length
          ? `继续自由叠放，当前 ${state.assembledOrder.length} 层，最多 ${MAX_SOLO_STACK_LAYERS} 层`
          : `自由叠放食材，最多 ${MAX_SOLO_STACK_LAYERS} 层`;
    elements.finishButton.disabled = !state.complete || state.finished;
    elements.finishButton.textContent = state.complete
      ? "完成料理"
      : `还差 ${Math.max(0, 2 - state.assembledOrder.length)} 层`;
    elements.undoButton.disabled = !state.history.length || state.finished;
    elements.inspectButton.disabled = state.finished || !state.assembledOrder.length;
    elements.inspectButton.textContent = expanded ? "合拢汉堡" : "展开查看";
    elements.focusButton.disabled = state.finished || !state.assembledOrder.length;
    elements.focusButton.textContent = focused ? "返回料理台" : "聚焦食物";
    elements.focusButton.dataset.focused = String(focused);
    elements.focusButton.setAttribute?.("aria-pressed", String(focused));
    elements.focusLayerHint.hidden = !focused;
    const selectedFocusIndex = selectedLayerId
      ? state.assembledOrder.indexOf(selectedLayerId)
      : -1;
    const fallbackCapabilities = {
      selected: selectedFocusIndex >= 0,
      canMoveUp: selectedFocusIndex >= 0 && selectedFocusIndex < state.assembledOrder.length - 1,
      canMoveDown: selectedFocusIndex > 0,
      canRotate: selectedFocusIndex >= 0,
      canDelete: selectedFocusIndex >= 0,
    };
    const focusCapabilities = stage.getFocusedLayerCapabilities?.() ?? fallbackCapabilities;
    const hasFocusedLayer = focused && focusCapabilities.selected;
    elements.focusLayerHint.textContent = !focused
      ? ""
      : hasFocusedLayer
        ? "拖动这一层调整位置"
        : "点一下汉堡的一层";
    if (elements.focusLayerToolbar) elements.focusLayerToolbar.hidden = !hasFocusedLayer;
    if (elements.focusLayerUpButton) {
      elements.focusLayerUpButton.disabled = !hasFocusedLayer || !focusCapabilities.canMoveUp;
    }
    if (elements.focusLayerDownButton) {
      elements.focusLayerDownButton.disabled = !hasFocusedLayer || !focusCapabilities.canMoveDown;
    }
    if (elements.focusLayerRotateButton) {
      elements.focusLayerRotateButton.disabled = !hasFocusedLayer || !focusCapabilities.canRotate;
    }
    elements.focusDeleteButton.disabled = !hasFocusedLayer || !focusCapabilities.canDelete;
    slotControls?.setHidden?.(focused);
    elements.finishSheet.hidden = !state.finished;

    const order = state.assembledOrder.map((id, index) => (
      `<span>${index + 1}. ${LAYER_NAMES[state.instances?.[id] ?? id] ?? id}</span>`
    )).join("");
    const sauces = sauceSummary(state.strokes, state.instances);
    elements.summary.innerHTML = state.assembledOrder.length
      ? `<div class="summary-list">${order}</div><p>${sauces.length ? sauces.join(" · ") : "还没加酱，可以自由混合三种调料。"}</p>`
      : "<p>还没有装盘，先从原料盒拿一层食材。</p>";
    elements.finishSummary.textContent = sauces.length
      ? `${state.assembledOrder.length} 层食材，${state.strokes.length} 条酱料轨迹。${sauces.join("；")}`
      : `${state.assembledOrder.length} 层食材已经组合完成，还可以继续调整或加酱。`;

    const tutorialText = TUTORIAL_COPY[tutorial.step];
    elements.tutorial.hidden = !tutorialText || state.finished;
    if (tutorialText) {
      elements.tutorial.dataset.step = tutorial.step;
      elements.tutorialTitle.textContent = tutorialText[0];
      elements.tutorialCopy.textContent = tutorialText[1];
    }
    if (!dropIntent) {
      stage.workbench.clearHighlights();
      if (tutorial.step === "pick" || tutorial.step === "assemble") {
        const next = Object.entries(state.locations)
          .find(([, location]) => location.kind === "bin")?.[0];
        if (next) stage.workbench.setHighlighted("ingredient", state.instances?.[next] ?? next, true);
      } else if (tutorial.step === "sauce") {
        stage.workbench.setHighlighted("tool", "ketchup", true);
      }
    }

    const statusByReason = {
      "drop-layer": "食材已吸附到餐盘",
      "remove-layer": "食材已放回原料盒",
      "rotate-layer": "已旋转选中食材",
      "sauce-stroke": "酱料已挤到食材上",
      undo: "已撤销上一步",
      reset: "料理台已重置",
      finish: "料理完成！",
      continue: "可以继续调整了",
    };
    if (statusByReason[detail.reason]) elements.status.textContent = statusByReason[detail.reason];
    if (detail.message) elements.status.textContent = detail.message;
    focusManager.sync(state.finished);
  };

  try {
    let pageStorage = null;
    try {
      pageStorage = windowTarget?.localStorage ?? null;
    } catch {
      pageStorage = null;
    }
    const tuning = loadBurgerTuning({ storage: pageStorage, globalTarget: windowTarget });
    autosave = autosaveFactory({ storage: pageStorage });
    const initialState = autosave.load();
    let loadout = initialState?.stationContents ?? loadWorkbenchLoadout(pageStorage);
    stage = stageFactory({
      THREE,
      canvas,
      tuning,
      loadout,
      initialState,
      reducedMotion: windowTarget.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
      onChange: render,
      onStationSelector: (detail) => openWorkbenchPicker(detail),
      onError: (error) => {
        elements.error.hidden = false;
        elements.status.textContent = error?.message ?? "WebGL 运行异常";
      },
    });
    const applyWorkbenchContent = (slotId, contentId) => {
      stage.setSlotContent(slotId, contentId);
      loadout = saveWorkbenchLoadout(
        setWorkbenchSlotContent(loadout, slotId, contentId),
        pageStorage,
      );
      slotControls?.setLoadout?.(loadout);
      workbenchPicker?.setLoadout?.(loadout);
      return loadout;
    };
    workbenchPicker = workbenchPickerFactory({
      root: elements.workbenchPicker,
      returnTarget: canvas,
      initialLoadout: loadout,
      onChange(_nextLoadout, { slotId, contentId }) {
        return applyWorkbenchContent(slotId, contentId);
      },
      onRequestClose() {
        stage.setInteractionPaused(false);
      },
    });
    openWorkbenchPicker = (detail) => {
      stage.setInteractionPaused(true);
      let opened = false;
      try {
        opened = workbenchPicker.open(detail);
        return opened;
      } finally {
        if (!opened) stage.setInteractionPaused(false);
      }
    };
    if (elements.slotControlsRoot) {
      const projectSlotAnchors = () => {
        const rect = canvas.getBoundingClientRect?.() ?? {};
        const width = Number(rect.width) || Number(canvas.clientWidth) || Number(canvas.width) || 1;
        const height = Number(rect.height) || Number(canvas.clientHeight) || Number(canvas.height) || 1;
        const camera = stage.host?.camera;
        if (!camera) return [];
        return stage.getSlotControlAnchors().map(({ slotId, region, anchor }) => {
          const point = anchor.getWorldPosition(new THREE.Vector3()).project(camera);
          const x = (point.x + 1) * 0.5 * width;
          const y = (1 - point.y) * 0.5 * height;
          return {
            slotId,
            region,
            x,
            y,
            visible: Number.isFinite(x) && Number.isFinite(y)
              && point.z >= -1 && point.z <= 1
              && x >= 0 && x <= width && y >= 0 && y <= height,
          };
        });
      };
      slotControls = slotControlsFactory({
        root: elements.slotControlsRoot,
        canvas,
        initialLoadout: loadout,
        getProjectedAnchors: projectSlotAnchors,
        subscribeAfterFrame: stage.host?.onAfterFrame?.bind(stage.host),
        onCycle: ({ slotId, contentId }) => applyWorkbenchContent(slotId, contentId),
        onChoose: ({ slotId, contentId }) => applyWorkbenchContent(slotId, contentId),
        onPreview: (detail) => (
          detail
            ? stage.previewSlotContent?.(detail.slotId, detail.contentId)
            : stage.clearSlotContentPreview?.()
        ),
        onOpenPicker: (detail) => {
          stage.clearSlotContentPreview?.();
          return openWorkbenchPicker(detail);
        },
        onHighlight: (slotId, value) => stage.workbench?.setSlotHighlighted?.(slotId, value),
        storage: pageStorage,
        timers: windowTarget,
        matchMedia: windowTarget.matchMedia?.bind(windowTarget),
      });
    }
    const closeTuning = () => {
      try {
        return tuningPanel?.close?.() ?? false;
      } finally {
        stage.setInteractionPaused(false);
      }
    };
    tuningPanel = tuningPanelFactory({
      root: elements.tuningSheet,
      documentTarget,
      navigatorTarget: windowTarget.navigator,
      initialTuning: stage.getTuning(),
      onChange(next) {
        const applied = stage.setTuning(next);
        saveBurgerTuning(applied, { storage: pageStorage, globalTarget: windowTarget });
      },
      onRequestClose: closeTuning,
    });
    replayRecorder = replayRecorderFactory({
      canvas,
      documentTarget,
      windowTarget,
      width: 480,
      fps: 12,
      seconds: 8,
      subscribeFrame: stage.host?.onAfterFrame?.bind(stage.host),
      readFramePixels: stage.host?.readFramePixels?.bind(stage.host),
    });
    replayRecorder.start();
    try {
      if (
        highlightFactory === createCookingHighlightReplayCoordinator
        && typeof windowTarget.MediaRecorder !== "function"
      ) {
        throw new Error("当前浏览器不支持视频高光回放");
      }
      const initialHighlightState = stage.getState();
      highlights = highlightFactory({
        recorder: replayRecorder,
        initialLayerCount: initialHighlightState.assembledOrder.length,
        initialFinished: initialHighlightState.finished,
        preEventMs: 5_000,
        postEventMs: 3_000,
        maxPostEventMs: 3_000,
        maxSnapshotFrames: 96,
        onClip() {
          const count = syncHighlightButton();
          if (!elements.highlightSheet?.hidden && count) showHighlightClip(count - 1);
        },
        onError(error) {
          if (elements.highlightMeta) {
            elements.highlightMeta.textContent = error?.message ?? "高光回放生成失败";
          }
        },
      });
    } catch (error) {
      highlights = null;
      if (elements.highlightMeta) {
        elements.highlightMeta.textContent = error?.message ?? "当前浏览器不支持高光回放";
      }
    }
    syncHighlightButton();
    if (manageLoading) elements.loading.hidden = true;
    render(latest ?? {
      reason: "ready",
      state: stage.getState(),
      tutorial: stage.getTutorial(),
      expanded: false,
      progress: `0/${MAX_SOLO_STACK_LAYERS}`,
    });
    feedback = feedbackFactory({
      canvas,
      dialog: elements.feedbackSheet,
      preview: elements.feedbackPreview,
      message: elements.feedbackMessage,
      status: elements.feedbackStatus,
      submitButton: elements.feedbackSubmitButton,
      recorder: replayRecorder,
      documentTarget,
      windowTarget,
      subscribeFrame: stage.host?.onAfterFrame?.bind(stage.host),
      readFramePixels: stage.host?.readFramePixels?.bind(stage.host),
      getContext: () => ({
        state: stage.getState(),
        focused: stage.isBurgerFocused?.() ?? false,
        expanded: stage.isExpanded?.() ?? false,
      }),
    });
    const openTuning = () => {
      stage.setInteractionPaused(true);
      let opened = false;
      try {
        opened = tuningPanel.open();
        return opened;
      } finally {
        if (!opened) stage.setInteractionPaused(false);
      }
    };
    const renderRecipeReference = (recipeId) => {
      const recipe = recipeId === null ? null : RECIPE_BY_ID.get(recipeId);
      elements.recipeReference.hidden = false;
      elements.recipeReferenceName.textContent = recipe?.publicName ?? "自由料理";
      elements.recipeReferenceSteps.innerHTML = recipeStepItems(recipe)
        .map((item, index) => `<li>${index + 1}. ${item}</li>`)
        .join("");
      for (const card of elements.recipeCards) {
        const cardId = card.dataset.recipeId || null;
        card.setAttribute?.("aria-pressed", String(cardId === (recipe?.id ?? null)));
      }
    };
    const closeRecipeSelector = () => {
      elements.recipeSelector.hidden = true;
      elements.recipeSelector.setAttribute?.("aria-hidden", "true");
    };
    const openRecipeSelector = () => {
      elements.recipeSelector.hidden = false;
      elements.recipeSelector.setAttribute?.("aria-hidden", "false");
      stage.setInteractionPaused(true);
      return true;
    };
    const chooseRecipe = (recipeId, { resume = true } = {}) => {
      const recipe = recipeId === null ? null : RECIPE_BY_ID.get(recipeId);
      if (recipeId !== null && !recipe) return false;
      stage.selectReferenceRecipe(recipe?.id ?? null);
      renderRecipeReference(recipe?.id ?? null);
      closeRecipeSelector();
      if (resume) stage.setInteractionPaused(false);
      return true;
    };
    const actionHandlers = {
      "rotate-left": () => stage.rotateSelected(-Math.PI / 8),
      "rotate-right": () => stage.rotateSelected(Math.PI / 8),
      "camera-reset": () => stage.resetCamera(),
      "toggle-expanded": () => stage.toggleExpanded(),
      "toggle-focus": () => stage.toggleBurgerFocus(),
      "focus-layer-up": () => stage.reorderFocusedLayer(1),
      "focus-layer-down": () => stage.reorderFocusedLayer(-1),
      "focus-layer-rotate": () => stage.rotateFocusedLayer(Math.PI / 12),
      "delete-focused-layer": () => stage.deleteFocusedLayer(),
      undo: () => stage.undo(),
      reset: () => stage.reset(),
      finish: () => stage.finish(),
      continue: () => stage.continueEditing(),
      restart: () => stage.reset(),
      "tutorial-skip": () => stage.skipTutorial(),
      "tutorial-replay": () => stage.replayTutorial(),
      "feedback-open": () => feedback.open(),
      "feedback-close": () => feedback.close(),
      "feedback-submit": () => feedback.submit(),
      "highlight-open": () => showHighlightClip(currentHighlightClips().length - 1),
      "highlight-close": closeHighlightSheet,
      "highlight-previous": () => showHighlightClip(highlightIndex - 1),
      "highlight-next": () => showHighlightClip(highlightIndex + 1),
      "tuning-open": openTuning,
      "tuning-close": closeTuning,
      "recipe-change": openRecipeSelector,
    };
    const handleClick = (event) => {
      if (event.target === elements.highlightSheet) {
        closeHighlightSheet();
        return;
      }
      const actionTarget = event.target.closest?.("[data-action]");
      const action = actionTarget?.dataset.action;
      if (action === "recipe-select") {
        chooseRecipe(actionTarget.dataset.recipeId || null);
        return;
      }
      actionHandlers[action]?.();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeHighlightSheet();
    };
    const routedRecipeId = recipeIdFromLocation(windowTarget.location);
    if (routedRecipeId && RECIPE_BY_ID.has(routedRecipeId)) {
      chooseRecipe(routedRecipeId, { resume: false });
    } else {
      openRecipeSelector();
    }
    const disposeIntegrations = () => {
      let firstError = null;
      for (const task of [
        () => tuningPanel?.dispose?.(),
        () => slotControls?.dispose?.(),
        () => workbenchPicker?.dispose?.(),
        () => stage?.setInteractionPaused?.(false),
        () => {
          closeHighlightSheet();
          elements.highlightVideo?.removeAttribute?.("src");
          elements.highlightVideo?.load?.();
        },
        () => highlights?.dispose?.(),
        () => feedback?.dispose?.(),
        () => replayRecorder?.dispose?.(),
      ]) {
        try {
          task();
        } catch (error) {
          if (!firstError) firstError = error;
        }
      }
      if (firstError) throw firstError;
    };
    mountSoloCookingLifecycle({
      documentTarget,
      windowTarget,
      stage,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      onDispose: disposeIntegrations,
    });
    return stage;
  } catch (error) {
    for (const task of [
      () => tuningPanel?.dispose?.(),
      () => slotControls?.dispose?.(),
      () => workbenchPicker?.dispose?.(),
      () => stage?.setInteractionPaused?.(false),
      () => highlights?.dispose?.(),
      () => feedback?.dispose?.(),
      () => replayRecorder?.dispose?.(),
      () => stage?.dispose?.(),
    ]) {
      try {
        task();
      } catch {
        // Preserve the boot error while completing the remaining cleanup.
      }
    }
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.status.textContent = error?.message ?? "无法启动三维料理台";
    return null;
  }
}
