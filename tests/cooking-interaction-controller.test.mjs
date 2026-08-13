import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "../vendor/three.module.min.js";
import { createCookingInteractionController } from "../cooking-interaction-controller.mjs";

function createEventTarget(bounds = null) {
  const listeners = new Map();
  const capturedPointerIds = new Set();
  const releasedPointerIds = [];

  return {
    hidden: false,
    capturedPointerIds,
    releasedPointerIds,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    getBoundingClientRect() {
      return bounds ?? { left: 0, top: 0, width: 100, height: 100 };
    },
    setPointerCapture(pointerId) {
      capturedPointerIds.add(pointerId);
    },
    hasPointerCapture(pointerId) {
      return capturedPointerIds.has(pointerId);
    },
    releasePointerCapture(pointerId) {
      capturedPointerIds.delete(pointerId);
      releasedPointerIds.push(pointerId);
    },
  };
}

function pointerEvent(pointerId, clientX = 10, clientY = 10) {
  return {
    pointerId,
    clientX,
    clientY,
    preventDefault() {},
  };
}

function transformSnapshot(object) {
  return {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray(),
  };
}

function createIngredientHarness(overrides = {}) {
  const canvas = createEventTarget();
  const documentTarget = createEventTarget();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const ingredient = new THREE.Group();
  ingredient.position.set(1, 0, 2);
  ingredient.rotation.set(0.08, -0.12, 0.04);
  ingredient.scale.set(0.9, 1.1, 0.95);
  ingredient.updateMatrixWorld(true);

  const surface = new THREE.Object3D();
  surface.userData.cookingSelectable = {
    kind: "food-layer",
    food: "burger",
    layerId: "patty-1",
  };

  const ingredientGestures = [];
  const invalidEvents = [];
  const drops = [];
  let nextTimerId = 1;
  const timers = new Map();
  const setTimeoutFn = (callback, delay) => {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  };
  const clearTimeoutFn = (id) => timers.delete(id);
  const flushTimers = () => {
    while (timers.size) {
      const [id, timer] = [...timers.entries()]
        .sort((first, second) => first[1].delay - second[1].delay)[0];
      timers.delete(id);
      timer.callback();
    }
  };
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    draggables: [{ id: "patty-1", object: ingredient, surfaces: [surface] }],
    raycast: () => ({
      object: surface,
      point: new THREE.Vector3(1, 0, 2),
    }),
    projectToPrep: (event) => new THREE.Vector3(
      event.clientX / 10,
      0,
      event.clientY / 10,
    ),
    onIngredientGesture: (detail) => ingredientGestures.push(detail),
    onInvalid: (detail) => invalidEvents.push(detail),
    onDrop: (detail) => drops.push(detail),
    setTimeoutFn,
    clearTimeoutFn,
    ...overrides,
  });

  return {
    canvas,
    documentTarget,
    ingredient,
    ingredientGestures,
    invalidEvents,
    drops,
    flushTimers,
    controller,
  };
}

test("ingredient release keeps the real airborne pose until the stage starts settling", (t) => {
  const harness = createIngredientHarness({
    prepBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    resolveDrop: () => ({ valid: true, anchor: new THREE.Object3D() }),
  });
  t.after(() => harness.controller.dispose());

  harness.controller.pointerDown(pointerEvent(5, 10, 10));
  const planted = harness.ingredient.position.clone();
  harness.controller.pointerMove(pointerEvent(5, 15, 15));
  assert.deepEqual(harness.ingredient.position.toArray(), planted.toArray());
  assert.deepEqual(harness.ingredientGestures.map(({ phase }) => phase), ["reach"]);
  harness.flushTimers();
  harness.controller.pointerMove(pointerEvent(5, 25, 25));
  const beforeRelease = harness.ingredient.position.clone();
  harness.controller.pointerUp(pointerEvent(5, 30, 30));

  assert.equal(harness.drops.length, 1);
  assert.ok(harness.drops[0].releasePose.position.x > beforeRelease.x);
  assert.ok(harness.drops[0].releasePose.position.z > beforeRelease.z);
  assert.deepEqual(harness.ingredient.position.toArray(), [
    harness.drops[0].releasePose.position.x,
    harness.drops[0].releasePose.position.y,
    harness.drops[0].releasePose.position.z,
  ]);
  assert.notDeepEqual(harness.drops[0].targetPose.position, harness.drops[0].releasePose.position);
  assert.ok(harness.ingredientGestures.at(-1).worldPosition);
});

