import test from "node:test";
import assert from "node:assert/strict";

import {
  createSoloCookingState,
  placeSoloLayer,
  removeSoloLayer,
  rotateSoloLayer,
  addSoloSauceStroke,
  addSoloSauceStrokes,
  finishSoloCooking,
  continueSoloCooking,
  undoSoloCooking,
  resetSoloCookingState,
  serializeSoloComposition,
  selectSoloReferenceRecipe,
  MAX_SOLO_STACK_LAYERS,
  SOLO_INGREDIENT_STOCK,
} from "../app/static/cooking-solo-state.mjs";
import {
  BURGER_RECIPES,
  SOLO_BURGER_INGREDIENT_IDS,
  SOLO_COOKING_SAUCE_IDS,
} from "../app/static/burger-recipes.mjs";

const stroke = (sauce = "ketchup", layerId = "patty") => ({
  sauce,
  layerId,
  amount: 0.5,
  points: [[-0.4, 0], [0.4, 0.2]],
});

test("starts every independent layer in its own bin with no completed stack", () => {
  const state = createSoloCookingState();

  assert.deepEqual(state.assembledOrder, []);
  assert.equal(state.complete, false);
  assert.equal(state.finished, false);
  assert.deepEqual(Object.keys(state.locations), SOLO_BURGER_INGREDIENT_IDS);
  SOLO_BURGER_INGREDIENT_IDS.forEach((id, index) => {
    assert.deepEqual(state.locations[id], { kind: "bin", index });
    assert.equal(state.rotations[id], 0);
    assert.equal(state.inventory[id], SOLO_INGREDIENT_STOCK);
  });
  assert.equal(state.referenceRecipeId, null);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.locations));
});

test("drop order defines stack order and an assembled layer can be reinserted or removed", () => {
  let state = createSoloCookingState();
  state = placeSoloLayer(state, "patty");
  state = placeSoloLayer(state, "cheese");
  state = placeSoloLayer(state, "bottom-bun", 0);
  state = placeSoloLayer(state, "patty", 2);

  assert.deepEqual(state.assembledOrder, ["bottom-bun", "cheese", "patty"]);
  assert.deepEqual(state.locations.cheese, { kind: "prep", index: 1 });
  assert.deepEqual(state.locations.patty, { kind: "prep", index: 2 });

  state = removeSoloLayer(state, "cheese");
  assert.deepEqual(state.assembledOrder, ["bottom-bun", "patty"]);
  assert.deepEqual(state.locations.cheese, { kind: "bin", index: 2 });
  assert.deepEqual(state.locations.patty, { kind: "prep", index: 1 });
});

test("rotation and repeated mixed sauce strokes are immutable and serializable", () => {
  const initial = createSoloCookingState();
  const rotated = rotateSoloLayer(initial, "patty", Math.PI / 3);
  const first = addSoloSauceStroke(rotated, stroke("ketchup"));
  const second = addSoloSauceStroke(first, stroke("mustard"));
  const third = addSoloSauceStroke(second, stroke("ketchup"));
  const composition = serializeSoloComposition(third);

  assert.equal(initial.rotations.patty, 0);
  assert.equal(rotated.rotations.patty, Math.PI / 3);
  assert.deepEqual(composition.strokes.map(({ sauce }) => sauce), [
    "ketchup", "mustard", "ketchup",
  ]);
  assert.equal(composition.layerPoses.patty.yaw, Math.PI / 3);
  assert.deepEqual(composition.layerOrder, SOLO_BURGER_INGREDIENT_IDS);
  composition.strokes[0].points[0][0] = 1;
  assert.equal(third.strokes[0].points[0][0], -0.4);
});

test("one sauce gesture adds all layer segments as one undoable edit", () => {
  const initial = createSoloCookingState();
  const updated = addSoloSauceStrokes(initial, [
    stroke("mustard", "patty"),
    stroke("mustard", "cheese"),
  ]);
  assert.deepEqual(updated.strokes.map(({ layerId }) => layerId), ["patty", "cheese"]);
  assert.equal(updated.history.length, 1);
  assert.deepEqual(undoSoloCooking(updated).strokes, []);
  assert.throws(() => addSoloSauceStrokes(initial, []), TypeError);
});

test("finish is gated by two solid layers and continue returns to editable state", () => {
  let state = createSoloCookingState();
  assert.throws(() => finishSoloCooking(state), /2|two|layers|层/i);

  state = placeSoloLayer(state, "bottom-bun");
  assert.equal(state.complete, false);
  state = placeSoloLayer(state, "patty");
  assert.equal(state.complete, true);
  state = finishSoloCooking(state);
  assert.equal(state.finished, true);
  assert.throws(() => rotateSoloLayer(state, "patty", 0.2), /finished/i);
  state = continueSoloCooking(state);
  assert.equal(state.finished, false);
  assert.equal(state.complete, true);
});

test("undo reverses the latest safe edit and reset returns a fresh initial state", () => {
  const initial = createSoloCookingState();
  const placed = placeSoloLayer(initial, "bottom-bun");
  const rotated = rotateSoloLayer(placed, "bottom-bun", 0.4);
  const undone = undoSoloCooking(rotated);

  assert.deepEqual(undone.assembledOrder, ["bottom-bun"]);
  assert.equal(undone.rotations["bottom-bun"], 0);
  assert.equal(undone.history.length, 1);
  assert.deepEqual(resetSoloCookingState(undone), createSoloCookingState());
});

