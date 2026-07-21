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
  MAX_SOLO_STACK_LAYERS,
  SOLO_INGREDIENT_STOCK,
} from "../app/static/cooking-solo-state.mjs";
import { BURGER_LAYER_IDS } from "../app/static/cooking-state.mjs";

const stroke = (sauce = "chili", layerId = "patty") => ({
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
  assert.deepEqual(Object.keys(state.locations), BURGER_LAYER_IDS);
  BURGER_LAYER_IDS.forEach((id, index) => {
    assert.deepEqual(state.locations[id], { kind: "bin", index });
    assert.equal(state.rotations[id], 0);
  });
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
  const first = addSoloSauceStroke(rotated, stroke("chili"));
  const second = addSoloSauceStroke(first, stroke("mustard"));
  const third = addSoloSauceStroke(second, stroke("chili"));
  const composition = serializeSoloComposition(third);

  assert.equal(initial.rotations.patty, 0);
  assert.equal(rotated.rotations.patty, Math.PI / 3);
  assert.deepEqual(composition.strokes.map(({ sauce }) => sauce), [
    "chili", "mustard", "chili",
  ]);
  assert.equal(composition.layerPoses.patty.yaw, Math.PI / 3);
  assert.deepEqual(composition.layerOrder, BURGER_LAYER_IDS);
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

test("finish is gated by all seven layers and continue returns to editable state", () => {
  let state = createSoloCookingState();
  assert.throws(() => finishSoloCooking(state), /seven|7|layers/i);

  for (const layerId of BURGER_LAYER_IDS) state = placeSoloLayer(state, layerId);
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
  assert.deepEqual(state, createSoloCookingState());
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
