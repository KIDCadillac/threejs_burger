import test from "node:test";
import assert from "node:assert/strict";

import {
  BURGER_LAYER_IDS,
  SAUCE_KEYS,
  addSauceStroke,
  createCookingState,
  moveLayer,
  reorderLayer,
  serializeComposition,
} from "../app/static/cooking-state.mjs";

const orderedLayerIds = (state) => [...state.layers]
  .sort((left, right) => left.order - right.order)
  .map(({ id }) => id);

test("hamburger starts as seven independent ordered 3D layers", () => {
  const state = createCookingState();

  assert.deepEqual(BURGER_LAYER_IDS, [
    "bottom-bun",
    "patty",
    "cheese",
    "tomato",
    "lettuce",
    "pickle",
    "top-bun",
  ]);
  assert.deepEqual(SAUCE_KEYS, ["chili", "mustard", "sour", "sticky"]);
  assert.equal(Object.isFrozen(BURGER_LAYER_IDS), true);
  assert.equal(Object.isFrozen(SAUCE_KEYS), true);
  assert.deepEqual(state, {
    food: "burger",
    expanded: false,
    layers: BURGER_LAYER_IDS.map((id, order) => ({
      id,
      order,
      pose: { x: 0, z: 0, yaw: 0 },
    })),
    strokes: [],
  });
  assert.equal(new Set(state.layers.map(({ id }) => id)).size, 7);
  assert.equal(new Set(state.layers.map(({ pose }) => pose)).size, 7);
});

test("moving top-bun leaves the input and every unrelated pose unchanged", () => {
  const initial = createCookingState();
  const initialSnapshot = structuredClone(initial);

  const moved = moveLayer(initial, "top-bun", { x: 0.7, z: -0.3, yaw: 0.4 });

  assert.notEqual(moved, initial);
  assert.deepEqual(initial, initialSnapshot);
  assert.deepEqual(
    moved.layers.filter(({ id }) => id !== "top-bun"),
    initial.layers.filter(({ id }) => id !== "top-bun"),
  );
  assert.deepEqual(
    moved.layers.find(({ id }) => id === "top-bun").pose,
    { x: 0.7, z: -0.3, yaw: 0.4 },
  );
});

