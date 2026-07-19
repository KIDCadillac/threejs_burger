import test from "node:test";
import assert from "node:assert/strict";
import {
  REACTION_DURATION_MS,
  REACTION_PHASES,
  phaseAt,
  resolveReactionPlan,
} from "../app/static/reaction-model.mjs";

test("repeated chili becomes a stronger primary reaction", () => {
  assert.deepEqual(resolveReactionPlan(["chili", "chili", "chili"]), {
    primary: "chili",
    primaryIntensity: 3,
    secondary: null,
    secondaryIntensity: 0,
  });
});

test("mixed recipe keeps the strongest effect primary and one readable follow-up", () => {
  assert.deepEqual(resolveReactionPlan(["mustard", "chili", "chili", "sour"]), {
    primary: "chili",
    primaryIntensity: 2,
    secondary: "mustard",
    secondaryIntensity: 1,
  });
});

test("ties preserve the player's ingredient order", () => {
  assert.equal(resolveReactionPlan(["sour", "mustard"]).primary, "sour");
});

test("an empty recipe has no reaction plan", () => {
  assert.equal(resolveReactionPlan(), null);
  assert.equal(resolveReactionPlan([]), null);
});

test("the four-second sequence exposes named phases", () => {
  assert.equal(REACTION_DURATION_MS, 4000);
  assert.deepEqual(REACTION_PHASES.map(({ name }) => name), [
    "notice",
    "reach",
    "lift",
    "bite",
    "chew",
    "brace",
    "burst",
    "recover",
    "settle",
  ]);
  assert.equal(phaseAt(0).name, "notice");
  assert.equal(phaseAt(1150).name, "bite");
  assert.equal(phaseAt(2200).name, "burst");
  assert.equal(phaseAt(3900).name, "settle");
});

test("reaction phases use the exact animation start times", () => {
  assert.deepEqual(REACTION_PHASES.map(({ at }) => at), [
    0,
    180,
    520,
    1100,
    1350,
    1800,
    2050,
    2750,
    3600,
  ]);
});

test("every reaction phase has a non-empty Chinese caption", () => {
  for (const { name, caption } of REACTION_PHASES) {
    assert.equal(typeof caption, "string", `${name} caption should be a string`);
    assert.notEqual(caption.trim(), "", `${name} caption should not be empty`);
    assert.match(caption, /[\u3400-\u9fff]/, `${name} caption should contain Chinese text`);
  }
});
