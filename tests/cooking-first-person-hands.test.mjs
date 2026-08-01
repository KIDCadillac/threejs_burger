import assert from "node:assert/strict";
import test from "node:test";

import {
  createCookingFirstPersonHands,
  firstPersonHandPoseForStageChange,
} from "../cooking-first-person-hands.mjs";

test("first-person hand reaches from the ingredient side and carries toward prep", () => {
  const detail = {
    selectedLayerId: "bottom-bun-1",
    state: { locations: { "bottom-bun-1": { slotId: "bread-left-1" } } },
  };
  assert.deepEqual(
    firstPersonHandPoseForStageChange({ ...detail, reason: "selection" }),
    { state: "reach", side: "left", settleAfter: 0 },
  );
  assert.deepEqual(
    firstPersonHandPoseForStageChange({
      ...detail,
      reason: "drop-intent",
      dropIntent: { kind: "prep" },
    }),
    { state: "carry", side: "left", settleAfter: 0 },
  );
});

test("first-person hand uses a right-hand squeeze pose for sauce", () => {
  assert.deepEqual(
    firstPersonHandPoseForStageChange({ reason: "sauce-gesture" }),
    { state: "squeeze", side: "right", settleAfter: 420 },
  );
});

test("first-person hand performer settles one-shot placement", () => {
  const root = { dataset: {} };
  const body = { dataset: {} };
  let scheduled = null;
  const performer = createCookingFirstPersonHands(
    {
      body,
      querySelector(selector) {
        return selector === "#first-person-hands" ? root : null;
      },
    },
    {
      setTimeoutFn(callback) {
        scheduled = callback;
        return 3;
      },
      clearTimeoutFn() {},
    },
  );

  performer.handleStageChange({ reason: "drop-layer" });
  assert.equal(root.dataset.handState, "place");
  assert.equal(body.dataset.cookingHandState, "place");
  scheduled();
  assert.equal(root.dataset.handState, "idle");
});
