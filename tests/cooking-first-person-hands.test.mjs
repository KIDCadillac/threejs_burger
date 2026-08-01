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

test("sauce hand stays attached for the full bottle gesture", () => {
  const styles = new Map();
  const root = {
    dataset: {},
    style: {
      setProperty(key, value) { styles.set(key, value); },
      removeProperty(key) { styles.delete(key); },
    },
  };
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
        return 5;
      },
      clearTimeoutFn() {},
    },
  );

  performer.handleToolGesture({
    phase: "start",
    gestureId: "sauce-1",
    position: { x: 0.72, y: 0.34 },
  });
  assert.equal(root.dataset.handState, "sauce-hold");
  assert.equal(root.dataset.handSide, "right");
  assert.equal(styles.get("--hand-tool-x"), "72%");
  assert.equal(styles.get("--hand-tool-y"), "34%");

  performer.handleToolGesture({
    phase: "move",
    gestureId: "sauce-1",
    position: { x: 0.5, y: 0.27 },
  });
  performer.handleStageChange({ reason: "sauce-gesture" });
  assert.equal(root.dataset.handState, "sauce-hold");
  assert.equal(styles.get("--hand-tool-x"), "50%");
  assert.equal(styles.get("--hand-tool-y"), "27%");

  performer.handleToolGesture({
    phase: "end",
    gestureId: "sauce-1",
    position: { x: 0.5, y: 0.27 },
  });
  assert.equal(root.dataset.handState, "sauce-release");
  scheduled();
  assert.equal(root.dataset.handState, "idle");
});

test("debug hand preview keeps the requested anatomical side visible", () => {
  const root = { dataset: {} };
  const body = { dataset: { debug: "true" } };
  const performer = createCookingFirstPersonHands(
    {
      body,
      querySelector(selector) {
        return selector === "#first-person-hands" ? root : null;
      },
    },
    {
      windowTarget: { location: { search: "?debug=1&handPreview=left" } },
      setTimeoutFn() {},
      clearTimeoutFn() {},
    },
  );

  assert.equal(root.dataset.handState, "reach");
  assert.equal(root.dataset.handSide, "left");
  performer.handleStageChange({ reason: "ready" });
  assert.equal(root.dataset.handState, "reach");
  assert.equal(root.dataset.handSide, "left");
});

test("debug sauce preview locks the hand over the condiment station", () => {
  const styles = new Map();
  const root = {
    dataset: {},
    style: { setProperty(key, value) { styles.set(key, value); } },
  };
  const performer = createCookingFirstPersonHands(
    {
      body: { dataset: { debug: "true" } },
      querySelector(selector) {
        return selector === "#first-person-hands" ? root : null;
      },
    },
    {
      windowTarget: { location: { search: "?debug=1&handPreview=sauce" } },
      setTimeoutFn() {},
      clearTimeoutFn() {},
    },
  );

  assert.equal(root.dataset.handState, "sauce-hold");
  assert.equal(root.dataset.handSide, "right");
  assert.equal(styles.get("--hand-tool-x"), "79%");
  assert.equal(styles.get("--hand-tool-y"), "43%");
  performer.handleStageChange({ reason: "ready" });
  assert.equal(root.dataset.handState, "sauce-hold");
});
