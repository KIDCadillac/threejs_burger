import {
  SWIPE_STACK_CONVEYOR_CAPACITY,
  SWIPE_STACK_PRESENTATION,
  addSwipeStackLayer,
  consumeConveyorSupply,
  createConveyorSupplyState,
  createSwipeStackOrderBoard,
  createSwipeStackState,
  cycleSwipeStackOrder,
  orderNextIngredient,
  orderRecipe,
  placeIngredientInOrder,
  refreshCompletedOrder,
  resolveOrderSwipeGesture,
  spawnConveyorSupply,
  supplyForecastForOrders,
  supplyNeedsForOrders,
  undoIngredientInOrder,
  undoSwipeStackOrderLayer,
} from "./swipe-stack-state.mjs?v=20260826-orderswipe49";
import { createSwipeStackStage } from "./swipe-stack-stage.mjs?v=20260826-orderswipe49";

const CONVEYOR_FIRST_DELAY_MS = 5200;
const CONVEYOR_SPAWN_INTERVAL_MS = 1700;
const CONVEYOR_REFLOW_MS = 520;
const ORDER_SERVE_DELAY_MS = 260;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const railWindow = document.querySelector("#ingredient-rail-window");
const rail = document.querySelector("#ingredient-rail");
const beltEmptyState = document.querySelector("#belt-empty-state");
const canvas = document.querySelector("#swipe-stack-canvas");
const stageSurface = document.querySelector(".swipe-stack-stage");
const servedCount = document.querySelector("#served-count");
const supplyCount = document.querySelector("#supply-count");
const orderDockRow = document.querySelector("#order-dock-row");
const activeOrderName = document.querySelector("#active-order-name");
const scoreValue = document.querySelector("#score-value");
const comboValue = document.querySelector("#combo-value");
const stageHint = document.querySelector("#stage-hint");
const stageError = document.querySelector("#stage-error");
const impactLabel = document.querySelector("#impact-label");
const serveLabel = document.querySelector("#serve-label");
const undoButton = document.querySelector("#undo-button");
const resetButton = document.querySelector("#reset-button");

let gameState = createSwipeStackState();
let orderBoard = createSwipeStackOrderBoard(3);
let supplyState = createConveyorSupplyState();
let activeOrderId = orderBoard.orders[0].id;
let supplyNeedCursor = 0;
let stage = null;
let pendingLaunch = null;
let servingOrderId = null;
let gesture = null;
let orderSwipeGesture = null;
let impactTimer = 0;
let serveTimer = 0;
let spawnTimer = 0;
let suppressClick = false;
let suppressOrderClick = false;

const cardById = new Map();
const arrivalTimerById = new Map();

function presentation(ingredientId) {
  return SWIPE_STACK_PRESENTATION[ingredientId] ?? { label: ingredientId, shortLabel: ingredientId };
}

function ingredientToken(ingredientId) {
  return `<span class="ingredient-token ingredient-token--${ingredientId}" aria-hidden="true"></span>`;
}

function currentOrder() {
  return orderBoard.orders.find(({ id }) => id === activeOrderId) ?? orderBoard.orders[0];
}

function railMetrics() {
  const width = Math.max(320, rail.clientWidth || railWindow.clientWidth || 390);
  const sourceGateSpace = 48;
  const gap = width < 520 ? 5 : 7;
  const cardWidth = Math.max(42, Math.min(78, (width - sourceGateSpace - 18 - gap * (SWIPE_STACK_CONVEYOR_CAPACITY - 1)) / SWIPE_STACK_CONVEYOR_CAPACITY));
  const cardHeight = Math.max(64, Math.min(76, (rail.clientHeight || 84) - 12));
  return { cardWidth, cardHeight, gap, left: 9 };
}

function slotLeft(index) {
  const { cardWidth, gap, left } = railMetrics();
  return `${left + index * (cardWidth + gap)}px`;
}