test("reordering cheese inserts it at stack position five without mutation", () => {
  const initial = createCookingState();
  const initialSnapshot = structuredClone(initial);

  const reordered = reorderLayer(initial, "cheese", 5);

  assert.deepEqual(orderedLayerIds(reordered), [
    "bottom-bun",
    "patty",
    "tomato",
    "lettuce",
    "pickle",
    "cheese",
    "top-bun",
  ]);
  assert.deepEqual(
    [...reordered.layers]
      .sort((left, right) => left.order - right.order)
      .map(({ order }) => order),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(initial, initialSnapshot);
});

test("reordering rounds and clamps the requested stack position", () => {
  const rounded = reorderLayer(createCookingState(), "patty", 2.6);
  const clampedLow = reorderLayer(createCookingState(), "top-bun", -20);
  const clampedHigh = reorderLayer(createCookingState(), "bottom-bun", 20);

  assert.deepEqual(orderedLayerIds(rounded), [
    "bottom-bun",
    "cheese",
    "tomato",
    "patty",
    "lettuce",
    "pickle",
    "top-bun",
  ]);
  assert.equal(orderedLayerIds(clampedLow).at(0), "top-bun");
  assert.equal(orderedLayerIds(clampedHigh).at(-1), "bottom-bun");
});

test("repeated and mixed condiment strokes serialize in insertion order", () => {
  let state = createCookingState();
  state = addSauceStroke(state, {
    sauce: "chili",
    layerId: "patty",
    amount: 0.6,
    points: [[-0.5, 0], [0, 0.25], [0.5, 0]],
  });
  state = addSauceStroke(state, {
    sauce: "chili",
    layerId: "patty",
    amount: 0.4,
    points: [[-0.2, -0.3], [0.3, 0.3]],
  });
  state = addSauceStroke(state, {
    sauce: "mustard",
    layerId: "cheese",
    amount: 0.3,
    points: [[-0.4, 0], [0.4, 0]],
  });

  const payload = serializeComposition(state);

  assert.deepEqual(
    payload.strokes.map(({ sauce, layerId }) => [sauce, layerId]),
    [
      ["chili", "patty"],
      ["chili", "patty"],
      ["mustard", "cheese"],
    ],
  );
  assert.deepEqual(payload.layerOrder, BURGER_LAYER_IDS);
});

test("network bounds retain the newest 64 strokes and 24 points with all sauces", () => {
  let state = createCookingState();

  for (let index = 0; index < 70; index += 1) {
    state = addSauceStroke(state, {
      sauce: SAUCE_KEYS[index % SAUCE_KEYS.length],
      layerId: "patty",
      amount: 0.1,
      points: Array.from({ length: 30 }, (_, pointIndex) => [
        pointIndex === 0 ? index / 69 : (pointIndex - 15) / 10,
        2,
      ]),
    });
  }

  const payload = serializeComposition(state);

  assert.equal(payload.strokes.length, 64);
  assert.ok(payload.strokes.every(({ points }) => points.length === 24));
  assert.equal(payload.strokes.at(0).points[0][0], 6 / 69);
  assert.equal(payload.strokes.at(-1).points[0][0], 1);
  assert.deepEqual(new Set(payload.strokes.map(({ sauce }) => sauce)), new Set(SAUCE_KEYS));
});

test("unknown and inherited-looking sauce or layer identifiers are rejected", () => {
  const state = createCookingState();

  assert.throws(
    () => moveLayer(state, "toString", { x: 0, z: 0, yaw: 0 }),
    TypeError,
  );
  assert.throws(() => reorderLayer(state, "constructor", 1), TypeError);
  assert.throws(
    () => addSauceStroke(state, {
      sauce: "toString",
      layerId: "patty",
      amount: 0.1,
      points: [[0, 0]],
    }),
    TypeError,
  );
  assert.throws(
    () => addSauceStroke(state, {
      sauce: "chili",
      layerId: "toString",
      amount: 0.1,
      points: [[0, 0]],
    }),
    TypeError,
  );
});

test("numeric inputs are clamped and non-finite or non-number values normalize safely", () => {
  const clamped = moveLayer(createCookingState(), "patty", {
    x: 5,
    z: -5,
    yaw: Math.PI * 2,
  });
  const normalized = moveLayer(clamped, "patty", {
    x: Number.NaN,
    z: Number.POSITIVE_INFINITY,
    yaw: "0.5",
  });
  let sauced = addSauceStroke(normalized, {
    sauce: "sticky",
    layerId: "patty",
    amount: Number.NaN,
    points: [[Number.NaN, Number.NEGATIVE_INFINITY], ["0.5", -2], [3, null]],
  });
  sauced = addSauceStroke(sauced, {
    sauce: "sour",
    layerId: "cheese",
    amount: 4,
    points: [[-4, 4]],
  });

  assert.deepEqual(
    clamped.layers.find(({ id }) => id === "patty").pose,
    { x: 1, z: -1, yaw: Math.PI },
  );
  assert.deepEqual(
    normalized.layers.find(({ id }) => id === "patty").pose,
    { x: 0, z: 0, yaw: 0 },
  );
  assert.deepEqual(sauced.strokes[0], {
    sauce: "sticky",
    layerId: "patty",
    amount: 0.01,
    points: [[0, 0], [0, -1], [1, 0]],
  });
  assert.equal(sauced.strokes[1].amount, 1);
  assert.deepEqual(sauced.strokes[1].points, [[-1, 1]]);

  const payload = serializeComposition(sauced);
  const numericValues = [
    ...Object.values(payload.layerPoses).flatMap(({ x, z, yaw }) => [x, z, yaw]),
    ...payload.strokes.flatMap(({ amount, points }) => [amount, ...points.flat()]),
  ];
  assert.ok(numericValues.every(Number.isFinite));
  assert.doesNotMatch(JSON.stringify(payload), /null/);
});

test("serialized composition is deeply detached from internal state", () => {
  let state = moveLayer(createCookingState(), "patty", { x: 0.25, z: -0.5, yaw: 0.75 });
  state = addSauceStroke(state, {
    sauce: "mustard",
    layerId: "patty",
    amount: 0.5,
    points: [[-0.5, 0.5], [0.5, -0.5]],
  });

  const payload = serializeComposition(state);
  payload.layerOrder.reverse();
  payload.layerPoses.patty.x = 99;
  payload.strokes[0].amount = 99;
  payload.strokes[0].points[0][0] = 99;

  const freshPayload = serializeComposition(state);
  assert.deepEqual(freshPayload.layerOrder, BURGER_LAYER_IDS);
  assert.deepEqual(freshPayload.layerPoses.patty, { x: 0.25, z: -0.5, yaw: 0.75 });
  assert.deepEqual(freshPayload.strokes, [{
    sauce: "mustard",
    layerId: "patty",
    amount: 0.5,
    points: [[-0.5, 0.5], [0.5, -0.5]],
  }]);
});
