import {
  SOLO_BURGER_INGREDIENT_IDS,
  SOLO_COOKING_SAUCE_IDS,
} from "./burger-recipes.mjs";

const DIFFICULTY = Object.freeze({
  1: Object.freeze({ minLayers: 4, maxLayers: 5, sauces: 0 }),
  2: Object.freeze({ minLayers: 5, maxLayers: 6, sauces: 1 }),
  3: Object.freeze({ minLayers: 7, maxLayers: 8, sauces: 1 }),
});

const FILLING_IDS = Object.freeze([
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "onion",
  "patty",
]);

const PUBLIC_NAMES = Object.freeze([
  "小馆暖场牛肉堡",
  "今日融金招牌堡",
  "满层丰收高塔堡",
]);

function nextRandom(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new TypeError("random must return a number from 0 up to 1");
  }
  return value;
}

function choose(items, random) {
  return items[Math.floor(nextRandom(random) * items.length)];
}

function freezeOrder(order) {
  const layers = Object.freeze(order.layers.map((layer) => Object.freeze({ ...layer })));
  const sauces = Object.freeze(order.sauces.map((sauce) => Object.freeze({ ...sauce })));
  return Object.freeze({ ...order, layers, sauces });
}

function isBread(ingredientId) {
  return typeof ingredientId === "string" && ingredientId.includes("bun");
}

export function isLegalBurgerOrder(order) {
  const difficulty = DIFFICULTY[order?.orderNumber];
  if (!difficulty || !Array.isArray(order.layers) || !Array.isArray(order.sauces)) {
    return false;
  }
  if (
    order.layers.length < difficulty.minLayers
    || order.layers.length > difficulty.maxLayers
    || order.sauces.length !== difficulty.sauces
  ) {
    return false;
  }
  if (
    order.layers[0]?.ingredientId !== "bottom-bun"
    || order.layers.at(-1)?.ingredientId !== "top-bun"
    || !order.layers.some(({ ingredientId }) => ingredientId === "patty")
  ) {
    return false;
  }
  const slotIds = new Set();
  for (let index = 0; index < order.layers.length; index += 1) {
    const layer = order.layers[index];
    if (
      !SOLO_BURGER_INGREDIENT_IDS.includes(layer?.ingredientId)
      || typeof layer.slotId !== "string"
      || slotIds.has(layer.slotId)
    ) {
      return false;
    }
    slotIds.add(layer.slotId);
    if (index > 0 && isBread(order.layers[index - 1].ingredientId) && isBread(layer.ingredientId)) {
      return false;
    }
  }
  return order.sauces.every((sauce) => (
    SOLO_COOKING_SAUCE_IDS.includes(sauce?.sauceId)
    && slotIds.has(sauce.targetLayerSlotId)
    && Number.isFinite(sauce.targetCoverage)
    && sauce.targetCoverage > 0
    && sauce.targetCoverage <= 1
  ));
}

export function createBurgerOrder({ orderNumber, random = Math.random } = {}) {
  const difficulty = DIFFICULTY[orderNumber];
  if (!difficulty) throw new RangeError("orderNumber must be 1, 2, or 3");
  if (typeof random !== "function") throw new TypeError("random must be a function");

  const layerCount = difficulty.minLayers
    + Math.floor(nextRandom(random) * (difficulty.maxLayers - difficulty.minLayers + 1));
  const ingredients = ["bottom-bun", "patty"];
  while (ingredients.length < layerCount - 1) {
    ingredients.push(choose(FILLING_IDS, random));
  }
  ingredients.push("top-bun");

  const layers = ingredients.map((ingredientId, index) => ({
    slotId: `layer-${index + 1}`,
    ingredientId,
  }));
  const sauceTargets = layers.filter(({ ingredientId }) => !isBread(ingredientId));
  const sauces = Array.from({ length: difficulty.sauces }, (_, index) => ({
    sauceId: choose(SOLO_COOKING_SAUCE_IDS, random),
    targetLayerSlotId: choose(sauceTargets, random).slotId,
    targetCoverage: index === 0 ? 0.5 : 0.4,
  }));
  const order = freezeOrder({
    id: `shop-order-${orderNumber}-${ingredients.join("-")}-${sauces.map(({ sauceId }) => sauceId).join("-")}`,
    orderNumber,
    publicName: PUBLIC_NAMES[orderNumber - 1],
    customerId: `customer-${orderNumber}`,
    layers,
    sauces,
  });

  if (!isLegalBurgerOrder(order)) throw new Error("generated burger order is invalid");
  return order;
}
