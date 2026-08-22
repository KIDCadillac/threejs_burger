import {
  SWIPE_STACK_MAX_LAYERS,
  SWIPE_STACK_PRESENTATION,
  addSwipeStackLayer,
  advanceConveyorCursor,
  conveyorIngredientAt,
  createConveyorWindow,
  createSwipeStackState,
  finishSwipeStack,
  resolveSwipeStackGesture,
  undoSwipeStackLayer,
} from "./swipe-stack-state.mjs?v=20260823-conveyor39";
import { createSwipeStackStage } from "./swipe-stack-stage.mjs?v=20260823-conveyor39";

const railWindow = document.querySelector("#ingredient-rail-window");
const rail = document.querySelector("#ingredient-rail");
const canvas = document.querySelector("#swipe-stack-canvas");
const layerCount = document.querySelector("#layer-count");
const scoreValue = document.querySelector("#score-value");
const comboValue = document.querySelector("#combo-value");
const selectedIngredient = document.querySelector("#selected-ingredient");
const stageHint = document.querySelector("#stage-hint");
const stageError = document.querySelector("#stage-error");
const impactLabel = document.querySelector("#impact-label");
const undoButton = document.querySelector("#undo-button");
const resetButton = document.querySelector("#reset-button");
const serveButton = document.querySelector("#serve-button");
const finishPanel = document.querySelector("#finish-panel");
const finishLayers = document.querySelector("#finish-layers");
const finishScore = document.querySelector("#finish-score");
const restartButton = document.querySelector("#restart-button");

let state = createSwipeStackState();
let conveyorCursor = 0;
let stage = null;
let pendingLaunch = null;
let gesture = null;
let impactTimer = 0;
let conveyorTimer = 0;
let conveyorAnimating = false;
let suppressClick = false;

function presentation(ingredientId) {
  return SWIPE_STACK_PRESENTATION[ingredientId] ?? { label: ingredientId, shortLabel: ingredientId };
}

function ingredientToken(ingredientId) {
  return `<span class="ingredient-token ingredient-token--${ingredientId}" aria-hidden="true"></span>`;
}

function renderRail() {
  rail.innerHTML = createConveyorWindow(conveyorCursor, 5).map(({ offset, ingredientId }) => {
    const label = presentation(ingredientId);
    const ariaLabel = offset === 0
      ? `${label.label}，当前可投放，向上滑动`
      : `${label.label}，传送带等待第 ${offset + 1} 位`;
    return `
      <button
        type="button"
        class="ingredient-card"
        role="option"
        aria-selected="${offset === 0}"
        aria-label="${ariaLabel}"
        data-selected="${offset === 0}"
        data-conveyor-offset="${offset}"
        data-ingredient-id="${ingredientId}"
        id="conveyor-item-${offset}"
      >
        <span class="ingredient-card__position" aria-hidden="true">${offset === 0 ? "投" : offset + 1}</span>
        ${ingredientToken(ingredientId)}
        <strong>${label.shortLabel}</strong>
      </button>
    `;
  }).join("");
  const activeId = conveyorIngredientAt(conveyorCursor);
  selectedIngredient.textContent = presentation(activeId).label;
  railWindow.setAttribute("aria-activedescendant", "conveyor-item-0");
}

function renderState() {
  layerCount.textContent = String(state.layers.length);
  scoreValue.textContent = String(state.score);
  comboValue.textContent = state.combo ? `×${state.combo}` : "0";
  undoButton.disabled = !state.layers.length || Boolean(pendingLaunch) || conveyorAnimating || state.finished;
  resetButton.disabled = Boolean(pendingLaunch) || conveyorAnimating;
  serveButton.disabled = state.layers.length < 2 || Boolean(pendingLaunch) || conveyorAnimating || state.finished;
  serveButton.textContent = state.finished ? "已上菜" : "上菜";
}

function setHint(message) {
  stageHint.textContent = message;
}

function showImpact() {
  window.clearTimeout(impactTimer);
  impactLabel.hidden = true;
  void impactLabel.offsetWidth;
  impactLabel.hidden = false;
  impactTimer = window.setTimeout(() => {
    impactLabel.hidden = true;
  }, 520);
}

function launchIngredient(ingredientId, detail) {
  if (!stage || pendingLaunch || conveyorAnimating || state.finished || state.layers.length >= SWIPE_STACK_MAX_LAYERS) {
    setHint(state.layers.length >= SWIPE_STACK_MAX_LAYERS ? "已经叠满 40 层，可以上菜了" : "等上一层落稳再投");
    return false;
  }
  pendingLaunch = { ingredientId, power: detail.power, lateral: detail.lateral };
  const launched = stage.launch(ingredientId, detail);
  if (!launched) {
    pendingLaunch = null;
    return false;
  }
  setHint(`${presentation(ingredientId).label}飞起来了，接住！`);
  railWindow.classList.add("is-launching");
  renderState();
  return true;
}

function advanceConveyor() {
  conveyorAnimating = true;
  railWindow.classList.remove("is-launching");
  railWindow.classList.add("is-advancing");
  window.clearTimeout(conveyorTimer);
  conveyorTimer = window.setTimeout(() => {
    conveyorCursor = advanceConveyorCursor(conveyorCursor);
    renderRail();
    railWindow.classList.remove("is-advancing");
    conveyorAnimating = false;
    renderState();
  }, 190);
}

