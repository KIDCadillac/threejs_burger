import test from "node:test";
import assert from "node:assert/strict";

import {
  createSoloCookingState,
  setSoloStationContent,
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
import { createDefaultWorkbenchLoadout } from "../app/static/workbench-loadout.mjs";

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

test("replenishes a used ingredient source and allows sixty independent repeated layers", () => {
  let state = createSoloCookingState();
  assert.equal(MAX_SOLO_STACK_LAYERS, 60);
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK);

  for (let index = 0; index < 60; index += 1) {
    const sourceId = state.binSources.patty;
    state = placeSoloLayer(state, sourceId, state.assembledOrder.length, { replenish: true });
    assert.equal(state.instances[sourceId], "patty");
    assert.notEqual(state.binSources.patty, sourceId);
  }

  assert.equal(state.assembledOrder.length, 60);
  assert.equal(new Set(state.assembledOrder).size, 60);
  assert.ok(state.assembledOrder.every((id) => state.instances[id] === "patty"));
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK - 60);
  assert.throws(
    () => placeSoloLayer(state, state.binSources.patty, 60, { replenish: true }),
    /60|maximum|layers/i,
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

test("explicit loadouts give duplicate ingredient slots independent replenishing sources", () => {
  const loadout = {
    ...createDefaultWorkbenchLoadout(),
    "filling-back-2": "patty",
  };
  let state = createSoloCookingState({ loadout });
  const firstSource = state.stationSources["filling-back-1"];
  const secondSource = state.stationSources["filling-back-2"];

  assert.equal(firstSource, "patty");
  assert.match(secondSource, /^patty#\d+$/);
  assert.notEqual(firstSource, secondSource);
  assert.equal(state.instances[firstSource], "patty");
  assert.equal(state.instances[secondSource], "patty");
  assert.deepEqual(state.locations[firstSource], { kind: "bin", slotId: "filling-back-1" });
  assert.deepEqual(state.locations[secondSource], { kind: "bin", slotId: "filling-back-2" });
  assert.equal(state.binSources.patty, firstSource);
  assert.equal(state.binSources.cheese, undefined);

  state = placeSoloLayer(state, secondSource, 0, { replenish: true });

  assert.equal(state.stationSources["filling-back-1"], firstSource);
  assert.notEqual(state.stationSources["filling-back-2"], secondSource);
  assert.equal(state.instances[state.stationSources["filling-back-2"]], "patty");
  assert.deepEqual(state.locations[state.stationSources["filling-back-2"]], {
    kind: "bin",
    slotId: "filling-back-2",
  });
  assert.deepEqual(state.assembledOrder, [secondSource]);
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK - 1);
});

test("switching an ingredient slot preserves the plated work, strokes, and history", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const platedId = state.stationSources["filling-back-1"];
  state = placeSoloLayer(state, platedId, 0, { replenish: true });
  state = addSoloSauceStroke(state, stroke("ketchup", platedId));
  const previousSource = state.stationSources["filling-back-2"];
  const orderBefore = state.assembledOrder;
  const strokesBefore = state.strokes;
  const historyBefore = state.history;

  const changed = setSoloStationContent(state, "filling-back-2", "onion");
  const replacementSource = changed.stationSources["filling-back-2"];

  assert.deepEqual(changed.assembledOrder, orderBefore);
  assert.deepEqual(changed.strokes, strokesBefore);
  assert.strictEqual(changed.history, historyBefore);
  assert.equal(changed.stationContents["filling-back-2"], "onion");
  assert.equal(changed.instances[previousSource], undefined);
  assert.equal(changed.instances[replacementSource], "onion");
  assert.equal(changed.instanceHomes[replacementSource], "filling-back-2");
  assert.deepEqual(changed.locations[replacementSource], {
    kind: "bin",
    slotId: "filling-back-2",
  });
  assert.equal(changed.inventory.onion, SOLO_INGREDIENT_STOCK);
});

test("switching a sauce slot only changes station contents", () => {
  const state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const changed = setSoloStationContent(state, "sauce-right-2", "ketchup");

  assert.equal(changed.stationContents["sauce-right-2"], "ketchup");
  assert.strictEqual(changed.instances, state.instances);
  assert.strictEqual(changed.locations, state.locations);
  assert.strictEqual(changed.rotations, state.rotations);
  assert.strictEqual(changed.stationSources, state.stationSources);
  assert.strictEqual(changed.instanceHomes, state.instanceHomes);
  assert.strictEqual(changed.binSources, state.binSources);
  assert.strictEqual(changed.inventory, state.inventory);
  assert.strictEqual(changed.assembledOrder, state.assembledOrder);
  assert.strictEqual(changed.strokes, state.strokes);
  assert.strictEqual(changed.history, state.history);
});

test("cooking undo and reset retain the latest explicit station loadout", () => {
  const referenceRecipeId = BURGER_RECIPES[0].id;
  let state = createSoloCookingState({
    referenceRecipeId,
    loadout: createDefaultWorkbenchLoadout(),
  });
  state = setSoloStationContent(state, "filling-back-2", "patty");
  const platedId = state.stationSources["filling-back-2"];
  state = placeSoloLayer(state, platedId, 0, { replenish: true });
  const latestSources = state.stationSources;
  state = rotateSoloLayer(state, platedId, 0.4);
  state = addSoloSauceStroke(state, stroke("mustard", platedId));

  state = undoSoloCooking(state);
  assert.deepEqual(state.strokes, []);
  assert.equal(state.rotations[platedId], 0.4);
  assert.equal(state.stationContents["filling-back-2"], "patty");
  assert.deepEqual(state.stationSources, latestSources);

  state = undoSoloCooking(state);
  assert.equal(state.rotations[platedId], 0);
  assert.equal(state.stationContents["filling-back-2"], "patty");
  assert.deepEqual(state.stationSources, latestSources);

  state = undoSoloCooking(state);
  assert.deepEqual(state.assembledOrder, []);
  assert.equal(state.stationContents["filling-back-2"], "patty");
  assert.deepEqual(state.stationSources, latestSources);
  assert.equal(state.instances[latestSources["filling-back-2"]], "patty");
  assert.deepEqual(state.locations[latestSources["filling-back-2"]], {
    kind: "bin",
    slotId: "filling-back-2",
  });

  const reset = resetSoloCookingState(state);
  assert.equal(reset.referenceRecipeId, referenceRecipeId);
  assert.deepEqual(reset.stationContents, state.stationContents);
  assert.deepEqual(reset.assembledOrder, []);
  assert.deepEqual(reset.strokes, []);
  assert.equal(Object.keys(reset.stationSources).length, 7);
});

test("a consolidated layer makes its changed home slot accept the returned ingredient", () => {
  const loadout = {
    ...createDefaultWorkbenchLoadout(),
    "filling-back-2": "patty",
  };
  let state = createSoloCookingState({ loadout });
  const untouchedSource = state.stationSources["filling-back-1"];
  const returnedId = state.stationSources["filling-back-2"];
  state = placeSoloLayer(state, returnedId, 0, { replenish: true });
  state = setSoloStationContent(state, "filling-back-2", "onion");
  const displacedSource = state.stationSources["filling-back-2"];

  state = removeSoloLayer(state, returnedId, { consolidate: true });

  assert.equal(state.stationContents["filling-back-2"], "patty");
  assert.equal(state.stationSources["filling-back-1"], untouchedSource);
  assert.equal(state.stationSources["filling-back-2"], returnedId);
  assert.deepEqual(state.locations[returnedId], {
    kind: "bin",
    slotId: "filling-back-2",
  });
  assert.equal(state.instances[displacedSource], undefined);
  assert.equal(state.instanceHomes[returnedId], "filling-back-2");
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK);
  const returnedSlotSources = Object.entries(state.locations)
    .filter(([, location]) => location.kind === "bin" && location.slotId === "filling-back-2")
    .map(([id]) => id);
  assert.deepEqual(returnedSlotSources, [returnedId]);
});

