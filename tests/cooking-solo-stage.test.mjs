import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { BURGER_LAYER_IDS } from "../app/static/cooking-state.mjs";
import { createCookingInteractionController } from "../app/static/cooking-interaction-controller.mjs";
import { createSoloCookingStage } from "../app/static/cooking-solo-stage.mjs";
import { MAX_SOLO_STACK_LAYERS, SOLO_INGREDIENT_STOCK } from "../app/static/cooking-solo-state.mjs";
import { createCookingWorkbench3D } from "../app/static/cooking-workbench-3d.mjs";
import { createBurgerModel3D } from "../app/static/burger-model-3d.mjs";
import { createCondimentTools3D } from "../app/static/condiment-tools-3d.mjs";

class FakeCanvas {
  constructor() {
    this.listeners = new Map();
    this.captured = new Set();
  }
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 640 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function createHostHarness() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 390 / 640, 0.1, 100);
  const callbacks = new Set();
  return {
    scene,
    camera,
    renderer: { shadowMap: {} },
    starts: 0,
    resets: 0,
    disposed: 0,
    start() { this.starts += 1; },
    resize() {},
    setVisible() {},
    onFrame(callback) { callbacks.add(callback); return () => callbacks.delete(callback); },
    onContextError() { return () => {}; },
    frame(time = 16) { for (const callback of callbacks) callback(time); },
    dispose() { this.disposed += 1; callbacks.clear(); },
  };
}

function harness(options = {}) {
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  let controllerCount = 0;
  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    hostFactory: () => host,
    controllerFactory: (configuration) => {
      controllerCount += 1;
      return createCookingInteractionController(configuration);
    },
    ...options,
  });
  return { canvas, host, stage, controllerCount };
}

const sampleStroke = (sauce, layerId = "patty") => ({
  sauce,
  layerId,
  amount: 0.45,
  points: [[-0.5, -0.2], [0.5, 0.2]],
});

function visibleLayerInterval(layer) {
  const bounds = layer.userData.selectableSurface.geometry.boundingBox;
  return {
    bottom: layer.position.y + bounds.min.y * layer.scale.y,
    top: layer.position.y + bounds.max.y * layer.scale.y,
  };
}

function readLayerTransform(layer) {
  return {
    position: layer.position.toArray(),
    rotation: layer.rotation.toArray(),
    scale: layer.scale.toArray(),
  };
}

class FakeVisibilityDocument {
  constructor() {
    this.visibilityState = "visible";
    this.listeners = new Map();
  }
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  hide() {
    this.visibilityState = "hidden";
    for (const callback of this.listeners.get("visibilitychange") ?? []) callback();
  }
}

function stageHarnessWithConfiguration(options = {}) {
  let configuration;
  const vibrations = [];
  const documentTarget = options.documentTarget ?? new FakeVisibilityDocument();
  const controller = {
    resetCamera: () => true,
    pause() {},
    resume() {},
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    documentTarget,
    hostFactory: createHostHarness,
    controllerFactory: (value) => { configuration = value; return controller; },
    vibrate: (pattern) => vibrations.push(pattern),
    ...options,
  });
  return { stage, configuration, vibrations, documentTarget };
}

function prepIntentPoints(stage) {
  const bounds = stage.workbench.getLayout().prep.bounds;
  const depth = bounds.maxZ - bounds.minZ;
  return {
    top: new THREE.Vector3(0, 0, bounds.minZ + depth * 0.25),
    bottom: new THREE.Vector3(0, 0, bounds.minZ + depth * 0.82),
  };
}

test("integrates one real Three scene, workbench, burger, bottles, and controller", () => {
  const { host, stage, controllerCount } = harness();

  assert.equal(controllerCount, 1);
  assert.equal(stage.host, host);
  assert.equal(stage.workbench.root.parent, host.scene);
  assert.equal(stage.burger.root.parent, stage.workbench.root);
  assert.equal(stage.tools.root.parent, stage.workbench.root);
  assert.ok(stage.workbench.root instanceof THREE.Group);
  assert.ok(stage.burger.getLayer("patty") instanceof THREE.Group);
  assert.ok(stage.tools.get("chili").root instanceof THREE.Group);
  assert.equal(host.starts, 1);
  stage.dispose();
});

test("keeps full cooking orbit while allowing low, high, and close food inspection", () => {
  let configuration;
  const controller = {
    resetCamera: () => true,
    pause() {},
    resume() {},
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    hostFactory: createHostHarness,
    controllerFactory: (options) => { configuration = options; return controller; },
  });

  assert.deepEqual(configuration.orbitLimits, {
    minYaw: -Math.PI,
    maxYaw: Math.PI,
    minPitch: -1.18,
    maxPitch: 1.56,
    minDistance: 5,
    maxDistance: 45,
    wrapYaw: true,
  });
  stage.dispose();
});

