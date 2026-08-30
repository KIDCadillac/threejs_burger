import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSushiFishGesture,
  SUSHI_FISH_TECHNIQUES,
  sushiMentorCue,
} from "../sushi-fish-techniques.mjs";

test("every fish breakdown task has a tool, direction and mentor lesson", () => {
  for (const taskId of [
    "scale-fish",
    "reserve-head-collar",
    "fillet-fish",
    "remove-pinbones",
    "skin-fillet",
    "slice-fillet",
  ]) {
    const technique = SUSHI_FISH_TECHNIQUES[taskId];
    assert.ok(technique.tool);
    assert.ok(technique.gesture.minDistance >= 38);
    assert.match(sushiMentorCue(taskId, "demo").message, /。/);
  }
});

test("knife direction and travel are both validated", () => {
  assert.equal(evaluateSushiFishGesture("scale-fish", { dx: -70, dy: 5 }).accepted, true);
  assert.equal(evaluateSushiFishGesture("scale-fish", { dx: 70, dy: 5 }).reason, "wrong-direction");
  assert.equal(evaluateSushiFishGesture("fillet-fish", { dx: 40, dy: 2 }).reason, "too-short");
  assert.equal(evaluateSushiFishGesture("slice-fillet", { dx: 3, dy: 60 }).accepted, true);
});

test("a repeated mistake triggers the chef's slow replay", () => {
  assert.equal(sushiMentorCue("skin-fillet", "error", 1).slowReplay, false);
  assert.equal(sushiMentorCue("skin-fillet", "error", 2).slowReplay, true);
});
