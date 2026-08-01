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

test("ingredient hand follows the projected food position through release", () => {
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
        return 7;
      },
      clearTimeoutFn() {},
    },
  );

  performer.handleStageChange({
    reason: "selection",
    selectedLayerId: "pickle-1",
    state: { locations: { "pickle-1": { slotId: "filling-back-2" } } },
  });
  performer.handleIngredientGesture({
    phase: "start",
    gestureId: "ingredient-1",
    layerId: "pickle-1",
    position: { x: 0.42, y: 0.31 },
  });
  assert.equal(root.dataset.handState, "ingredient-hold");
  assert.equal(root.dataset.handSide, "left");
  assert.equal(styles.get("--hand-ingredient-x"), "42%");
  assert.equal(styles.get("--hand-ingredient-y"), "31%");

  performer.handleIngredientGesture({
    phase: "move",
    gestureId: "ingredient-1",
    layerId: "pickle-1",
    position: { x: 0.5, y: 0.52 },
  });
  performer.handleStageChange({ reason: "drop-layer" });
  assert.equal(root.dataset.handState, "ingredient-hold");
  assert.equal(styles.get("--hand-ingredient-x"), "50%");
  assert.equal(styles.get("--hand-ingredient-y"), "52%");

  performer.handleIngredientGesture({
    phase: "end",
    gestureId: "ingredient-1",
    layerId: "pickle-1",
    position: { x: 0.5, y: 0.52 },
  });
  assert.equal(root.dataset.handState, "ingredient-release");
  assert.equal(root.dataset.handSide, "left");
  scheduled();
  assert.equal(root.dataset.handState, "idle");
});

test("right-side ingredient keeps the anatomical right hand", () => {
  const root = {
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
  };
  const performer = createCookingFirstPersonHands(
    {
      body: { dataset: {} },
      querySelector(selector) {
        return selector === "#first-person-hands" ? root : null;
      },
    },
    { setTimeoutFn() {}, clearTimeoutFn() {} },
  );

  performer.handleStageChange({
    reason: "selection",
    selectedLayerId: "onion-1",
    state: { locations: { "onion-1": { slotId: "filling-back-3" } } },
  });
  performer.handleIngredientGesture({
    phase: "start",
    gestureId: "ingredient-2",
    layerId: "onion-1",
    position: { x: 0.61, y: 0.34 },
  });

  assert.equal(root.dataset.handState, "ingredient-hold");
  assert.equal(root.dataset.handSide, "right");
});

test("stage lifecycle boundaries clear an interrupted ingredient gesture", () => {
  const root = {
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
  };
  const performer = createCookingFirstPersonHands(
    {
      body: { dataset: {} },
      querySelector(selector) {
        return selector === "#first-person-hands" ? root : null;
      },
    },
    { setTimeoutFn() {}, clearTimeoutFn() {} },
  );

  performer.handleStageChange({
    reason: "selection",
    selectedLayerId: "patty-1",
    state: { locations: { "patty-1": { slotId: "filling-back-1" } } },
  });
  performer.handleIngredientGesture({
    phase: "start",
    gestureId: "ingredient-old",
    layerId: "patty-1",
    position: { x: 0.4, y: 0.4 },
  });
  assert.equal(root.dataset.handState, "ingredient-hold");

  performer.handleStageChange({ reason: "interaction-paused" });
  assert.equal(root.dataset.handState, "idle");
  assert.equal(root.dataset.handSide, "center");

  const lateMove = performer.handleIngredientGesture({
    phase: "move",
    gestureId: "ingredient-old",
    layerId: "patty-1",
    position: { x: 0.55, y: 0.55 },
  });
  const lateEnd = performer.handleIngredientGesture({
    phase: "end",
    gestureId: "ingredient-old",
    layerId: "patty-1",
    position: { x: 0.55, y: 0.55 },
  });
  assert.equal(lateMove, null);
  assert.equal(lateEnd, null);
  assert.equal(root.dataset.handState, "idle");

  const nextPose = performer.handleIngredientGesture({
    phase: "start",
    gestureId: "ingredient-new",
    layerId: "top-bun-1",
    position: { x: 0.6, y: 0.5 },
  });
  assert.equal(nextPose?.state, "ingredient-hold");
});

test("stage pause rejects late sauce events after the hand has been cleared", () => {
  const root = {
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
  };
  const performer = createCookingFirstPersonHands(
    {
      body: { dataset: {} },
      querySelector(selector) {
        return selector === "#first-person-hands" ? root : null;
      },
    },
    { setTimeoutFn() {}, clearTimeoutFn() {} },
  );

  performer.handleToolGesture({
    phase: "start",
    gestureId: "sauce-old",
    position: { x: 0.78, y: 0.35 },
  });
  performer.handleStageChange({ reason: "interaction-paused" });
  assert.equal(root.dataset.handState, "idle");
  assert.equal(performer.handleToolGesture({
    phase: "move",
    gestureId: "sauce-old",
    position: { x: 0.5, y: 0.4 },
  }), null);
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