test("food focus shows only assembled burger layers and restores the full workbench and camera", () => {
  const changes = [];
  const { host, stage } = harness({ onChange: (detail) => changes.push(detail) });
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.dropLayer("patty", { kind: "prep" });
  const before = stage.controller.getCameraView();

  assert.equal(stage.toggleBurgerFocus(), true);
  assert.equal(stage.workbench.root.visible, false);
  assert.equal(stage.burger.root.parent, host.scene);
  assert.equal(stage.burger.getLayer("bottom-bun").visible, true);
  assert.equal(stage.burger.getLayer("patty").visible, true);
  assert.equal(stage.burger.getLayer("cheese").visible, false);
  assert.equal(changes.at(-1).focused, true);
  assert.notDeepEqual(stage.controller.getCameraView().target, before.target);

  assert.equal(stage.toggleBurgerFocus(), false);
  assert.equal(stage.workbench.root.visible, true);
  assert.equal(stage.burger.root.parent, stage.workbench.root);
  assert.ok(BURGER_LAYER_IDS.every((id) => stage.burger.getLayer(id).visible));
  const restored = stage.controller.getCameraView();
  assert.deepEqual(restored.target, before.target);
  assert.ok(new THREE.Vector3(...restored.position).distanceTo(new THREE.Vector3(...before.position)) < 1e-9);
  assert.equal(changes.at(-1).focused, false);
  stage.dispose();
});

test("resolves visible indexed gaps and a forgiving home drop intention", () => {
  let configuration;
  const changes = [];
  const controller = {
    resetCamera: () => true,
    pause() {},
    resume() {},
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    hostFactory: createHostHarness,
    controllerFactory: (options) => { configuration = options; return controller; },
    onChange: (detail) => changes.push(detail),
  });
  for (const id of ["bottom-bun", "patty", "cheese"]) {
    stage.dropLayer(id, { kind: "prep" });
  }
  const layout = stage.workbench.getLayout();
  const prep = layout.prep.bounds;
  const topZ = prep.minZ + 0.2;
  const bottomZ = prep.maxZ - 0.1;

  const leftTop = configuration.resolveDrop({
    id: "tomato", point: new THREE.Vector3(prep.minX + 0.2, 0, topZ),
  });
  const rightTop = configuration.resolveDrop({
    id: "tomato", point: new THREE.Vector3(prep.maxX - 0.2, 0, topZ),
  });
  const bottom = configuration.resolveDrop({
    id: "tomato", point: new THREE.Vector3(0, 0, bottomZ),
  });
  assert.equal(leftTop.targetIndex, 3);
  assert.equal(rightTop.targetIndex, 3, "left and right no longer change the layer order");
  assert.equal(bottom.targetIndex, 0);
  assert.equal(leftTop.anchor, stage.workbench.prep.dropAnchor);

  const home = layout.ingredients.find(({ id }) => id === "tomato");
  const homeReturn = configuration.resolveDrop({
    id: "tomato",
    point: new THREE.Vector3(home.bounds.maxX + 0.3, 0, home.position.z),
  });
  assert.equal(homeReturn.valid, true);
  assert.equal(homeReturn.anchor, stage.workbench.getStation("ingredient", "tomato").dropAnchor);

  changes.length = 0;
  configuration.onMove({
    id: "tomato", reason: "drag", point: { x: 0, y: 0, z: topZ },
    pose: { rotation: { y: 0 } },
  });
  assert.deepEqual(changes.at(-1).dropIntent, {
    kind: "prep", intent: "insert", id: "tomato", targetIndex: 3, slotCount: 4,
  });
  const unchangedCount = changes.length;
  configuration.onMove({
    id: "tomato", reason: "drag", point: { x: 0.1, y: 0, z: topZ },
    pose: { rotation: { y: 0 } },
  });
  assert.equal(changes.length, unchangedCount, "unchanged intent does not rerender every pointer move");
  configuration.onMove({
    id: "tomato", reason: "drag", point: { x: 0, y: 0, z: bottomZ },
    pose: { rotation: { y: 0 } },
  });
  assert.equal(changes.at(-1).dropIntent.intent, "insert");
  assert.equal(changes.at(-1).dropIntent.targetIndex, 0);

  configuration.onDrop({
    id: "tomato", anchor: stage.workbench.prep.dropAnchor, targetIndex: 0,
  });
  assert.equal(changes.at(-1).dropIntent, null);
  configuration.onMove({
    id: "tomato", reason: "drag",
    point: { x: home.bounds.maxX + 0.3, y: 0, z: home.position.z },
    pose: { rotation: { y: 0 } },
  });
  assert.equal(changes.at(-1).dropIntent.intent, "home");
  configuration.onInvalid({ reason: "outside-prep" });
  assert.equal(changes.at(-1).dropIntent, null);
  stage.dispose();
});

test("places seven actual independent layer groups into their matching U-shaped bins", () => {
  const { stage } = harness();

  assert.equal(stage.layerPresentationScale, 0.72);
  assert.equal(stage.binLayerScale, stage.layerPresentationScale);
  assert.equal(stage.prepLayerScale, stage.layerPresentationScale);
  for (const layerId of BURGER_LAYER_IDS) {
    const layer = stage.burger.getLayer(layerId);
    const station = stage.workbench.getStation("ingredient", layerId);
    const stationWorld = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
    const layerWorld = layer.getWorldPosition(new THREE.Vector3());
    assert.ok(layerWorld.distanceTo(stationWorld) < 0.35, layerId);
    assert.equal(layer.scale.x, stage.binLayerScale);
  }
  assert.deepEqual(stage.getState().assembledOrder, []);
  stage.dispose();
});

