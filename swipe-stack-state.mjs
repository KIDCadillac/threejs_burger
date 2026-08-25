export const SWIPE_STACK_MAX_LAYERS = 40;
export const SWIPE_STACK_CONVEYOR_CAPACITY = 6;

export const SWIPE_STACK_INGREDIENTS = Object.freeze([
  "bottom-bun",
  "patty",
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "onion",
  "top-bun",
]);

export const SWIPE_STACK_PRESENTATION = Object.freeze({
  "bottom-bun": Object.freeze({ label: "底层面包", shortLabel: "底包" }),
  patty: Object.freeze({ label: "牛肉饼", shortLabel: "肉饼" }),
  cheese: Object.freeze({ label: "芝士", shortLabel: "芝士" }),
  tomato: Object.freeze({ label: "番茄", shortLabel: "番茄" }),
  lettuce: Object.freeze({ label: "生菜", shortLabel: "生菜" }),
  pickle: Object.freeze({ label: "酸黄瓜", shortLabel: "黄瓜" }),
  onion: Object.freeze({ label: "洋葱碎", shortLabel: "洋葱" }),
  "top-bun": Object.freeze({ label: "上层面包", shortLabel: "顶包" }),
});

export const SWIPE_STACK_ORDER_RECIPES = Object.freeze([
  Object.freeze({
    id: "classic",
    label: "经典牛肉堡",
    shortLabel: "经典",
    accent: "#ef9f38",
    ingredients: Object.freeze(["bottom-bun", "patty", "cheese", "lettuce", "tomato", "top-bun"]),
  }),
  Object.freeze({
    id: "double-cheese",
    label: "双层芝士堡",
    shortLabel: "双层",
    accent: "#ed6452",
    ingredients: Object.freeze(["bottom-bun", "patty", "cheese", "patty", "cheese", "top-bun"]),
  }),
  Object.freeze({
    id: "garden",
    label: "田园蔬菜堡",
    shortLabel: "田园",
    accent: "#75ad4e",
    ingredients: Object.freeze(["bottom-bun", "lettuce", "tomato", "pickle", "onion", "top-bun"]),
  }),
  Object.freeze({
    id: "onion-beef",
    label: "洋葱牛肉堡",
    shortLabel: "洋葱",
    accent: "#b97874",
    ingredients: Object.freeze(["bottom-bun", "patty", "onion", "tomato", "pickle", "top-bun"]),
  }),
]);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertIngredient(ingredientId) {
  if (!SWIPE_STACK_INGREDIENTS.includes(ingredientId)) {
    throw new TypeError(`Unknown swipe-stack ingredient: ${String(ingredientId)}`);
  }
}

export function normalizeSwipeRailIndex(value) {
  const size = SWIPE_STACK_INGREDIENTS.length;
  const integer = Math.trunc(finite(Number(value), 0));
  return ((integer % size) + size) % size;
}

export function conveyorIngredientAt(index, offset = 0) {
  return SWIPE_STACK_INGREDIENTS[normalizeSwipeRailIndex(index + offset)];
}

export function createConveyorSupplyState() {
  return Object.freeze({
    items: Object.freeze([]),
    nextSequenceIndex: 0,
    nextItemNumber: 1,
  });
}

export function spawnConveyorSupply(
  state,
  capacity = SWIPE_STACK_CONVEYOR_CAPACITY,
  ingredientId = conveyorIngredientAt(state?.nextSequenceIndex ?? 0),
) {
  if (!state || !Array.isArray(state.items)) throw new TypeError("state must be a conveyor supply state");
  const safeCapacity = clamp(Math.trunc(finite(Number(capacity), SWIPE_STACK_CONVEYOR_CAPACITY)), 1, 8);
  if (state.items.length >= safeCapacity) return state;
  assertIngredient(ingredientId);
  const item = Object.freeze({
    id: `conveyor-${state.nextItemNumber}`,
    ingredientId,
  });
  return Object.freeze({
    items: Object.freeze([...state.items, item]),
    nextSequenceIndex: normalizeSwipeRailIndex(state.nextSequenceIndex + 1),
    nextItemNumber: state.nextItemNumber + 1,
  });
}

export function consumeConveyorSupply(state, itemId = state?.items?.[0]?.id ?? null) {
  if (!state || !Array.isArray(state.items)) throw new TypeError("state must be a conveyor supply state");
  const itemIndex = state.items.findIndex(({ id }) => id === itemId);
  if (itemIndex < 0) return Object.freeze({ state, item: null });
  return Object.freeze({
    state: Object.freeze({
      items: Object.freeze(state.items.filter((_, index) => index !== itemIndex)),
      nextSequenceIndex: state.nextSequenceIndex,
      nextItemNumber: state.nextItemNumber,
    }),
    item: state.items[itemIndex],
  });
}