test("rejects unknown layers, invalid indices, and malformed strokes without mutation", () => {
  const state = createSoloCookingState();
  assert.throws(() => placeSoloLayer(state, "bread"), TypeError);
  assert.throws(() => placeSoloLayer(state, "patty", -1), TypeError);
  assert.throws(() => rotateSoloLayer(state, "patty", Infinity), TypeError);
  assert.throws(() => addSoloSauceStroke(state, { ...stroke(), points: [[0, 0]] }), TypeError);
  assert.throws(() => addSoloSauceStroke(state, stroke("chili")), TypeError);
  assert.deepEqual(state, createSoloCookingState());
});

test("solo ingredient and sauce profiles include the recipe-only options", () => {
  const state = createSoloCookingState();

  assert.ok(state.instances.onion);
  assert.ok(state.instances["middle-bun"]);
  assert.deepEqual(SOLO_COOKING_SAUCE_IDS, ["ketchup", "mustard", "house-sauce"]);

  const withSauce = addSoloSauceStroke(state, stroke("house-sauce", "middle-bun"));
  assert.equal(withSauce.strokes[0].sauce, "house-sauce");
});

test("reference selection is validated and never clears composition or enters undo history", () => {
  const initialReference = BURGER_RECIPES[0].id;
  const nextReference = BURGER_RECIPES[1].id;
  let state = createSoloCookingState({ referenceRecipeId: initialReference });
  state = placeSoloLayer(state, "bottom-bun");
  const historyBeforeSelection = state.history;

  state = selectSoloReferenceRecipe(state, nextReference);

  assert.equal(state.referenceRecipeId, nextReference);
  assert.deepEqual(state.assembledOrder, ["bottom-bun"]);
  assert.strictEqual(state.history, historyBeforeSelection);
  assert.equal(undoSoloCooking(state).referenceRecipeId, nextReference);
  assert.throws(() => selectSoloReferenceRecipe(state, "missing-recipe"), TypeError);
  assert.throws(
    () => createSoloCookingState({ referenceRecipeId: "missing-recipe" }),
    TypeError,
  );
});

test("reference survives reset and undo but is excluded from serialized composition", () => {
  const referenceRecipeId = BURGER_RECIPES[2].id;
  let state = createSoloCookingState({ referenceRecipeId });
  state = placeSoloLayer(state, "bottom-bun");
  state = rotateSoloLayer(state, "bottom-bun", 0.25);

  const undone = undoSoloCooking(state);
  const reset = resetSoloCookingState(undone);
  const composition = serializeSoloComposition(undone);

  assert.equal(undone.referenceRecipeId, referenceRecipeId);
  assert.equal(reset.referenceRecipeId, referenceRecipeId);
  assert.equal(Object.hasOwn(composition, "referenceRecipeId"), false);
});

test("free cooking can explicitly clear a selected reference without changing the stack", () => {
  let state = createSoloCookingState({ referenceRecipeId: BURGER_RECIPES[0].id });
  state = placeSoloLayer(state, "onion");

  state = selectSoloReferenceRecipe(state, null);

  assert.equal(state.referenceRecipeId, null);
  assert.deepEqual(state.assembledOrder, ["onion"]);
});

test("replenishes a used ingredient source and allows twenty independent repeated layers", () => {
  let state = createSoloCookingState();
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK);

  for (let index = 0; index < MAX_SOLO_STACK_LAYERS; index += 1) {
    const sourceId = state.binSources.patty;
    state = placeSoloLayer(state, sourceId, state.assembledOrder.length, { replenish: true });
    assert.equal(state.instances[sourceId], "patty");
    assert.notEqual(state.binSources.patty, sourceId);
  }

  assert.equal(state.assembledOrder.length, 20);
  assert.equal(new Set(state.assembledOrder).size, 20);
  assert.ok(state.assembledOrder.every((id) => state.instances[id] === "patty"));
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK - 20);
  assert.throws(
    () => placeSoloLayer(state, state.binSources.patty, 20, { replenish: true }),
    /20|maximum|layers/i,
  );
});

test("returning a repeated layer consolidates the bin source and restores its stock", () => {
  let state = createSoloCookingState();
  state = placeSoloLayer(state, state.binSources.cheese, 0, { replenish: true });
  const placedId = state.assembledOrder[0];
  const replacementId = state.binSources.cheese;

  state = removeSoloLayer(state, placedId, { consolidate: true });

  assert.equal(state.binSources.cheese, placedId);
  assert.equal(state.locations[placedId].kind, "bin");
  assert.equal(state.instances[replacementId], undefined);
  assert.equal(state.inventory.cheese, SOLO_INGREDIENT_STOCK);
});

test("returning several copies never leaves duplicate source models in one ingredient bin", () => {
  let state = createSoloCookingState();
  state = placeSoloLayer(state, state.binSources.tomato, 0, { replenish: true });
  state = placeSoloLayer(state, state.binSources.tomato, 1, { replenish: true });
  const [canonical, repeated] = state.assembledOrder;

  state = removeSoloLayer(state, canonical, { consolidate: true });
  assert.equal(state.binSources.tomato, canonical);
  state = removeSoloLayer(state, repeated, { consolidate: true });

  const tomatoInstances = Object.entries(state.instances)
    .filter(([, ingredientId]) => ingredientId === "tomato")
    .map(([id]) => id);
  assert.equal(tomatoInstances.length, 1);
  assert.equal(state.binSources.tomato, tomatoInstances[0]);
  assert.equal(state.locations[tomatoInstances[0]].kind, "bin");
  assert.equal(state.inventory.tomato, SOLO_INGREDIENT_STOCK);
});