function arrivalDuration(index) {
  if (prefersReducedMotion) return 1;
  return Math.max(760, 1750 - index * 130);
}

function clearArrivalTimer(itemId) {
  window.clearTimeout(arrivalTimerById.get(itemId));
  arrivalTimerById.delete(itemId);
}

function createSupplyCard(item, index) {
  const label = presentation(item.ingredientId);
  const { cardWidth, cardHeight } = railMetrics();
  const card = document.createElement("button");
  card.type = "button";
  card.className = "ingredient-card";
  card.id = item.id;
  card.setAttribute("role", "option");
  card.dataset.supplyId = item.id;
  card.dataset.ingredientId = item.ingredientId;
  card.dataset.moving = "true";
  card.style.left = "calc(100% + 16px)";
  card.style.top = "6px";
  card.style.setProperty("--card-width", `${cardWidth}px`);
  card.style.setProperty("--card-height", `${cardHeight}px`);
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

  const { cardWidth, cardHeight } = railMetrics();
  supplyState.items.forEach((item, index) => {
    const card = cardById.get(item.id) ?? createSupplyCard(item, index);
    const label = presentation(item.ingredientId);
    card.dataset.conveyorOffset = String(index);
    card.style.setProperty("--card-width", `${cardWidth}px`);
    card.style.setProperty("--card-height", `${cardHeight}px`);
    card.setAttribute("aria-label", `${label.label}，供给槽第 ${index + 1} 张，拖到右侧订单口`);
    card.querySelector(".ingredient-card__position").textContent = String(index + 1);
    if (item.id !== newItemId) {
      card.style.setProperty("--travel-ms", `${CONVEYOR_REFLOW_MS}ms`);
      card.style.left = slotLeft(index);
    }
  });

  beltEmptyState.hidden = Boolean(supplyState.items.length);
  supplyCount.textContent = `${supplyState.items.length}/${SWIPE_STACK_CONVEYOR_CAPACITY}`;
  document.body.dataset.conveyorCount = String(supplyState.items.length);
  document.body.dataset.conveyorCurrent = supplyState.items[0]?.ingredientId ?? "empty";
}

function nextSuppliedIngredient() {
  const queued = new Set(supplyState.items.map(({ ingredientId }) => ingredientId));
  const immediateNeeds = [...new Set(supplyNeedsForOrders(orderBoard))];
  const missingImmediate = immediateNeeds.find((ingredientId) => !queued.has(ingredientId));
  if (missingImmediate) return missingImmediate;
  const needs = supplyForecastForOrders(orderBoard, 2);
  if (!needs.length) return "bottom-bun";
  const ingredientId = needs[supplyNeedCursor % needs.length];
  supplyNeedCursor += 1;
  return ingredientId;
}

