import * as THREE from "./vendor/three.module.min.js";
import { createSoloCookingStage } from "./cooking-solo-stage.mjs";
import {
  disposeActiveSoloCookingPage,
  mountSoloCookingLifecycle,
} from "./cooking-solo-lifecycle.mjs";
import { createFinishFocusManager } from "./cooking-solo-focus.mjs";
import { createCookingFeedbackReporter } from "./cooking-feedback.mjs";

const LAYER_NAMES = Object.freeze({
  "bottom-bun": "下层面包",
  patty: "牛肉饼",
  cheese: "芝士",
  tomato: "番茄",
  lettuce: "生菜",
  pickle: "酸黄瓜",
  "top-bun": "上层面包",
});

const SAUCE_NAMES = Object.freeze({
  chili: "辣椒酱",
  mustard: "芥末酱",
  sour: "酸味酱",
  sticky: "浓稠酱",
});

const TUTORIAL_COPY = Object.freeze({
  pick: ["第一步：拿起食材", "按住任意一层食材，把它从料盒里拖出来。"],
  drop: ["放到中央餐盘", "拖到餐盘中央再松手，食材会自动吸附。"],
  rotate: ["转一转看看", "选中食材后，点下面的大旋转按钮，或双指扭转。"],
  sauce: ["亲手挤一条酱", "抓住前排任意调料瓶，倾斜并划过食材表面。"],
  assemble: ["继续自由组合", "把剩余食材按你喜欢的顺序装盘；也能拖回料盒重排。"],
  finish: ["完成料理", "七层已经装好，点最下方的完成料理。"],
});

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
    feedbackSheet: documentTarget.querySelector("#feedback-sheet"),
    feedbackPreview: documentTarget.querySelector("#feedback-preview"),
    feedbackMessage: documentTarget.querySelector("#feedback-message"),
    feedbackStatus: documentTarget.querySelector("#feedback-status"),
  };
  const focusManager = createFinishFocusManager({
    dialog: elements.finishSheet,
    returnTarget: canvas,
  });

  let stage = null;
  let feedback = null;
  let latest = null;
  const render = (detail) => {
    latest = detail;
    if (!stage) return;
    const { state, tutorial, expanded, focused = false, progress, dropIntent = null } = detail;
    elements.progress.textContent = progress;
    const inventoryEntries = Object.entries(state.inventory ?? {});
    elements.stock.textContent = inventoryEntries.length
      ? inventoryEntries.map(([id, count]) => `${LAYER_NAMES[id] ?? id} ×${count}`).join(" · ")
      : "每种原料库存 ×999";
    elements.objective.textContent = state.finished
      ? "料理完成，可以继续调整或重新做"
      : state.assembledOrder.length >= 20
        ? "已经叠满 20 层，现在可以完成料理"
        : state.complete
          ? `基础汉堡已装好，还能继续叠 ${20 - state.assembledOrder.length} 层`
        : state.assembledOrder.length
          ? `继续自由叠放，当前 ${state.assembledOrder.length} 层，最多 20 层`
          : "自由叠放食材，最多 20 层";
    elements.finishButton.disabled = !state.complete || state.finished;
    elements.finishButton.textContent = state.complete ? "完成料理" : `再装 ${7 - state.assembledOrder.length} 层`;
    elements.undoButton.disabled = !state.history.length || state.finished;
    elements.inspectButton.disabled = state.finished || !state.assembledOrder.length;
    elements.inspectButton.textContent = expanded ? "合拢汉堡" : "展开查看";
    elements.focusButton.disabled = state.finished || !state.assembledOrder.length;
    elements.focusButton.textContent = focused ? "返回料理台" : "聚焦食物";
    elements.focusButton.dataset.focused = String(focused);
    elements.focusButton.setAttribute?.("aria-pressed", String(focused));
    elements.finishSheet.hidden = !state.finished;

    const order = state.assembledOrder.map((id, index) => (
      `<span>${index + 1}. ${LAYER_NAMES[state.instances?.[id] ?? id] ?? id}</span>`
    )).join("");
    const sauces = sauceSummary(state.strokes, state.instances);
    elements.summary.innerHTML = state.assembledOrder.length
      ? `<div class="summary-list">${order}</div><p>${sauces.length ? sauces.join(" · ") : "还没加酱，可以反复混合四种调料。"}</p>`
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
        stage.workbench.setHighlighted("tool", "chili", true);
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
    stage = stageFactory({
      THREE,
      canvas,
      reducedMotion: windowTarget.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
      onChange: render,
      onError: (error) => {
        elements.error.hidden = false;
        elements.status.textContent = error?.message ?? "WebGL 运行异常";
      },
    });
    if (manageLoading) elements.loading.hidden = true;
    render(latest ?? {
      reason: "ready",
      state: stage.getState(),
      tutorial: stage.getTutorial(),
      expanded: false,
      progress: "0/20",
    });
    feedback = feedbackFactory({
      canvas,
      dialog: elements.feedbackSheet,
      preview: elements.feedbackPreview,
      message: elements.feedbackMessage,
      status: elements.feedbackStatus,
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
    const actionHandlers = {
      "rotate-left": () => stage.rotateSelected(-Math.PI / 8),
      "rotate-right": () => stage.rotateSelected(Math.PI / 8),
      "camera-reset": () => stage.resetCamera(),
      "toggle-expanded": () => stage.toggleExpanded(),
      "toggle-focus": () => stage.toggleBurgerFocus(),
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
    };
    const handleClick = (event) => {
      const action = event.target.closest?.("[data-action]")?.dataset.action;
      actionHandlers[action]?.();
    };
    mountSoloCookingLifecycle({
      documentTarget,
      windowTarget,
      stage,
      onClick: handleClick,
      onDispose: () => feedback?.dispose?.(),
    });
    return stage;
  } catch (error) {
    try {
      feedback?.dispose?.();
    } catch {
      // Preserve the boot error after best-effort feedback recorder cleanup.
    }
    try {
      stage?.dispose?.();
    } catch {
      // Preserve and display the boot error after best-effort stage cleanup.
    }
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.status.textContent = error?.message ?? "无法启动三维料理台";
    return null;
  }
}
