import assert from "node:assert/strict";
import test from "node:test";

import {
  SWIPE_STACK_INGREDIENTS,
  addSwipeStackLayer,
  consumeConveyorSupply,
  createConveyorSupplyState,
  createSwipeStackOrderBoard,
  createSwipeStackState,
  cycleSwipeStackOrder,
  finishSwipeStack,
  orderNextIngredient,
  orderRecipe,
  placeIngredientInOrder,
  refreshCompletedOrder,
  resolveOrderSwipeGesture,
  resolveSwipeStackGesture,
  spawnConveyorSupply,
  supplyForecastForOrders,
  supplyNeedsForOrders,
  undoIngredientInOrder,
  undoSwipeStackLayer,
  undoSwipeStackOrderLayer,
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

test("full bottom supply keeps its pile and allows any visible item to be consumed", () => {
  let supply = createConveyorSupplyState();
  for (let index = 0; index < 6; index += 1) supply = spawnConveyorSupply(supply);
  assert.equal(spawnConveyorSupply(supply), supply);
  const consumed = consumeConveyorSupply(supply, supply.items[2].id);
  assert.equal(consumed.item.ingredientId, "cheese");
  assert.deepEqual(consumed.state.items.map(({ ingredientId }) => ingredientId), [
    "bottom-bun", "patty", "tomato", "lettuce", "pickle",
  ]);
  const refilled = spawnConveyorSupply(consumed.state, 6, "onion");
  assert.equal(refilled.items.at(-1).ingredientId, "onion");
  assert.equal(refilled.items.length, 6);
});

test("three order filters request different materials and reject the wrong lane", () => {
  let board = createSwipeStackOrderBoard(3);
  assert.deepEqual(supplyNeedsForOrders(board), ["bottom-bun", "bottom-bun", "bottom-bun"]);

  const wrong = placeIngredientInOrder(board, "order-1", "patty");
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.expected, "bottom-bun");
  assert.equal(wrong.state, board);

  const accepted = placeIngredientInOrder(board, "order-1", "bottom-bun");
  assert.equal(accepted.accepted, true);
  board = accepted.state;
  assert.equal(orderNextIngredient(board.orders[0]), "patty");
  assert.equal(orderRecipe(board.orders[1]).id, "double-cheese");
  assert.deepEqual(supplyNeedsForOrders(board), ["patty", "bottom-bun", "bottom-bun"]);
  assert.deepEqual(supplyForecastForOrders(board, 2), ["patty", "cheese", "bottom-bun", "lettuce"]);
});

test("a completed burger auto-refreshes only its order lane", () => {
  let board = createSwipeStackOrderBoard(3);
  const originalOtherOrders = board.orders.slice(1);
  const recipe = orderRecipe(board.orders[0]);
  for (const ingredientId of recipe.ingredients) {
    board = placeIngredientInOrder(board, "order-1", ingredientId).state;
  }
  assert.equal(board.orders[0].complete, true);
  const refreshed = refreshCompletedOrder(board, "order-1");
  assert.equal(refreshed.servedCount, 1);
  assert.deepEqual(refreshed.orders[0].placed, []);
  assert.equal(refreshed.orders[0].recipeId, "onion-beef");
  assert.deepEqual(refreshed.orders.slice(1), originalOtherOrders);
});

test("undo removes only the selected order's latest ingredient", () => {
  let board = createSwipeStackOrderBoard(3);
  board = placeIngredientInOrder(board, "order-2", "bottom-bun").state;
  const undone = undoIngredientInOrder(board, "order-2");
  assert.deepEqual(undone.orders[1].placed, []);
  assert.equal(undone.orders[0], board.orders[0]);
});

test("score history undo removes the selected order layer instead of another lane", () => {
  let state = createSwipeStackState();
  state = addSwipeStackLayer(state, "bottom-bun", { orderId: "order-1" });
  state = addSwipeStackLayer(state, "bottom-bun", { orderId: "order-2" });
  state = addSwipeStackLayer(state, "patty", { orderId: "order-1" });
  const undone = undoSwipeStackOrderLayer(state, "order-2");
  assert.deepEqual(undone.layers.map(({ orderId, ingredientId }) => [orderId, ingredientId]), [
    ["order-1", "bottom-bun"],
    ["order-1", "patty"],
  ]);
});

test("plate swipe cycles three orders in both directions without accepting vertical motion", () => {
  const board = createSwipeStackOrderBoard(3);
  assert.equal(cycleSwipeStackOrder(board, "order-1", 1), "order-2");
  assert.equal(cycleSwipeStackOrder(board, "order-1", -1), "order-3");
  assert.deepEqual(
    resolveOrderSwipeGesture({ deltaX: -72, deltaY: 8, width: 390 }),
    { action: "switch-order", step: 1 },
  );
  assert.deepEqual(
    resolveOrderSwipeGesture({ deltaX: 72, deltaY: -8, width: 390 }),
    { action: "switch-order", step: -1 },
  );
  assert.deepEqual(
    resolveOrderSwipeGesture({ deltaX: 16, deltaY: -92, width: 390 }),
    { action: "none", step: 0 },
  );
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