test("fills a tall phone with a larger prep board while keeping every control visible", () => {
  const { stage, host } = harness();
  host.camera.aspect = 390 / 608;
  host.camera.updateProjectionMatrix();
  host.camera.updateMatrixWorld(true);
  const layout = stage.workbench.getLayout();
  const prepLeft = new THREE.Vector3(layout.prep.bounds.minX, 0, 0).project(host.camera);
  const prepRight = new THREE.Vector3(layout.prep.bounds.maxX, 0, 0).project(host.camera);
  const prepPixels = (prepRight.x - prepLeft.x) * 390 / 2;
  assert.ok(prepPixels >= 210, `prep board is only ${prepPixels}px wide`);

  for (const station of [...layout.ingredients, ...layout.tools]) {
    for (const x of [station.bounds.minX, station.bounds.maxX]) {
      for (const y of [0, 1.5]) {
        for (const z of [station.bounds.minZ, station.bounds.maxZ]) {
          const point = new THREE.Vector3(x, y, z).project(host.camera);
          assert.ok(Math.abs(point.x) <= 1, `${station.id} is outside phone width`);
          assert.ok(Math.abs(point.y) <= 1, `${station.id} is outside phone height`);
        }
      }
    }
  }
  stage.dispose();
});

test("keeps one base food scale while plate snapping adds only a temporary local pop", () => {
  const { stage } = harness();
  const layer = stage.burger.getLayer("patty");
  const expected = [0.72, 0.72, 0.72];
  assert.deepEqual(layer.scale.toArray(), expected);

  stage.dropLayer("patty", { kind: "prep" });
  assert.deepEqual(layer.scale.toArray(), expected, "drop start does not resize the ingredient");
  stage.tick(95);
  assert.ok(layer.scale.x < expected[0], "ingredient begins smaller at its final layer");
  assert.equal(layer.scale.x, layer.scale.y);
  assert.equal(layer.scale.y, layer.scale.z);
  stage.tick(190);
  assert.ok(layer.scale.x > expected[0], "ingredient briefly overshoots during its pop");
  stage.tick(380);
  assert.deepEqual(layer.scale.toArray(), expected, "settled plate food returns to its base size");
  stage.dropLayer("patty", { kind: "bin" });
  stage.tick(620);
  assert.deepEqual(layer.scale.toArray(), expected, "returning home also preserves size");
  stage.dispose();
});

test("stacks all seven scaled layers in visible contact without cumulative air gaps", () => {
  const { stage } = harness({ reducedMotion: true });
  BURGER_LAYER_IDS.forEach((id) => stage.dropLayer(id, { kind: "prep" }));

  const intervals = stage.getState().assembledOrder.map((id) => (
    visibleLayerInterval(stage.burger.getLayer(id))
  ));
  for (let index = 1; index < intervals.length; index += 1) {
    const gap = intervals[index].bottom - intervals[index - 1].top;
    assert.ok(gap <= 1e-9, `layer ${index} must not float by ${gap}`);
    assert.ok(gap >= -0.12, `layer ${index} must not sink excessively by ${gap}`);
  }
  stage.dispose();
});

test("bun contact follows the shared footprint instead of only global bounding boxes", () => {
  const { stage } = harness({ reducedMotion: true });
  for (const layerId of ["bottom-bun", "patty", "top-bun"]) {
    stage.dropLayer(layerId, { kind: "prep" });
  }
  stage.burger.root.updateMatrixWorld(true);

  const surfaceY = (layerId, x, fromY, directionY) => {
    const layer = stage.burger.getLayer(layerId);
    const surface = layer.userData.selectableSurface;
    const previousSide = surface.material.side;
    surface.material.side = THREE.DoubleSide;
    const origin = layer.localToWorld(new THREE.Vector3(x, fromY, 0));
    const direction = new THREE.Vector3(0, directionY, 0)
      .transformDirection(layer.matrixWorld);
    const hit = new THREE.Raycaster(origin, direction, 0, 8)
      .intersectObject(surface, false)[0];
    surface.material.side = previousSide;
    assert.ok(hit, `${layerId} exposes a contact surface at x=${x}`);
    return hit.point.y;
  };

  for (const x of [0.95, 1.1]) {
    const bottomBunTop = surfaceY("bottom-bun", x, 2, -1);
    const pattyBottom = surfaceY("patty", x, -2, 1);
    assert.ok(
      pattyBottom - bottomBunTop <= 0.005,
      `bottom bun has an outer contact gap of ${pattyBottom - bottomBunTop} at x=${x}`,
    );

    const pattyTop = surfaceY("patty", x, 2, -1);
    const topBunBottom = surfaceY("top-bun", x, -2, 1);
    assert.ok(
      topBunBottom - pattyTop <= 0.005,
      `top bun has an outer contact gap of ${topBunBottom - pattyTop} at x=${x}`,
    );
  }
  stage.dispose();
});

test("held food highlights while indexed previews open only the required gap", () => {
  const { stage, configuration } = stageHarnessWithConfiguration();
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.tick(1000);
  const bun = stage.burger.getLayer("bottom-bun");
  const baseY = bun.position.y;

  configuration.onPick({ id: "patty" });
  assert.equal(stage.burger.selectionFeedback.parent, stage.burger.getLayer("patty"));
  const points = prepIntentPoints(stage);
  configuration.onMove({ id: "patty", reason: "drag", point: points.top });
  assert.equal(stage.workbench.dropCue.userData.targetIndex, 1);
  assert.equal(stage.burger.dropPreview.visible, true);
  assert.equal(stage.burger.dropPreview.userData.layerId, "patty");
  assert.equal(stage.burger.dropPreview.userData.targetIndex, 1);
  assert.equal(
    stage.burger.dropPreview.children[0].geometry,
    stage.burger.getLayer("patty").userData.selectableSurface.geometry,
  );
  const topPreviewY = stage.burger.dropPreview.position.y;
  assert.ok(topPreviewY > bun.position.y, "ghost shows the final top-layer result");
  assert.equal(bun.position.y, baseY);

  configuration.onMove({ id: "patty", reason: "drag", point: points.bottom });
  assert.equal(stage.workbench.dropCue.userData.targetIndex, 0);
  assert.equal(stage.burger.dropPreview.userData.targetIndex, 0);
  assert.ok(stage.burger.dropPreview.position.y < topPreviewY, "ghost follows the chosen gap");
  assert.ok(bun.position.y > baseY);

  configuration.onMove({
    id: "patty",
    reason: "drag",
    point: new THREE.Vector3(999, 0, 999),
  });
  assert.equal(stage.burger.dropPreview.visible, false, "invalid intent clears the target ghost");
  stage.dispose();
});

