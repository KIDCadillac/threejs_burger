import assert from "node:assert/strict";
import test from "node:test";

import {
  SWIPE_STACK_INGREDIENTS,
  addSwipeStackLayer,
  advanceConveyorCursor,
  conveyorIngredientAt,
  createConveyorWindow,
  createSwipeStackState,
  finishSwipeStack,
  resolveSwipeStackGesture,
  undoSwipeStackLayer,
} from "../swipe-stack-state.mjs";

test("automatic conveyor exposes the current ingredient and advances one slot", () => {
  assert.equal(conveyorIngredientAt(0), "bottom-bun");
  assert.deepEqual(createConveyorWindow(0, 3).map(({ ingredientId }) => ingredientId), [
    "bottom-bun", "patty", "cheese",
  ]);
  assert.equal(advanceConveyorCursor(0), 1);
  assert.equal(advanceConveyorCursor(SWIPE_STACK_INGREDIENTS.length - 1), 0);
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
