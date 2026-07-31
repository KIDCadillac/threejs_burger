import assert from "node:assert/strict";
import test from "node:test";

import {
  createCookingPuppetPerformer,
  puppetPoseForStageChange,
} from "../cooking-puppet-performer.mjs";
import {
  createDefaultWorkbenchLoadout,
  WORKBENCH_LOADOUT_STORAGE_KEY,
} from "../workbench-loadout.mjs";
import { SOLO_AUTOSAVE_STORAGE_KEY } from "../cooking-solo-autosave.mjs";

test("puppet reaches toward the ingredient home and carries it to prep", () => {
  const detail = {
    selectedLayerId: "bottom-bun-1",
    state: {
      locations: { "bottom-bun-1": { slotId: "bread-left-1" } },
    },
  };

  assert.deepEqual(
    puppetPoseForStageChange({ ...detail, reason: "selection" }),
    { state: "reach", side: "left", settleAfter: 0 },
  );
  assert.deepEqual(
    puppetPoseForStageChange({
      ...detail,
      reason: "drop-intent",
      dropIntent: { kind: "prep" },
    }),
    { state: "carry", side: "left", settleAfter: 0 },
  );
  assert.deepEqual(
    puppetPoseForStageChange({ ...detail, reason: "drop-layer" }),
    { state: "place", side: "left", settleAfter: 560 },
  );
});

test("puppet uses distinct error and serving poses", () => {
  assert.deepEqual(
    puppetPoseForStageChange({ reason: "invalid-drop" }),
    { state: "miss", side: "right", settleAfter: 520 },
  );
  assert.deepEqual(
    puppetPoseForStageChange({ reason: "finish" }),
    { state: "celebrate", side: "center", settleAfter: 0 },
  );
});

test("performer writes the visual state and settles one-shot poses", () => {
  const puppet = { dataset: {} };
  const body = { dataset: {} };
  let scheduled = null;
  const performer = createCookingPuppetPerformer(
    {
      body,
      querySelector(selector) {
        return selector === "#puppet-chef" ? puppet : null;
      },
    },
    {
      setTimeoutFn(callback) {
        scheduled = callback;
        return 7;
      },
      clearTimeoutFn() {},
    },
  );

  performer.handleStageChange({ reason: "drop-layer" });
  assert.equal(puppet.dataset.puppetState, "place");
  assert.equal(body.dataset.cookingPuppetState, "place");
  scheduled();
  assert.equal(puppet.dataset.puppetState, "idle");
  assert.equal(body.dataset.cookingPuppetState, "idle");
});

test("the fresh workbench contains every classic burger layer", () => {
  const loadout = Object.values(createDefaultWorkbenchLoadout());
  for (const ingredient of ["bottom-bun", "patty", "pickle", "onion", "top-bun"]) {
    assert.ok(loadout.includes(ingredient), `${ingredient} should be present`);
  }
  assert.match(WORKBENCH_LOADOUT_STORAGE_KEY, /:v2$/);
  assert.match(SOLO_AUTOSAVE_STORAGE_KEY, /:v3$/);
});