test("middle insertion opens only the upper stack and never moves bin ingredients", () => {
  const { stage, configuration } = stageHarnessWithConfiguration();
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.dropLayer("patty", { kind: "prep" });
  stage.tick(1000);

  const bottomBun = stage.burger.getLayer("bottom-bun");
  const patty = stage.burger.getLayer("patty");
  const bottomBefore = bottomBun.position.y;
  const pattyBefore = patty.position.y;
  const untouchedIds = ["tomato", "lettuce", "pickle", "top-bun"];
  const homes = new Map(untouchedIds.map((id) => (
    [id, readLayerTransform(stage.burger.getLayer(id))]
  )));

  configuration.onPick({ id: "cheese" });
  const prep = stage.workbench.getLayout().prep.bounds;
  configuration.onMove({
    id: "cheese",
    reason: "drag",
    point: new THREE.Vector3(0, 0, (prep.minZ + prep.maxZ) / 2),
  });

  assert.equal(stage.workbench.dropCue.userData.targetIndex, 1);
  assert.equal(bottomBun.position.y, bottomBefore, "lower layer stays authoritative");
  assert.ok(patty.position.y > pattyBefore, "upper layer opens the middle gap");
  for (const id of untouchedIds) {
    assert.deepEqual(readLayerTransform(stage.burger.getLayer(id)), homes.get(id), id);
  }

  configuration.onDrop({
    id: "cheese",
    anchor: stage.workbench.prep.dropAnchor,
    targetIndex: 1,
  });
  stage.tick(1070);
  assert.equal(bottomBun.position.y, bottomBefore, "lower layer remains still during insertion");
  assert.ok(patty.position.y > pattyBefore, "upper layer remains open during insertion");
  for (const id of untouchedIds) {
    assert.deepEqual(readLayerTransform(stage.burger.getLayer(id)), homes.get(id), id);
  }

  stage.tick(1380);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "cheese", "patty"]);
  for (const id of untouchedIds) {
    assert.deepEqual(readLayerTransform(stage.burger.getLayer(id)), homes.get(id), id);
  }
  stage.dispose();
});

test("top insertion scales from its contact plane and finishes at its exact target", () => {
  const { stage, configuration, vibrations } = stageHarnessWithConfiguration();
  const patty = stage.burger.getLayer("patty");
  const finalY = stage.workbench.prep.dropAnchor.position.y
    - patty.userData.boundsMinY * stage.layerPresentationScale;
  configuration.onPick({ id: "patty" });
  configuration.onDrop({ id: "patty", anchor: stage.workbench.prep.dropAnchor, targetIndex: 0 });
  stage.tick(290);
  stage.tick(320);
  const animatedBottom = patty.position.y + patty.userData.stackMinY * patty.scale.y;
  const settledBottom = finalY
    + patty.userData.stackMinY * stage.layerPresentationScale;
  assert.ok(
    Math.abs(animatedBottom - settledBottom) < 1e-9,
    "top layer keeps its lower contact planted while it scales",
  );
  stage.tick(380);
  assert.ok(Math.abs(patty.position.y - finalY) < 1e-9);
  assert.deepEqual(vibrations, [12]);
  stage.dispose();
});

test("bottom insertion lifts old layers while the new food pops at its target height", () => {
  const { stage, configuration } = stageHarnessWithConfiguration();
  stage.dropLayer("patty", { kind: "prep" });
  stage.tick(1000);
  const oldPattyY = stage.burger.getLayer("patty").position.y;
  configuration.onPick({ id: "bottom-bun" });
  configuration.onDrop({
    id: "bottom-bun",
    anchor: stage.workbench.prep.dropAnchor,
    targetIndex: 0,
  });
  stage.tick(1070);
  assert.ok(stage.burger.getLayer("patty").position.y > oldPattyY);
  const bottomBun = stage.burger.getLayer("bottom-bun");
  const finalBottomY = stage.workbench.prep.dropAnchor.position.y
    - bottomBun.userData.boundsMinY * stage.layerPresentationScale;
  stage.tick(1250);
  assert.ok(bottomBun.position.y >= finalBottomY, "new layer never travels through the stack");
  assert.notEqual(bottomBun.scale.x, stage.layerPresentationScale, "new layer is scaling locally");
  stage.tick(1380);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.ok(Math.abs(bottomBun.position.y - finalBottomY) < 1e-9);
  stage.dispose();
});