function spawnNextSupply() {
  if (supplyState.items.length >= SWIPE_STACK_CONVEYOR_CAPACITY) return false;
  const nextState = spawnConveyorSupply(
    supplyState,
    SWIPE_STACK_CONVEYOR_CAPACITY,
    nextSuppliedIngredient(),
  );
  if (nextState === supplyState) return false;
  const item = nextState.items.at(-1);
  supplyState = nextState;
  syncSupplyCards({ newItemId: item.id });
  if (supplyState.items.length === 1) {
    setHint(`${presentation(item.ingredientId).label}正从底部传送带右侧进入`);
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
  supplyNeedCursor = 0;
  syncSupplyCards();
  scheduleSupply(CONVEYOR_FIRST_DELAY_MS);
}

function progressDots(order) {
  const recipe = orderRecipe(order);
  return recipe.ingredients.map((_, index) => `<i class="${index < order.placed.length ? "is-filled" : ""}"></i>`).join("");
}

function renderOrders() {
  orderDockRow.replaceChildren();
  orderBoard.orders.forEach((order, index) => {
    const recipe = orderRecipe(order);
    const next = orderNextIngredient(order);
    const dock = document.createElement("button");
    dock.type = "button";
    dock.className = "order-dock";
    dock.dataset.orderId = order.id;
    dock.dataset.selected = String(order.id === activeOrderId);
    dock.dataset.complete = String(order.complete);
    dock.style.setProperty("--dock-accent", recipe.accent);
    dock.setAttribute("aria-label", `订单 ${index + 1}，${recipe.label}，下一份${next ? presentation(next).label : "等待出餐"}`);
    dock.innerHTML = `
      <small>订单 ${index + 1}</small>
      <strong>${recipe.shortLabel}</strong>
      <span class="order-dock__next">${next ? `要 ${presentation(next).shortLabel}` : "完成"}</span>
      <span class="order-dock__progress" aria-hidden="true">${progressDots(order)}</span>
    `;
    orderDockRow.append(dock);
  });
  const order = currentOrder();
  const recipe = orderRecipe(order);
  activeOrderName.textContent = recipe?.label ?? "当前订单";
  servedCount.textContent = String(orderBoard.servedCount);
  document.body.dataset.activeOrder = activeOrderId;
  document.body.dataset.servedCount = String(orderBoard.servedCount);
}

function renderState() {
  scoreValue.textContent = String(gameState.score);
  comboValue.textContent = gameState.combo ? `×${gameState.combo}` : "0";
  const order = currentOrder();
  undoButton.disabled = !order?.placed.length || Boolean(pendingLaunch) || Boolean(servingOrderId);
  resetButton.disabled = Boolean(pendingLaunch) || Boolean(servingOrderId);
  renderOrders();
}

function setHint(message) {
  stageHint.textContent = message;
}

function showImpact() {
  window.clearTimeout(impactTimer);
  impactLabel.hidden = true;
  void impactLabel.offsetWidth;
  impactLabel.hidden = false;
  impactTimer = window.setTimeout(() => { impactLabel.hidden = true; }, 520);
}

function showServeStamp() {
  window.clearTimeout(serveTimer);
  serveLabel.hidden = true;
  void serveLabel.offsetWidth;
  serveLabel.hidden = false;
  serveTimer = window.setTimeout(() => { serveLabel.hidden = true; }, 900);
}

function selectOrder(orderId, { announce = true, direction = 0 } = {}) {
  if (pendingLaunch || servingOrderId) return false;
  const order = orderBoard.orders.find(({ id }) => id === orderId);
  if (!order) return false;
  const previousIndex = orderBoard.orders.findIndex(({ id }) => id === activeOrderId);
  const nextIndex = orderBoard.orders.findIndex(({ id }) => id === orderId);
  let switchDirection = Math.sign(direction);
  if (!switchDirection && previousIndex !== nextIndex) {
    const rawDifference = nextIndex - previousIndex;
    switchDirection = Math.abs(rawDifference) > orderBoard.orders.length / 2
      ? -Math.sign(rawDifference)
      : Math.sign(rawDifference);
  }
  activeOrderId = orderId;
  stage?.showStack?.(order.placed, { direction: switchDirection });
  renderState();
  if (announce) {
    const next = orderNextIngredient(order);
    setHint(`已切到${orderRecipe(order).label}${next ? `，需要${presentation(next).label}` : "，准备出餐"}`);
  }
  return true;
}

function switchOrderByStep(step) {
  const nextOrderId = cycleSwipeStackOrder(orderBoard, activeOrderId, step);
  if (!nextOrderId) return false;
  return selectOrder(nextOrderId, { direction: step });
}

function resetOrderSwipeVisuals() {
  orderDockRow.removeAttribute("data-swiping");
  orderDockRow.style.removeProperty("--order-swipe-x");
  document.body.dataset.orderSwipe = "idle";
}

function beginOrderSwipe(event) {
  if ((event.pointerType === "mouse" && event.button !== 0) || pendingLaunch || servingOrderId) return;
  const captureTarget = event.target.closest?.(".order-dock") ?? canvas;
  orderSwipeGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    captureTarget,
  };
  if (event.target === canvas) canvas.focus?.({ preventScroll: true });
  try { captureTarget.setPointerCapture?.(event.pointerId); } catch { /* synthetic pointers may not support capture */ }
}

