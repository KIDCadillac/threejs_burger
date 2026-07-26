import test from "node:test";
import assert from "node:assert/strict";

import {
  createBurgerOrder,
  isLegalBurgerOrder,
} from "../app/static/burger-order-generator.mjs";

test("first order has four layers and no sauce at the lowest random value", () => {
  const order = createBurgerOrder({ orderNumber: 1, random: () => 0 });

  assert.equal(order.layers.length, 4);
  assert.equal(order.sauces.length, 0);
  assert.equal(order.layers[0].ingredientId, "bottom-bun");
  assert.equal(order.layers.at(-1).ingredientId, "top-bun");
  assert.ok(order.layers.some(({ ingredientId }) => ingredientId === "patty"));
  assert.equal(isLegalBurgerOrder(order), true);
});

test("second order introduces one targeted sauce", () => {
  const order = createBurgerOrder({ orderNumber: 2, random: () => 0.4 });

  assert.ok(order.layers.length >= 5 && order.layers.length <= 6);
  assert.equal(order.sauces.length, 1);
  assert.ok(order.layers.some(({ slotId }) => slotId === order.sauces[0].targetLayerSlotId));
  assert.equal(isLegalBurgerOrder(order), true);
});

test("third order has seven or eight layers without adjacent bread", () => {
  const order = createBurgerOrder({ orderNumber: 3, random: () => 0.9 });

  assert.ok(order.layers.length >= 7 && order.layers.length <= 8);
  assert.equal(order.sauces.length, 1);
  for (let index = 1; index < order.layers.length; index += 1) {
    const previousBread = order.layers[index - 1].ingredientId.includes("bun");
    const currentBread = order.layers[index].ingredientId.includes("bun");
    assert.equal(previousBread && currentBread, false);
  }
  assert.equal(isLegalBurgerOrder(order), true);
});

test("orders four through eight progressively increase difficulty and stay legal", () => {
  const expectations = new Map([
    [4, { minLayers: 7, maxLayers: 8, sauces: 1 }],
    [5, { minLayers: 7, maxLayers: 9, sauces: 2 }],
    [6, { minLayers: 8, maxLayers: 10, sauces: 2 }],
    [7, { minLayers: 9, maxLayers: 11, sauces: 2 }],
    [8, { minLayers: 10, maxLayers: 12, sauces: 2 }],
  ]);

  for (const [orderNumber, expectation] of expectations) {
    const order = createBurgerOrder({ orderNumber, random: () => 0.75 });
    assert.ok(
      order.layers.length >= expectation.minLayers
        && order.layers.length <= expectation.maxLayers,
      `order ${orderNumber} has an expected layer count`,
    );
    assert.equal(order.sauces.length, expectation.sauces);
    assert.equal(isLegalBurgerOrder(order), true);
    assert.ok(order.publicName);
  }
});

test("generation is deterministic for the same random sequence", () => {
  const sequence = [0.8, 0.1, 0.6, 0.2, 0.9, 0.4, 0.3, 0.7];
  const makeRandom = () => {
    let index = 0;
    return () => sequence[index++ % sequence.length];
  };

  assert.deepEqual(
    createBurgerOrder({ orderNumber: 3, random: makeRandom() }),
    createBurgerOrder({ orderNumber: 3, random: makeRandom() }),
  );
});

test("rejects unsupported order numbers and invalid random sources", () => {
  assert.throws(() => createBurgerOrder({ orderNumber: 0 }), /orderNumber/);
  assert.throws(() => createBurgerOrder({ orderNumber: 9 }), /orderNumber/);
  assert.throws(
    () => createBurgerOrder({ orderNumber: 1, random: () => Number.NaN }),
    /random/,
  );
});