test("assembled contact planes overlap slightly so neither bun can float", () => {
  const { stage } = harness();
  for (const layerId of ["bottom-bun", "cheese", "lettuce", "top-bun"]) {
    stage.dropLayer(layerId, { kind: "prep" });
  }
  stage.tick(1000);

  const order = stage.getState().assembledOrder;
  for (let index = 1; index < order.length; index += 1) {
    const lower = stage.burger.getLayer(order[index - 1]);
    const upper = stage.burger.getLayer(order[index]);
    const lowerTop = lower.position.y
      + lower.userData.stackMaxY * stage.layerPresentationScale;
    const upperBottom = upper.position.y
      + upper.userData.stackMinY * stage.layerPresentationScale;
    assert.ok(
      upperBottom <= lowerTop + 1e-9,
      `${order[index]} rests on ${order[index - 1]} instead of floating`,
    );
    assert.ok(lowerTop - upperBottom <= 0.08, "contact overlap stays subtle");
  }

  const topBun = stage.burger.getLayer("top-bun");
  const lettuce = stage.burger.getLayer("lettuce");
  const bunBottom = topBun.position.y
    + topBun.userData.boundsMinY * stage.layerPresentationScale;
  const lettuceTop = lettuce.position.y
    + lettuce.userData.stackMaxY * stage.layerPresentationScale;
  assert.ok(bunBottom <= lettuceTop + 1e-9, "top bun has no visible air gap");
  stage.dispose();
});

test("insert pop scales from the food contact plane instead of lifting its bottom", () => {
  const { stage: settledStage } = harness({ reducedMotion: true });
  settledStage.dropLayer("bottom-bun", { kind: "prep" });
  settledStage.dropLayer("top-bun", { kind: "prep" });
  const settledUpper = settledStage.burger.getLayer("top-bun");
  const settledVisibleBottom = settledUpper.position.y
    + settledUpper.userData.boundsMinY * settledUpper.scale.y;
  settledStage.dispose();

  const { stage } = harness();
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.tick(380);
  stage.dropLayer("top-bun", { kind: "prep" });
  const lower = stage.burger.getLayer("bottom-bun");
  const upper = stage.burger.getLayer("top-bun");
  for (const time of [400, 430, 475, 520, 570, 620, 680, 740]) {
    stage.tick(time);
    const lowerTop = lower.position.y
      + lower.userData.stackMaxY * lower.scale.y;
    const upperBottom = upper.position.y
      + upper.userData.stackMinY * upper.scale.y;
    const animatedVisibleBottom = upper.position.y
      + upper.userData.boundsMinY * upper.scale.y;
    assert.ok(
      upperBottom <= lowerTop + 1e-9,
      `pop animation lifted the bun by ${upperBottom - lowerTop} at ${time}ms`,
    );
    assert.ok(
      animatedVisibleBottom <= settledVisibleBottom + 1e-9,
      `pop animation lifted the visible underside at ${time}ms`,
    );
  }
  stage.tick(760);
  const finalVisibleBottom = upper.position.y
    + upper.userData.boundsMinY * upper.scale.y;
  assert.ok(
    Math.abs(finalVisibleBottom - settledVisibleBottom) < 1e-9,
    "settled animation returns to the exact supported target",
  );
  stage.dispose();
});

test("home return bounces once and hidden pages clear temporary visuals", () => {
  const { stage, configuration, documentTarget } = stageHarnessWithConfiguration();
  stage.dropLayer("patty", { kind: "prep" });
  stage.tick(1000);
  configuration.onPick({ id: "patty" });
  const station = stage.workbench.getStation("ingredient", "patty");
  configuration.onDrop({ id: "patty", anchor: station.dropAnchor, targetIndex: null });
  stage.tick(1168);
  const target = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
  const bouncing = stage.burger.getLayer("patty").getWorldPosition(new THREE.Vector3());
  assert.notEqual(bouncing.y, target.y, "home motion visibly compresses before settling");
  documentTarget.hide();
  assert.equal(stage.burger.selectionFeedback.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  const actual = stage.burger.getLayer("patty").getWorldPosition(new THREE.Vector3());
  assert.ok(actual.distanceTo(target) < 1e-9);
  stage.dispose();
});

test("programmatic drops assemble, reinsert, remove, and rotate the visible 3d stack", () => {
  const { stage } = harness();
  stage.dropLayer("patty", { kind: "prep" });
  stage.dropLayer("cheese", { kind: "prep" });
  stage.dropLayer("bottom-bun", { kind: "prep", targetIndex: 0 });
  stage.dropLayer("patty", { kind: "prep", targetIndex: 2 });
  stage.tick(1000);

  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "cheese", "patty"]);
  assert.equal(stage.burger.getLayer("bottom-bun").position.x, 0);
  assert.ok(stage.burger.getLayer("cheese").position.y > stage.burger.getLayer("bottom-bun").position.y);
  assert.ok(stage.burger.getLayer("patty").position.y > stage.burger.getLayer("cheese").position.y);

  stage.selectLayer("patty");
  assert.equal(stage.rotateSelected(Math.PI / 4), true);
  assert.ok(Math.abs(stage.burger.getLayer("patty").rotation.y - Math.PI / 4) < 1e-9);
  stage.dropLayer("cheese", { kind: "bin" });
  stage.tick(2000);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.equal(stage.getState().locations.cheese.kind, "bin");
  stage.dispose();
});