test("a deliberate fast drag keeps the visible grip phase before moving", (t) => {
  const phases = [];
  const harness = createIngredientHarness({
    prepBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    resolveDrop: () => ({ valid: true, anchor: new THREE.Object3D() }),
    onIngredientGesture: (detail) => phases.push(detail.phase),
  });
  t.after(() => harness.controller.dispose());
  const planted = harness.ingredient.position.clone();

  harness.controller.pointerDown(pointerEvent(6, 10, 10));
  assert.deepEqual(harness.ingredient.position.toArray(), planted.toArray());
  harness.controller.pointerMove(pointerEvent(6, 25, 25));

  assert.deepEqual(phases, ["reach", "grip"]);
  assert.deepEqual(harness.ingredient.position.toArray(), planted.toArray());

  harness.flushTimers();

  assert.deepEqual(phases, ["reach", "grip", "carry"]);
  assert.notDeepEqual(harness.ingredient.position.toArray(), planted.toArray());
});

test("a fast release waits for grip and then completes the cached drop", (t) => {
  const phases = [];
  const harness = createIngredientHarness({
    prepBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    resolveDrop: () => ({ valid: true, anchor: new THREE.Object3D() }),
    onIngredientGesture: (detail) => phases.push(detail.phase),
  });
  t.after(() => harness.controller.dispose());

  harness.controller.pointerDown(pointerEvent(16, 10, 10));
  harness.controller.pointerMove(pointerEvent(16, 25, 25));
  harness.controller.pointerUp(pointerEvent(16, 30, 30));

  assert.deepEqual(phases, ["reach", "grip"]);
  assert.equal(harness.drops.length, 0);
  harness.flushTimers();
  assert.deepEqual(phases, ["reach", "grip", "carry", "end"]);
  assert.equal(harness.drops.length, 1);
});

function createSauceHarness(overrides = {}) {
  const canvas = createEventTarget();
  const documentTarget = createEventTarget();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const previewRoot = new THREE.Group();
  const bottleRoot = new THREE.Group();
  const nozzleAnchor = new THREE.Object3D();
  bottleRoot.add(nozzleAnchor);
  previewRoot.add(bottleRoot);
  const bottleSurface = new THREE.Object3D();
  bottleSurface.userData.cookingSelectable = {
    kind: "condiment-bottle",
    sauce: "ketchup",
    slotId: "sauce-slot-1",
    id: "bottle-1",
  };
  const bottle = {
    id: "bottle-1",
    sauce: "ketchup",
    root: bottleRoot,
    nozzleAnchor,
    selectableSurfaces: [bottleSurface],
    homePose: {},
  };
  const foodSurface = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2));
  foodSurface.userData.cookingSelectable = {
    kind: "food-layer",
    food: "burger",
    layerId: "bottom-bun-1",
  };
  previewRoot.add(foodSurface);
  const pattySurface = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.8));
  pattySurface.userData.cookingSelectable = {
    kind: "food-layer",
    food: "burger",
    layerId: "patty-1",
  };
  previewRoot.add(pattySurface);
  previewRoot.updateMatrixWorld(true);

  const commits = [];
  const cancels = [];
  const toolGestures = [];
  const requestedSlots = [];
  const condimentTools = {
    previewRoot,
    selectableSurfaces: [bottleSurface],
    noRaycast() {},
    get: () => bottle,
    getBySlot: (slotId) => {
      requestedSlots.push(slotId);
      return slotId === "sauce-slot-1" ? bottle : null;
    },
    claimBottleForSauce: (sauceId) => (sauceId === "ketchup" ? bottle : null),
    setActive() {},
    setTilt() {},
    dock() {
      bottleRoot.position.set(0, 0, 0);
      bottleRoot.updateMatrixWorld(true);
    },
  };
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    condimentTools,
    directCondimentPickup: false,
    sauceIds: ["ketchup"],
    foodSurfaces: [foodSurface, pattySurface],
    selectableSurfaces: [foodSurface, pattySurface],
    projectToPrep: (event) => new THREE.Vector3(event.clientX / 100, 0, event.clientY / 100),
    raycast: ({ event, kind }) => (
      kind === "nozzle" && event.overBurger
        ? {
          object: event.layerId === "patty-1" ? pattySurface : foodSurface,
          point: new THREE.Vector3(0.2, 0.1, 0.1),
        }
        : null
    ),
    onSauceCommit: (detail) => commits.push(detail),
    onSauceCancel: (detail) => cancels.push(detail),
    onSauceTool: (detail) => toolGestures.push(detail),
    ...overrides,
  });
  return { canvas, controller, commits, cancels, toolGestures, requestedSlots };
}

