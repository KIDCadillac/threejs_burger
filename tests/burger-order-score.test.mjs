import test from "node:test";
import assert from "node:assert/strict";

import {
  scoreBurgerOrder,
  summarizeBurgerRun,
} from "../app/static/burger-order-score.mjs";

const order = Object.freeze({
  id: "order-2-test",
  orderNumber: 2,
  layers: Object.freeze([
    Object.freeze({ slotId: "layer-1", ingredientId: "bottom-bun" }),
    Object.freeze({ slotId: "layer-2", ingredientId: "patty" }),
    Object.freeze({ slotId: "layer-3", ingredientId: "cheese" }),
    Object.freeze({ slotId: "layer-4", ingredientId: "pickle" }),
    Object.freeze({ slotId: "layer-5", ingredientId: "top-bun" }),
  ]),
  sauces: Object.freeze([
    Object.freeze({
      sauceId: "ketchup",
      targetLayerSlotId: "layer-3",
      targetCoverage: 0.5,
    }),
  ]),
});

function perfectSnapshot() {
  const assembledOrder = ["instance-1", "instance-2", "instance-3", "instance-4", "instance-5"];
  return {
    assembledOrder,
    instances: Object.fromEntries(assembledOrder.map((id, index) => [
      id,
      order.layers[index].ingredientId,
    ])),
    offsets: Object.fromEntries(assembledOrder.map((id) => [id, { x: 0, z: 0 }])),
    strokes: [{
      sauce: "ketchup",
      layerId: "instance-3",
      amount: 0.5,
      points: [[-0.5, 0], [0.5, 0]],
    }],
  };
}

test("perfect composition scores 1000", () => {
  const result = scoreBurgerOrder(order, perfectSnapshot(), { remainingMs: 45_000 });

  assert.equal(result.total, 1_000);
  assert.deepEqual(result.parts, {
    ingredients: 350,
    order: 250,
    sauce: 150,
    placement: 100,
    speed: 150,
  });
  assert.equal(result.reaction, "high");
});

test("empty composition scores zero instead of receiving sauce or speed points", () => {
  const result = scoreBurgerOrder(order, {
    assembledOrder: [],
    instances: {},
    offsets: {},
    strokes: [],
  }, { remainingMs: 45_000 });

  assert.equal(result.total, 0);
  assert.deepEqual(result.parts, {
    ingredients: 0,
    order: 0,
    sauce: 0,
    placement: 0,
    speed: 0,
  });
  assert.equal(result.reaction, "low");
});

test("wrong order, extra ingredients, misplaced layers and wrong sauce lose points", () => {
  const snapshot = perfectSnapshot();
  snapshot.assembledOrder = [
    "instance-1",
    "instance-3",
    "instance-2",
    "instance-4",
    "instance-5",
    "extra",
  ];
  snapshot.instances.extra = "tomato";
  snapshot.offsets["instance-3"] = { x: 1.45, z: 0 };
  snapshot.offsets.extra = { x: 1.45, z: 0 };
  snapshot.strokes = [{
    sauce: "mustard",
    layerId: "instance-2",
    amount: 1,
    points: [[0, 0], [0.5, 0]],
  }];

  const result = scoreBurgerOrder(order, snapshot, { remainingMs: 0 });

  assert.ok(result.parts.ingredients < 350);
  assert.ok(result.parts.order < 250);
  assert.equal(result.parts.sauce, 0);
  assert.ok(result.parts.placement < 100);
  assert.equal(result.parts.speed, 0);
  assert.ok(result.total < 700);
});

test("run summary uses raw total thresholds and defined coin formula", () => {
  assert.deepEqual(summarizeBurgerRun([
    { total: 850 },
    { total: 850 },
    { total: 850 },
  ]), {
    totalScore: 2_550,
    stars: 3,
    coins: 40,
  });
  assert.deepEqual(summarizeBurgerRun([
    { total: 700 },
    { total: 700 },
    { total: 700 },
  ]), {
    totalScore: 2_100,
    stars: 2,
    coins: 31,
  });
  assert.deepEqual(summarizeBurgerRun([{ total: 500 }, { total: 500 }, { total: 500 }]), {
    totalScore: 1_500,
    stars: 1,
    coins: 20,
  });
});
