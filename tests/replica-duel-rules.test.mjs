import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPETITION_MODEL_VERSION,
  createReplicaCompetitionSnapshot,
  createReplicaPublicSummary,
  validateReplicaOriginal,
} from "../app/static/replica-duel-rules.mjs";

const order = ["b0", "p0", "c0", "t0", "l0", "p1", "o0", "b1"];
const types = {
  b0: "bottom-bun",
  p0: "patty",
  c0: "cheese",
  t0: "tomato",
  l0: "lettuce",
  p1: "patty",
  o0: "onion",
  b1: "top-bun",
};

function soloState(overrides = {}) {
  return {
    assembledOrder: [...order],
    instances: { ...types },
    offsets: Object.fromEntries(order.map((id, index) => [id, { x: index / 20, z: -index / 40 }])),
    rotations: Object.fromEntries(order.map((id, index) => [id, index / 10])),
    strokes: [{
      sauce: "ketchup",
      layerId: "t0",
      amount: 0.5,
      points: [[-0.8, -0.8], [0, 0], [0.8, 0.8]],
    }],
    history: [{ shouldNotLeak: true }],
    stationContents: { filling1: "patty" },
    inventory: { patty: 998 },
    referenceRecipeId: "secret-answer",
    ...overrides,
  };
}

test("creates a deeply frozen competition snapshot without solo history or station answers", () => {
  const result = createReplicaCompetitionSnapshot(soloState(), {
    placementRadii: { patty: 1.2, cheese: 0.9 },
  });

  assert.equal(result.version, 1);
  assert.equal(result.modelVersion, COMPETITION_MODEL_VERSION);
  assert.equal(result.food, "burger");
  assert.equal(result.layers.length, 8);
  assert.deepEqual(result.layers[1], {
    layerId: "p0",
    ingredientId: "patty",
    x: 0.05,
    z: -0.025,
    yaw: 0.1,
    placementRadius: 1.2,
  });
  assert.equal(result.strokes[0].sauceId, "ketchup");
  assert.equal(result.strokes[0].targetLayerIndex, 3);
  assert.deepEqual(result.strokes[0].points[1], [0, 0]);
  assert.ok(result.strokes[0].cells.includes("3:3"));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.layers));
  assert.ok(Object.isFrozen(result.layers[0]));
  assert.ok(Object.isFrozen(result.strokes[0].points[0]));

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "history", "stationContents", "inventory", "referenceRecipeId", "locations",
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden));
});

test("accepts exactly eight layers with correct buns, three fillings, and sauce", () => {
  const snapshot = createReplicaCompetitionSnapshot(soloState());
  assert.deepEqual(validateReplicaOriginal(snapshot), {
    valid: true,
    code: "valid",
    message: "原作合格，可以交给对手复刻",
  });
});

test("reports every original validation failure with a stable code", () => {
  const valid = createReplicaCompetitionSnapshot(soloState());
  const withLayers = (layers) => ({ ...valid, layers });

  assert.equal(validateReplicaOriginal(withLayers(valid.layers.slice(0, 7))).code, "layer-count");
  assert.equal(validateReplicaOriginal(withLayers([
    { ...valid.layers[0], ingredientId: "patty" }, ...valid.layers.slice(1),
  ])).code, "bottom-bun");
  assert.equal(validateReplicaOriginal(withLayers([
    ...valid.layers.slice(0, -1),
    { ...valid.layers.at(-1), ingredientId: "patty" },
  ])).code, "top-bun");
  assert.equal(validateReplicaOriginal(withLayers([
    valid.layers[0],
    ...valid.layers.slice(1, 7).map((entry) => ({ ...entry, ingredientId: "patty" })),
    valid.layers[7],
  ])).code, "filling-variety");
  assert.equal(validateReplicaOriginal({ ...valid, strokes: [] }).code, "sauce-required");
});

test("public summary exposes progress but not ingredient order, poses, points, or layer ids", () => {
  const snapshot = createReplicaCompetitionSnapshot(soloState());
  const summary = createReplicaPublicSummary(snapshot);

  assert.deepEqual(summary, {
    version: 1,
    modelVersion: COMPETITION_MODEL_VERSION,
    layerCount: 8,
    sauceStrokeCount: 1,
    valid: true,
  });
  const serialized = JSON.stringify(summary);
  for (const secret of ["bottom-bun", "p0", "ingredientId", "points", "yaw"]) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
});

test("snapshot creation rejects sauce aimed at a layer outside the assembled burger", () => {
  assert.throws(
    () => createReplicaCompetitionSnapshot(soloState({
      strokes: [{
        sauce: "ketchup",
        layerId: "not-assembled",
        amount: 0.5,
        points: [[0, 0], [0.5, 0.5]],
      }],
    })),
    /assembled layer/,
  );
});
