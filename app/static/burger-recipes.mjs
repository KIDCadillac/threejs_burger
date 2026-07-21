export const SOLO_BURGER_INGREDIENT_IDS = Object.freeze([
  "bottom-bun",
  "patty",
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "top-bun",
  "onion",
  "middle-bun",
]);

export const SOLO_COOKING_SAUCE_IDS = Object.freeze([
  "ketchup",
  "mustard",
  "house-sauce",
]);

const layer = (id, ingredientId) => ({ id, kind: "layer", ingredientId });
const sauce = (id, sauceId, targetLayerSlotId) => ({
  id,
  kind: "sauce",
  sauceId,
  targetLayerSlotId,
});
const freezeRecipe = (recipe) => {
  recipe.steps.forEach((step) => Object.freeze(step));
  Object.freeze(recipe.steps);
  return Object.freeze(recipe);
};

export const BURGER_RECIPES = Object.freeze([
  freezeRecipe({
    id: "classic-beef",
    developmentReferenceName: "汉堡包",
    publicName: "小馆经典牛肉堡",
    steps: [
      layer("bottom-bun-1", "bottom-bun"),
      layer("patty-1", "patty"),
      sauce("ketchup-1", "ketchup", "patty-1"),
      layer("pickle-1", "pickle"),
      layer("onion-1", "onion"),
      layer("top-bun-1", "top-bun"),
    ],
  }),
  freezeRecipe({
    id: "melty-cheese",
    developmentReferenceName: "吉士汉堡包",
    publicName: "融金芝士牛肉堡",
    steps: [
      layer("bottom-bun-1", "bottom-bun"),
      layer("patty-1", "patty"),
      layer("cheese-1", "cheese"),
      sauce("ketchup-1", "ketchup", "cheese-1"),
      sauce("mustard-1", "mustard", "cheese-1"),
      layer("pickle-1", "pickle"),
      layer("onion-1", "onion"),
      layer("top-bun-1", "top-bun"),
    ],
  }),
  freezeRecipe({
    id: "double-melty-cheese",
    developmentReferenceName: "双层吉士汉堡",
    publicName: "双层融金芝士堡",
    steps: [
      layer("bottom-bun-1", "bottom-bun"),
      layer("patty-1", "patty"),
      layer("cheese-1", "cheese"),
      layer("patty-2", "patty"),
      layer("cheese-2", "cheese"),
      sauce("ketchup-1", "ketchup", "cheese-2"),
      sauce("mustard-1", "mustard", "cheese-2"),
      layer("pickle-1", "pickle"),
      layer("onion-1", "onion"),
      layer("top-bun-1", "top-bun"),
    ],
  }),
  freezeRecipe({
    id: "tower-double-beef",
    developmentReferenceName: "巨无霸",
    publicName: "三层高塔双牛堡",
    steps: [
      layer("bottom-bun-1", "bottom-bun"),
      sauce("house-sauce-1", "house-sauce", "bottom-bun-1"),
      layer("onion-1", "onion"),
      layer("lettuce-1", "lettuce"),
      layer("cheese-1", "cheese"),
      layer("patty-1", "patty"),
      layer("middle-bun-1", "middle-bun"),
      sauce("house-sauce-2", "house-sauce", "middle-bun-1"),
      layer("onion-2", "onion"),
      layer("lettuce-2", "lettuce"),
      layer("pickle-1", "pickle"),
      layer("patty-2", "patty"),
      layer("top-bun-1", "top-bun"),
    ],
  }),
]);