function resetGestureVisuals() {
  railWindow.classList.remove("is-dragging");
  railWindow.style.setProperty("--lift-y", "0px");
  rail.querySelectorAll("[data-gesture-source]").forEach((item) => item.removeAttribute("data-gesture-source"));
}

function beginRailGesture(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (pendingLaunch || conveyorAnimating || state.finished) return;
  const card = event.target.closest?.('[data-conveyor-offset="0"]');
  if (!card) return;
  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startedAt: performance.now(),
    card,
    ingredientId: card.dataset.ingredientId,
    moved: false,
  };
  card.setAttribute("data-gesture-source", "true");
  railWindow.classList.add("is-dragging");
  railWindow.setPointerCapture?.(event.pointerId);
}

function moveRailGesture(event) {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  gesture.moved = gesture.moved || Math.hypot(deltaX, deltaY) > 8;
  railWindow.style.setProperty("--lift-y", `${Math.max(-72, Math.min(0, deltaY * .72))}px`);
  event.preventDefault();
}

function endRailGesture(event, cancelled = false) {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const activeGesture = gesture;
  gesture = null;
  railWindow.releasePointerCapture?.(event.pointerId);
  const deltaX = event.clientX - activeGesture.startX;
  const deltaY = event.clientY - activeGesture.startY;
  const resolution = cancelled ? { action: "tap" } : resolveSwipeStackGesture({
    deltaX,
    deltaY,
    width: railWindow.clientWidth,
    height: window.innerHeight,
    elapsedMs: performance.now() - activeGesture.startedAt,
  });
  suppressClick = activeGesture.moved;
  resetGestureVisuals();

  if (resolution.action === "launch") {
    launchIngredient(activeGesture.ingredientId, resolution);
    return;
  }
  setHint("从投料口把当前食材向上划；传送带会自动补位");
}

function resetGame() {
  if (!stage?.reset()) return false;
  state = createSwipeStackState();
  conveyorCursor = 0;
  pendingLaunch = null;
  conveyorAnimating = false;
  window.clearTimeout(conveyorTimer);
  railWindow.classList.remove("is-launching", "is-advancing");
  finishPanel.hidden = true;
  setHint("把投料口里的食材向上划，传送带会自动补位");
  renderRail();
  renderState();
  return true;
}

try {
  stage = createSwipeStackStage({
    canvas,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    onImpact() {
      showImpact();
      try { window.navigator.vibrate?.(18); } catch { /* haptic is optional */ }
    },
    onSettle() {
      if (!pendingLaunch) return;
      state = addSwipeStackLayer(state, pendingLaunch.ingredientId, pendingLaunch);
      pendingLaunch = null;
      setHint(state.layers.length >= SWIPE_STACK_MAX_LAYERS
        ? "40 层满塔！现在可以上菜"
        : `${state.layers.length} 层接稳了，下一份正在送来`);
      renderState();
      advanceConveyor();
    },
    onError(error) {
      stageError.hidden = false;
      stageError.textContent = error?.message ?? "三维舞台运行异常";
    },
  });
} catch (error) {
  stageError.hidden = false;
  stageError.textContent = error?.message ?? "三维舞台启动失败，请刷新后重试。";
}

railWindow.addEventListener("pointerdown", beginRailGesture);
railWindow.addEventListener("pointermove", moveRailGesture);
railWindow.addEventListener("pointerup", (event) => endRailGesture(event));
railWindow.addEventListener("pointercancel", (event) => endRailGesture(event, true));
railWindow.addEventListener("click", (event) => {
  if (suppressClick) {
    suppressClick = false;
    event.preventDefault();
    return;
  }
  const card = event.target.closest?.("[data-conveyor-offset]");
  if (!card) return;
  if (card.dataset.conveyorOffset === "0") {
    setHint("按住当前食材向上划，就能投进汉堡");
  } else {
    setHint(`${presentation(card.dataset.ingredientId).label}正在排队，前面的投出后会自动送来`);
  }
});
railWindow.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    launchIngredient(conveyorIngredientAt(conveyorCursor), { power: .5, lateral: 0 });
  }
});

undoButton.addEventListener("click", () => {
  if (!stage?.undo()) return;
  state = undoSwipeStackLayer(state);
  setHint("已撤销最上面一层；传送带供料顺序保持不变");
  renderState();
});
resetButton.addEventListener("click", resetGame);
serveButton.addEventListener("click", () => {
  const nextState = finishSwipeStack(state);
  if (nextState === state) {
    setHint("至少叠两层再上菜");
    return;
  }
  state = nextState;
  finishLayers.textContent = String(state.layers.length);
  finishScore.textContent = String(state.score);
  finishPanel.hidden = false;
  renderState();
  restartButton.focus();
});
restartButton.addEventListener("click", resetGame);

window.addEventListener("pagehide", () => {
  window.clearTimeout(impactTimer);
  window.clearTimeout(conveyorTimer);
  stage?.dispose?.();
}, { once: true });

renderRail();
renderState();