test("undo keeps a returned duplicate ingredient tied to its original slot after a slot switch", () => {
  const loadout = {
    ...createDefaultWorkbenchLoadout(),
    "filling-back-2": "patty",
  };
  let state = createSoloCookingState({ loadout });
  const firstSlotSource = state.stationSources["filling-back-1"];
  const returnedId = state.stationSources["filling-back-2"];

  state = placeSoloLayer(state, returnedId, 0, { replenish: true });
  state = removeSoloLayer(state, returnedId, { consolidate: true });
  state = setSoloStationContent(state, "filling-back-2", "cheese");
  state = undoSoloCooking(state);

  assert.deepEqual(state.assembledOrder, [returnedId]);
  assert.equal(state.instanceHomes[returnedId], "filling-back-2");

  state = removeSoloLayer(state, returnedId, { consolidate: true });

  assert.equal(state.stationSources["filling-back-1"], firstSlotSource);
  assert.equal(state.stationSources["filling-back-2"], returnedId);
  assert.ok(Object.values(state.stationSources).every((id) => state.instances[id]));
  assert.deepEqual(state.locations[returnedId], {
    kind: "bin",
    slotId: "filling-back-2",
  });
});

test("undo restores an assembled canonical instance to its historical home slot", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  state = setSoloStationContent(state, "filling-back-1", "onion");
  const returnedId = state.stationSources["filling-back-1"];
  assert.equal(returnedId, "onion");

  state = placeSoloLayer(state, returnedId, 0, { replenish: true });
  state = removeSoloLayer(state, returnedId, { consolidate: true });
  state = setSoloStationContent(state, "filling-back-1", "patty");
  state = setSoloStationContent(state, "filling-back-2", "onion");
  state = undoSoloCooking(state);

  assert.deepEqual(state.assembledOrder, [returnedId]);
  assert.equal(state.instanceHomes[returnedId], "filling-back-1");

  state = removeSoloLayer(state, returnedId, { consolidate: true });

  assert.equal(state.stationSources["filling-back-1"], returnedId);
  assert.equal(state.stationContents["filling-back-1"], "onion");
  assert.notEqual(state.stationSources["filling-back-2"], returnedId);
  assert.deepEqual(state.locations[returnedId], {
    kind: "bin",
    slotId: "filling-back-1",
  });
});

