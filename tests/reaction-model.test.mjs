import test from "node:test";
import assert from "node:assert/strict";
import {
  REACTION_DURATION_MS,
  REACTION_PHASES,
  captionForPhase,
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

test("burst and recovery captions describe each primary reaction accurately", () => {
  const expectations = {
    chili: [/喷火/, /降温/],
    mustard: [/喷嚏/, /鼻子/],
    sour: [/酸/, /缓一缓/],
    sticky: [/黏/, /挣脱/],
  };

  for (const [primary, [burst, recover]] of Object.entries(expectations)) {
    const plan = { primary, primaryIntensity: 1, secondary: null, secondaryIntensity: 0 };
    assert.match(captionForPhase("burst", plan), burst);
    assert.match(captionForPhase("recover", plan), recover);
  }
  for (const primary of ["mustard", "sour", "sticky"]) {
    const plan = { primary, primaryIntensity: 1, secondary: null, secondaryIntensity: 0 };
    assert.doesNotMatch(captionForPhase("burst", plan), /辣|喷火|降温/);
    assert.doesNotMatch(captionForPhase("recover", plan), /辣|喷火|降温/);
  }
});

test("recovery caption consumes the secondary reaction as a readable follow-up", () => {
  const plan = {
    primary: "chili",
    primaryIntensity: 2,
    secondary: "mustard",
    secondaryIntensity: 1,
  };
  assert.match(captionForPhase("recover", plan), /还混了芥末/);
});

test("reaction phase definitions are deeply immutable", () => {
  assert.ok(Object.isFrozen(REACTION_PHASES), "phase collection should be frozen");
  for (const phase of REACTION_PHASES) {
    assert.ok(Object.isFrozen(phase), `${phase.name} phase should be frozen`);
  }
});

test("every phase starts at its exact boundary", () => {
  const expectedPhases = [
    ["notice", 0],
    ["reach", 180],
    ["lift", 520],
    ["bite", 1100],
    ["chew", 1350],
    ["brace", 1800],
    ["burst", 2050],
    ["recover", 2750],
    ["settle", 3600],
  ];

  expectedPhases.forEach(([name, at], index) => {
    assert.equal(phaseAt(at).name, name, `${name} should start at ${at}ms`);
    if (index > 0) {
      const previousName = expectedPhases[index - 1][0];
      assert.equal(
        phaseAt(at - 1).name,
        previousName,
        `${previousName} should remain active at ${at - 1}ms`,
      );
    }
  });
});
