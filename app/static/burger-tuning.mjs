export const BURGER_TUNING_STORAGE_KEY = "solo-cooking-burger-tuning:v1";

export const BURGER_TUNING_INGREDIENT_IDS = Object.freeze([
  "bottom-bun",
  "patty",
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "onion",
  "middle-bun",
  "top-bun",
]);

export const BURGER_TUNING_INGREDIENT_LABELS = Object.freeze({
  "bottom-bun": "下层面包",
  patty: "牛肉饼",
  cheese: "芝士",
  tomato: "番茄",
  lettuce: "生菜",
  pickle: "酸黄瓜",
  onion: "洋葱碎",
  "middle-bun": "中层面包",
  "top-bun": "上层面包",
});

const LIMITS = Object.freeze({
  presentationScale: Object.freeze({ minimum: 0.55, maximum: 0.9 }),
  scaleX: Object.freeze({ minimum: 0.6, maximum: 1.6 }),
  scaleY: Object.freeze({ minimum: 0.4, maximum: 2.5 }),
  scaleZ: Object.freeze({ minimum: 0.6, maximum: 1.6 }),
  sinkY: Object.freeze({ minimum: 0, maximum: 0.18 }),
});

function freezeTuning({ global, ingredients }) {
  const frozenIngredients = Object.fromEntries(BURGER_TUNING_INGREDIENT_IDS.map((id) => [
    id,
    Object.freeze({
      scaleX: ingredients[id].scaleX,
      scaleY: ingredients[id].scaleY,
      scaleZ: ingredients[id].scaleZ,
      sinkY: ingredients[id].sinkY,
    }),
  ]));
  return Object.freeze({
    version: 1,
    global: Object.freeze({ presentationScale: global.presentationScale }),
    ingredients: Object.freeze(frozenIngredients),
  });
}

export const DEFAULT_BURGER_TUNING = freezeTuning({
  global: { presentationScale: 0.72 },
  ingredients: {
    "bottom-bun": { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.012 },
    patty: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0 },
    cheese: { scaleX: 1, scaleY: 1.45, scaleZ: 1, sinkY: 0.008 },
    tomato: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0 },
    lettuce: { scaleX: 1, scaleY: 1.55, scaleZ: 1, sinkY: 0.008 },
    pickle: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0 },
    onion: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.006 },
    "middle-bun": { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.012 },
    "top-bun": { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.008 },
  },
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeNumber(value, fallback, { minimum, maximum }) {
  const finiteValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, finiteValue));
}

export function normalizeBurgerTuning(value) {
  if (!isRecord(value) || value.version !== 1) return DEFAULT_BURGER_TUNING;

  const inputGlobal = isRecord(value.global) ? value.global : {};
  const inputIngredients = isRecord(value.ingredients) ? value.ingredients : {};
  const ingredients = Object.fromEntries(BURGER_TUNING_INGREDIENT_IDS.map((id) => {
    const defaults = DEFAULT_BURGER_TUNING.ingredients[id];
    const input = isRecord(inputIngredients[id]) ? inputIngredients[id] : {};
    return [id, {
      scaleX: normalizeNumber(input.scaleX, defaults.scaleX, LIMITS.scaleX),
      scaleY: normalizeNumber(input.scaleY, defaults.scaleY, LIMITS.scaleY),
      scaleZ: normalizeNumber(input.scaleZ, defaults.scaleZ, LIMITS.scaleZ),
      sinkY: normalizeNumber(input.sinkY, defaults.sinkY, LIMITS.sinkY),
    }];
  }));

  return freezeTuning({
    global: {
      presentationScale: normalizeNumber(
        inputGlobal.presentationScale,
        DEFAULT_BURGER_TUNING.global.presentationScale,
        LIMITS.presentationScale,
      ),
    },
    ingredients,
  });
}

export function serializeBurgerTuning(value) {
  return JSON.stringify(normalizeBurgerTuning(value), null, 2);
}

export function resetBurgerIngredient(value, id) {
  const normalized = normalizeBurgerTuning(value);
  if (!BURGER_TUNING_INGREDIENT_IDS.includes(id)) return normalized;

  const ingredients = Object.fromEntries(BURGER_TUNING_INGREDIENT_IDS.map((ingredientId) => [
    ingredientId,
    ingredientId === id
      ? DEFAULT_BURGER_TUNING.ingredients[ingredientId]
      : normalized.ingredients[ingredientId],
  ]));
  return freezeTuning({ global: normalized.global, ingredients });
}

function resolveStorage(storage, globalTarget) {
  if (storage !== undefined) return storage;
  try {
    return globalTarget?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadBurgerTuning({ storage, globalTarget = globalThis } = {}) {
  const resolvedStorage = resolveStorage(storage, globalTarget);
  try {
    if (typeof resolvedStorage?.getItem !== "function") return DEFAULT_BURGER_TUNING;
    const serialized = resolvedStorage.getItem(BURGER_TUNING_STORAGE_KEY);
    if (serialized === null) return DEFAULT_BURGER_TUNING;
    return normalizeBurgerTuning(JSON.parse(serialized));
  } catch {
    return DEFAULT_BURGER_TUNING;
  }
}

export function saveBurgerTuning(
  value,
  { storage, globalTarget = globalThis } = {},
) {
  const resolvedStorage = resolveStorage(storage, globalTarget);
  try {
    if (typeof resolvedStorage?.setItem !== "function") return false;
    resolvedStorage.setItem(BURGER_TUNING_STORAGE_KEY, serializeBurgerTuning(value));
    return true;
  } catch {
    return false;
  }
}
