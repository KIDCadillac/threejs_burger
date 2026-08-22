import {
  SWIPE_STACK_CONVEYOR_CAPACITY,
  SWIPE_STACK_MAX_LAYERS,
  SWIPE_STACK_PRESENTATION,
  addSwipeStackLayer,
  consumeConveyorSupply,
  createConveyorSupplyState,
  createSwipeStackState,
  finishSwipeStack,
  resolveSwipeStackGesture,
  spawnConveyorSupply,
  undoSwipeStackLayer,
} from "./swipe-stack-state.mjs?v=20260823-livebelt40";
import { createSwipeStackStage } from "./swipe-stack-stage.mjs?v=20260823-livebelt40";

const CONVEYOR_FIRST_DELAY_MS = 1800;
const CONVEYOR_SPAWN_INTERVAL_MS = 1100;
const CONVEYOR_REFLOW_MS = 560;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const railWindow = document.querySelector("#ingredient-rail-window");
const rail = document.querySelector("#ingredient-rail");
const beltEmptyState = document.querySelector("#belt-empty-state");
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
let supplyState = createConveyorSupplyState();
let stage = null;
let pendingLaunch = null;
let gesture = null;
let impactTimer = 0;
let spawnTimer = 0;
let suppressClick = false;

const cardById = new Map();
const arrivalTimerById = new Map();

function presentation(ingredientId) {
  return SWIPE_STACK_PRESENTATION[ingredientId] ?? { label: ingredientId, shortLabel: ingredientId };
}

function ingredientToken(ingredientId) {
  return `<span class="ingredient-token ingredient-token--${ingredientId}" aria-hidden="true"></span>`;
}

function slotLeft(index) {
  return `calc(${index * 20}% + 6px)`;
}

function arrivalDuration(index) {
  return prefersReducedMotion ? 1 : Math.max(650, 2650 - index * 500);
}

function clearArrivalTimer(itemId) {
  window.clearTimeout(arrivalTimerById.get(itemId));
  arrivalTimerById.delete(itemId);
}

function createSupplyCard(item, index) {
  const label = presentation(item.ingredientId);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "ingredient-card";
  card.id = item.id;
  card.setAttribute("role", "option");
  card.dataset.supplyId = item.id;
  card.dataset.ingredientId = item.ingredientId;
  card.dataset.moving = "true";
  card.style.left = "calc(100% + 12px)";
  card.innerHTML = `
    <span class="ingredient-card__position" aria-hidden="true"></span>
    ${ingredientToken(item.ingredientId)}
    <strong>${label.shortLabel}</strong>
  `;
  rail.append(card);
  cardById.set(item.id, card);

  const duration = arrivalDuration(index);
  card.style.setProperty("--travel-ms", `${duration}ms`);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!card.isConnected) return;
      card.style.left = slotLeft(index);
      const timer = window.setTimeout(() => {
        card.removeAttribute("data-moving");
        arrivalTimerById.delete(item.id);
      }, duration + 80);
      arrivalTimerById.set(item.id, timer);
    });
  });
  return card;
}

function syncSupplyCards({ newItemId = null } = {}) {
  const activeIds = new Set(supplyState.items.map(({ id }) => id));
  for (const [itemId, card] of cardById) {
    if (activeIds.has(itemId)) continue;
    clearArrivalTimer(itemId);
    card.remove();
    cardById.delete(itemId);
  }

  supplyState.items.forEach((item, index) => {
    const card = cardById.get(item.id) ?? createSupplyCard(item, index);
    const label = presentation(item.ingredientId);
    const isCurrent = index === 0;
    card.dataset.conveyorOffset = String(index);
    card.dataset.selected = String(isCurrent);
    card.setAttribute("aria-selected", String(isCurrent));
    card.setAttribute(
      "aria-label",
      isCurrent
        ? `${label.label}，当前可投放，向上滑动`
        : `${label.label}，正在传送带第 ${index + 1} 位等待`,
    );
    card.querySelector(".ingredient-card__position").textContent = isCurrent ? "投" : String(index + 1);
    if (item.id !== newItemId) {
      card.style.setProperty("--travel-ms", `${CONVEYOR_REFLOW_MS}ms`);
      card.style.left = slotLeft(index);
    }
  });

  const current = supplyState.items[0] ?? null;
  selectedIngredient.textContent = current ? presentation(current.ingredientId).label : "等待食材";
  beltEmptyState.hidden = Boolean(current);
  if (current) {
    railWindow.setAttribute("aria-activedescendant", current.id);
  } else {
    railWindow.removeAttribute("aria-activedescendant");
  }
  document.body.dataset.conveyorCount = String(supplyState.items.length);
  document.body.dataset.conveyorCurrent = current?.ingredientId ?? "empty";
}