test("Escape cancels an active ingredient gesture through the document listener", (t) => {
  const harness = createIngredientHarness();
  t.after(() => harness.controller.dispose());
  const initialTransform = transformSnapshot(harness.ingredient);
  const pointerId = 7;

  harness.controller.pointerDown(pointerEvent(pointerId));
  harness.flushTimers();
  harness.controller.rotateSelected(Math.PI / 4);

  assert.equal(harness.controller.getState(), "dragging-layer");
  assert.notDeepEqual(transformSnapshot(harness.ingredient), initialTransform);
  assert.deepEqual(
    harness.ingredientGestures.map(({ phase, reason = null }) => [phase, reason]),
    [["reach", null], ["grip", null], ["carry", null]],
  );

  let prevented = false;
  harness.documentTarget.dispatch("keydown", {
    key: "Escape",
    preventDefault() { prevented = true; },
  });

  assert.equal(prevented, true);
  assert.equal(harness.controller.getState(), "idle");
  assert.deepEqual(transformSnapshot(harness.ingredient), initialTransform);
  assert.equal(harness.canvas.capturedPointerIds.has(pointerId), false);
  assert.deepEqual(harness.canvas.releasedPointerIds, [pointerId]);
  assert.deepEqual(
    harness.ingredientGestures.map(({ phase, reason = null }) => [phase, reason]),
    [["reach", null], ["grip", null], ["carry", null], ["end", "escape"]],
  );
  assert.equal(harness.invalidEvents.at(-1)?.reason, "escape");
});

test("pause cancels the gesture, blocks new picks, and resume starts a new gesture", (t) => {
  const harness = createIngredientHarness();
  t.after(() => harness.controller.dispose());
  const initialTransform = transformSnapshot(harness.ingredient);
  const firstPointerId = 11;

  harness.controller.pointerDown(pointerEvent(firstPointerId));
  harness.flushTimers();
  harness.controller.rotateSelected(-Math.PI / 5);
  harness.controller.pause();

  assert.equal(harness.controller.getState(), "idle");
  assert.deepEqual(transformSnapshot(harness.ingredient), initialTransform);
  assert.equal(harness.canvas.capturedPointerIds.has(firstPointerId), false);
  assert.deepEqual(harness.canvas.releasedPointerIds, [firstPointerId]);
  assert.deepEqual(
    harness.ingredientGestures.map(({ phase, reason = null }) => [phase, reason]),
    [["reach", null], ["grip", null], ["carry", null], ["end", "paused"]],
  );
  assert.equal(harness.invalidEvents.at(-1)?.reason, "paused");

  const blockedPointerId = 12;
  harness.controller.pointerDown(pointerEvent(blockedPointerId, 20, 20));
  assert.equal(harness.controller.getState(), "idle");
  assert.equal(harness.canvas.capturedPointerIds.has(blockedPointerId), false);
  assert.equal(harness.ingredientGestures.length, 4);

  harness.controller.resume();
  harness.controller.pointerDown(pointerEvent(blockedPointerId, 20, 20));

  assert.equal(harness.controller.getState(), "dragging-layer");
  assert.equal(harness.canvas.capturedPointerIds.has(blockedPointerId), true);
  assert.equal(harness.ingredientGestures.at(-1)?.phase, "reach");
  assert.equal(harness.ingredientGestures.at(-1)?.gestureId, "ingredient-2");
});

test("capsule sauce commits only when the final release is over the burger", (t) => {
  const harness = createSauceHarness();
  t.after(() => harness.controller.dispose());

  assert.equal(harness.controller.beginSauceGesture("ketchup", pointerEvent(21, 50, 90)), true);
  harness.controller.pointerMove({ ...pointerEvent(21, 50, 45), overBurger: true });
  const outcome = harness.controller.pointerUp({ ...pointerEvent(21, 10, 10), overBurger: false });

  assert.deepEqual(outcome, {
    handled: true,
    committed: false,
    reason: "release-outside-burger",
    gestureId: "sauce-1",
    sauce: "ketchup",
    strokeCount: 1,
  });
  assert.equal(harness.commits.length, 0);
  assert.equal(harness.cancels.at(-1)?.reason, "release-outside-burger");
});

