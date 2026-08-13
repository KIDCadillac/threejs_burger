import * as THREE from "./vendor/three.module.min.js";
import { createSoloCookingStage } from "./cooking-solo-stage.mjs?v=20260813-hands34";
import {
  disposeActiveSoloCookingPage,
  mountSoloCookingLifecycle,
} from "./cooking-solo-lifecycle.mjs";
import { createFinishFocusManager } from "./cooking-solo-focus.mjs";
import {
  createCanvasReplayRecorder,
  createCookingFeedbackReporter,
} from "./cooking-feedback.mjs?v=20260813-hands34";
import { createCookingHighlightReplayCoordinator } from "./cooking-highlight-replay.mjs";
import { createCookingTuningPanel } from "./cooking-tuning-panel.mjs";
import { loadBurgerTuning, saveBurgerTuning } from "./burger-tuning.mjs";
import { BURGER_RECIPES } from "./burger-recipes.mjs";
import { MAX_SOLO_STACK_LAYERS } from "./cooking-solo-state.mjs";
import { createWorkbenchSlotPicker } from "./cooking-workbench-picker.mjs";
import { createCondimentRackControls } from "./cooking-condiment-rack.mjs?v=20260802-gameplay31";
import {
  loadWorkbenchLoadout,
  saveWorkbenchLoadout,
  setWorkbenchSlotContent,
} from "./workbench-loadout.mjs";
import { createSoloAutosave } from "./cooking-solo-autosave.mjs";
import { createBurgerShopAudio } from "./burger-shop-audio.mjs";
import {
  CLASSIC_BURGER_RECIPE_ID,
  evaluateClassicBurger,
  loadClassicBurgerAttempt,
  recordClassicBurgerMistake,
  scoreClassicBurgerAttempt,
  settleClassicBurgerAttempt,
  startClassicBurgerAttempt,
  validateClassicTransition,
} from "./classic-burger-experience.mjs";

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
  sauce: ["亲手挤一条酱", "在底部胶囊左右滑选调料，按住约半秒后向上拨，再拖到汉堡上松手。"],
  assemble: ["继续自由组合", "把剩余食材按你喜欢的顺序装盘；也能拖回料盒重排。"],
  finish: ["完成料理", "至少两层食材已经装好，点最下方的完成料理。"],
});

const RECIPE_BY_ID = new Map(BURGER_RECIPES.map((recipe) => [recipe.id, recipe]));

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

function recipeLayerSteps(recipe) {
  return recipe?.steps?.filter?.((step) => step.kind === "layer") ?? [];
}

function recipeLayerProgress(recipe, state) {
  const steps = recipeLayerSteps(recipe);
  if (!steps.length) return null;
  return Object.freeze({
    current: Math.min(state.assembledOrder.length, steps.length),
    target: steps.length,
    complete: state.assembledOrder.length >= steps.length,
  });
}

function recipeStepState(index, evaluation) {
  if (!evaluation) return "pending";
  if (index < evaluation.completedSteps) return "complete";
  if (index === evaluation.nextStepIndex && !evaluation.complete) return "current";
  return "pending";
}