function recipeAt(index) {
  return SWIPE_STACK_ORDER_RECIPES[index % SWIPE_STACK_ORDER_RECIPES.length];
}

function createOrderLane(laneIndex, recipeIndex) {
  return Object.freeze({
    id: `order-${laneIndex + 1}`,
    recipeId: recipeAt(recipeIndex).id,
    placed: Object.freeze([]),
    complete: false,
  });
}

export function orderRecipe(order) {
  return SWIPE_STACK_ORDER_RECIPES.find(({ id }) => id === order?.recipeId) ?? null;
}

export function orderNextIngredient(order) {
  const recipe = orderRecipe(order);
  if (!recipe || order.complete) return null;
  return recipe.ingredients[order.placed.length] ?? null;
}

export function createSwipeStackOrderBoard(laneCount = 3) {
  const safeLaneCount = clamp(Math.trunc(finite(Number(laneCount), 3)), 2, 3);
  return Object.freeze({
    orders: Object.freeze(Array.from({ length: safeLaneCount }, (_, index) => createOrderLane(index, index))),
    servedCount: 0,
    nextRecipeIndex: safeLaneCount,
  });
}

export function cycleSwipeStackOrder(board, activeOrderId, step = 1) {
  if (!board || !Array.isArray(board.orders)) throw new TypeError("board must be an order board");
  if (!board.orders.length) return null;
  const activeIndex = board.orders.findIndex(({ id }) => id === activeOrderId);
  const startIndex = activeIndex < 0 ? 0 : activeIndex;
  const direction = Math.sign(finite(Number(step), 1)) || 1;
  const nextIndex = (startIndex + direction + board.orders.length) % board.orders.length;
  return board.orders[nextIndex].id;
}

export function resolveOrderSwipeGesture({ deltaX, deltaY, width } = {}) {
  const x = finite(deltaX);
  const y = finite(deltaY);
  const viewportWidth = Math.max(1, finite(width, 1));
  const threshold = Math.max(42, Math.min(68, viewportWidth * 0.13));
  if (Math.abs(x) < threshold || Math.abs(x) < Math.abs(y) * 1.25) {
    return Object.freeze({ action: "none", step: 0 });
  }
  return Object.freeze({
    action: "switch-order",
    step: x < 0 ? 1 : -1,
  });
}

export function supplyNeedsForOrders(board) {
  if (!board || !Array.isArray(board.orders)) throw new TypeError("board must be an order board");
  return Object.freeze(board.orders.map(orderNextIngredient).filter(Boolean));
}

export function supplyForecastForOrders(board, lookahead = 2) {
  if (!board || !Array.isArray(board.orders)) throw new TypeError("board must be an order board");
  const safeLookahead = clamp(Math.trunc(finite(Number(lookahead), 2)), 1, 4);
  const forecast = [];
  board.orders.forEach((order) => {
    const recipe = orderRecipe(order);
    if (!recipe || order.complete) return;
    recipe.ingredients
      .slice(order.placed.length, order.placed.length + safeLookahead)
      .forEach((ingredientId) => {
        if (!forecast.includes(ingredientId)) forecast.push(ingredientId);
      });
  });
  return Object.freeze(forecast);
}

export function placeIngredientInOrder(board, orderId, ingredientId) {
  if (!board || !Array.isArray(board.orders)) throw new TypeError("board must be an order board");
  assertIngredient(ingredientId);
  const orderIndex = board.orders.findIndex(({ id }) => id === orderId);
  if (orderIndex < 0) return Object.freeze({ state: board, accepted: false, complete: false, expected: null });
  const order = board.orders[orderIndex];
  const expected = orderNextIngredient(order);
  if (expected !== ingredientId) {
    return Object.freeze({ state: board, accepted: false, complete: false, expected });
  }
  const recipe = orderRecipe(order);
  const placed = Object.freeze([...order.placed, ingredientId]);
  const complete = placed.length === recipe.ingredients.length;
  const nextOrder = Object.freeze({ ...order, placed, complete });
  const orders = board.orders.map((candidate, index) => index === orderIndex ? nextOrder : candidate);
  return Object.freeze({
    state: Object.freeze({ ...board, orders: Object.freeze(orders) }),
    accepted: true,
    complete,
    expected,
  });
}

