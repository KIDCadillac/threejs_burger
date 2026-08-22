import assert from "node:assert/strict";
import test from "node:test";

import {
  SWIPE_STACK_INGREDIENTS,
  addSwipeStackLayer,
  consumeConveyorSupply,
  createConveyorSupplyState,
  createSwipeStackState,
  finishSwipeStack,
  resolveSwipeStackGesture,
  spawnConveyorSupply,
  undoSwipeStackLayer,
} from "../swipe-stack-state.mjs";

test("live conveyor starts empty and accumulates supplied ingredients", () => {
  let supply = createConveyorSupplyState();
  assert.deepEqual(supply.items, []);
  supply = spawnConveyorSupply(supply);
  supply = spawnConveyorSupply(supply);
  supply = spawnConveyorSupply(supply);
  assert.deepEqual(supply.items.map(({ ingredientId }) => ingredientId), [
    "bottom-bun", "patty", "cheese",
  ]);
});

test("full conveyor keeps its pile until the front ingredient is consumed", () => {
  let supply = createConveyorSupplyState();
  for (let index = 0; index < 5; index += 1) supply = spawnConveyorSupply(supply);
  assert.equal(spawnConveyorSupply(supply), supply);
  const consumed = consumeConveyorSupply(supply);
  assert.equal(consumed.item.ingredientId, "bottom-bun");
  assert.deepEqual(consumed.state.items.map(({ ingredientId }) => ingredientId), [
    "patty", "cheese", "tomato", "lettuce",
  ]);
  const refilled = spawnConveyorSupply(consumed.state);
  assert.equal(refilled.items.at(-1).ingredientId, "pickle");
  assert.equal(refilled.items.length, 5);
});

test("only an upward dominant gesture launches; horizontal movement never changes supply", () => {
  assert.deepEqual(
    resolveSwipeStackGesture({ deltaX: 8, deltaY: -110, width: 390, height: 844, elapsedMs: 260 }).action,
    "launch",
  );
  assert.equal(resolveSwipeStackGesture({ deltaX: -92, deltaY: -8, width: 390, height: 844, elapsedMs: 260 }).action, "tap");
  assert.equal(
    resolveSwipeStackGesture({ deltaX: 9, deltaY: -12, width: 390, height: 844, elapsedMs: 260 }).action,
    "tap",
  );
});

test("swipe stacking accepts repeats and any ingredient order", () => {
  let state = createSwipeStackState();
  state = addSwipeStackLayer(state, "patty", { power: .7, lateral: -.2 });
  state = addSwipeStackLayer(state, "patty", { power: .3, lateral: .1 });
  state = addSwipeStackLayer(state, "bottom-bun");

  assert.deepEqual(state.layers.map(({ ingredientId }) => ingredientId), [
    "patty",
    "patty",
    "bottom-bun",
  ]);
  assert.equal(state.combo, 3);
  assert.ok(state.score > 300);
});

test("undo removes only the latest layer and finish needs two layers", () => {
  const oneLayer = addSwipeStackLayer(createSwipeStackState(), "cheese");
  assert.equal(finishSwipeStack(oneLayer), oneLayer);

  const twoLayers = addSwipeStackLayer(oneLayer, "top-bun");
  const finished = finishSwipeStack(twoLayers);
  assert.equal(finished.finished, true);
  assert.deepEqual(undoSwipeStackLayer(twoLayers).layers.map(({ ingredientId }) => ingredientId), ["cheese"]);
});