test("rack pickup resolves the physical condiment by slot instead of by sauce", (t) => {
  const harness = createSauceHarness();
  t.after(() => harness.controller.dispose());
  harness.requestedSlots.length = 0;

  assert.equal(
    harness.controller.beginCondimentSlotGesture(
      "sauce-slot-1",
      pointerEvent(25, 50, 90),
    ),
    true,
  );
  assert.deepEqual(harness.requestedSlots, ["sauce-slot-1"]);
  assert.equal(harness.toolGestures.at(-1)?.phase, "start");
  harness.controller.cancelActiveGesture("test-finished");

  assert.equal(
    harness.controller.beginCondimentSlotGesture(
      "missing-slot",
      pointerEvent(26, 50, 90),
    ),
    false,
  );
  assert.deepEqual(harness.requestedSlots, ["sauce-slot-1", "missing-slot"]);
});

test("a single-point sauce contact becomes a small committed dab on release", (t) => {
  const harness = createSauceHarness();
  t.after(() => harness.controller.dispose());

  assert.equal(harness.controller.beginSauceGesture("ketchup", pointerEvent(22, 50, 90)), true);
  const outcome = harness.controller.pointerUp({ ...pointerEvent(22, 50, 45), overBurger: true });

  assert.equal(outcome.committed, true);
  assert.equal(outcome.strokeCount, 1);
  assert.equal(harness.commits.length, 1);
  assert.equal(harness.commits[0].strokes[0].points.length, 2);
  assert.deepEqual(
    harness.toolGestures.map(({ phase }) => phase),
    ["start", "move", "end"],
  );
  assert.equal(harness.toolGestures[0].squeezing, false);
  assert.equal(harness.toolGestures[1].squeezing, true);
  assert.ok(harness.toolGestures[1].pressure > 0);
  assert.equal(harness.toolGestures[2].squeezing, false);
  assert.ok(Math.abs(harness.toolGestures.at(-1).position.x - 0.5) < 1e-9);
  assert.ok(Math.abs(harness.toolGestures.at(-1).position.y - 0.5) < 1e-9);
});

test("final sauce release layer discards lower-layer contact from the pickup path", (t) => {
  const harness = createSauceHarness();
  t.after(() => harness.controller.dispose());

  assert.equal(harness.controller.beginSauceGesture("ketchup", pointerEvent(24, 50, 90)), true);
  harness.controller.pointerMove({
    ...pointerEvent(24, 50, 55),
    overBurger: true,
    layerId: "bottom-bun-1",
  });
  const outcome = harness.controller.pointerUp({
    ...pointerEvent(24, 50, 45),
    overBurger: true,
    layerId: "patty-1",
  });

  assert.equal(outcome.committed, true);
  assert.equal(outcome.strokeCount, 1);
  assert.deepEqual(
    harness.commits[0].strokes.map(({ layerId }) => layerId),
    ["patty-1"],
  );
});

test("a throwing sauce cancel callback cannot leave the controller stuck", (t) => {
  const harness = createSauceHarness({
    onSauceCancel() { throw new Error("cancel callback failed"); },
  });
  t.after(() => harness.controller.dispose());

  assert.equal(harness.controller.beginSauceGesture("ketchup", pointerEvent(23, 50, 90)), true);
  assert.throws(
    () => harness.controller.cancelActiveGesture("escape"),
    /cancel callback failed/,
  );
  assert.equal(harness.controller.getState(), "idle");
});

test("camera lock ignores one-finger orbit and two-finger pinch zoom", (t) => {
  const canvas = createEventTarget();
  const documentTarget = createEventTarget();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    raycast: () => null,
  });
  t.after(() => controller.dispose());
  controller.setOrbitEnabled(false);
  const before = transformSnapshot(camera);

  controller.pointerDown(pointerEvent(31, 20, 20));
  controller.pointerMove(pointerEvent(31, 80, 60));
  controller.pointerDown(pointerEvent(32, 30, 30));
  controller.pointerMove(pointerEvent(31, 5, 5));
  controller.pointerMove(pointerEvent(32, 95, 95));
  controller.pointerUp(pointerEvent(31, 5, 5));
  controller.pointerUp(pointerEvent(32, 95, 95));

  assert.deepEqual(transformSnapshot(camera), before);
  assert.equal(controller.isOrbitEnabled(), false);
  assert.equal(controller.isPinchZoomEnabled(), false);
});