export function refreshCompletedOrder(board, orderId) {
  if (!board || !Array.isArray(board.orders)) throw new TypeError("board must be an order board");
  const orderIndex = board.orders.findIndex(({ id }) => id === orderId);
  if (orderIndex < 0 || !board.orders[orderIndex].complete) return board;
  const replacement = createOrderLane(orderIndex, board.nextRecipeIndex);
  const orders = board.orders.map((candidate, index) => index === orderIndex ? replacement : candidate);
  return Object.freeze({
    orders: Object.freeze(orders),
    servedCount: board.servedCount + 1,
    nextRecipeIndex: board.nextRecipeIndex + 1,
  });
}

export function undoIngredientInOrder(board, orderId) {
  if (!board || !Array.isArray(board.orders)) throw new TypeError("board must be an order board");
  const orderIndex = board.orders.findIndex(({ id }) => id === orderId);
  if (orderIndex < 0) return board;
  const order = board.orders[orderIndex];
  if (!order.placed.length || order.complete) return board;
  const nextOrder = Object.freeze({
    ...order,
    placed: Object.freeze(order.placed.slice(0, -1)),
  });
  const orders = board.orders.map((candidate, index) => index === orderIndex ? nextOrder : candidate);
  return Object.freeze({ ...board, orders: Object.freeze(orders) });
}

export function resolveSwipeStackGesture({
  deltaX,
  deltaY,
  width,
  height,
  elapsedMs,
} = {}) {
  const x = finite(deltaX);
  const y = finite(deltaY);
  const viewportWidth = Math.max(1, finite(width, 1));
  const viewportHeight = Math.max(1, finite(height, 1));
  const elapsed = Math.max(1, finite(elapsedMs, 1));
  const verticalDistance = Math.max(44, Math.min(82, viewportHeight * 0.095));
  const upwardVelocity = -y / elapsed;

  if (
    y <= -verticalDistance
    && Math.abs(y) >= Math.abs(x) * 1.15
  ) {
    return Object.freeze({
      action: "launch",
      power: clamp((-y - verticalDistance) / (viewportHeight * 0.24) + upwardVelocity * 0.22, 0, 1),
      lateral: clamp(x / (viewportWidth * 0.32), -1, 1),
    });
  }

  return Object.freeze({ action: "tap" });
}

export function createSwipeStackState() {
  return Object.freeze({
    layers: Object.freeze([]),
    score: 0,
    combo: 0,
    finished: false,
  });
}

export function addSwipeStackLayer(state, ingredientId, {
  power = 0,
  lateral = 0,
  orderId = null,
} = {}) {
  assertIngredient(ingredientId);
  if (!state || !Array.isArray(state.layers)) throw new TypeError("state must be a swipe-stack state");
  if (state.finished || state.layers.length >= SWIPE_STACK_MAX_LAYERS) return state;
  const nextCombo = state.combo + 1;
  const layer = Object.freeze({
    id: `swipe-${state.layers.length + 1}`,
    ingredientId,
    orderId,
    power: clamp(finite(power), 0, 1),
    lateral: clamp(finite(lateral), -1, 1),
  });
  return Object.freeze({
    layers: Object.freeze([...state.layers, layer]),
    score: state.score + 100 + Math.min(400, (nextCombo - 1) * 12),
    combo: nextCombo,
    finished: false,
  });
}

export function undoSwipeStackOrderLayer(state, orderId) {
  if (!state || !Array.isArray(state.layers)) throw new TypeError("state must be a swipe-stack state");
  if (!state.layers.length || state.finished) return state;
  const layerIndex = state.layers.findLastIndex((layer) => layer.orderId === orderId);
  if (layerIndex < 0) return state;
  return Object.freeze({
    layers: Object.freeze(state.layers.filter((_, index) => index !== layerIndex)),
    score: Math.max(0, state.score - 100),
    combo: Math.max(0, state.combo - 1),
    finished: false,
  });
}

export function undoSwipeStackLayer(state) {
  if (!state || !Array.isArray(state.layers)) throw new TypeError("state must be a swipe-stack state");
  if (!state.layers.length || state.finished) return state;
  return Object.freeze({
    layers: Object.freeze(state.layers.slice(0, -1)),
    score: Math.max(0, state.score - 100),
    combo: Math.max(0, state.combo - 1),
    finished: false,
  });
}

export function finishSwipeStack(state) {
  if (!state || !Array.isArray(state.layers)) throw new TypeError("state must be a swipe-stack state");
  if (state.layers.length < 2 || state.finished) return state;
  return Object.freeze({ ...state, finished: true });
}
