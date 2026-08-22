export const SWIPE_STACK_MAX_LAYERS = 40;

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

export function createConveyorWindow(cursor, count = 5) {
  const safeCount = clamp(Math.trunc(finite(Number(count), 5)), 1, 8);
  return Object.freeze(Array.from({ length: safeCount }, (_, offset) => Object.freeze({
    offset,
    ingredientId: conveyorIngredientAt(cursor, offset),
  })));
}

export function advanceConveyorCursor(cursor) {
  return normalizeSwipeRailIndex(cursor + 1);
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
} = {}) {
  assertIngredient(ingredientId);
  if (!state || !Array.isArray(state.layers)) throw new TypeError("state must be a swipe-stack state");
  if (state.finished || state.layers.length >= SWIPE_STACK_MAX_LAYERS) return state;
  const nextCombo = state.combo + 1;
  const layer = Object.freeze({
    id: `swipe-${state.layers.length + 1}`,
    ingredientId,
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
