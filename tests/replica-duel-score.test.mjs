import test from "node:test";
import assert from "node:assert/strict";

import {
  alignReplicaLayers,
  scoreReplicaDuelRound,
  scoreSauceSimilarity,
} from "../app/static/replica-duel-score.mjs";

const layer = (ingredientId, x = 0, z = 0, yaw = 0) => ({
  ingredientId, x, z, yaw,
});

const layers = [
  layer("bottom-bun"),
  layer("patty"),
  layer("cheese"),
  layer("pickle"),
  layer("onion"),
  layer("lettuce"),
  layer("tomato"),
  layer("top-bun"),
];

const sauceStroke = ({
  sauceId = "ketchup",
  targetLayerIndex = 3,
  amount = 12,
  cells = ["1:1", "1:2", "2:2"],
} = {}) => ({ sauceId, targetLayerIndex, amount, cells });

const snapshot = ({
  nextLayers = layers,
  strokes = [sauceStroke()],
} = {}) => ({ layers: nextLayers, strokes });

const radii = Object.freeze(Object.fromEntries(
  layers.map(({ ingredientId }) => [ingredientId, 1]),
));

test("an exact replica scores 100 within 15 seconds and 90 at 45 seconds", () => {
  const target = snapshot();
  const fast = scoreReplicaDuelRound({
    target,
    replica: snapshot(),
    elapsedMs: 15_000,
    placementRadii: radii,
  });
  const timedOut = scoreReplicaDuelRound({
    target,
    replica: snapshot(),
    elapsedMs: 45_000,
    placementRadii: radii,
  });

  assert.equal(fast.rawScore, 100);
  assert.equal(fast.displayScore, 100);
  assert.deepEqual(fast.breakdown.display, {
    ingredients: 25,
    order: 40,
    sauce: 15,
    placement: 10,
    speed: 10,
  });
  assert.equal(timedOut.rawScore, 90);
  assert.equal(timedOut.breakdown.raw.speed, 0);
});

test("alignment is deterministic and only equal diagonal items form placement pairs", () => {
  const result = alignReplicaLayers(
    ["bottom-bun", "patty", "cheese", "top-bun"],
    ["bottom-bun", "cheese", "patty", "top-bun"],
  );

  assert.equal(result.distance, 2);
  assert.deepEqual(result.matches, [
    { targetIndex: 0, replicaIndex: 0, ingredientId: "bottom-bun" },
    { targetIndex: 3, replicaIndex: 3, ingredientId: "top-bun" },
  ]);
});

test("missing, extra, swapped, and empty replicas use the documented denominators", () => {
  const target = snapshot();
  const swappedLayers = [...layers];
  [swappedLayers[3], swappedLayers[4]] = [swappedLayers[4], swappedLayers[3]];
  const swapped = scoreReplicaDuelRound({
    target,
    replica: snapshot({ nextLayers: swappedLayers }),
    elapsedMs: 45_000,
    placementRadii: radii,
  });
  const missing = scoreReplicaDuelRound({
    target,
    replica: snapshot({ nextLayers: layers.slice(0, -1) }),
    elapsedMs: 45_000,
    placementRadii: radii,
  });
  const extra = scoreReplicaDuelRound({
    target,
    replica: snapshot({ nextLayers: [...layers, layer("patty")] }),
    elapsedMs: 45_000,
    placementRadii: radii,
  });
  const empty = scoreReplicaDuelRound({
    target,
    replica: snapshot({ nextLayers: [], strokes: [] }),
    elapsedMs: 45_000,
    placementRadii: radii,
  });

  assert.equal(swapped.breakdown.raw.ingredients, 25);
  assert.equal(swapped.breakdown.raw.order, 30);
  assert.equal(missing.breakdown.raw.ingredients, 21.875);
  assert.equal(missing.breakdown.raw.order, 35);
  assert.equal(extra.breakdown.raw.ingredients, 200 / 9);
  assert.equal(extra.breakdown.raw.order, 320 / 9);
  assert.equal(empty.breakdown.raw.ingredients, 0);
  assert.equal(empty.breakdown.raw.order, 0);
  assert.equal(empty.breakdown.raw.placement, 0);
});

test("sauce scoring combines group Jaccard, amount ratio, and coverage IoU", () => {
  const target = [
    sauceStroke(),
    sauceStroke({
      sauceId: "mustard",
      targetLayerIndex: 5,
      amount: 8,
      cells: ["0:0", "0:1"],
    }),
  ];
  const replica = [
    sauceStroke({ amount: 6, cells: ["1:1", "1:2"] }),
    sauceStroke({
      sauceId: "house-sauce",
      targetLayerIndex: 5,
      amount: 4,
      cells: ["0:0"],
    }),
  ];

  const result = scoreSauceSimilarity(target, replica);

  assert.equal(result.groupSet, 5 / 3);
  assert.equal(result.usage, 2.5);
  assert.ok(Math.abs(result.coverage - 10 / 3) < 1e-12);
  assert.ok(Math.abs(result.raw - 7.5) < 1e-12);
  assert.equal(scoreSauceSimilarity([], []).raw, 15);
  assert.equal(scoreSauceSimilarity(target, []).raw, 0);
});

test("placement scores horizontal distance and shortest yaw difference", () => {
  const replicaLayers = layers.map((entry) => ({ ...entry }));
  replicaLayers[1] = layer("patty", 0.175, 0, Math.PI / 12);
  const result = scoreReplicaDuelRound({
    target: snapshot({ strokes: [] }),
    replica: snapshot({ nextLayers: replicaLayers, strokes: [] }),
    elapsedMs: 45_000,
    placementRadii: radii,
  });

  // Seven perfect layers and one layer at half distance and half yaw credit.
  assert.equal(result.breakdown.raw.placement, 9.375);
});

test("speed is zero below 60 percent structural accuracy", () => {
  const result = scoreReplicaDuelRound({
    target: snapshot(),
    replica: snapshot({ nextLayers: [layer("bottom-bun")], strokes: [] }),
    elapsedMs: 1_000,
    placementRadii: radii,
  });

  assert.ok(result.breakdown.raw.accuracy < 54);
  assert.equal(result.breakdown.raw.speed, 0);
});