test("undo keeps a retained stroked canonical target separate from a reused station source", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const strokedId = state.stationSources["filling-back-1"];
  assert.equal(strokedId, "patty");

  state = addSoloSauceStroke(state, stroke("ketchup", strokedId));
  state = setSoloStationContent(state, "filling-back-1", "onion");
  const onionId = state.stationSources["filling-back-1"];
  for (let index = 0; index < 64; index += 1) {
    state = addSoloSauceStroke(state, stroke("mustard", onionId));
  }

  assert.equal(state.instances[strokedId], undefined);
  assert.ok(state.history.at(-1).strokes.some(({ layerId }) => layerId === strokedId));

  state = setSoloStationContent(state, "filling-back-2", "patty");
  assert.equal(state.stationSources["filling-back-2"], strokedId);
  state = undoSoloCooking(state);

  const currentPattySource = state.stationSources["filling-back-2"];
  assert.notEqual(currentPattySource, strokedId);
  assert.equal(state.instances[currentPattySource], "patty");
  assert.equal(state.instanceHomes[currentPattySource], "filling-back-2");
  assert.equal(state.instances[strokedId], "patty");
  assert.equal(state.instanceHomes[strokedId], "filling-back-1");
  assert.deepEqual(state.locations[strokedId], {
    kind: "bin",
    slotId: "filling-back-1",
  });
  assert.ok(state.strokes.some(({ layerId }) => layerId === strokedId));
});

test("undoing a same-slot stroke keeps one canonical station source", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const sourceId = state.stationSources["filling-back-1"];
  state = addSoloSauceStroke(state, stroke("ketchup", sourceId));
  state = addSoloSauceStroke(state, stroke("mustard", sourceId));

  state = undoSoloCooking(state);

  assert.equal(state.stationSources["filling-back-1"], sourceId);
  assert.equal(state.instanceHomes[sourceId], "filling-back-1");
  assert.deepEqual(state.strokes.map(({ sauce, layerId }) => [sauce, layerId]), [
    ["ketchup", sourceId],
  ]);
  const firstSlotInstances = Object.entries(state.locations)
    .filter(([, location]) => (
      location.kind === "bin" && location.slotId === "filling-back-1"
    ))
    .map(([id]) => id);
  assert.deepEqual(firstSlotInstances, [sourceId]);
});

test("ten thousand station switches keep provenance bounded to live instances", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });

  for (let index = 0; index < 10_000; index += 1) {
    const contentId = state.stationContents["filling-back-1"] === "patty"
      ? "onion"
      : "patty";
    state = setSoloStationContent(state, "filling-back-1", contentId);
  }

  assert.equal(Object.keys(state.instances).length, 7);
  assert.deepEqual(
    new Set(Object.keys(state.instanceHomes)),
    new Set(Object.keys(state.instances)),
  );
});