test("replenishes bins, stacks twenty repeated portions in contact, and expands the camera", () => {
  const { stage } = harness();
  const initialView = stage.controller.getCameraView();

  for (let index = 0; index < MAX_SOLO_STACK_LAYERS; index += 1) {
    const sourceId = stage.getState().binSources.patty;
    assert.equal(stage.dropLayer(sourceId, { kind: "prep" }), true);
    stage.tick((index + 1) * 500);
  }

  const state = stage.getState();
  assert.equal(state.assembledOrder.length, 20);
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK - 20);
  assert.equal(stage.burger.layers.size, BURGER_LAYER_IDS.length + 20);
  const intervals = state.assembledOrder.map((id) => visibleLayerInterval(stage.burger.getLayer(id)));
  for (let index = 1; index < intervals.length; index += 1) {
    assert.ok(Math.abs(intervals[index].bottom - intervals[index - 1].top) < 0.08);
  }
  const grownView = stage.controller.getCameraView();
  assert.ok(grownView.target.y > initialView.target.y + 1);
  assert.ok(grownView.distance > initialView.distance);
  assert.equal(
    stage.dropLayer(state.binSources.patty, { kind: "prep" }),
    false,
    "the twenty-first layer is rejected without disturbing the stack",
  );
  assert.equal(stage.getState().assembledOrder.length, 20);
  stage.dispose();
});

test("an immediate toolbar rotation cancels the selected layer snap transition", () => {
  const { stage } = harness();
  stage.selectLayer("patty");
  stage.dropLayer("patty", { kind: "prep" });
  stage.rotateSelected(Math.PI / 3);

  stage.tick(95);
  assert.ok(Math.abs(stage.burger.getLayer("patty").rotation.y - Math.PI / 3) < 1e-9);
  assert.ok(Math.abs(stage.getState().rotations.patty - Math.PI / 3) < 1e-9);
  stage.dispose();
});

test("a quick drag cancels an older transition before the next animation frame", () => {
  let configuration;
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  const controller = {
    getState: () => "idle",
    resetCamera: () => true,
    pause() {}, resume() {}, dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    hostFactory: () => host,
    controllerFactory: (options) => { configuration = options; return controller; },
  });
  stage.dropLayer("bottom-bun", { kind: "prep" });
  const patty = stage.burger.getLayer("patty");
  patty.position.set(1.8, 2.4, -0.7);
  configuration.onMove({
    id: "patty",
    reason: "drag",
    pose: { rotation: { y: patty.rotation.y } },
  });

  stage.tick(95);
  assert.deepEqual(patty.position.toArray(), [1.8, 2.4, -0.7]);
  stage.dispose();
});

test("repeated mixed sauce callbacks create surface-safe burger ribbons and update composition", () => {
  const { stage } = harness();
  stage.applySauceStroke(sampleStroke("chili"));
  stage.applySauceStroke(sampleStroke("mustard"));
  stage.applySauceStroke(sampleStroke("chili"));

  assert.deepEqual(stage.getState().strokes.map(({ sauce }) => sauce), [
    "chili", "mustard", "chili",
  ]);
  assert.deepEqual(stage.burger.getSnapshot().strokes.map(({ sauce }) => sauce), [
    "chili", "mustard", "chili",
  ]);
  const sauceMeshes = [];
  stage.burger.root.traverse((object) => {
    if (object.userData.sauceStroke) sauceMeshes.push(object);
  });
  assert.equal(sauceMeshes.length, 3);
  assert.ok(sauceMeshes.every(({ geometry }) => geometry.userData.sauceShape === "surface-ribbon"));
  stage.dispose();
});

test("live sauce previews appear before release and promote without a visual duplicate", () => {
  const { stage, configuration } = stageHarnessWithConfiguration();
  const stroke = sampleStroke("mustard", "patty");
  configuration.onSaucePreview({
    gestureId: "sauce-1",
    segmentIndex: 0,
    stroke,
  });

  const preview = stage.burger.getLayer("patty").children.find((child) => (
    child.userData.preview === true
  ));
  assert.ok(preview, "surface sauce is visible before release");
  assert.equal(stage.getState().strokes.length, 0);

  configuration.onSauceCommit({ gestureId: "sauce-1", strokes: [stroke] });
  assert.equal(preview.parent, stage.burger.getLayer("patty"));
  assert.equal(preview.userData.preview, false);
  assert.equal(stage.getState().strokes.length, 1);
  assert.equal(stage.burger.getSnapshot().strokes.length, 1);
  assert.equal(stage.burger.getLayer("patty").children.filter((child) => (
    child.userData.sauceStroke
  )).length, 1, "commit promotes instead of duplicating the preview");

  configuration.onSaucePreview({
    gestureId: "sauce-2",
    segmentIndex: 0,
    stroke: sampleStroke("sour", "cheese"),
  });
  configuration.onSauceCancel({ gestureId: "sauce-2", reason: "pointercancel" });
  assert.equal(stage.burger.getLayer("cheese").children.some((child) => (
    child.userData.preview === true
  )), false);
  assert.equal(stage.getState().strokes.length, 1, "cancel leaves state unchanged");
  stage.dispose();
});

test("completion freezes editing, shows a real 3d celebration, then allows adjustment", () => {
  const { stage } = harness();
  BURGER_LAYER_IDS.forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));

  assert.equal(stage.getState().complete, true);
  assert.equal(stage.finish(), true);
  assert.equal(stage.getState().finished, true);
  assert.equal(stage.celebration.visible, true);
  assert.equal(stage.controller.getState(), "idle");
  assert.throws(() => stage.dropLayer("patty", { kind: "bin" }), /finished/i);
  assert.equal(stage.continueEditing(), true);
  assert.equal(stage.getState().finished, false);
  assert.equal(stage.celebration.visible, false);
  stage.dispose();
});

