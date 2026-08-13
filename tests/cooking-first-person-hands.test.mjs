import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "../vendor/three.module.min.js";
import { createCookingFirstPersonHands } from "../cooking-first-person-hands.mjs";

test("procedural cooking hands contain articulated geometry and no texture maps", () => {
  const scene = new THREE.Scene();
  const hands = createCookingFirstPersonHands(THREE, { parent: scene });

  assert.equal(scene.getObjectByName("procedural-cooking-hands-3d"), hands.root);
  assert.ok(scene.getObjectByName("procedural-left-glove"));
  assert.ok(scene.getObjectByName("procedural-right-glove"));
  assert.ok(scene.getObjectByName("left-thumb-joint"));
  assert.ok(scene.getObjectByName("right-finger-4-tip-joint"));
  assert.ok(scene.getObjectByName("left-glove-wrist"));
  assert.ok(scene.getObjectByName("left-chef-sleeve"));
  assert.ok(scene.getObjectByName("right-chef-sleeve"));
  assert.equal(scene.getObjectByName("left-wooden-forearm"), undefined);
  assert.ok(scene.getObjectByName("right-finger-1-joint-seam"));
  assert.ok(scene.getObjectByName("right-red-cuff"));
  assert.ok(scene.getObjectByName("left-thumb-joint").position.x > 0);
  assert.ok(scene.getObjectByName("right-thumb-joint").position.x < 0);
  assert.ok(scene.getObjectByName("left-finger-1-knuckle").position.x > 0);
  assert.ok(scene.getObjectByName("right-finger-1-knuckle").position.x < 0);
  hands.root.traverse((node) => {
    if (!node.material) return;
    assert.equal(node.material.map, null);
    assert.equal(node.material.userData.textureFree, true);
  });

  hands.dispose();
  assert.equal(hands.root.parent, null);
});

test("ingredient hand grips on the correct side and detaches at release", () => {
  const scene = new THREE.Scene();
  const food = new THREE.Group();
  food.position.set(-2, 1, 0);
  scene.add(food);
  scene.updateMatrixWorld(true);
  const hands = createCookingFirstPersonHands(THREE, { parent: scene });

  const reach = hands.handleIngredientGesture({
    phase: "reach",
    gestureId: "ingredient-1",
    layerId: "bottom-bun-1",
    ingredientId: "bottom-bun",
    slotId: "bread-left-1",
    worldPosition: { x: -2, y: 1, z: 0 },
  }, { object: food, ingredientId: "bottom-bun" });
  assert.deepEqual(reach, { mode: "reach", side: "left", gestureId: "ingredient-1" });
  assert.equal(hands.getDebugState().left.visible, true);
  assert.equal(hands.getDebugState().right.visible, false);
  assert.ok(hands.getDebugState().left.position.z > food.position.z);
  assert.equal(hands.getDebugState().left.poseId, "cradle");
  assert.ok(hands.getDebugState().left.isAboveObject);
  assert.ok(Math.abs(scene.getObjectByName("procedural-left-glove").rotation.x) > 0.7);

  hands.tick(48);
  assert.equal(hands.getDebugState().left.mode, "reach");
  hands.tick(100);
  hands.handleIngredientGesture({
    phase: "grip",
    gestureId: "ingredient-1",
    layerId: "bottom-bun-1",
    ingredientId: "bottom-bun",
    worldPosition: { x: -2, y: 1, z: 0 },
  }, { object: food, ingredientId: "bottom-bun" });
  assert.equal(hands.getDebugState().left.mode, "grip");
  hands.tick(170);
  hands.handleIngredientGesture({
    phase: "carry",
    gestureId: "ingredient-1",
    layerId: "bottom-bun-1",
    ingredientId: "bottom-bun",
    worldPosition: { x: -1, y: 1.2, z: 0 },
  }, { object: food, ingredientId: "bottom-bun" });
  assert.equal(hands.getDebugState().left.mode, "hold");
  hands.handleIngredientGesture({
    phase: "end",
    gestureId: "ingredient-1",
    layerId: "bottom-bun-1",
    ingredientId: "bottom-bun",
    reason: "pointer-up",
    worldPosition: { x: -0.2, y: 1.4, z: 0 },
  }, { object: food, ingredientId: "bottom-bun" });
  const releasePosition = hands.getDebugState().left.position;
  food.position.set(0, 0.45, 0);
  scene.updateMatrixWorld(true);
  hands.tick(260);
  const released = hands.getDebugState().left;
  assert.equal(released.visible, true);
  assert.equal(released.mode, "withdraw");
  assert.ok(released.position.y > releasePosition.y);
  assert.notEqual(released.position.x, food.position.x);

  hands.tick(510);
  assert.equal(hands.getDebugState().left.visible, false);
  hands.dispose();
});