function moveOrderSwipe(event) {
  if (!orderSwipeGesture || event.pointerId !== orderSwipeGesture.pointerId) return;
  const deltaX = event.clientX - orderSwipeGesture.startX;
  const deltaY = event.clientY - orderSwipeGesture.startY;
  const horizontal = Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.05;
  if (!horizontal) return;
  orderSwipeGesture.moved = true;
  const previewX = Math.max(-24, Math.min(24, deltaX * 0.18));
  orderDockRow.dataset.swiping = deltaX < 0 ? "next" : "previous";
  orderDockRow.style.setProperty("--order-swipe-x", `${previewX}px`);
  document.body.dataset.orderSwipe = deltaX < 0 ? "next" : "previous";
  event.preventDefault();
}

function endOrderSwipe(event, cancelled = false) {
  if (!orderSwipeGesture || event.pointerId !== orderSwipeGesture.pointerId) return;
  const activeGesture = orderSwipeGesture;
  orderSwipeGesture = null;
  try { activeGesture.captureTarget.releasePointerCapture?.(event.pointerId); } catch { /* pointer may already be released */ }
  const result = cancelled
    ? { action: "none", step: 0 }
    : resolveOrderSwipeGesture({
      deltaX: event.clientX - activeGesture.startX,
      deltaY: event.clientY - activeGesture.startY,
      width: canvas.clientWidth,
    });
  resetOrderSwipeVisuals();
  if (result.action === "switch-order") {
    suppressOrderClick = true;
    window.setTimeout(() => { suppressOrderClick = false; }, 0);
    switchOrderByStep(result.step);
  }
  else if (activeGesture.moved) setHint("左右滑动盘子切换订单");
}

function rejectDrop(card, orderId, expected) {
  const dock = orderDockRow.querySelector(`[data-order-id="${orderId}"]`);
  card?.setAttribute("data-rejected", "true");
  dock?.setAttribute("data-rejected", "true");
  window.setTimeout(() => {
    card?.removeAttribute("data-rejected");
    dock?.removeAttribute("data-rejected");
  }, 330);
  setHint(`这个订单现在要${presentation(expected).label}，${presentation(card?.dataset.ingredientId).label}已退回供给槽`);
}

function tryLaunchIngredient(itemId, orderId, { power = .55, lateral = 0 } = {}) {
  if (!stage || pendingLaunch || servingOrderId) return false;
  const item = supplyState.items.find(({ id }) => id === itemId);
  const orderBefore = orderBoard.orders.find(({ id }) => id === orderId);
  if (!item || !orderBefore) return false;

  const placement = placeIngredientInOrder(orderBoard, orderId, item.ingredientId);
  if (!placement.accepted) {
    rejectDrop(cardById.get(item.id), orderId, placement.expected);
    return false;
  }

  if (activeOrderId !== orderId) {
    activeOrderId = orderId;
    stage.showStack(orderBefore.placed);
  }
  const launched = stage.launch(item.ingredientId, { power, lateral });
  if (!launched) return false;

  orderBoard = placement.state;
  pendingLaunch = {
    itemId: item.id,
    ingredientId: item.ingredientId,
    orderId,
    complete: placement.complete,
    power,
    lateral,
  };
  supplyState = consumeConveyorSupply(supplyState, item.id).state;
  syncSupplyCards();
  renderState();
  setHint(`${presentation(item.ingredientId).label}进入${orderRecipe(orderBefore).label}`);
  return true;
}