test("undoing continue-editing re-freezes the controller with the restored finished state", () => {
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  const calls = { pause: 0, resume: 0 };
  const controller = {
    getState: () => "idle",
    resetCamera: () => true,
    pause: () => { calls.pause += 1; },
    resume: () => { calls.resume += 1; },
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    hostFactory: () => host,
    controllerFactory: () => controller,
  });
  BURGER_LAYER_IDS.forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));
  stage.finish();
  stage.continueEditing();
  stage.undo();

  assert.equal(stage.getState().finished, true);
  assert.equal(calls.pause, 2);
  stage.dispose();
});

test("undo and reset restore state, scene transforms, sauce geometry, and resource identity", () => {
  const { stage } = harness();
  const identities = {
    workbench: stage.workbench,
    burger: stage.burger,
    tools: stage.tools,
    controller: stage.controller,
  };
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.applySauceStroke(sampleStroke("sticky", "bottom-bun"));
  assert.equal(stage.undo(), true);
  assert.equal(stage.getState().strokes.length, 0);
  assert.equal(stage.burger.getSnapshot().strokes.length, 0);

  stage.reset();
  assert.deepEqual(stage.getState().assembledOrder, []);
  assert.equal(stage.getState().strokes.length, 0);
  assert.equal(stage.workbench, identities.workbench);
  assert.equal(stage.burger, identities.burger);
  assert.equal(stage.tools, identities.tools);
  assert.equal(stage.controller, identities.controller);
  stage.dispose();
});

test("undo and reset reconcile tutorial guidance with the restored cooking state", () => {
  const { stage } = harness();
  stage.selectLayer("bottom-bun");
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.rotateSelected(0.4);
  stage.applySauceStroke(sampleStroke("chili", "bottom-bun"));
  assert.equal(stage.getTutorial().step, "assemble");

  assert.equal(stage.undo(), true);
  assert.equal(stage.getState().strokes.length, 0);
  assert.equal(stage.getTutorial().step, "sauce");
  assert.equal(stage.undo(), true);
  assert.equal(stage.getState().rotations["bottom-bun"], 0);
  assert.equal(stage.getTutorial().step, "rotate");

  stage.rotateSelected(0.4);
  stage.applySauceStroke(sampleStroke("chili", "bottom-bun"));
  for (const layerId of BURGER_LAYER_IDS.slice(1)) {
    stage.dropLayer(layerId, { kind: "prep" });
  }
  assert.equal(stage.getTutorial().step, "finish");
  assert.equal(stage.undo(), true);
  assert.equal(stage.getState().complete, false);
  assert.equal(stage.getTutorial().step, "assemble");

  stage.reset();
  assert.equal(stage.getState().assembledOrder.length, 0);
  assert.equal(stage.getTutorial().step, "pick");
  stage.dispose();
});

test("reset keeps a persisted completed tutorial quiet", () => {
  const storage = { getItem: () => "complete", setItem() {} };
  const { stage } = harness({ storage });
  assert.equal(stage.getTutorial().step, "done");
  stage.reset();
  assert.equal(stage.getTutorial().step, "done");
  stage.dispose();
});

test("disposes controller before every scene resource and remains idempotent", () => {
  const order = [];
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    hostFactory: () => ({ ...host, dispose() { order.push("host"); host.dispose(); } }),
    controllerFactory: (configuration) => {
      const controller = createCookingInteractionController(configuration);
      const dispose = controller.dispose.bind(controller);
      controller.dispose = () => { order.push("controller"); dispose(); };
      return controller;
    },
    resourceDisposeObserver: (name) => order.push(name),
  });

  stage.dispose();
  stage.dispose();
  assert.deepEqual(order, ["controller", "tools", "burger", "workbench", "host"]);
});

function trackedDisposable(value, name, order, { throws = false } = {}) {
  const dispose = value.dispose?.bind(value) ?? (() => {});
  return new Proxy(value, {
    get(target, property, receiver) {
      if (property !== "dispose") return Reflect.get(target, property, receiver);
      return () => {
        order.push(name);
        dispose();
        if (throws) throw new Error(`dispose:${name}`);
      };
    },
  });
}

function constructionFailureHarness(failAt, { cleanupThrowsAt = null } = {}) {
  const order = [];
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  const hostDispose = host.dispose.bind(host);
  host.dispose = () => {
    order.push("host");
    hostDispose();
    if (cleanupThrowsAt === "host") throw new Error("dispose:host");
  };
  host.onFrame = (callback) => {
    if (failAt === "frame-listener") throw new Error("boom:frame-listener");
    const remove = createHostHarness().onFrame(callback);
    return () => { order.push("remove-frame"); remove(); };
  };
  host.onContextError = () => {
    if (failAt === "context-listener") throw new Error("boom:context-listener");
    return () => { order.push("remove-context"); };
  };
  host.start = () => {
    if (failAt === "start") throw new Error("boom:start");
    host.starts += 1;
  };
  const fail = (name, factory) => (...args) => {
    if (failAt === name) throw new Error(`boom:${name}`);
    return trackedDisposable(factory(...args), name, order, {
      throws: cleanupThrowsAt === name,
    });
  };
  const celebrationFactory = fail("celebration", (Three) => ({
    root: new Three.Group(),
    pieces: [],
    visible: false,
    tick() {},
    dispose() {},
  }));
  const controllerFactory = fail("controller", () => ({
    getState: () => "idle",
    resetCamera: () => true,
    pause() {}, resume() {}, dispose() {},
  }));
  const onChange = () => {
    if (failAt === "emit") throw new Error("boom:emit");
  };
  return {
    order,
    create: () => createSoloCookingStage({
      THREE,
      canvas,
      storage: null,
      hostFactory: () => {
        if (failAt === "host") throw new Error("boom:host");
        return host;
      },
      workbenchFactory: fail("workbench", (Three) => createCookingWorkbench3D(Three)),
      burgerFactory: fail("burger", (Three) => createBurgerModel3D(Three)),
      toolsFactory: fail("tools", (Three, options) => createCondimentTools3D(Three, options)),
      celebrationFactory,
      controllerFactory,
      onChange,
    }),
  };
}