function spawnNextSupply() {
  if (state.finished || supplyState.items.length >= SWIPE_STACK_CONVEYOR_CAPACITY) return false;
  const nextState = spawnConveyorSupply(supplyState);
  if (nextState === supplyState) return false;
  const item = nextState.items.at(-1);
  supplyState = nextState;
  syncSupplyCards({ newItemId: item.id });
  if (supplyState.items.length === 1) {
    setHint(`${presentation(item.ingredientId).label}正在从右侧送来，可以直接向上划取走`);
  }
  return true;
}

function scheduleSupply(delay = CONVEYOR_SPAWN_INTERVAL_MS) {
  window.clearTimeout(spawnTimer);
  spawnTimer = window.setTimeout(() => {
    spawnNextSupply();
    scheduleSupply();
  }, delay);
}

function resetSupply() {
  window.clearTimeout(spawnTimer);
  for (const itemId of arrivalTimerById.keys()) clearArrivalTimer(itemId);
  for (const card of cardById.values()) card.remove();
  cardById.clear();
  supplyState = createConveyorSupplyState();
  syncSupplyCards();
  scheduleSupply(CONVEYOR_FIRST_DELAY_MS);
}

function renderState() {
  layerCount.textContent = String(state.layers.length);
  scoreValue.textContent = String(state.score);
  comboValue.textContent = state.combo ? `×${state.combo}` : "0";
  undoButton.disabled = !state.layers.length || Boolean(pendingLaunch) || state.finished;
  resetButton.disabled = Boolean(pendingLaunch);
  serveButton.disabled = state.layers.length < 2 || Boolean(pendingLaunch) || state.finished;
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

function launchCurrentIngredient(detail, expectedItemId = null) {
  const current = supplyState.items[0] ?? null;
  if (!current) {
    setHint("传送带正在送来第一份食材");
    return false;
  }
  if (expectedItemId && expectedItemId !== current.id) {
    setHint("食材已经向前补位，请重新向上划");
    return false;
  }
  if (!stage || pendingLaunch || state.finished || state.layers.length >= SWIPE_STACK_MAX_LAYERS) {
    setHint(state.layers.length >= SWIPE_STACK_MAX_LAYERS ? "已经叠满 40 层，可以上菜了" : "等上一层落稳再投");
    return false;
  }

  const pending = { itemId: current.id, ingredientId: current.ingredientId, power: detail.power, lateral: detail.lateral };
  const launched = stage.launch(current.ingredientId, detail);
  if (!launched) return false;
  pendingLaunch = pending;
  const consumed = consumeConveyorSupply(supplyState);
  supplyState = consumed.state;
  syncSupplyCards();
  setHint(`${presentation(current.ingredientId).label}飞起来了，后面的食材继续向左补位`);
  renderState();
  return true;
}

function resetGestureVisuals() {
  railWindow.classList.remove("is-dragging");
  railWindow.style.setProperty("--lift-y", "0px");
  rail.querySelectorAll("[data-gesture-source]").forEach((item) => item.removeAttribute("data-gesture-source"));
}

function beginRailGesture(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (pendingLaunch || state.finished) return;
  const card = event.target.closest?.('[data-selected="true"]');
  if (!card) return;
  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startedAt: performance.now(),
    card,
    itemId: card.dataset.supplyId,
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
    launchCurrentIngredient(resolution, activeGesture.itemId);
    return;
  }
  setHint("把传送带最左边的食材向上划；不拿时它会停在投料口");
}

function resetGame() {
  if (!stage?.reset()) return false;
  state = createSwipeStackState();
  pendingLaunch = null;
  finishPanel.hidden = true;
  setHint("传送带还是空的，第一份食材会从右侧慢慢送来");
  resetSupply();
  renderState();
  return true;
}

try {
  stage = createSwipeStackStage({
    canvas,
    reducedMotion: prefersReducedMotion,
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
        : `${state.layers.length} 层接稳了，传送带会继续积料`);
      renderState();
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
  if (!card) {
    setHint("食材会从传送带右侧慢慢进入");
    return;
  }
  if (card.dataset.selected === "true") {
    setHint("按住最左边的食材向上划，就能投进汉堡");
  } else {
    setHint(`${presentation(card.dataset.ingredientId).label}正在后面排队，前面的不拿就会一直停着`);
  }
});
railWindow.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    launchCurrentIngredient({ power: .5, lateral: 0 });
  }
});

undoButton.addEventListener("click", () => {
  if (!stage?.undo()) return;
  state = undoSwipeStackLayer(state);
  setHint("已撤销最上面一层；传送带里的食材继续保留");
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
  window.clearTimeout(spawnTimer);
  finishLayers.textContent = String(state.layers.length);
  finishScore.textContent = String(state.score);
  finishPanel.hidden = false;
  renderState();
  restartButton.focus();
});
restartButton.addEventListener("click", resetGame);

window.addEventListener("pagehide", () => {
  window.clearTimeout(impactTimer);
  window.clearTimeout(spawnTimer);
  for (const itemId of arrivalTimerById.keys()) clearArrivalTimer(itemId);
  stage?.dispose?.();
}, { once: true });

resetSupply();
renderState();
