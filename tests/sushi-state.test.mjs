import assert from "node:assert/strict";
import test from "node:test";

import {
  changeSushiStation,
  completeSushiService,
  createSushiState,
  gripSushi,
  performSushiFishPrep,
  placeSushiFish,
  plateSushi,
  portionSushiRice,
  resetSushiState,
  shapeSushiRice,
  startSushiService,
  sushiFishStage,
  sushiNextTask,
} from "../sushi-state.mjs";

function processedFishState() {
  let state = createSushiState();
  for (const actionId of [
    "scale-fish",
    "scale-fish",
    "scale-fish",
    "reserve-head-collar",
    "fillet-fish",
    "remove-pinbones",
    "remove-pinbones",
    "remove-pinbones",
    "skin-fillet",
    "slice-fillet",
    "slice-fillet",
  ]) {
    state = performSushiFishPrep(state, actionId).state;
  }
  return state;
}

function preparedState() {
  let state = processedFishState();
  state = portionSushiRice(state).state;
  return shapeSushiRice(state).state;
}

test("a whole fish is scaled in three separate strokes", () => {
  let state = createSushiState();
  assert.equal(state.station, "prep");
  assert.equal(sushiFishStage(state), "whole");
  for (let count = 1; count <= 3; count += 1) {
    const result = performSushiFishPrep(state, "scale-fish");
    assert.equal(result.accepted, true);
    assert.equal(result.actionCount, count);
    state = result.state;
  }
  assert.equal(sushiFishStage(state), "scaled");
  assert.equal(sushiNextTask(state), "reserve-head-collar");
});

test("head, collar, frame, pin bones and skin are preserved before slicing", () => {
  let state = createSushiState({ scaleStrokes: 3 });
  const skipped = performSushiFishPrep(state, "fillet-fish");
  assert.equal(skipped.accepted, false);
  assert.equal(skipped.expected, "reserve-head-collar");
  state = performSushiFishPrep(state, "reserve-head-collar").state;
  assert.equal(state.headCollarReserved, true);
  assert.equal(sushiFishStage(state), "headed");
  state = performSushiFishPrep(state, "fillet-fish").state;
  assert.equal(state.fishFrameReserved, true);
  assert.equal(sushiFishStage(state), "filleted");
  for (let count = 1; count <= 3; count += 1) {
    const bone = performSushiFishPrep(state, "remove-pinbones");
    assert.equal(bone.actionCount, count);
    state = bone.state;
  }
  assert.equal(sushiFishStage(state), "deboned");
  const skinned = performSushiFishPrep(state, "skin-fillet");
  assert.equal(skinned.byproduct, "salmon-skin");
  assert.equal(skinned.state.skinReserved, true);
  state = skinned.state;
  state = performSushiFishPrep(state, "slice-fillet").state;
  assert.equal(sushiFishStage(state), "skinned");
  const finalSlice = performSushiFishPrep(state, "slice-fillet");
  assert.equal(finalSlice.prepComplete, true);
  assert.equal(sushiFishStage(finalSlice.state), "sliced");
  assert.equal(sushiNextTask(finalSlice.state), "portion-rice");
});

test("rice must be portioned before it can be shaped", () => {
  let state = processedFishState();
  const tooEarly = shapeSushiRice(state);
  assert.equal(tooEarly.accepted, false);
  assert.equal(tooEarly.expected, "portion-rice");
  state = portionSushiRice(state).state;
  state = shapeSushiRice(state).state;
  assert.equal(state.riceShaped, true);
  assert.equal(state.phase, "assembling");
});

test("prepared food cannot assemble until the player moves to the next counter", () => {
  const state = preparedState();
  const wrongCounter = placeSushiFish(state);
  assert.equal(wrongCounter.accepted, false);
  assert.equal(wrongCounter.reason, "wrong-station");
  const assembly = changeSushiStation(state, "assembly");
  assert.equal(placeSushiFish(assembly).accepted, true);
});

test("fish placement, grip and plating form one ordered service loop", () => {
  let state = changeSushiStation(preparedState(), "assembly");
  state = placeSushiFish(state).state;
  assert.equal(sushiNextTask(state), "grip-sushi");
  state = gripSushi(state).state;
  assert.equal(sushiNextTask(state), "plate-sushi");
  const plated = plateSushi(state);
  assert.equal(plated.complete, true);
  assert.equal(plated.state.phase, "ready");
  assert.equal(sushiNextTask(plated.state), "serve");
});

test("service counts once and restores a new whole fish", () => {
  let state = changeSushiStation(preparedState(), "assembly");
  state = placeSushiFish(state).state;
  state = gripSushi(state).state;
  state = plateSushi(state).state;
  const serving = startSushiService(state);
  const next = completeSushiService(serving);
  assert.equal(next.servedCount, 1);
  assert.equal(next.station, "prep");
  assert.equal(sushiFishStage(next), "whole");
  assert.equal(next.ricePortioned, false);
  assert.equal(completeSushiService(next), next);
});

test("reset preserves the served counter but clears the current fish", () => {
  const state = processedFishState();
  const reset = resetSushiState({ ...state, servedCount: 2 });
  assert.equal(reset.servedCount, 2);
  assert.equal(sushiFishStage(reset), "whole");
  assert.equal(reset.riceShaped, false);
});