function renderRecipeStepItems(recipe, evaluation) {
  return recipeStepItems(recipe).map((item, index) => {
    const state = recipeStepState(index, evaluation);
    const status = state === "complete" ? "完成" : state === "current" ? "当前" : "待做";
    const ariaCurrent = state === "current" ? ' aria-current="step"' : "";
    return `<li data-step-state="${state}"${ariaCurrent}><span>${index + 1}</span><strong>${item}</strong><small>${status}</small></li>`;
  }).join("");
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
    slotControlsFactory = createCondimentRackControls,
    autosaveFactory = createSoloAutosave,
    audioFactory = createBurgerShopAudio,
    manageLoading = true,
    openRecipePicker = true,
    mountDefaultActions = true,
    onStageChange = () => {},
    onToolGesture = () => {},
    onIngredientGesture = () => {},
    onInteractionPause = () => {},
  } = {},
) {
  if (typeof onStageChange !== "function") {
    throw new TypeError("onStageChange must be a function");
  }
  if (typeof onToolGesture !== "function") {
    throw new TypeError("onToolGesture must be a function");
  }
  if (typeof onIngredientGesture !== "function") {
    throw new TypeError("onIngredientGesture must be a function");
  }
  if (typeof onInteractionPause !== "function") {
    throw new TypeError("onInteractionPause must be a function");
  }
  const canvas = documentTarget?.querySelector?.("#cooking-canvas");
  if (!canvas) throw new Error("Missing #cooking-canvas");
  disposeActiveSoloCookingPage(documentTarget);
  const elements = {
    loading: documentTarget.querySelector("#cooking-loading"),
    error: documentTarget.querySelector("#cooking-error"),
    objectiveCard: documentTarget.querySelector(".objective-card"),
    objective: documentTarget.querySelector("#cooking-objective"),
    progress: documentTarget.querySelector("#cooking-progress"),
    stock: documentTarget.querySelector("#cooking-stock"),
    summary: documentTarget.querySelector("#cooking-summary"),
    status: documentTarget.querySelector("#cooking-status"),
    tutorial: documentTarget.querySelector("#tutorial-coach"),
    tutorialTitle: documentTarget.querySelector("#tutorial-title"),
    tutorialCopy: documentTarget.querySelector("#tutorial-copy"),
    finishSheet: documentTarget.querySelector("#finish-sheet"),
    finishTitle: documentTarget.querySelector("#finish-title"),
    finishSummary: documentTarget.querySelector("#finish-summary"),
    finishReaction: documentTarget.querySelector("#finish-reaction"),
    finishScore: documentTarget.querySelector("#finish-score"),
    finishCoins: documentTarget.querySelector("#finish-coins"),
    finishBalance: documentTarget.querySelector("#finish-balance"),
    finishButton: documentTarget.querySelector('[data-action="finish"]'),
    undoButton: documentTarget.querySelector('[data-action="undo"]'),
    inspectButton: documentTarget.querySelector('[data-action="toggle-expanded"]'),
    focusButton: documentTarget.querySelector('[data-action="toggle-focus"]'),
    focusLayerManager: documentTarget.querySelector("#focus-layer-manager"),
    focusLayerList: documentTarget.querySelector("#focus-layer-list"),
    focusLayerCount: documentTarget.querySelector("#focus-layer-count"),
    focusLayerReplacePanel: documentTarget.querySelector("#focus-layer-replace-panel"),
    focusLayerToolbar: documentTarget.querySelector("#focus-layer-toolbar"),
    focusLayerReplaceButton: documentTarget.querySelector('[data-action="focus-layer-replace"]'),
    focusLayerUpButton: documentTarget.querySelector('[data-action="focus-layer-up"]'),
    focusLayerDownButton: documentTarget.querySelector('[data-action="focus-layer-down"]'),
    focusLayerRotateButton: documentTarget.querySelector('[data-action="focus-layer-rotate"]'),
    focusDeleteButton: documentTarget.querySelector('[data-action="delete-focused-layer"]'),
    focusLayerHint: documentTarget.querySelector("#focus-layer-hint"),
    feedbackSheet: documentTarget.querySelector("#feedback-sheet"),
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
    puppetOrderProgress: documentTarget.querySelector("#puppet-order-progress"),
    actionLabel: documentTarget.querySelector("#cooking-action-label"),
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
  let audio = null;
  let attempt = null;
  let finalResult = null;
  let settlement = null;
  let lastEvaluation = null;
  let correctionTimer = null;
  let feedbackTimer = null;
  let resultSoundTimer = null;
  let rejectingTransition = false;
  let pendingCorrectionMessage = "";
  let acceptedState = null;
  let pageStorage = null;
  let openWorkbenchPicker = () => false;
  let latest = null;
  let focusLayerReplaceOpen = false;
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
    const previousDetail = latest;
    latest = detail;
    autosave?.save?.(detail.state);
    if (!acceptedState) acceptedState = detail.state;
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
    const activeRecipe = state.referenceRecipeId
      ? RECIPE_BY_ID.get(state.referenceRecipeId) ?? null
      : null;
    const isClassicOrder = activeRecipe?.id === CLASSIC_BURGER_RECIPE_ID;
    const evaluation = isClassicOrder ? evaluateClassicBurger(activeRecipe, state) : null;
    const activeRecipeProgress = evaluation ?? recipeLayerProgress(activeRecipe, state);
    const canServe = activeRecipeProgress?.complete ?? state.complete;
    let invalidTransition = null;
    const validatesClassicAction = isClassicOrder
      && ["drop-layer", "sauce-stroke", "sauce-gesture"].includes(detail.reason);
    if (validatesClassicAction && !rejectingTransition) {
      const validation = validateClassicTransition(
        activeRecipe,
        acceptedState ?? previousDetail?.state ?? state,
        state,
        detail.reason,
      );
      if (!validation.valid) {
        invalidTransition = validation;
        attempt = recordClassicBurgerMistake(attempt, { storage: pageStorage });
        pendingCorrectionMessage = validation.message;
        audio?.play?.("tick");
      } else {
        acceptedState = state;
        pendingCorrectionMessage = "";
        const previousEvaluation = lastEvaluation;
        if (detail.reason === "drop-layer") audio?.play?.("drop");
        if (detail.reason === "sauce-stroke" || detail.reason === "sauce-gesture") {
          audio?.play?.("correct");
        } else if (previousEvaluation && validation.evaluation.completedSteps > previousEvaluation.completedSteps) {
          audio?.play?.("correct");
        }
      }
    } else if ([
      "ready",
      "reference-recipe",
      "remove-layer",
      "undo",
      "reset",
      "finish",
      "continue",
    ].includes(detail.reason)) {
      acceptedState = state;
    }
    lastEvaluation = evaluation;
    highlights?.observe?.({
      layerCount: state.assembledOrder.length,
      finished: state.finished,
    });
    elements.progress.textContent = activeRecipeProgress
      ? `${activeRecipeProgress.completedSteps ?? activeRecipeProgress.current}/${activeRecipeProgress.targetSteps ?? activeRecipeProgress.target}`
      : progress;
    if (elements.puppetOrderProgress) {
      elements.puppetOrderProgress.textContent = elements.progress.textContent;
    }
    const inventoryEntries = Object.entries(state.inventory ?? {});
    elements.stock.textContent = inventoryEntries.length
      ? inventoryEntries.map(([id, count]) => `${LAYER_NAMES[id] ?? id} ×${count}`).join(" · ")
      : "每种原料库存 ×999";
    elements.objective.textContent = pendingCorrectionMessage
      || (state.finished
        ? "出餐完成，顾客已经给出评价"
        : evaluation
          ? evaluation.instruction
          : activeRecipeProgress
            ? activeRecipeProgress.complete
              ? "汉堡装好了，可以按铃出餐"
              : `按订单继续装配，还差 ${activeRecipeProgress.target - activeRecipeProgress.current} 层`
        : state.assembledOrder.length >= MAX_SOLO_STACK_LAYERS
          ? `已经叠满 ${MAX_SOLO_STACK_LAYERS} 层，现在可以完成料理`
          : state.complete
            ? `已经可以完成料理，还能继续叠 ${MAX_SOLO_STACK_LAYERS - state.assembledOrder.length} 层`
            : state.assembledOrder.length
              ? `继续自由叠放，当前 ${state.assembledOrder.length} 层，最多 ${MAX_SOLO_STACK_LAYERS} 层`
              : `自由叠放食材，最多 ${MAX_SOLO_STACK_LAYERS} 层`);
    elements.finishButton.disabled = !canServe || state.finished;
    elements.finishButton.textContent = state.finished
      ? "已出餐"
      : canServe
        ? "按铃出餐"
        : evaluation
          ? `订单 ${evaluation.completedSteps}/${evaluation.targetSteps}`
          : activeRecipeProgress
          ? `还差 ${activeRecipeProgress.target - activeRecipeProgress.current} 层`
          : `还差 ${Math.max(0, 2 - state.assembledOrder.length)} 层`;
    if (elements.actionLabel) {
      elements.actionLabel.textContent = pendingCorrectionMessage
        || (state.finished
        ? "出餐完成，辛苦啦！"
        : canServe
          ? "汉堡装好了，按铃出餐"
          : evaluation
            ? evaluation.instruction
            : state.assembledOrder.length
            ? `继续交给厨师，还差 ${activeRecipeProgress?.target - activeRecipeProgress?.current || 1} 层`
            : "厨师准备好了，先拿下层面包");
    }
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
      canReplace: selectedFocusIndex >= 0,
      canDelete: selectedFocusIndex >= 0,
    };
    const focusCapabilities = stage.getFocusedLayerCapabilities?.() ?? fallbackCapabilities;
    const hasFocusedLayer = focused && focusCapabilities.selected;
    if (!focused || !hasFocusedLayer) focusLayerReplaceOpen = false;
    if (elements.focusLayerManager) elements.focusLayerManager.hidden = !focused;
    if (elements.focusLayerCount) {
      elements.focusLayerCount.textContent = `${state.assembledOrder.length} 层`;
    }
    if (elements.focusLayerList) {
      elements.focusLayerList.innerHTML = state.assembledOrder.map((id, index) => {
        const ingredientId = state.instances?.[id] ?? id;
        const selected = id === selectedLayerId;
        return `<button type="button" role="option" data-focus-layer-id="${id}" aria-selected="${selected}"><span>${index + 1}</span><strong>${LAYER_NAMES[ingredientId] ?? ingredientId}</strong></button>`;
      }).reverse().join("");
    }
    if (elements.focusLayerReplacePanel) {
      elements.focusLayerReplacePanel.hidden = !focused || !hasFocusedLayer || !focusLayerReplaceOpen;
    }
    if (elements.focusLayerReplaceButton) {
      elements.focusLayerReplaceButton.disabled = !hasFocusedLayer || !focusCapabilities.canReplace;
      elements.focusLayerReplaceButton.setAttribute?.("aria-expanded", String(focusLayerReplaceOpen));
    }
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
    slotControls?.setDisabled?.(
      focused || state.finished || Boolean(stage.isInteractionPaused?.()),
    );
    elements.finishSheet.hidden = !state.finished;

    if (activeRecipe && elements.recipeReferenceSteps) {
      elements.recipeReferenceSteps.innerHTML = renderRecipeStepItems(activeRecipe, evaluation);
    }

    const order = state.assembledOrder.map((id, index) => (
      `<span>${index + 1}. ${LAYER_NAMES[state.instances?.[id] ?? id] ?? id}</span>`
    )).join("");
    const sauces = sauceSummary(state.strokes, state.instances);
    elements.summary.innerHTML = state.assembledOrder.length
      ? `<div class="summary-list">${order}</div><p>${sauces.length ? sauces.join(" · ") : "还没加酱，可以自由混合三种调料。"}</p>`
      : "<p>还没有装盘，先从原料盒拿一层食材。</p>";
    if (state.finished && evaluation?.complete) {
      if (!finalResult) finalResult = scoreClassicBurgerAttempt(attempt);
      if (!settlement || settlement.attempt?.id !== attempt?.id) {
        settlement = settleClassicBurgerAttempt(attempt, finalResult, { storage: pageStorage });
        attempt = settlement.attempt;
      }
      elements.finishTitle.textContent = finalResult.rating;
      elements.finishReaction.textContent = `“${finalResult.quote}”`;
      elements.finishScore.textContent = String(finalResult.score);
      elements.finishCoins.textContent = `+${finalResult.coins}`;
      elements.finishBalance.textContent = `当前余额 ${settlement.totalCoins}`;
      elements.finishSummary.textContent = finalResult.mistakes
        ? `订单 6/6 完成，本次纠正了 ${finalResult.mistakes} 次步骤。`
        : "订单 6/6 一次完成，食材顺序和番茄酱位置都正确。";
      if (detail.reason === "finish" && resultSoundTimer === null) {
        resultSoundTimer = windowTarget.setTimeout?.(() => {
          resultSoundTimer = null;
          audio?.play?.("result");
        }, 220) ?? null;
      }
    } else {
      elements.finishTitle.textContent = "你的三维汉堡做好了！";
      elements.finishReaction.textContent = "顾客正在等待品尝。";
      elements.finishScore.textContent = "--";
      elements.finishCoins.textContent = "+0";
      elements.finishBalance.textContent = "完成固定订单后结算";
      elements.finishSummary.textContent = sauces.length
        ? `${state.assembledOrder.length} 层食材，${state.strokes.length} 条酱料轨迹。${sauces.join("；")}`
        : `${state.assembledOrder.length} 层食材已经组合完成，还可以继续调整或加酱。`;
    }

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

    const presentationDetail = invalidTransition || (rejectingTransition && pendingCorrectionMessage)
      ? Object.freeze({ ...detail, reason: "invalid-drop", message: pendingCorrectionMessage })
      : detail;
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
    if (statusByReason[presentationDetail.reason]) {
      elements.status.textContent = statusByReason[presentationDetail.reason];
    }
    if (presentationDetail.message) elements.status.textContent = presentationDetail.message;
    if (elements.objectiveCard) {
      const feedback = invalidTransition || (rejectingTransition && pendingCorrectionMessage)
        ? "mistake"
        : validatesClassicAction
          ? "correct"
          : "";
      if (feedback) {
        elements.objectiveCard.dataset.feedback = feedback;
        if (feedbackTimer !== null) windowTarget.clearTimeout?.(feedbackTimer);
        feedbackTimer = windowTarget.setTimeout?.(() => {
          feedbackTimer = null;
          delete elements.objectiveCard.dataset.feedback;
        }, 680) ?? null;
      }
    }
    focusManager.sync(state.finished);
    onStageChange(presentationDetail);

    if (invalidTransition && correctionTimer === null) {
      stage.setInteractionPaused?.(true);
      correctionTimer = windowTarget.setTimeout?.(() => {
        correctionTimer = null;
        rejectingTransition = true;
        try {
          stage.undo();
        } finally {
          rejectingTransition = false;
          stage.setInteractionPaused?.(false);
        }
      }, 180) ?? null;
    }
  };

  try {
    try {
      pageStorage = windowTarget?.localStorage ?? null;
    } catch {
      pageStorage = null;
    }
    const tuning = loadBurgerTuning({ storage: pageStorage, globalTarget: windowTarget });
    autosave = autosaveFactory({ storage: pageStorage });
    audio = audioFactory({ navigatorTarget: windowTarget.navigator });
    let initialState = autosave.load();
    let discardedSavedState = false;
    const classicRecipe = RECIPE_BY_ID.get(CLASSIC_BURGER_RECIPE_ID);
    if (initialState) {
      const restoredEvaluation = evaluateClassicBurger(classicRecipe, initialState);
      const hasComposition = Boolean(
        initialState.assembledOrder?.length || initialState.strokes?.length,
      );
      const belongsToClassicOrder = !hasComposition
        || initialState.referenceRecipeId === CLASSIC_BURGER_RECIPE_ID;
      const canRestore = belongsToClassicOrder
        && restoredEvaluation.compatible
        && (!initialState.finished || restoredEvaluation.complete);
      if (!canRestore) {
        autosave.clear();
        initialState = null;
        discardedSavedState = true;
      }
    }
    attempt = loadClassicBurgerAttempt({ storage: pageStorage });
    if (discardedSavedState || (!initialState?.finished && attempt.completedAt)) {
      attempt = startClassicBurgerAttempt({ storage: pageStorage });
    }
    let loadout = initialState?.stationContents ?? loadWorkbenchLoadout(pageStorage);
    stage = stageFactory({
      THREE,
      canvas,
      tuning,
      storage: pageStorage,
      loadout,
      initialState,
      directCondimentPickup: false,
      reducedMotion: windowTarget.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
      onChange: render,
      onToolGesture,
      onIngredientGesture,
      onInteractionPause: (detail) => {
        slotControls?.cancel?.(detail?.reason ?? "interaction-paused");
        onInteractionPause(detail);
      },
      onStationSelector: (detail) => openWorkbenchPicker(detail),
      onError: (error) => {
        elements.error.hidden = false;
        elements.status.textContent = error?.message ?? "WebGL 运行异常";
      },
    });
    stage.setCameraLocked?.(true);
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
        return stage.getCondimentRackControlAnchors().map(({ slotId, region, anchor }) => {
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
        onPickupStart: ({ slotId, event }) => (
          stage.beginCondimentSlotGesture?.(slotId, event) ?? false
        ),
        onPickupMove: ({ event }) => stage.moveSauceGesture?.(event),
        onPickupCommit: ({ event }) => stage.endSauceGesture?.(event),
        onPickupCancel: ({ reason }) => stage.cancelSauceGesture?.(reason),
        onHighlight: (slotId, value) => stage.workbench?.setSlotHighlighted?.(slotId, value),
        onFeedback: (kind) => {
          const duration = {
            switch: 10,
            open: 18,
            roulette: 4,
            choose: 14,
            pickup: 16,
            drop: 10,
            hint: 6,
          }[kind];
          if (!duration) return;
          try { windowTarget.navigator?.vibrate?.(duration); } catch { /* optional haptic */ }
        },
        onStatus: (message) => {
          if (elements.status) elements.status.textContent = message;
        },
        timers: windowTarget,
      });
      slotControls.setDisabled?.(
        Boolean(stage.getState?.()?.finished || stage.isInteractionPaused?.()),
      );
      const setStageInteractionPaused = stage.setInteractionPaused?.bind(stage);
      if (setStageInteractionPaused) {
        stage.setInteractionPaused = (value) => {
          const paused = setStageInteractionPaused(value);
          slotControls?.setDisabled?.(paused || Boolean(stage.getState?.()?.finished));
          return paused;
        };
      }
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
      preview: null,
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
      const evaluation = recipe?.id === CLASSIC_BURGER_RECIPE_ID && latest?.state
        ? evaluateClassicBurger(recipe, latest.state)
        : null;
      elements.recipeReferenceSteps.innerHTML = renderRecipeStepItems(recipe, evaluation);
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
    const restartClassicOrder = () => {
      attempt = startClassicBurgerAttempt({ storage: pageStorage });
      finalResult = null;
      settlement = null;
      lastEvaluation = null;
      pendingCorrectionMessage = "";
      acceptedState = null;
      elements.finishSheet.hidden = true;
      return stage.reset();
    };
    const finishClassicOrder = () => {
      const recipe = RECIPE_BY_ID.get(CLASSIC_BURGER_RECIPE_ID);
      const evaluation = evaluateClassicBurger(recipe, stage.getState());
      if (!evaluation.complete) {
        pendingCorrectionMessage = evaluation.instruction;
        elements.status.textContent = evaluation.instruction;
        return false;
      }
      audio?.play?.("bell");
      return stage.finish();
    };
    const viewFinishedBurger = () => {
      elements.finishSheet.hidden = true;
      focusManager.sync(false);
      canvas.focus?.();
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
      "focus-layer-replace": () => {
        if (!latest?.focused && !stage.isBurgerFocused?.()) return false;
        focusLayerReplaceOpen = !focusLayerReplaceOpen;
        if (elements.focusLayerReplacePanel) {
          elements.focusLayerReplacePanel.hidden = !focusLayerReplaceOpen;
        }
        elements.focusLayerReplaceButton?.setAttribute?.(
          "aria-expanded",
          String(focusLayerReplaceOpen),
        );
        return true;
      },
      "focus-layer-rotate": () => stage.rotateFocusedLayer(Math.PI / 12),
      "delete-focused-layer": () => stage.deleteFocusedLayer(),
      undo: () => stage.undo(),
      reset: restartClassicOrder,
      finish: finishClassicOrder,
      continue: () => stage.continueEditing(),
      restart: restartClassicOrder,
      "view-finished": viewFinishedBurger,
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
      "recipe-change": () => (
        documentTarget.body?.dataset?.debug === "true" ? openRecipeSelector() : false
      ),
    };
    const handleClick = (event) => {
      if (event.target === elements.highlightSheet) {
        closeHighlightSheet();
        return;
      }
      const focusLayerTarget = event.target.closest?.("[data-focus-layer-id]");
      if (focusLayerTarget?.dataset.focusLayerId) {
        focusLayerReplaceOpen = false;
        stage.selectFocusedLayer(focusLayerTarget.dataset.focusLayerId);
        return;
      }
      const replacementTarget = event.target.closest?.("[data-focus-layer-replacement]");
      if (replacementTarget?.dataset.focusLayerReplacement) {
        const changed = stage.replaceFocusedLayer(
          replacementTarget.dataset.focusLayerReplacement,
        );
        if (changed) {
          focusLayerReplaceOpen = false;
          if (elements.focusLayerReplacePanel) elements.focusLayerReplacePanel.hidden = true;
          elements.focusLayerReplaceButton?.setAttribute?.("aria-expanded", "false");
        }
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
    if (!openRecipePicker) {
      chooseRecipe(null, { resume: false });
    } else {
      chooseRecipe(CLASSIC_BURGER_RECIPE_ID, { resume: false });
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
        () => audio?.dispose?.(),
        () => {
          if (correctionTimer !== null) windowTarget.clearTimeout?.(correctionTimer);
          if (feedbackTimer !== null) windowTarget.clearTimeout?.(feedbackTimer);
          if (resultSoundTimer !== null) windowTarget.clearTimeout?.(resultSoundTimer);
          correctionTimer = null;
          feedbackTimer = null;
          resultSoundTimer = null;
        },
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
      onClick: mountDefaultActions ? handleClick : () => {},
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
      () => audio?.dispose?.(),
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
