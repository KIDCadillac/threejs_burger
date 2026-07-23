import test from "node:test";
import assert from "node:assert/strict";
import { createBurgerShopStageAdapter } from "../app/static/burger-shop-stage-adapter.mjs";

function createStageHarness() {
  const calls = [];
  const state = Object.freeze({ assembledOrder: ["bun-bottom-1"] });
  return {
    calls,
    state,
    stage: {
      reset() { calls.push(["reset"]); return true; },
      replaceState(value) { calls.push(["replaceState", value]); return true; },
      setBurgerFocus(value) { calls.push(["setBurgerFocus", value]); return value; },
      setInteractionPaused(value) { calls.push(["setInteractionPaused", value]); return value; },
      getState() { calls.push(["getState"]); return state; },
      resetCamera() { calls.push(["resetCamera"]); return true; },
    },
  };
}

test("a fresh shop order resets, exits focus, and waits paused", () => {
  const { stage, calls, state } = createStageHarness();
  const adapter = createBurgerShopStageAdapter(stage);

  assert.equal(adapter.startOrder(), state);
  assert.deepEqual(calls, [
    ["setBurgerFocus", false],
    ["setInteractionPaused", true],
    ["reset"],
    ["getState"],
  ]);
});

test("a restored order replaces stage state without resetting it", () => {
  const { stage, calls, state } = createStageHarness();
  const adapter = createBurgerShopStageAdapter(stage);
  const restoredState = Object.freeze({ assembledOrder: ["saved-layer"] });

  assert.equal(adapter.startOrder({ restoredState }), state);
  assert.deepEqual(calls, [
    ["setBurgerFocus", false],
    ["setInteractionPaused", true],
    ["replaceState", restoredState],
    ["getState"],
  ]);
});

test("cooking activation and serving own the stage interaction lock", () => {
  const { stage, calls, state } = createStageHarness();
  const adapter = createBurgerShopStageAdapter(stage);

  assert.equal(adapter.setCooking(true), false);
  assert.equal(adapter.setCooking(false), true);
  assert.equal(adapter.serve(), state);
  assert.deepEqual(calls, [
    ["setInteractionPaused", false],
    ["setInteractionPaused", true],
    ["setBurgerFocus", false],
    ["setInteractionPaused", true],
    ["getState"],
  ]);
});

test("focus, camera reset, and state reads stay thin stage delegations", () => {
  const { stage, calls, state } = createStageHarness();
  const adapter = createBurgerShopStageAdapter(stage);

  assert.equal(adapter.focus(true), true);
  assert.equal(adapter.resetCamera(), true);
  assert.equal(adapter.getCookingState(), state);
  assert.deepEqual(calls, [
    ["setBurgerFocus", true],
    ["resetCamera"],
    ["getState"],
  ]);
});