function nearestOrderDock(clientX, clientY) {
  const stageRect = canvas.getBoundingClientRect();
  if (clientX < stageRect.left - 10 || clientX > stageRect.right + 10) return null;
  if (clientY < stageRect.top - 10 || clientY > stageRect.bottom + 10) return null;
  const docks = [...orderDockRow.querySelectorAll(".order-dock")];
  if (!docks.length) return null;
  return docks.reduce((best, dock) => {
    const rect = dock.getBoundingClientRect();
    const distance = Math.abs(clientX - (rect.left + rect.width / 2)) + Math.max(0, clientY - rect.bottom) * .14;
    return !best || distance < best.distance ? { dock, distance } : best;
  }, null)?.dock ?? null;
}

function setDropTarget(orderId = null) {
  orderDockRow.querySelectorAll(".order-dock").forEach((dock) => {
    if (dock.dataset.orderId === orderId) dock.setAttribute("data-drop-target", "true");
    else dock.removeAttribute("data-drop-target");
  });
}

function createDragGhost(card, event) {
  const ghost = card.cloneNode(true);
  ghost.removeAttribute("id");
  ghost.removeAttribute("role");
  ghost.className = "ingredient-card ingredient-drag-ghost";
  ghost.removeAttribute("data-gesture-source");
  document.body.append(ghost);
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
  return ghost;
}

function resetGestureVisuals({ returning = false } = {}) {
  if (!gesture) return;
  gesture.card?.removeAttribute("data-gesture-source");
  setDropTarget(null);
  if (returning) gesture.ghost?.classList.add("is-returning");
  const ghost = gesture.ghost;
  window.setTimeout(() => ghost?.remove(), returning ? 130 : 0);
}

function beginRailGesture(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (pendingLaunch || servingOrderId) return;
  const card = event.target.closest?.(".ingredient-card");
  if (!card || !card.dataset.supplyId) return;
  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startedAt: performance.now(),
    card,
    itemId: card.dataset.supplyId,
    ghost: createDragGhost(card, event),
    targetOrderId: null,
    moved: false,
  };
  card.setAttribute("data-gesture-source", "true");
  try { railWindow.setPointerCapture?.(event.pointerId); } catch { /* synthetic and legacy pointers may not support capture */ }
}

function moveRailGesture(event) {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  gesture.moved = gesture.moved || Math.hypot(deltaX, deltaY) > 7;
  gesture.ghost.style.left = `${event.clientX}px`;
  gesture.ghost.style.top = `${event.clientY}px`;
  gesture.ghost.style.setProperty("--drag-tilt", `${Math.max(-8, Math.min(8, deltaX * .035))}deg`);
  const dock = nearestOrderDock(event.clientX, event.clientY);
  gesture.targetOrderId = dock?.dataset.orderId ?? null;
  setDropTarget(gesture.targetOrderId);
  event.preventDefault();
}

function endRailGesture(event, cancelled = false) {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const activeGesture = gesture;
  try { railWindow.releasePointerCapture?.(event.pointerId); } catch { /* pointer may already be released */ }
  const deltaX = event.clientX - activeGesture.startX;
  const deltaY = event.clientY - activeGesture.startY;
  const validTravel = !cancelled && activeGesture.targetOrderId && deltaY <= -48;
  suppressClick = activeGesture.moved;
  resetGestureVisuals({ returning: !validTravel });
  gesture = null;

  if (!validTravel) {
    setHint("按住底部任意食材，向上拖到三个订单口之一");
    return;
  }
  const power = Math.max(.25, Math.min(1, (-deltaY) / Math.max(120, window.innerHeight * .42)));
  const stageRect = canvas.getBoundingClientRect();
  const lateral = Math.max(-1, Math.min(1, ((event.clientX - stageRect.left) / stageRect.width - .5) * 1.2));
  tryLaunchIngredient(activeGesture.itemId, activeGesture.targetOrderId, { power, lateral });
}

