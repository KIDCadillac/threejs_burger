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
  assert.ok(scene.getObjectByName("left-wooden-wrist-joint"));
  assert.ok(scene.getObjectByName("left-wooden-forearm"));
  assert.ok(scene.getObjectByName("right-finger-1-joint-seam"));
  assert.ok(scene.getObjectByName("right-red-cuff"));
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
  assert.ok(Math.abs(scene.getObjectByName("procedural-left-glove").rotation.x) > 1);
  assert.ok(Math.abs(scene.getObjectByName("procedural-left-glove").rotation.z) < 1e-9);

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
