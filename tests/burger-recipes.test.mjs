import test from "node:test";
import assert from "node:assert/strict";

const loadCatalog = () => import("../app/static/burger-recipes.mjs");

test("publishes the solo burger ingredient and cooking sauce identifiers", async () => {
  const {
    SOLO_BURGER_INGREDIENT_IDS,
    SOLO_COOKING_SAUCE_IDS,
  } = await loadCatalog();

  assert.deepEqual(SOLO_BURGER_INGREDIENT_IDS, [
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
  assert.deepEqual(SOLO_COOKING_SAUCE_IDS, [
    "ketchup",
    "mustard",
    "house-sauce",
  ]);
  assert.ok(Object.isFrozen(SOLO_BURGER_INGREDIENT_IDS));
  assert.ok(Object.isFrozen(SOLO_COOKING_SAUCE_IDS));
});

test("publishes four development references under original public names", async () => {
  const { BURGER_RECIPES } = await loadCatalog();

  assert.deepEqual(BURGER_RECIPES.map(({
    id,
    developmentReferenceName,
    publicName,
  }) => ({ id, developmentReferenceName, publicName })), [
    {
      id: "classic-beef",
      developmentReferenceName: "汉堡包",
      publicName: "小馆经典牛肉堡",
    },
    {
      id: "melty-cheese",
      developmentReferenceName: "吉士汉堡包",
      publicName: "融金芝士牛肉堡",
    },
    {
      id: "double-melty-cheese",
      developmentReferenceName: "双层吉士汉堡",
      publicName: "双层融金芝士堡",
    },
    {
      id: "tower-double-beef",
      developmentReferenceName: "巨无霸",
      publicName: "三层高塔双牛堡",
    },
  ]);
});

test("defines each reference recipe's exact bottom-to-top solid layer slots", async () => {
  const { BURGER_RECIPES } = await loadCatalog();
  const layerSlotsByRecipe = Object.fromEntries(BURGER_RECIPES.map((recipe) => [
    recipe.id,
    recipe.steps
      .filter(({ kind }) => kind === "layer")
      .map(({ id, ingredientId }) => [id, ingredientId]),
  ]));

  assert.deepEqual(layerSlotsByRecipe, {
    "classic-beef": [
      ["bottom-bun-1", "bottom-bun"],
      ["patty-1", "patty"],
      ["pickle-1", "pickle"],
      ["onion-1", "onion"],
      ["top-bun-1", "top-bun"],
    ],
    "melty-cheese": [
      ["bottom-bun-1", "bottom-bun"],
      ["patty-1", "patty"],
      ["cheese-1", "cheese"],
      ["pickle-1", "pickle"],
      ["onion-1", "onion"],
      ["top-bun-1", "top-bun"],
    ],
    "double-melty-cheese": [
      ["bottom-bun-1", "bottom-bun"],
      ["patty-1", "patty"],
      ["cheese-1", "cheese"],
      ["patty-2", "patty"],
      ["cheese-2", "cheese"],
      ["pickle-1", "pickle"],
      ["onion-1", "onion"],
      ["top-bun-1", "top-bun"],
    ],
    "tower-double-beef": [
      ["bottom-bun-1", "bottom-bun"],
      ["onion-1", "onion"],
      ["lettuce-1", "lettuce"],
      ["cheese-1", "cheese"],
      ["patty-1", "patty"],
      ["middle-bun-1", "middle-bun"],
      ["onion-2", "onion"],
      ["lettuce-2", "lettuce"],
      ["pickle-1", "pickle"],
      ["patty-2", "patty"],
      ["top-bun-1", "top-bun"],
    ],
  });
});

test("places each sauce on an earlier valid solid layer slot", async () => {
  const {
    BURGER_RECIPES,
    SOLO_BURGER_INGREDIENT_IDS,
    SOLO_COOKING_SAUCE_IDS,
  } = await loadCatalog();
  const sauceSlotsByRecipe = Object.fromEntries(BURGER_RECIPES.map((recipe) => [
    recipe.id,
    recipe.steps
      .filter(({ kind }) => kind === "sauce")
      .map(({ id, sauceId, targetLayerSlotId }) => [id, sauceId, targetLayerSlotId]),
  ]));

  assert.deepEqual(sauceSlotsByRecipe, {
    "classic-beef": [
      ["ketchup-1", "ketchup", "patty-1"],
    ],
    "melty-cheese": [
      ["ketchup-1", "ketchup", "cheese-1"],
      ["mustard-1", "mustard", "cheese-1"],
    ],
    "double-melty-cheese": [
      ["ketchup-1", "ketchup", "cheese-2"],
      ["mustard-1", "mustard", "cheese-2"],
    ],
    "tower-double-beef": [
      ["house-sauce-1", "house-sauce", "bottom-bun-1"],
      ["house-sauce-2", "house-sauce", "middle-bun-1"],
    ],
  });

  for (const recipe of BURGER_RECIPES) {
    const stepIds = recipe.steps.map(({ id }) => id);
    assert.equal(new Set(stepIds).size, stepIds.length, `${recipe.id} step IDs`);
    recipe.steps.forEach((step, index) => {
      if (step.kind === "layer") {
        assert.ok(
          SOLO_BURGER_INGREDIENT_IDS.includes(step.ingredientId),
          `${recipe.id}:${step.id} ingredient`,
        );
        return;
      }
      assert.equal(step.kind, "sauce", `${recipe.id}:${step.id} kind`);
      assert.ok(
        SOLO_COOKING_SAUCE_IDS.includes(step.sauceId),
        `${recipe.id}:${step.id} sauce`,
      );
      const targetIndex = recipe.steps.findIndex(({ id }) => id === step.targetLayerSlotId);
      assert.ok(targetIndex >= 0 && targetIndex < index, `${recipe.id}:${step.id} target order`);
      assert.equal(recipe.steps[targetIndex].kind, "layer", `${recipe.id}:${step.id} target kind`);
    });
  }
});

test("keeps reference metadata isolated from the deeply frozen public catalog", async () => {
  const { BURGER_RECIPES } = await loadCatalog();
  const recipeIds = BURGER_RECIPES.map(({ id }) => id);

  assert.ok(Object.isFrozen(BURGER_RECIPES));
  assert.equal(new Set(recipeIds).size, recipeIds.length);
  for (const recipe of BURGER_RECIPES) {
    assert.deepEqual(Object.keys(recipe), [
      "id",
      "developmentReferenceName",
      "publicName",
      "steps",
    ]);
    assert.ok(Object.isFrozen(recipe));
    assert.ok(Object.isFrozen(recipe.steps));
    assert.doesNotMatch(recipe.publicName, /麦当劳|巨无霸|吉士汉堡包|汉堡包/u);
    assert.equal(Object.hasOwn(recipe, "referenceName"), false);
    for (const step of recipe.steps) {
      assert.ok(Object.isFrozen(step));
      assert.deepEqual(
        Object.keys(step),
        step.kind === "layer"
          ? ["id", "kind", "ingredientId"]
          : ["id", "kind", "sauceId", "targetLayerSlotId"],
      );
    }
  }
});