test("construction failures unwind every completed stage resource in reverse order", () => {
  const cases = [
    ["workbench", ["host"]],
    ["burger", ["workbench", "host"]],
    ["tools", ["burger", "workbench", "host"]],
    ["celebration", ["tools", "burger", "workbench", "host"]],
    ["controller", ["celebration", "tools", "burger", "workbench", "host"]],
    ["frame-listener", ["controller", "celebration", "tools", "burger", "workbench", "host"]],
    ["context-listener", ["remove-frame", "controller", "celebration", "tools", "burger", "workbench", "host"]],
    ["start", ["remove-context", "remove-frame", "controller", "celebration", "tools", "burger", "workbench", "host"]],
    ["emit", ["remove-context", "remove-frame", "controller", "celebration", "tools", "burger", "workbench", "host"]],
  ];
  for (const [failAt, expected] of cases) {
    const harness = constructionFailureHarness(failAt, {
      cleanupThrowsAt: failAt === "emit" ? "tools" : null,
    });
    assert.throws(harness.create, new RegExp(`boom:${failAt}`), failAt);
    assert.deepEqual(harness.order, expected, failAt);
  }
});

test("normal dispose attempts every cleanup once even when earlier cleanup throws", () => {
  const harness = constructionFailureHarness(null, { cleanupThrowsAt: "controller" });
  const stage = harness.create();

  assert.throws(() => stage.dispose(), /dispose:controller/);
  assert.deepEqual(harness.order, [
    "remove-context", "remove-frame", "controller", "celebration",
    "tools", "burger", "workbench", "host",
  ]);
  assert.doesNotThrow(() => stage.dispose());
  assert.equal(harness.order.length, 8);
});

test("stage state and tutorial remain DOM-free and notify concise progress", () => {
  const changes = [];
  const { stage } = harness({ onChange: (detail) => changes.push(detail) });
  stage.dropLayer("bottom-bun", { kind: "prep" });

  assert.equal(stage.getState().assembledOrder.length, 1);
  assert.equal(changes.at(-1).progress, "1/20");
  assert.equal(changes.at(-1).tutorial.step, "pick");
  assert.equal(JSON.stringify(stage.getState()).includes("HTMLElement"), false);
  stage.dispose();
});

test("tutorial reconciles an already complete burger immediately after the first sauce", () => {
  const { stage } = harness();
  stage.selectLayer("bottom-bun");
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.rotateSelected(0.2);
  for (const layerId of BURGER_LAYER_IDS.slice(1)) {
    stage.dropLayer(layerId, { kind: "prep" });
  }
  assert.equal(stage.getState().complete, true);
  assert.equal(stage.getTutorial().step, "sauce");

  stage.applySauceStroke(sampleStroke("chili"));
  assert.equal(stage.getTutorial().step, "finish");
  stage.dispose();
});

test("invalid placement emits a Chinese reason and safe short haptic without escaping errors", () => {
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  const changes = [];
  let configuration;
  let vibrations = 0;
  const controller = {
    getState: () => "idle",
    resetCamera: () => true,
    pause() {},
    resume() {},
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    hostFactory: () => host,
    controllerFactory: (options) => { configuration = options; return controller; },
    onChange: (detail) => changes.push(detail),
    vibrate: (duration) => {
      vibrations += 1;
      assert.ok(duration > 0 && duration <= 50);
      throw new Error("platform rejected haptic");
    },
  });

  assert.doesNotThrow(() => configuration.onInvalid({ reason: "outside-prep" }));
  assert.equal(vibrations, 1);
  assert.equal(changes.at(-1).reason, "invalid-drop");
  assert.match(changes.at(-1).message, /餐盘|料盒|放/);
  stage.dispose();
});

test("reduced motion keeps the completed WebGL celebration visibly static", () => {
  const { stage } = harness({ reducedMotion: true });
  BURGER_LAYER_IDS.forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));
  stage.finish();
  const before = stage.celebration.pieces.map((piece) => ({
    position: piece.position.toArray(), rotation: piece.rotation.toArray(),
  }));
  stage.tick(5000);
  const after = stage.celebration.pieces.map((piece) => ({
    position: piece.position.toArray(), rotation: piece.rotation.toArray(),
  }));

  assert.equal(stage.celebration.visible, true);
  assert.deepEqual(after, before);
  stage.dispose();
});

test("stage construction tolerates a SecurityError localStorage property getter", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new DOMException("denied", "SecurityError"); },
  });
  let stage;
  try {
    const canvas = new FakeCanvas();
    const host = createHostHarness();
    assert.doesNotThrow(() => {
      stage = createSoloCookingStage({
        THREE,
        canvas,
        hostFactory: () => host,
        controllerFactory: () => ({
          getState: () => "idle",
          resetCamera: () => true,
          pause() {}, resume() {}, dispose() {},
        }),
      });
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
    stage?.dispose();
  }
});