test("actual station position selects left or right hand before slot fallback", () => {
  const scene = new THREE.Scene();
  const leftFood = new THREE.Group();
  const rightFood = new THREE.Group();
  leftFood.position.set(-1.7, 1, -3);
  rightFood.position.set(1.7, 1, -3);
  scene.add(leftFood, rightFood);
  const hands = createCookingFirstPersonHands(THREE, { parent: scene });

  const left = hands.handleIngredientGesture({
    phase: "reach",
    gestureId: "left-station",
    layerId: "patty-1",
    ingredientId: "patty",
    slotId: "filling-back-4",
    worldPosition: { x: -1.7, y: 1, z: -3 },
  }, { object: leftFood, ingredientId: "patty" });
  assert.equal(left.side, "left");
  hands.handleStageChange({ reason: "reset" });

  const right = hands.handleIngredientGesture({
    phase: "reach",
    gestureId: "right-station",
    layerId: "pickle-1",
    ingredientId: "pickle",
    slotId: "filling-back-1",
    worldPosition: { x: 1.7, y: 1, z: -3 },
  }, { object: rightFood, ingredientId: "pickle" });
  assert.equal(right.side, "right");
  assert.equal(hands.getDebugState().right.poseId, "precision-pinch");
  assert.equal(hands.getDebugState().left.visible, false);
  hands.dispose();
});

test("bun patty pickle onion and bottle use distinct grip poses above their props", () => {
  const scene = new THREE.Scene();
  const food = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.25, 12),
    new THREE.MeshBasicMaterial(),
  );
  food.position.set(-2, 1, 0);
  scene.add(food);
  const hands = createCookingFirstPersonHands(THREE, { parent: scene });
  const expected = new Map([
    ["bottom-bun", "cradle"],
    ["patty", "clamp"],
    ["pickle", "precision-pinch"],
    ["onion", "scoop-pinch"],
  ]);
  const signatures = new Set();
  let poseTime = 1000;

  for (const [ingredientId, poseId] of expected) {
    hands.handleStageChange({ reason: "reset" });
    hands.handleIngredientGesture({
      phase: "reach",
      gestureId: `pose-${ingredientId}`,
      layerId: `${ingredientId}-1`,
      ingredientId,
      slotId: "filling-back-1",
      worldPosition: { x: -2, y: 1, z: 0 },
    }, { object: food, ingredientId });
    hands.handleIngredientGesture({
      phase: "grip",
      gestureId: `pose-${ingredientId}`,
      layerId: `${ingredientId}-1`,
      ingredientId,
      worldPosition: { x: -2, y: 1, z: 0 },
    }, { object: food, ingredientId });
    poseTime += 100;
    hands.tick(poseTime);
    const state = hands.getDebugState().left;
    assert.equal(state.poseId, poseId);
    assert.equal(state.isAboveObject, true);
    signatures.add(state.fingerCurls.map(({ root }) => root.toFixed(3)).join(","));
  }
  assert.equal(signatures.size, expected.size);

  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, 1.2, 10),
    new THREE.MeshBasicMaterial(),
  );
  bottle.position.set(3, 1, 0);
  scene.add(bottle);
  hands.handleStageChange({ reason: "reset" });
  hands.handleToolGesture({
    phase: "start",
    gestureId: "bottle-pose",
    bottleId: "ketchup",
    worldPosition: { x: 3, y: 1, z: 0 },
  }, { object: bottle });
  assert.equal(hands.getDebugState().right.poseId, "bottle-wrap");
  assert.equal(hands.getDebugState().right.squeezeAmount, 0);

  hands.handleToolGesture({
    phase: "move",
    gestureId: "bottle-pose",
    bottleId: "ketchup",
    worldPosition: { x: 3, y: 1, z: 0 },
    squeezing: true,
    pressure: 0.8,
  }, { object: bottle });
  hands.tick(180);
  assert.ok(hands.getDebugState().right.squeezeAmount > 0.75);
  assert.equal(hands.getDebugState().right.isAboveObject, true);
  hands.dispose();
});

test("right condiment grip and lifecycle reset never revive a stale gesture", () => {
  const scene = new THREE.Scene();
  const bottle = new THREE.Group();
  bottle.position.set(3, 1, 0);
  scene.add(bottle);
  const hands = createCookingFirstPersonHands(THREE, { parent: scene });

  hands.handleToolGesture({
    phase: "start",
    gestureId: "sauce-1",
    bottleId: "bottle-1",
    worldPosition: { x: 3, y: 1, z: 0 },
  }, { object: bottle });
  assert.equal(hands.getDebugState().right.mode, "sauce-hold");
  assert.equal(hands.getDebugState().left.visible, false);

  hands.handleStageChange({ reason: "interaction-paused" });
  assert.equal(hands.getDebugState().right.visible, false);
  assert.equal(hands.handleToolGesture({
    phase: "move",
    gestureId: "sauce-1",
    worldPosition: { x: 2, y: 1, z: 0 },
  }), null);
  assert.equal(hands.getDebugState().right.visible, false);
  hands.dispose();
});