function completeOrderAfterSettle(orderId) {
  servingOrderId = orderId;
  renderState();
  showServeStamp();
  const dock = orderDockRow.querySelector(`[data-order-id="${orderId}"]`);
  dock?.setAttribute("data-complete", "true");
  setHint(`${orderRecipe(orderBoard.orders.find(({ id }) => id === orderId)).label}完成，正在自动出餐`);
  window.setTimeout(() => {
    stage.serve(() => {
      orderBoard = refreshCompletedOrder(orderBoard, orderId);
      servingOrderId = null;
      activeOrderId = orderId;
      stage.showStack([]);
      renderState();
      setHint(`订单已出餐！${orderRecipe(currentOrder()).label}已补入这个订单口`);
      scheduleSupply(260);
    });
  }, prefersReducedMotion ? 1 : ORDER_SERVE_DELAY_MS);
}

function resetGame() {
  if (!stage?.reset()) return false;
  gameState = createSwipeStackState();
  orderBoard = createSwipeStackOrderBoard(3);
  activeOrderId = orderBoard.orders[0].id;
  pendingLaunch = null;
  servingOrderId = null;
  setHint("食材从底部传送带进入，向上拖到对应订单口");
  resetSupply();
  stage.showStack([]);
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
      const settled = pendingLaunch;
      gameState = addSwipeStackLayer(gameState, settled.ingredientId, settled);
      pendingLaunch = null;
      renderState();
      if (settled.complete) {
        completeOrderAfterSettle(settled.orderId);
        return;
      }
      const order = orderBoard.orders.find(({ id }) => id === settled.orderId);
      setHint(`${orderRecipe(order).label}接稳了，下一份要${presentation(orderNextIngredient(order)).label}`);
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
  const card = event.target.closest?.(".ingredient-card");
  if (!card) setHint("底部传送带会从右侧逐张进料，满了以后停住等待");
  else setHint(`按住${presentation(card.dataset.ingredientId).label}，向上拖到需要它的订单口`);
});
railWindow.addEventListener("keydown", (event) => {
  if (["1", "2", "3"].includes(event.key)) {
    const order = orderBoard.orders[Number(event.key) - 1];
    if (order) selectOrder(order.id);
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const first = supplyState.items[0];
    if (first) tryLaunchIngredient(first.id, activeOrderId, { power: .5, lateral: 0 });
  }
});

orderDockRow.addEventListener("click", (event) => {
  if (suppressOrderClick) {
    suppressOrderClick = false;
    event.preventDefault();
    return;
  }
  const dock = event.target.closest?.(".order-dock");
  if (dock) selectOrder(dock.dataset.orderId);
});

stageSurface.addEventListener("pointerdown", beginOrderSwipe);
stageSurface.addEventListener("pointermove", moveOrderSwipe);
stageSurface.addEventListener("pointerup", (event) => endOrderSwipe(event));
stageSurface.addEventListener("pointercancel", (event) => endOrderSwipe(event, true));
canvas.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  switchOrderByStep(event.key === "ArrowRight" ? 1 : -1);
});

undoButton.addEventListener("click", () => {
  const previous = orderBoard;
  orderBoard = undoIngredientInOrder(orderBoard, activeOrderId);
  if (orderBoard === previous || !stage?.undo()) {
    orderBoard = previous;
    return;
  }
  gameState = undoSwipeStackOrderLayer(gameState, activeOrderId);
  setHint(`已撤销${orderRecipe(currentOrder()).label}最上面一层`);
  renderState();
});
resetButton.addEventListener("click", resetGame);

window.addEventListener("resize", () => syncSupplyCards());
window.addEventListener("pagehide", () => {
  window.clearTimeout(impactTimer);
  window.clearTimeout(serveTimer);
  window.clearTimeout(spawnTimer);
  for (const itemId of arrivalTimerById.keys()) clearArrivalTimer(itemId);
  stage?.dispose?.();
}, { once: true });

resetSupply();
renderState();