test("evicted strokes release unreachable bin instances after retained history expires", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });

  for (let index = 0; index < 500; index += 1) {
    const sourceId = state.stationSources["filling-back-1"];
    state = addSoloSauceStroke(state, stroke("mustard", sourceId));
    const contentId = state.stationContents["filling-back-1"] === "patty"
      ? "onion"
      : "patty";
    state = setSoloStationContent(state, "filling-back-1", contentId);
  }

  const reachable = new Set([
    ...state.assembledOrder,
    ...Object.values(state.stationSources),
    ...state.strokes.map(({ layerId }) => layerId),
    ...state.history.flatMap((snapshot) => [
      ...snapshot.assembledOrder,
      ...snapshot.strokes.map(({ layerId }) => layerId),
    ]),
  ]);
  const unreachableInstances = Object.keys(state.instances)
    .filter((instanceId) => !reachable.has(instanceId));
  const unreachableHomes = Object.keys(state.instanceHomes)
    .filter((instanceId) => !reachable.has(instanceId));

  assert.deepEqual(unreachableInstances, []);
  assert.deepEqual(unreachableHomes, []);
});

test("undo preserves a stroked bin instance from the restored station snapshot", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const strokedId = state.stationSources["filling-back-1"];

  state = placeSoloLayer(state, strokedId, 0, { replenish: true });
  state = addSoloSauceStroke(state, stroke("ketchup", strokedId));
  state = removeSoloLayer(state, strokedId, { consolidate: true });
  state = placeSoloLayer(state, strokedId, 0, { replenish: true });
  state = undoSoloCooking(state);

  assert.equal(state.instances[strokedId], "patty");
  assert.deepEqual(state.locations[strokedId], {
    kind: "bin",
    slotId: "filling-back-1",
  });
  assert.deepEqual(state.strokes.map(({ layerId }) => layerId), [strokedId]);
});

test("switching a slot keeps its stroked bin source alive", () => {
  let state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const strokedId = state.stationSources["filling-back-1"];
  state = addSoloSauceStroke(state, stroke("mustard", strokedId));

  state = setSoloStationContent(state, "filling-back-1", "onion");

  assert.equal(state.instances[strokedId], "patty");
  assert.deepEqual(state.locations[strokedId], {
    kind: "bin",
    slotId: "filling-back-1",
  });
  assert.equal(state.instanceHomes[strokedId], "filling-back-1");
  assert.deepEqual(state.strokes.map(({ layerId }) => layerId), [strokedId]);
  assert.notEqual(state.stationSources["filling-back-1"], strokedId);
  assert.equal(state.instances[state.stationSources["filling-back-1"]], "onion");
});

test("explicit station records are frozen, validated, and excluded from serialization", () => {
  const state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });

  assert.deepEqual(Object.keys(state.stationContents), [
    "bread-left-1",
    "bread-left-2",
    "bread-left-3",
    "filling-back-1",
    "filling-back-2",
    "filling-back-3",
    "filling-back-4",
    "sauce-right-1",
    "sauce-right-2",
    "sauce-right-3",
  ]);
  assert.deepEqual(Object.keys(state.stationSources), [
    "bread-left-1",
    "bread-left-2",
    "bread-left-3",
    "filling-back-1",
    "filling-back-2",
    "filling-back-3",
    "filling-back-4",
  ]);
  assert.equal(Object.isFrozen(state.stationContents), true);
  assert.equal(Object.isFrozen(state.stationSources), true);
  assert.equal(Object.isFrozen(state.instanceHomes), true);

  assert.throws(() => setSoloStationContent(state, "missing-slot", "patty"), TypeError);
  assert.throws(() => setSoloStationContent(state, "bread-left-1", "patty"), TypeError);
  assert.throws(() => setSoloStationContent(state, "filling-back-1", "ketchup"), TypeError);
  assert.throws(() => setSoloStationContent(state, "sauce-right-1", "cheese"), TypeError);
  assert.throws(() => setSoloStationContent(state, "filling-back-1", "truffle"), TypeError);

  const composition = serializeSoloComposition(state);
  assert.equal(Object.hasOwn(composition, "stationContents"), false);
  assert.equal(Object.hasOwn(composition, "stationSources"), false);
  assert.equal(Object.hasOwn(composition, "instanceHomes"), false);
});
