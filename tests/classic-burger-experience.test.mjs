import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIC_BURGER_SETTLEMENTS_KEY,
  evaluateClassicBurger,
  loadClassicBurgerAttempt,
  recordClassicBurgerMistake,
  scoreClassicBurgerAttempt,
  settleClassicBurgerAttempt,
  startClassicBurgerAttempt,
  validateClassicTransition,
} from "../classic-burger-experience.mjs";
import { BURGER_RECIPES } from "../burger-recipes.mjs";
import { HOME_PROGRESS_KEY } from "../home-lobby-state.mjs";

const recipe = BURGER_RECIPES.find(({ id }) => id === "classic-beef");

function state(layerTypes = [], strokes = []) {
  const assembledOrder = layerTypes.map((_, index) => `layer-${index + 1}`);
  return {
    assembledOrder,
    instances: Object.fromEntries(assembledOrder.map((id, index) => [id, layerTypes[index]])),
    strokes,
  };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("classic order counts the sauce as a real sixth step", () => {
  const empty = evaluateClassicBurger(recipe, state());
  assert.equal(empty.completedSteps, 0);
  assert.equal(empty.targetSteps, 6);
  assert.equal(empty.nextStep.ingredientId, "bottom-bun");

  const beforeSauce = evaluateClassicBurger(recipe, state(["bottom-bun", "patty"]));
  assert.equal(beforeSauce.completedSteps, 2);
  assert.equal(beforeSauce.nextStep.kind, "sauce");
  assert.equal(beforeSauce.actualTargetLayerId, "layer-2");
  assert.match(beforeSauce.instruction, /番茄酱.*牛肉饼/);
});
test("classic order completes only with exact layers and ketchup on the patty", () => {
  const correct = state(
    ["bottom-bun", "patty", "pickle", "onion", "top-bun"],
    [{ sauce: "ketchup", layerId: "layer-2" }],
  );
  const evaluation = evaluateClassicBurger(recipe, correct);
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.completedSteps, 6);

  const wrongTarget = evaluateClassicBurger(recipe, {
    ...correct,
    strokes: [{ sauce: "ketchup", layerId: "layer-1" }],
  });
  assert.equal(wrongTarget.complete, false);
  assert.equal(wrongTarget.compatible, false);
});

test("transition validation rejects a wrong layer and a wrong sauce target", () => {
  const base = state(["bottom-bun", "patty"]);
  const wrongLayer = validateClassicTransition(
    recipe,
    base,
    state(["bottom-bun", "patty", "pickle"]),
    "drop-layer",
  );
  assert.equal(wrongLayer.valid, false);
  assert.match(wrongLayer.message, /先挤番茄酱/);

  const wrongSauce = validateClassicTransition(
    recipe,
    base,
    state(["bottom-bun", "patty"], [{ sauce: "ketchup", layerId: "layer-1" }]),
    "sauce-stroke",
  );
  assert.equal(wrongSauce.valid, false);
  assert.match(wrongSauce.message, /牛肉饼/);
});

test("attempt scoring records mistakes without rewarding speed pressure", () => {
  const storage = memoryStorage();
  let attempt = startClassicBurgerAttempt({ storage, now: 1_000, random: 0.25 });
  attempt = recordClassicBurgerMistake(attempt, { storage });
  const restored = loadClassicBurgerAttempt({ storage, now: 5_000, random: 0.5 });
  const result = scoreClassicBurgerAttempt(restored, { now: 61_000 });

  assert.equal(result.mistakes, 1);
  assert.equal(result.score, 92);
  assert.equal(result.coins, 90);
  assert.equal(result.elapsedMs, 60_000);
});

test("settlement credits the home balance exactly once per attempt", () => {
  const storage = memoryStorage({
    [HOME_PROGRESS_KEY]: JSON.stringify({ energy: 5, coins: 1740, streak: 0, lastClaimDay: "" }),
  });
  const attempt = startClassicBurgerAttempt({ storage, now: 1_000, random: 0.5 });
  const result = scoreClassicBurgerAttempt(attempt, { now: 10_000 });
  const first = settleClassicBurgerAttempt(attempt, result, { storage, now: 10_000 });
  const second = settleClassicBurgerAttempt(attempt, result, { storage, now: 11_000 });

  assert.equal(first.awarded, true);
  assert.equal(first.totalCoins, 1860);
  assert.equal(second.awarded, false);
  assert.equal(JSON.parse(storage.getItem(HOME_PROGRESS_KEY)).coins, 1860);
  assert.equal(JSON.parse(storage.getItem(CLASSIC_BURGER_SETTLEMENTS_KEY)).length, 1);

  const nextAttempt = startClassicBurgerAttempt({ storage, now: 12_000, random: 0.75 });
  const third = settleClassicBurgerAttempt(nextAttempt, result, { storage, now: 13_000 });
  assert.equal(third.awarded, true);
  assert.equal(JSON.parse(storage.getItem(HOME_PROGRESS_KEY)).coins, 1980);
});
