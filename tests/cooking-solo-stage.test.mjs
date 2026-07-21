import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { BURGER_LAYER_IDS } from "../app/static/cooking-state.mjs";
import {
  SOLO_BURGER_INGREDIENT_IDS,
  SOLO_COOKING_SAUCE_IDS,
} from "../app/static/burger-recipes.mjs";
import { createCookingInteractionController } from "../app/static/cooking-interaction-controller.mjs";
import { createSoloCookingStage } from "../app/static/cooking-solo-stage.mjs";
import {
  MAX_SOLO_STACK_LAYERS,
  SOLO_INGREDIENT_STOCK,
  addSoloSauceStroke,
  createSoloCookingState,
  finishSoloCooking,
  placeSoloLayer,
  rotateSoloLayer,
} from "../app/static/cooking-solo-state.mjs";
import { hydrateSoloCookingState } from "../app/static/cooking-solo-save.mjs";
import { createCookingWorkbench3D } from "../app/static/cooking-workbench-3d.mjs";
import { createBurgerModel3D } from "../app/static/burger-model-3d.mjs";
import { createCondimentTools3D } from "../app/static/condiment-tools-3d.mjs";
import { normalizeBurgerTuning } from "../app/static/burger-tuning.mjs";
import {
  WORKBENCH_SLOTS,
  createDefaultWorkbenchLoadout,
  normalizeWorkbenchLoadout,
} from "../app/static/workbench-loadout.mjs";

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
    resizes: 0,
    resets: 0,
    disposed: 0,
    start() { this.starts += 1; },
    resize() { this.resizes += 1; },
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
  let configuration;
  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    hostFactory: () => host,
    controllerFactory: (value) => {
      controllerCount += 1;
      configuration = value;
      return createCookingInteractionController(value);
    },
    ...options,
  });
  return { canvas, host, stage, controllerCount, configuration };
}

const slotDescriptorsFor = (loadout) => {
  const regionIndices = { bread: 0, filling: 0, sauce: 0 };
  return WORKBENCH_SLOTS.map(({ slotId, region }) => Object.freeze({
    slotId,
    region,
    kind: region === "sauce" ? "tool" : "ingredient",
    index: regionIndices[region]++,
    contentId: loadout[slotId],
  }));
};

const loadedLayerIds = (stage) => Object.values(stage.getState().stationSources);

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

function expectedLayerScale(stage, instanceId) {
  const ingredientId = stage.getState().instances[instanceId];
  const config = stage.getTuning().ingredients[ingredientId];
  const presentationScale = stage.getTuning().global.presentationScale;
  return [config.scaleX, config.scaleY, config.scaleZ]
    .map((value) => value * presentationScale);
}

const STACK_SAFE_NDC_MARGIN = 0.86;

function assertStackFitsCamera(stage, label, {
  margin = STACK_SAFE_NDC_MARGIN,
  requireTight = true,
} = {}) {
  stage.host.scene.updateMatrixWorld(true);
  stage.host.camera.updateProjectionMatrix();
  stage.host.camera.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const layerId of stage.getState().assembledOrder) {
    bounds.expandByObject(stage.burger.getLayer(layerId));
  }
  assert.equal(bounds.isEmpty(), false, `${label} stack bounds are available`);
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  let maximumScreenMagnitude = 0;
  for (const corner of corners) {
    const ndc = corner.project(stage.host.camera);
    maximumScreenMagnitude = Math.max(
      maximumScreenMagnitude,
      Math.abs(ndc.x),
      Math.abs(ndc.y),
    );
    assert.ok(Number.isFinite(ndc.x) && Math.abs(ndc.x) <= margin + 1e-8,
      `${label} stack exceeds camera width at NDC x=${ndc.x}`);
    assert.ok(Number.isFinite(ndc.y) && Math.abs(ndc.y) <= margin + 1e-8,
      `${label} stack exceeds camera height at NDC y=${ndc.y}`);
    assert.ok(Number.isFinite(ndc.z) && Math.abs(ndc.z) <= 1 + 1e-9,
      `${label} stack exceeds camera depth at NDC z=${ndc.z}`);
  }
  if (requireTight) {
    assert.ok(
      maximumScreenMagnitude >= margin - 0.08,
      `${label} camera leaves heuristic-sized empty space at NDC ${maximumScreenMagnitude}`,
    );
  }
  return maximumScreenMagnitude;
}

function assertSelectorVerticesFitCamera(stage, label) {
  stage.host.scene.updateMatrixWorld(true);
  stage.host.camera.updateProjectionMatrix();
  stage.host.camera.updateMatrixWorld(true);
  let vertexCount = 0;
  for (const station of [
    ...stage.workbench.ingredientSlots,
    ...stage.workbench.toolDocks,
  ]) {
    const selector = station.selector;
    assert.ok(selector?.geometry?.attributes?.position, `${station.slotId} has selector vertices`);
    const positions = selector.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const ndc = new THREE.Vector3()
        .fromBufferAttribute(positions, index)
        .applyMatrix4(selector.matrixWorld)
        .project(stage.host.camera);
      vertexCount += 1;
      assert.ok(
        Number.isFinite(ndc.x) && Math.abs(ndc.x) <= 1 + 1e-9,
        `${label} ${station.slotId} selector vertex ${index} exceeds width at NDC x=${ndc.x}`,
      );
      assert.ok(
        Number.isFinite(ndc.y) && Math.abs(ndc.y) <= 1 + 1e-9,
        `${label} ${station.slotId} selector vertex ${index} exceeds height at NDC y=${ndc.y}`,
      );
      assert.ok(
        Number.isFinite(ndc.z) && Math.abs(ndc.z) <= 1 + 1e-9,
        `${label} ${station.slotId} selector vertex ${index} exceeds depth at NDC z=${ndc.z}`,
      );
    }
  }
  assert.ok(vertexCount > 0, `${label} projected selector vertices`);
}

function pointerAtWorld(stage, canvas, pointerId, worldPoint) {
  stage.host.scene.updateMatrixWorld(true);
  stage.host.camera.updateMatrixWorld(true);
  const bounds = canvas.getBoundingClientRect();
  const ndc = worldPoint.clone().project(stage.host.camera);
  return {
    pointerId,
    clientX: bounds.left + (ndc.x + 1) * bounds.width / 2,
    clientY: bounds.top + (1 - ndc.y) * bounds.height / 2,
    pointerType: "touch",
    preventDefault() {},
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

test("integrates the complete recipe ingredient and sauce sets into the solo stage", () => {
  const { host, stage, controllerCount } = harness();

  assert.equal(controllerCount, 1);
  assert.equal(stage.host, host);
  assert.equal(stage.workbench.root.parent, host.scene);
  assert.equal(stage.burger.root.parent, stage.workbench.root);
  assert.equal(stage.tools.root.parent, stage.workbench.root);
  assert.ok(stage.workbench.root instanceof THREE.Group);
  assert.ok(stage.burger.getLayer("patty") instanceof THREE.Group);
  assert.deepEqual(
    [...stage.burger.layers.keys()],
    SOLO_BURGER_INGREDIENT_IDS,
  );
  assert.ok(stage.burger.getLayer("onion") instanceof THREE.Group);
  assert.ok(stage.burger.getLayer("middle-bun") instanceof THREE.Group);
  const sauceSlotIds = WORKBENCH_SLOTS
    .filter(({ region }) => region === "sauce")
    .map(({ slotId }) => slotId);
  assert.deepEqual([...stage.tools.bottles.keys()], sauceSlotIds);
  assert.deepEqual(
    sauceSlotIds.map((slotId) => stage.tools.getBySlot(slotId).sauce),
    SOLO_COOKING_SAUCE_IDS,
  );
  assert.ok(stage.tools.get("ketchup").root instanceof THREE.Group);
  assert.equal(stage.workbench.ingredientSlots.length, 7);
  assert.equal(stage.workbench.toolDocks.length, SOLO_COOKING_SAUCE_IDS.length);
  assert.equal(host.starts, 1);
  stage.dispose();
});

test("builds the fixed workbench and solo state from one normalized loadout", () => {
  const requestedLoadout = {
    ...createDefaultWorkbenchLoadout(),
    "filling-back-1": "patty",
    "filling-back-2": "patty",
    "filling-back-3": "onion",
    "bread-left-2": "not-a-bread",
  };
  const expectedLoadout = normalizeWorkbenchLoadout(requestedLoadout);
  let workbenchOptions;
  let controllerOptions;
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    loadout: requestedLoadout,
    hostFactory: createHostHarness,
    workbenchFactory: (Three, options) => {
      workbenchOptions = options;
      return createCookingWorkbench3D(Three, options);
    },
    controllerFactory: (options) => {
      controllerOptions = options;
      return createCookingInteractionController(options);
    },
  });

  assert.deepEqual(workbenchOptions, {
    slotDescriptors: slotDescriptorsFor(expectedLoadout),
  });
  assert.deepEqual(stage.getState().stationContents, expectedLoadout);
  assert.equal(stage.workbench.ingredientSlots.length, 7);
  assert.equal(stage.workbench.toolDocks.length, 3);

  const firstSource = stage.getState().stationSources["filling-back-1"];
  const secondSource = stage.getState().stationSources["filling-back-2"];
  assert.notEqual(firstSource, secondSource);
  assert.equal(stage.getState().instances[firstSource], "patty");
  assert.equal(stage.getState().instances[secondSource], "patty");

  for (const [slotId, sourceId] of Object.entries(stage.getState().stationSources)) {
    const station = stage.workbench.getStationBySlot(slotId);
    const stationWorld = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
    const sourceWorld = stage.burger.getLayer(sourceId).getWorldPosition(new THREE.Vector3());
    assert.ok(sourceWorld.distanceTo(stationWorld) < 1e-9, `${sourceId} uses ${slotId}`);
  }

  const secondHome = stage.workbench.getLayout().ingredients.find(
    ({ slotId }) => slotId === "filling-back-2",
  );
  const returnDrop = controllerOptions.resolveDrop({
    id: secondSource,
    point: new THREE.Vector3(secondHome.position.x, 0, secondHome.position.z),
  });
  assert.equal(returnDrop.valid, true);
  assert.equal(
    returnDrop.anchor,
    stage.workbench.getStationBySlot("filling-back-2").dropAnchor,
    "duplicate content returns to its physical home slot",
  );
  stage.dispose();
});

test("starts from a verified saved state and lets its station contents override an explicit loadout", () => {
  const savedLoadout = {
    ...createDefaultWorkbenchLoadout(),
    "filling-back-2": "patty",
  };
  let saved = createSoloCookingState({ loadout: savedLoadout });
  const bottomSource = saved.stationSources["bread-left-1"];
  const pattySource = saved.stationSources["filling-back-1"];
  saved = placeSoloLayer(saved, bottomSource, 0, { replenish: true });
  saved = placeSoloLayer(saved, pattySource, 1, { replenish: true });
  saved = rotateSoloLayer(saved, pattySource, Math.PI / 3);
  saved = addSoloSauceStroke(saved, sampleStroke("mustard", pattySource));
  const initialState = hydrateSoloCookingState(saved);
  assert.ok(initialState);
  const ready = [];

  const { stage } = harness({
    initialState,
    loadout: {
      ...createDefaultWorkbenchLoadout(),
      "filling-back-2": "onion",
    },
    reducedMotion: true,
    onChange: (detail) => ready.push(detail),
  });

  assert.strictEqual(stage.getState(), initialState, "verified state is not rebuilt or mutated");
  assert.deepEqual(stage.getState().stationContents, normalizeWorkbenchLoadout(savedLoadout));
  assert.equal(stage.workbench.getStationBySlot("filling-back-2").id, "patty");
  assert.deepEqual(stage.getState().assembledOrder, [bottomSource, pattySource]);
  assert.equal(stage.burger.getLayer(pattySource).rotation.y, Math.PI / 3);
  assert.deepEqual(stage.burger.getSnapshot().strokes, initialState.strokes);
  assert.strictEqual(stage.getState().history, initialState.history);
  assert.strictEqual(ready.at(-1).state, initialState);
  assertStackFitsCamera(stage, "saved initial stack", { requireTight: false });
  assertSelectorVerticesFitCamera(stage, "saved initial workbench");
  stage.dispose();

  const fallback = harness({
    initialState: Object.freeze({ incomplete: true }),
    loadout: {
      ...createDefaultWorkbenchLoadout(),
      "filling-back-2": "onion",
    },
  }).stage;
  assert.equal(fallback.getState().stationContents["filling-back-2"], "onion");
  fallback.dispose();
});

test("restores a valid legacy v1 state without station fields instead of replacing it", () => {
  let saved = createSoloCookingState();
  saved = placeSoloLayer(saved, "bottom-bun", 0, { replenish: true });
  saved = placeSoloLayer(saved, "patty", 1, { replenish: true });
  const initialState = hydrateSoloCookingState(saved);
  assert.ok(initialState);
  assert.equal(Object.hasOwn(initialState, "stationContents"), false);
  const ready = [];

  const { stage } = harness({
    initialState,
    reducedMotion: true,
    onChange: (detail) => ready.push(detail),
  });

  assert.strictEqual(stage.getState(), initialState);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.equal(stage.burger.getLayer("bottom-bun").visible, true);
  assert.equal(stage.burger.getLayer("patty").visible, true);
  assert.strictEqual(ready.at(-1).state, initialState);
  stage.dispose();
});

test("fits a restored sixty-layer stack before the first frame without waiting for resize", () => {
  let saved = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  for (let index = 0; index < MAX_SOLO_STACK_LAYERS; index += 1) {
    const sourceId = saved.stationSources["filling-back-1"];
    saved = placeSoloLayer(saved, sourceId, saved.assembledOrder.length, { replenish: true });
  }
  const initialState = hydrateSoloCookingState(saved);
  assert.equal(initialState.assembledOrder.length, MAX_SOLO_STACK_LAYERS);
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  host.camera.aspect = 390 / 844;
  host.camera.updateProjectionMatrix();
  const cameraReasons = [];

  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    initialState,
    reducedMotion: true,
    hostFactory: () => host,
    controllerFactory: (options) => {
      const controller = createCookingInteractionController(options);
      const setCameraView = controller.setCameraView.bind(controller);
      controller.setCameraView = (view, reason) => {
        cameraReasons.push(reason);
        return setCameraView(view, reason);
      };
      return controller;
    },
  });

  assert.equal(host.resizes, 0);
  assert.equal(host.starts, 1);
  assert.deepEqual(cameraReasons, ["initial-state-fit"]);
  assertStackFitsCamera(stage, "restored first frame", { requireTight: false });
  stage.dispose();
});

test("pauses a restored finished state before pointer input can start dragging", () => {
  let saved = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const bottomSource = saved.stationSources["bread-left-1"];
  const pattySource = saved.stationSources["filling-back-1"];
  saved = placeSoloLayer(saved, bottomSource, 0, { replenish: true });
  saved = placeSoloLayer(saved, pattySource, 1, { replenish: true });
  saved = finishSoloCooking(saved);
  const initialState = hydrateSoloCookingState(saved);
  const { stage, canvas } = harness({ initialState, reducedMotion: true });
  const pattySurface = stage.burger.getLayer(pattySource).userData.selectableSurface;
  const pattyWorld = pattySurface.getWorldPosition(new THREE.Vector3());

  assert.equal(stage.getState().finished, true);
  assert.equal(stage.controller.getState(), "idle");
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 71, pattyWorld));

  assert.equal(stage.controller.getState(), "idle");
  assert.equal(stage.getSelectedLayerId(), null);
  assert.equal(canvas.hasPointerCapture(71), false);
  stage.dispose();
});

test("forwards stable station-selector details without changing cooking or camera state", () => {
  let controllerOptions;
  const observed = [];
  const { stage } = harness({
    onStationSelector: (detail) => observed.push(detail),
    controllerFactory: (options) => {
      controllerOptions = options;
      return createCookingInteractionController(options);
    },
  });
  const stateBefore = stage.getState();
  const cameraBefore = stage.controller.getCameraView();

  const mutablePayload = { slotId: "filling-back-3", region: "filling" };
  controllerOptions.onStationSelector(mutablePayload);
  mutablePayload.slotId = "bread-left-1";

  assert.deepEqual(observed, [{ slotId: "filling-back-3", region: "filling" }]);
  assert.equal(Object.isFrozen(observed[0]), true);
  assert.strictEqual(stage.getState(), stateBefore);
  assert.deepEqual(stage.controller.getCameraView(), cameraBefore);
  stage.dispose();
});

test("switches one ingredient slot without clearing the plated burger, history, or camera", () => {
  const changes = [];
  const { stage } = harness({
    loadout: createDefaultWorkbenchLoadout(),
    onChange: (detail) => changes.push(detail),
  });
  const bottomSource = stage.getState().stationSources["bread-left-1"];
  const pattySource = stage.getState().stationSources["filling-back-1"];
  stage.dropLayer(bottomSource, { kind: "prep" });
  stage.dropLayer(pattySource, { kind: "prep" });
  stage.tick(500);

  const stateBefore = stage.getState();
  const orderBefore = [...stateBefore.assembledOrder];
  const historyBefore = stateBefore.history.map((snapshot) => snapshot.assembledOrder);
  const cameraBefore = stage.controller.getCameraView();
  const platedBefore = Object.fromEntries(orderBefore.map((id) => [
    id,
    readLayerTransform(stage.burger.getLayer(id)),
  ]));

  assert.equal(stage.setSlotContent("filling-back-2", "onion"), true);
  const nextState = stage.getState();
  assert.equal(nextState.stationContents["filling-back-2"], "onion");
  assert.equal(stage.workbench.getStationBySlot("filling-back-2").id, "onion");
  assert.deepEqual(nextState.assembledOrder, orderBefore);
  assert.deepEqual(nextState.history.map((snapshot) => snapshot.assembledOrder), historyBefore);
  assert.deepEqual(stage.controller.getCameraView(), cameraBefore);
  assert.deepEqual(Object.fromEntries(orderBefore.map((id) => [
    id,
    readLayerTransform(stage.burger.getLayer(id)),
  ])), platedBefore);

  const onionSource = nextState.stationSources["filling-back-2"];
  assert.equal(nextState.instances[onionSource], "onion");
  const onionWorld = stage.burger.getLayer(onionSource).getWorldPosition(new THREE.Vector3());
  const slotWorld = stage.workbench.getStationBySlot("filling-back-2")
    .pickupAnchor.getWorldPosition(new THREE.Vector3());
  assert.ok(onionWorld.distanceTo(slotWorld) < 1e-9);
  assert.equal(changes.at(-1).reason, "slot-content");
  assert.deepEqual(changes.at(-1).slot, {
    slotId: "filling-back-2",
    region: "filling",
    contentId: "onion",
  });
  assert.equal(stage.setSlotContent("filling-back-2", "onion"), false);
  stage.dispose();
});

test("keeps a stroked displaced source in state while hiding it from rendering and picking", () => {
  const { stage, canvas } = harness({
    loadout: createDefaultWorkbenchLoadout(),
    reducedMotion: true,
  });
  const slotId = "filling-back-1";
  const strokedId = stage.getState().stationSources[slotId];
  stage.applySauceStroke(sampleStroke("ketchup", strokedId));

  stage.setSlotContent(slotId, "onion");
  const onionId = stage.getState().stationSources[slotId];
  const strokedLayer = stage.burger.getLayer(strokedId);
  const onionLayer = stage.burger.getLayer(onionId);

  assert.equal(stage.getState().instances[strokedId], "patty");
  assert.deepEqual(stage.getState().strokes.map(({ layerId }) => layerId), [strokedId]);
  assert.equal(strokedLayer.visible, false);
  assert.equal(onionLayer.visible, true);
  assert.equal(stage.controller.unregisterDraggable(strokedId), false);

  const onionWorld = onionLayer.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 72, onionWorld));
  assert.equal(stage.controller.getState(), "dragging-layer");
  assert.equal(stage.getSelectedLayerId(), onionId);
  assert.equal(canvas.hasPointerCapture(72), true);
  stage.controller.pointerCancel({ pointerId: 72 });
  stage.dispose();
});

test("keeps duplicate sauce slots physically distinct and switches one live bottle", () => {
  const loadout = {
    ...createDefaultWorkbenchLoadout(),
    "sauce-right-2": "ketchup",
  };
  const { stage } = harness({ loadout });
  const first = stage.tools.getBySlot("sauce-right-1");
  const second = stage.tools.getBySlot("sauce-right-2");
  assert.notStrictEqual(first, second);
  assert.equal(first.sauce, "ketchup");
  assert.equal(second.sauce, "ketchup");
  const stateBefore = stage.getState();
  const historyBefore = stateBefore.history;
  const cameraBefore = stage.controller.getCameraView();

  assert.equal(stage.setSlotContent("sauce-right-2", "mustard"), true);
  assert.equal(stage.getState().stationContents["sauce-right-1"], "ketchup");
  assert.equal(stage.getState().stationContents["sauce-right-2"], "mustard");
  assert.equal(stage.workbench.getStationBySlot("sauce-right-2").id, "mustard");
  assert.equal(first.sauce, "ketchup");
  assert.equal(second.sauce, "mustard");
  assert.strictEqual(stage.getState().history, historyBefore);
  assert.deepEqual(stage.controller.getCameraView(), cameraBefore);
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
    maxDistance: 320,
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
  const focused = stage.controller.getCameraView();
  assert.ok(Math.abs(focused.yaw - before.yaw) < 1e-12);
  assert.ok(Math.abs(focused.pitch - before.pitch) < 1e-12);
  assert.ok(focused.distance < before.distance);

  assert.equal(stage.toggleBurgerFocus(), false);
  assert.equal(stage.workbench.root.visible, true);
  assert.equal(stage.burger.root.parent, stage.workbench.root);
  assert.ok(loadedLayerIds(stage).every((id) => stage.burger.getLayer(id).visible));
  assert.equal(stage.burger.getLayer("pickle").visible, false);
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

test("returns an assembled ingredient to a different slot in the same region", () => {
  const changes = [];
  const { stage, configuration } = stageHarnessWithConfiguration({
    loadout: createDefaultWorkbenchLoadout(),
    reducedMotion: true,
    onChange: (detail) => changes.push(detail),
  });
  const returnedId = stage.getState().stationSources["filling-back-1"];
  stage.dropLayer(returnedId, { kind: "prep" });
  const homeSlotId = "filling-back-1";
  const targetSlotId = "filling-back-2";
  const homeLayout = stage.workbench.getLayout().ingredients.find(
    ({ slotId }) => slotId === homeSlotId,
  );
  const targetLayout = stage.workbench.getLayout().ingredients.find(
    ({ slotId }) => slotId === targetSlotId,
  );

  configuration.onMove({
    id: returnedId,
    reason: "drag",
    point: new THREE.Vector3(homeLayout.position.x, 0, homeLayout.position.z),
    pose: { rotation: { y: 0 } },
  });
  assert.equal(changes.at(-1).dropIntent.slotId, homeSlotId);
  configuration.onMove({
    id: returnedId,
    reason: "drag",
    point: new THREE.Vector3(targetLayout.position.x, 0, targetLayout.position.z),
    pose: { rotation: { y: 0 } },
  });
  assert.equal(changes.at(-1).dropIntent.slotId, targetSlotId);

  const resolution = configuration.resolveDrop({
    id: returnedId,
    point: new THREE.Vector3(targetLayout.position.x, 0, targetLayout.position.z),
  });

  assert.equal(resolution.valid, true);
  assert.strictEqual(
    resolution.anchor,
    stage.workbench.getStationBySlot(targetSlotId).dropAnchor,
  );
  configuration.onDrop({
    id: returnedId,
    anchor: resolution.anchor,
    targetIndex: null,
  });
  assert.deepEqual(stage.getState().locations[returnedId], {
    kind: "bin",
    slotId: targetSlotId,
  });
  assert.equal(stage.getState().stationSources[targetSlotId], returnedId);
  assert.equal(stage.getState().stationContents[targetSlotId], "patty");
  assert.equal(stage.workbench.getStationBySlot(targetSlotId).id, "patty");
  stage.dispose();
});

test("synchronizes the physical workbench when a returned ingredient changes slot content", () => {
  const { stage } = harness({
    loadout: createDefaultWorkbenchLoadout(),
    reducedMotion: true,
  });
  const slotId = "filling-back-1";
  const returnedId = stage.getState().stationSources[slotId];
  stage.dropLayer(returnedId, { kind: "prep" });
  stage.setSlotContent(slotId, "cheese");
  assert.equal(stage.workbench.getStationBySlot(slotId).id, "cheese");

  stage.dropLayer(returnedId, { kind: "bin" });

  assert.equal(stage.getState().stationContents[slotId], "patty");
  assert.equal(stage.getState().stationSources[slotId], returnedId);
  assert.equal(stage.workbench.getStationBySlot(slotId).id, "patty");
  const returnedWorld = stage.burger.getLayer(returnedId).getWorldPosition(new THREE.Vector3());
  const slotWorld = stage.workbench.getStationBySlot(slotId)
    .pickupAnchor.getWorldPosition(new THREE.Vector3());
  assert.ok(returnedWorld.distanceTo(slotWorld) < 1e-9);
  stage.dispose();
});

test("undo after a returned ingredient and manual slot switch preserves the latest loadout everywhere", () => {
  const { stage } = harness({
    loadout: createDefaultWorkbenchLoadout(),
    reducedMotion: true,
  });
  const slotId = "filling-back-1";
  const pattyId = stage.getState().stationSources[slotId];
  stage.dropLayer(pattyId, { kind: "prep" });
  stage.setSlotContent(slotId, "cheese");
  stage.dropLayer(pattyId, { kind: "bin" });
  stage.setSlotContent(slotId, "onion");
  const onionId = stage.getState().stationSources[slotId];

  assert.equal(stage.undo(), true);

  const restored = stage.getState();
  assert.deepEqual(restored.assembledOrder, [pattyId]);
  assert.equal(restored.stationContents[slotId], "onion");
  assert.equal(restored.stationSources[slotId], onionId);
  assert.equal(restored.instances[onionId], "onion");
  assert.deepEqual(restored.locations[onionId], { kind: "bin", slotId });
  assert.deepEqual(restored.locations[pattyId], { kind: "prep", index: 0 });
  assert.equal(stage.workbench.getStationBySlot(slotId).id, "onion");
  const onionWorld = stage.burger.getLayer(onionId).getWorldPosition(new THREE.Vector3());
  const slotWorld = stage.workbench.getStationBySlot(slotId)
    .pickupAnchor.getWorldPosition(new THREE.Vector3());
  assert.ok(onionWorld.distanceTo(slotWorld) < 1e-9);
  stage.dispose();
});

test("places all recipe ingredients into matching U-shaped bins", () => {
  const { stage } = harness();

  assert.equal(stage.layerPresentationScale, 0.72);
  assert.equal(stage.binLayerScale, stage.layerPresentationScale);
  assert.equal(stage.prepLayerScale, stage.layerPresentationScale);
  for (const [slotId, layerId] of Object.entries(stage.getState().stationSources)) {
    const layer = stage.burger.getLayer(layerId);
    const station = stage.workbench.getStationBySlot(slotId);
    const stationWorld = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
    const layerWorld = layer.getWorldPosition(new THREE.Vector3());
    assert.ok(layerWorld.distanceTo(stationWorld) < 0.35, layerId);
    assert.deepEqual(layer.scale.toArray(), expectedLayerScale(stage, layerId));
  }
  assert.ok(
    stage.burger.getLayer("cheese").scale.y > stage.burger.getLayer("cheese").scale.x,
    "default cheese keeps its tuned thickness",
  );
  assert.ok(
    stage.burger.getLayer("lettuce").scale.y > stage.burger.getLayer("lettuce").scale.x,
    "default lettuce keeps its tuned thickness",
  );
  assert.deepEqual(stage.getState().assembledOrder, []);
  stage.dispose();
});

test("exposes live presentation scale compatibility getters", () => {
  const { stage } = harness();
  for (const property of ["layerPresentationScale", "binLayerScale", "prepLayerScale"]) {
    assert.equal(typeof Object.getOwnPropertyDescriptor(stage, property)?.get, "function", property);
    assert.equal(stage[property], 0.72, property);
  }

  stage.setTuning({ version: 1, global: { presentationScale: 0.83 } });
  assert.equal(stage.layerPresentationScale, 0.83);
  assert.equal(stage.binLayerScale, 0.83);
  assert.equal(stage.prepLayerScale, 0.83);
  stage.dispose();
});

test("fits the fixed switchable workbench into a tall phone with a usable prep board", () => {
  const { stage, host } = harness();
  host.camera.aspect = 390 / 608;
  host.camera.updateProjectionMatrix();
  host.camera.updateMatrixWorld(true);
  const layout = stage.workbench.getLayout();
  const prepLeft = new THREE.Vector3(layout.prep.bounds.minX, 0, 0).project(host.camera);
  const prepRight = new THREE.Vector3(layout.prep.bounds.maxX, 0, 0).project(host.camera);
  const prepPixels = (prepRight.x - prepLeft.x) * 390 / 2;
  assert.ok(prepPixels >= 180, `prep board is only ${prepPixels}px wide`);

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

test("keeps every real station-selector vertex on screen for both tall phone viewports", () => {
  for (const [label, width, height] of [
    ["390x608", 390, 608],
    ["390x844", 390, 844],
  ]) {
    const canvas = new FakeCanvas();
    const host = createHostHarness();
    host.camera.aspect = width / height;
    host.camera.updateProjectionMatrix();
    const stage = createSoloCookingStage({
      THREE,
      canvas,
      storage: null,
      hostFactory: () => host,
      controllerFactory: (options) => createCookingInteractionController(options),
    });

    assert.equal(host.resizes, 0, `${label} does not depend on a resize event`);
    assertSelectorVerticesFitCamera(stage, label);
    stage.dispose();
  }
});

test("keeps one base food scale while plate snapping starts a temporary local pop", () => {
  const { stage } = harness();
  const layer = stage.burger.getLayer("patty");
  const expected = expectedLayerScale(stage, "patty");
  assert.deepEqual(layer.scale.toArray(), expected);

  stage.dropLayer("patty", { kind: "prep" });
  assert.deepEqual(
    layer.scale.toArray(),
    expected.map((value) => value * 0.64),
    "drop starts at the target layer with a local scale pop",
  );
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

test("rests the default bottom bun visible underside on the prep support", () => {
  const { stage } = harness({
    reducedMotion: true,
    workbenchFactory: (Three, options) => {
      const workbench = createCookingWorkbench3D(Three, options);
      workbench.prep.dropAnchor.position.y = 0.38;
      return workbench;
    },
  });
  stage.dropLayer("bottom-bun", { kind: "prep" });

  const bottom = visibleLayerInterval(stage.burger.getLayer("bottom-bun")).bottom;
  const supportY = stage.workbench.prep.supportY;
  const gap = bottom - supportY;
  const config = stage.getTuning().ingredients[stage.getState().instances["bottom-bun"]];
  assert.equal(config.sinkY, 0.012);
  assert.ok(Math.abs(gap + config.sinkY) < 1e-9, "default sink is applied to the visible underside");
  assert.ok(gap <= 0.005, `bottom bun floats ${gap} above the prep support`);
  assert.ok(gap >= -0.03, `bottom bun penetrates ${-gap} below the prep support`);
  stage.dispose();
});

test("applies per-ingredient tuning to bin and authoritative stack contact planes", () => {
  const tuning = {
    version: 1,
    global: { presentationScale: 0.8 },
    ingredients: {
      patty: { scaleX: 1.25, scaleY: 1.8, scaleZ: 0.7, sinkY: 0.04 },
      cheese: { scaleX: 0.9, scaleY: 1.6, scaleZ: 1.1, sinkY: 0.015 },
    },
  };
  const normalized = normalizeBurgerTuning(tuning);
  const { stage } = harness({ reducedMotion: true, tuning });
  const patty = stage.burger.getLayer("patty");
  const pattyConfig = normalized.ingredients.patty;
  const presentationScale = normalized.global.presentationScale;
  const pattyScale = [pattyConfig.scaleX, pattyConfig.scaleY, pattyConfig.scaleZ]
    .map((value) => value * presentationScale);

  assert.deepEqual(patty.scale.toArray(), pattyScale, "bin uses tuned XYZ scale without sink");
  const binAnchor = stage.workbench.getStation("ingredient", "patty")
    .pickupAnchor.getWorldPosition(new THREE.Vector3());
  const binPosition = patty.getWorldPosition(new THREE.Vector3());
  assert.ok(binPosition.distanceTo(binAnchor) < 1e-9, "sink never offsets a bin ingredient");
  stage.dropLayer("patty", { kind: "prep" });
  assert.deepEqual(patty.scale.toArray(), pattyScale, "prep target keeps the tuned XYZ scale");
  const pattyBottom = patty.position.y + patty.userData.stackMinY * patty.scale.y;
  assert.ok(Math.abs(
    pattyBottom - (stage.workbench.prep.supportY - Math.min(pattyConfig.sinkY, 0.03))
  ) < 1e-9, "the first layer clamps effective sink at the plate safety bound");

  stage.dropLayer("cheese", { kind: "prep" });
  const cheese = stage.burger.getLayer("cheese");
  const cheeseConfig = normalized.ingredients.cheese;
  assert.deepEqual(cheese.scale.toArray(), [
    presentationScale * cheeseConfig.scaleX,
    presentationScale * cheeseConfig.scaleY,
    presentationScale * cheeseConfig.scaleZ,
  ]);
  const pattyTop = patty.position.y + patty.userData.stackMaxY * patty.scale.y;
  const cheeseBottom = cheese.position.y + cheese.userData.stackMinY * cheese.scale.y;
  assert.ok(Math.abs(
    cheeseBottom - (pattyTop - 0.025 - cheeseConfig.sinkY)
  ) < 1e-9, "next layer follows tuned scaleY contact planes and sink");
  stage.dispose();
});

test("maps canonical, repeated, and replenished instances through their ingredient type", () => {
  const tuning = {
    version: 1,
    global: { presentationScale: 0.8 },
    ingredients: {
      patty: { scaleX: 0.75, scaleY: 2.1, scaleZ: 1.3, sinkY: 0.035 },
    },
  };
  const normalized = normalizeBurgerTuning(tuning);
  const config = normalized.ingredients.patty;
  const expectedScale = [config.scaleX, config.scaleY, config.scaleZ]
    .map((value) => value * normalized.global.presentationScale);
  const { stage } = harness({ reducedMotion: true, tuning });

  const canonicalId = stage.getState().binSources.patty;
  stage.dropLayer(canonicalId, { kind: "prep" });
  const repeatedId = stage.getState().binSources.patty;
  stage.dropLayer(repeatedId, { kind: "prep" });
  const replenishedId = stage.getState().binSources.patty;

  for (const instanceId of [canonicalId, repeatedId, replenishedId]) {
    assert.equal(stage.getState().instances[instanceId], "patty");
    assert.deepEqual(stage.burger.getLayer(instanceId).scale.toArray(), expectedScale, instanceId);
  }

  const latestInput = {
    version: 1,
    global: { presentationScale: 0.77 },
    ingredients: {
      patty: { scaleX: 1.4, scaleY: 0.65, scaleZ: 0.85, sinkY: 0.02 },
    },
  };
  const latest = normalizeBurgerTuning(latestInput);
  stage.setTuning(latestInput);
  const latestConfig = latest.ingredients.patty;
  const latestScale = [latestConfig.scaleX, latestConfig.scaleY, latestConfig.scaleZ]
    .map((value) => value * latest.global.presentationScale);
  for (const instanceId of [canonicalId, repeatedId, replenishedId]) {
    assert.deepEqual(stage.burger.getLayer(instanceId).scale.toArray(), latestScale, instanceId);
  }
  stage.dispose();
});

test("getTuning and setTuning normalize frozen live targets without mutating cooking state", () => {
  const changes = [];
  const { stage } = harness({ onChange: (detail) => changes.push(detail) });
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.applySauceStroke(sampleStroke("house-sauce", "bottom-bun"));
  const stateBefore = stage.getState();
  const fieldIdentities = {
    assembledOrder: stateBefore.assembledOrder,
    inventory: stateBefore.inventory,
    history: stateBefore.history,
    strokes: stateBefore.strokes,
  };
  const input = {
    version: 1,
    global: { presentationScale: 0.86 },
    ingredients: {
      "bottom-bun": { scaleX: 1.3, scaleY: 2, scaleZ: 0.9, sinkY: 0.02 },
      cheese: { scaleX: "invalid", scaleY: 999, scaleZ: Infinity, sinkY: -10 },
    },
  };
  const expected = normalizeBurgerTuning(input);

  const applied = stage.setTuning(input);

  assert.strictEqual(stage.getTuning(), applied);
  assert.deepEqual(applied, expected);
  assert.ok(Object.isFrozen(applied));
  assert.ok(Object.isFrozen(applied.global));
  assert.ok(Object.isFrozen(applied.ingredients));
  assert.ok(Object.isFrozen(applied.ingredients.cheese));
  assert.strictEqual(stage.getState(), stateBefore);
  assert.strictEqual(stage.getState().assembledOrder, fieldIdentities.assembledOrder);
  assert.strictEqual(stage.getState().inventory, fieldIdentities.inventory);
  assert.strictEqual(stage.getState().history, fieldIdentities.history);
  assert.strictEqual(stage.getState().strokes, fieldIdentities.strokes);
  assert.equal(stage.getState().finished, false);

  const bottomBun = stage.burger.getLayer("bottom-bun");
  const bottomConfig = expected.ingredients["bottom-bun"];
  assert.deepEqual(bottomBun.scale.toArray(), [
    expected.global.presentationScale * bottomConfig.scaleX,
    expected.global.presentationScale * bottomConfig.scaleY,
    expected.global.presentationScale * bottomConfig.scaleZ,
  ]);
  assert.ok(Math.abs(
    bottomBun.position.y + bottomBun.userData.stackMinY * bottomBun.scale.y
      - (stage.workbench.prep.supportY - bottomConfig.sinkY)
  ) < 1e-9);
  const cheese = stage.burger.getLayer(stage.getState().binSources.cheese);
  const cheeseConfig = expected.ingredients.cheese;
  assert.deepEqual(cheese.scale.toArray(), [
    expected.global.presentationScale * cheeseConfig.scaleX,
    expected.global.presentationScale * cheeseConfig.scaleY,
    expected.global.presentationScale * cheeseConfig.scaleZ,
  ]);

  const tunedTransform = readLayerTransform(bottomBun);
  stage.tick(10_000);
  assert.deepEqual(readLayerTransform(bottomBun), tunedTransform, "old motion cannot overwrite tuning");
  assert.equal(changes.at(-1).reason, "tuning");
  assert.equal(changes.at(-1).dropIntent, null);
  stage.dispose();
});

test("setTuning clears transient visuals and transitions while adapting the stack camera", () => {
  const changes = [];
  const { stage, configuration } = harness({
    reducedMotion: true,
    onChange: (detail) => changes.push(detail),
  });
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.dropLayer("cheese", { kind: "prep" });
  const cameraReasons = [];
  stage.controller.getCameraView = () => ({
    target: { x: 0, y: -10, z: 0 },
    yaw: 0,
    pitch: 0.3,
    distance: 5,
  });
  stage.controller.setCameraView = (_view, reason) => {
    cameraReasons.push(reason);
    return true;
  };

  configuration.onPick({ id: "patty" });
  configuration.onMove({ id: "patty", reason: "drag", point: prepIntentPoints(stage).top });
  assert.equal(stage.burger.selectionFeedback.visible, true);
  assert.equal(stage.burger.dropPreview.visible, true);
  assert.equal(stage.workbench.dropCue.visible, true);
  const stateBefore = stage.getState();

  stage.setTuning({ version: 1, global: { presentationScale: 0.88 } });

  assert.strictEqual(stage.getState(), stateBefore);
  assert.equal(stage.burger.selectionFeedback.visible, false);
  assert.equal(stage.burger.dropPreview.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  assert.equal(changes.at(-1).reason, "tuning");
  assert.equal(changes.at(-1).dropIntent, null);
  assert.deepEqual(cameraReasons, ["stack-growth"]);

  stage.toggleExpanded();
  stage.setTuning({ version: 1, global: { presentationScale: 0.79 } });
  const cheese = stage.burger.getLayer("cheese");
  const tunedTransform = readLayerTransform(cheese);
  stage.tick(10_000);
  assert.deepEqual(readLayerTransform(cheese), tunedTransform, "old transition stays cancelled");
  stage.dispose();
});

test("setTuning silently cancels a real active drag and restores its tuned authority", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas } = harness({
    reducedMotion: true,
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  const patty = stage.burger.getLayer("patty");
  const surfaceWorld = patty.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 41, surfaceWorld));
  assert.equal(stage.controller.getState(), "dragging-layer");

  const prepWorld = stage.workbench.root.localToWorld(new THREE.Vector3(0, 0.42, 0));
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 41, prepWorld));
  assert.equal(stage.controller.getState(), "dragging-layer");
  assert.equal(updates.at(-1).dropIntent?.kind, "prep");
  assert.equal(stage.burger.dropPreview.visible, true);
  updates.length = 0;

  stage.setTuning({
    version: 1,
    global: { presentationScale: 0.81 },
    ingredients: {
      patty: { scaleX: 1.2, scaleY: 1.7, scaleZ: 0.8, sinkY: 0.04 },
    },
  });

  assert.deepEqual(vibrations, []);
  assert.deepEqual(updates.map(({ reason }) => reason), ["tuning"]);
  assert.equal(updates[0].dropIntent, null);
  assert.equal(stage.controller.getState(), "idle");
  assert.equal(stage.burger.dropPreview.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  const binAnchor = stage.workbench.getStation("ingredient", "patty")
    .pickupAnchor.getWorldPosition(new THREE.Vector3());
  const actualWorld = patty.getWorldPosition(new THREE.Vector3());
  assert.ok(actualWorld.distanceTo(binAnchor) < 1e-9);
  assert.deepEqual(patty.scale.toArray(), expectedLayerScale(stage, "patty"));
  stage.dispose();
});

test("setTuning cancels a real active sauce preview without invalid feedback", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas } = harness({
    reducedMotion: true,
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  stage.dropLayer("patty", { kind: "prep" });
  const bottle = stage.tools.get("ketchup");
  const bottleWorld = bottle.body.getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 43, bottleWorld));
  assert.equal(stage.controller.getState(), "dragging-bottle");
  const patty = stage.burger.getLayer("patty");
  const foodWorld = patty.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 43, foodWorld));
  assert.ok(patty.children.some(({ userData }) => userData.preview === true));
  updates.length = 0;

  stage.setTuning({ version: 1, global: { presentationScale: 0.82 } });

  assert.deepEqual(vibrations, []);
  assert.deepEqual(updates.map(({ reason }) => reason), ["tuning"]);
  assert.equal(stage.controller.getState(), "idle");
  assert.equal(patty.children.some(({ userData }) => userData.preview === true), false);
  assert.equal(stage.tools.previewRoot.children.length, 0);
  stage.dispose();
});

test("setTuning resumes an eligible stage after pause failure without masking the primary error", () => {
  const pauseError = new Error("pause failed");
  const resumeError = new Error("resume failed");
  const calls = { pause: 0, resume: 0 };
  const updates = [];
  const vibrations = [];
  let configuration;
  let throwPause = true;
  let throwResume = true;
  const controller = {
    resetCamera: () => true,
    pause() {
      calls.pause += 1;
      if (throwPause) throw pauseError;
    },
    resume() {
      calls.resume += 1;
      if (throwResume) throw resumeError;
    },
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    hostFactory: createHostHarness,
    controllerFactory: (value) => { configuration = value; return controller; },
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });

  assert.throws(
    () => stage.setTuning({ version: 1, global: { presentationScale: 0.8 } }),
    (error) => error === pauseError,
  );
  assert.deepEqual(calls, { pause: 1, resume: 1 });

  configuration.onInvalid({ reason: "outside-prep" });
  assert.deepEqual(vibrations, [28], "suppression is reset after the failed pause");
  assert.equal(updates.at(-1).reason, "invalid-drop");
  throwPause = false;
  throwResume = false;
  stage.dispose();
});

test("setTuning preserves an observer error when the required resume also fails", () => {
  const observerError = new Error("observer failed");
  const resumeError = new Error("resume failed");
  const calls = { pause: 0, resume: 0 };
  let throwResume = true;
  const controller = {
    resetCamera: () => true,
    pause() { calls.pause += 1; },
    resume() {
      calls.resume += 1;
      if (throwResume) throw resumeError;
    },
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    hostFactory: createHostHarness,
    controllerFactory: () => controller,
    onChange: ({ reason }) => {
      if (reason === "tuning") throw observerError;
    },
  });

  assert.throws(
    () => stage.setTuning({ version: 1, global: { presentationScale: 0.8 } }),
    (error) => error === observerError,
  );
  assert.deepEqual(calls, { pause: 1, resume: 1 });
  assert.equal(stage.getTuning().global.presentationScale, 0.8);
  throwResume = false;
  stage.dispose();
});

test("setTuning does not resume after its observer externally pauses interaction", () => {
  const calls = { pause: 0, resume: 0 };
  const controller = {
    resetCamera: () => true,
    pause() { calls.pause += 1; },
    resume() { calls.resume += 1; },
    dispose() {},
  };
  let stage;
  stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    hostFactory: createHostHarness,
    controllerFactory: () => controller,
    onChange: ({ reason }) => {
      if (reason === "tuning") stage.setInteractionPaused(true);
    },
  });

  stage.setTuning({ version: 1, global: { presentationScale: 0.8 } });

  assert.deepEqual(calls, { pause: 2, resume: 0 });
  stage.dispose();
});

test("setTuning preserves falsy observer throws when resume also fails", () => {
  const resumeError = new Error("resume failed");
  let observerValue = null;
  const controller = {
    resetCamera: () => true,
    pause() {},
    resume() { throw resumeError; },
    dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    hostFactory: createHostHarness,
    controllerFactory: () => controller,
    onChange: ({ reason }) => {
      if (reason === "tuning") throw observerValue;
    },
  });

  for (const expected of [null, false]) {
    observerValue = expected;
    const notThrown = Symbol("not thrown");
    let caught = notThrown;
    try {
      stage.setTuning({ version: 1, global: { presentationScale: 0.8 } });
    } catch (error) {
      caught = error;
    }
    assert.notStrictEqual(caught, notThrown);
    assert.strictEqual(caught, expected);
  }
  stage.dispose();
});

test("setInteractionPaused silently cancels a real active drag", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas } = harness({
    reducedMotion: true,
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  const patty = stage.burger.getLayer("patty");
  const surfaceWorld = patty.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 42, surfaceWorld));
  const prepWorld = stage.workbench.root.localToWorld(new THREE.Vector3(0, 0.42, 0));
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 42, prepWorld));
  assert.equal(stage.controller.getState(), "dragging-layer");
  assert.equal(updates.at(-1).dropIntent?.kind, "prep");
  updates.length = 0;

  assert.equal(stage.setInteractionPaused(true), true);

  assert.deepEqual(vibrations, []);
  assert.deepEqual(updates, []);
  assert.equal(stage.controller.getState(), "idle");
  assert.equal(stage.burger.dropPreview.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  const binAnchor = stage.workbench.getStation("ingredient", "patty")
    .pickupAnchor.getWorldPosition(new THREE.Vector3());
  const actualWorld = patty.getWorldPosition(new THREE.Vector3());
  assert.ok(actualWorld.distanceTo(binAnchor) < 1e-9);
  assert.deepEqual(patty.scale.toArray(), expectedLayerScale(stage, "patty"));
  assert.equal(stage.setInteractionPaused(false), false);
  stage.dispose();
});

test("setInteractionPaused owns gesture cancellation and prevents forbidden resumes", () => {
  const calls = { pause: 0, resume: 0, dispose: 0 };
  let gestureActive = true;
  const controller = {
    resetCamera: () => true,
    pause() { calls.pause += 1; gestureActive = false; },
    resume() { calls.resume += 1; },
    dispose() { calls.dispose += 1; },
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    hostFactory: createHostHarness,
    controllerFactory: () => controller,
    reducedMotion: true,
  });

  assert.equal(stage.setInteractionPaused(true), true);
  assert.equal(gestureActive, false, "pausing cancels the controller's current gesture");
  assert.equal(calls.pause, 1);
  stage.setTuning({ version: 1, global: { presentationScale: 0.8 } });
  assert.equal(calls.pause, 2, "live tuning temporarily pauses the controller");
  assert.equal(calls.resume, 0, "live tuning cannot override an external pause");
  assert.equal(stage.setInteractionPaused(false), false);
  assert.equal(calls.resume, 1, "an unfinished active stage may resume");

  loadedLayerIds(stage).forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));
  assert.equal(stage.finish(), true);
  const finishedState = stage.getState();
  const resumesAtFinish = calls.resume;
  assert.equal(stage.setInteractionPaused(false), false);
  stage.setTuning({ version: 1, global: { presentationScale: 0.75 } });
  assert.strictEqual(stage.getState(), finishedState);
  assert.equal(stage.getState().finished, true);
  assert.equal(calls.resume, resumesAtFinish, "finished stages never resume interaction");

  stage.dispose();
  assert.equal(calls.dispose, 1);
  assert.equal(stage.setInteractionPaused(false), false);
  assert.equal(calls.resume, resumesAtFinish, "disposed stages never resume interaction");
});

test("stacks all seven scaled layers in visible contact without cumulative air gaps", () => {
  const { stage } = harness({ reducedMotion: true });
  loadedLayerIds(stage).forEach((id) => stage.dropLayer(id, { kind: "prep" }));

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

test("indexed preview uses each layer's live nonuniform target scale and prep support", () => {
  const tuning = {
    version: 1,
    global: { presentationScale: 0.8 },
    ingredients: {
      "bottom-bun": { scaleX: 0.7, scaleY: 1.8, scaleZ: 1.1, sinkY: 0.02 },
      patty: { scaleX: 1.6, scaleY: 2.5, scaleZ: 0.6, sinkY: 0.04 },
    },
  };
  const { stage, configuration } = stageHarnessWithConfiguration({
    reducedMotion: true,
    tuning,
    workbenchFactory: (Three, options) => {
      const workbench = createCookingWorkbench3D(Three, options);
      workbench.prep.dropAnchor.position.y = workbench.prep.supportY + 0.41;
      return workbench;
    },
  });
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.dropLayer("top-bun", { kind: "prep" });
  const lower = stage.burger.getLayer("bottom-bun");
  const upper = stage.burger.getLayer("top-bun");
  const selected = stage.burger.getLayer("patty");
  const lowerY = lower.position.y;
  const upperY = upper.position.y;

  configuration.onPick({ id: "patty" });
  const prep = stage.workbench.getLayout().prep.bounds;
  configuration.onMove({
    id: "patty",
    reason: "drag",
    point: new THREE.Vector3(0, 0, (prep.minZ + prep.maxZ) / 2),
  });

  assert.equal(stage.workbench.dropCue.userData.targetIndex, 1);
  const selectedTargetScale = expectedLayerScale(stage, "patty");
  const tunedThickness = (
    selected.userData.stackMaxY - selected.userData.stackMinY
  ) * selectedTargetScale[1];
  assert.ok(Math.abs(upper.position.y - upperY - tunedThickness - 0.08) < 1e-9);
  assert.equal(lower.position.y, lowerY);
  stage.host.scene.updateMatrixWorld(true);
  const expectedCueWorldY = lower.localToWorld(
    new THREE.Vector3(0, lower.userData.stackMaxY, 0),
  ).y + 0.015;
  const cueWorldY = stage.workbench.dropCue.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(Math.abs(cueWorldY - expectedCueWorldY) < 1e-9);
  const expectedRadius = selected.userData.surfaceRadius
    * Math.max(selectedTargetScale[0], selectedTargetScale[2]);
  assert.ok(Math.abs(stage.workbench.dropCue.scale.x - expectedRadius) < 1e-9);
  assert.deepEqual(stage.burger.dropPreview.scale.toArray(), selectedTargetScale);
  const collapsedGhostBottom = stage.burger.dropPreview.localToWorld(
    new THREE.Vector3(0, selected.userData.stackMinY, 0),
  ).y;

  assert.equal(stage.toggleExpanded(), true);
  configuration.onPick({ id: "patty" });
  configuration.onMove({
    id: "patty",
    reason: "drag",
    point: new THREE.Vector3(0, 0, (prep.minZ + prep.maxZ) / 2),
  });
  stage.host.scene.updateMatrixWorld(true);
  const expandedCueWorldY = stage.workbench.dropCue.getWorldPosition(new THREE.Vector3()).y;
  const expandedGhostBottom = stage.burger.dropPreview.localToWorld(
    new THREE.Vector3(0, selected.userData.stackMinY, 0),
  ).y;
  assert.ok(Math.abs(expandedCueWorldY - cueWorldY - 0.42) < 1e-9);
  assert.ok(Math.abs(expandedGhostBottom - collapsedGhostBottom - 0.42) < 1e-9);
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
  const untouchedIds = ["tomato", "lettuce", "middle-bun", "top-bun"];
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
  const pattyConfig = stage.getTuning().ingredients[stage.getState().instances.patty];
  const targetScaleY = expectedLayerScale(stage, "patty")[1];
  const finalY = stage.workbench.prep.supportY
    - patty.userData.stackMinY * targetScaleY
    - pattyConfig.sinkY;
  configuration.onPick({ id: "patty" });
  configuration.onDrop({ id: "patty", anchor: stage.workbench.prep.dropAnchor, targetIndex: 0 });
  stage.tick(290);
  stage.tick(320);
  const animatedBottom = patty.position.y + patty.userData.stackMinY * patty.scale.y;
  const settledBottom = finalY
    + patty.userData.stackMinY * targetScaleY;
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
  const bottomConfig = stage.getTuning().ingredients[stage.getState().instances["bottom-bun"]];
  const targetScaleX = expectedLayerScale(stage, "bottom-bun")[0];
  const targetScaleY = expectedLayerScale(stage, "bottom-bun")[1];
  const finalBottomY = stage.workbench.prep.supportY
    - bottomBun.userData.stackMinY * targetScaleY
    - bottomConfig.sinkY;
  stage.tick(1250);
  assert.ok(bottomBun.position.y >= finalBottomY, "new layer never travels through the stack");
  assert.notEqual(bottomBun.scale.x, targetScaleX, "new layer is scaling locally");
  stage.tick(1380);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.ok(Math.abs(bottomBun.position.y - finalBottomY) < 1e-9);
  stage.dispose();
});

test("maximum bottom bun sink stays safe statically and throughout its local scale pop", () => {
  const tuning = {
    version: 1,
    ingredients: {
      "bottom-bun": { sinkY: 0.18 },
      patty: { sinkY: 0.18 },
    },
  };
  const { stage: settledStage } = harness({ reducedMotion: true, tuning });
  settledStage.dropLayer("bottom-bun", { kind: "prep", targetIndex: 0 });
  const settledBottomBun = settledStage.burger.getLayer("bottom-bun");
  const settledGap = visibleLayerInterval(settledBottomBun).bottom
    - settledStage.workbench.prep.supportY;
  assert.equal(settledStage.getTuning().ingredients["bottom-bun"].sinkY, 0.18);
  assert.ok(settledGap <= 0.005 && settledGap >= -0.03 - 1e-9);
  settledStage.dropLayer("patty", { kind: "prep", targetIndex: 1 });
  const patty = settledStage.burger.getLayer("patty");
  const lowerTop = settledBottomBun.position.y
    + settledBottomBun.userData.stackMaxY * settledBottomBun.scale.y;
  const pattyBottom = patty.position.y + patty.userData.stackMinY * patty.scale.y;
  assert.ok(Math.abs(pattyBottom - (lowerTop - 0.025 - 0.18)) < 1e-9);
  settledStage.dispose();

  const { stage } = harness({ tuning });
  const bottomBun = stage.burger.getLayer("bottom-bun");
  stage.dropLayer("bottom-bun", { kind: "prep", targetIndex: 0 });

  for (const time of [0, 80, 160, 240, 320, 380]) {
    if (time > 0) stage.tick(time);
    const visibleBottom = visibleLayerInterval(bottomBun).bottom;
    const supportGap = visibleBottom - stage.workbench.prep.supportY;
    assert.ok(supportGap <= 0.005, `bottom bun floats ${supportGap} at ${time}ms`);
    assert.ok(supportGap >= -0.03 - 1e-9, `bottom bun penetrates ${-supportGap} at ${time}ms`);
  }
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
      + lower.userData.stackMaxY * lower.scale.y;
    const upperBottom = upper.position.y
      + upper.userData.stackMinY * upper.scale.y;
    assert.ok(
      upperBottom <= lowerTop + 1e-9,
      `${order[index]} rests on ${order[index - 1]} instead of floating`,
    );
    assert.ok(lowerTop - upperBottom <= 0.08, "contact overlap stays subtle");
  }

  const topBun = stage.burger.getLayer("top-bun");
  const lettuce = stage.burger.getLayer("lettuce");
  const bunBottom = topBun.position.y
    + topBun.userData.boundsMinY * topBun.scale.y;
  const lettuceTop = lettuce.position.y
    + lettuce.userData.stackMaxY * lettuce.scale.y;
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

test("home impact amplitude follows the returning layer's tuned thickness", () => {
  const { stage } = harness({
    tuning: {
      version: 1,
      global: { presentationScale: 0.9 },
      ingredients: {
        patty: { scaleX: 0.7, scaleY: 2.5, scaleZ: 1.6, sinkY: 0.03 },
      },
    },
  });
  const patty = stage.burger.getLayer("patty");
  stage.dropLayer("patty", { kind: "prep" });
  stage.tick(380);
  const station = stage.workbench.getStation("ingredient", "patty");
  stage.workbench.root.updateMatrixWorld(true);
  stage.burger.root.updateMatrixWorld(true);
  const homeTarget = stage.burger.root.worldToLocal(
    station.pickupAnchor.getWorldPosition(new THREE.Vector3()),
  );

  stage.dropLayer("patty", { kind: "bin" });
  stage.tick(380 + 240 * (0.55 + 0.27 / 2));

  const targetScaleY = expectedLayerScale(stage, "patty")[1];
  const tunedThickness = (
    patty.userData.stackMaxY - patty.userData.stackMinY
  ) * targetScaleY;
  assert.ok(Math.abs(patty.position.y - (homeTarget.y - tunedThickness * 0.09)) < 1e-9);
  assert.deepEqual(patty.scale.toArray(), expectedLayerScale(stage, "patty"));
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

test("replenishes bins, stacks sixty repeated portions in contact, and expands the camera", () => {
  const { stage } = harness();
  const initialView = stage.controller.getCameraView();

  for (let index = 0; index < MAX_SOLO_STACK_LAYERS; index += 1) {
    const sourceId = stage.getState().binSources.patty;
    assert.equal(stage.dropLayer(sourceId, { kind: "prep" }), true);
    stage.tick((index + 1) * 500);
  }

  const state = stage.getState();
  assert.equal(state.assembledOrder.length, 60);
  assert.equal(state.inventory.patty, SOLO_INGREDIENT_STOCK - 60);
  assert.equal(stage.burger.layers.size, SOLO_BURGER_INGREDIENT_IDS.length + 60);
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
    "the sixty-first layer is rejected without disturbing the stack",
  );
  assert.equal(stage.getState().assembledOrder.length, 60);
  stage.dispose();
});

test("a real sixty-first bin drag is rejected at resolution and returns fully home", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas } = harness({
    reducedMotion: true,
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  for (let index = 0; index < MAX_SOLO_STACK_LAYERS; index += 1) {
    assert.equal(stage.dropLayer(stage.getState().binSources.patty, { kind: "prep" }), true);
    stage.tick((index + 1) * 500);
  }

  const stateBefore = stage.getState();
  const stateSnapshot = {
    assembledOrder: [...stateBefore.assembledOrder],
    history: [...stateBefore.history],
    inventory: { ...stateBefore.inventory },
  };
  const cameraBefore = stage.controller.getCameraView();
  const sourceId = stateBefore.binSources.patty;
  const source = stage.burger.getLayer(sourceId);
  const sourceTransform = readLayerTransform(source);
  const sourceHome = stage.workbench.getStation("ingredient", "patty")
    .pickupAnchor.getWorldPosition(new THREE.Vector3());
  const sourceSurface = source.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  updates.length = 0;

  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 61, sourceSurface));
  assert.equal(stage.controller.getState(), "dragging-layer");
  const prepWorld = stage.workbench.root.localToWorld(new THREE.Vector3(0, 0.42, 0));
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 61, prepWorld));
  assert.equal(updates.at(-1).dropIntent?.kind, "prep");
  stage.controller.pointerUp(pointerAtWorld(stage, canvas, 61, prepWorld));

  assert.equal(stage.controller.getState(), "idle");
  assert.strictEqual(stage.getState(), stateBefore);
  assert.deepEqual(stage.getState().assembledOrder, stateSnapshot.assembledOrder);
  assert.deepEqual(stage.getState().history, stateSnapshot.history);
  assert.deepEqual(stage.getState().inventory, stateSnapshot.inventory);
  assert.deepEqual(stage.controller.getCameraView(), cameraBefore);
  assert.deepEqual(readLayerTransform(source), sourceTransform);
  assert.ok(source.getWorldPosition(new THREE.Vector3()).distanceTo(sourceHome) < 1e-9);
  assert.equal(stage.burger.dropPreview.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  assert.equal(stage.burger.selectionFeedback.visible, false);
  assert.equal(updates.at(-1).reason, "invalid-drop");
  assert.equal(updates.at(-1).dropIntent, null);
  assert.match(updates.at(-1).message, /最多.*60.*层/);
  assert.deepEqual(vibrations, [28]);

  stage.tick(40_000);
  assert.deepEqual(readLayerTransform(source), sourceTransform);
  assert.ok(source.getWorldPosition(new THREE.Vector3()).distanceTo(sourceHome) < 1e-9);
  stage.dispose();
});

test("an assembled layer can still be reordered by real drag when all sixty slots are full", () => {
  const { stage, canvas } = harness({ reducedMotion: true });
  for (let index = 0; index < MAX_SOLO_STACK_LAYERS; index += 1) {
    assert.equal(stage.dropLayer(stage.getState().binSources.patty, { kind: "prep" }), true);
    stage.tick((index + 1) * 500);
  }

  const before = stage.getState();
  const inventoryBefore = { ...before.inventory };
  const requestedSurface = stage.burger.getLayer(before.assembledOrder[0]).userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 62, requestedSurface));
  assert.equal(stage.controller.getState(), "dragging-layer");
  const movingId = stage.controller.getSelectedId();
  const movingIndex = before.assembledOrder.indexOf(movingId);
  assert.ok(movingIndex >= 0, "the real hit is an already assembled layer");
  const targetEdge = movingIndex < MAX_SOLO_STACK_LAYERS / 2 ? "top" : "bottom";
  const intentPoint = prepIntentPoints(stage)[targetEdge];
  const targetPoint = stage.workbench.root.localToWorld(
    new THREE.Vector3(intentPoint.x, 0.42, intentPoint.z),
  );
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 62, targetPoint));
  assert.equal(stage.burger.dropPreview.visible, true);
  const targetIndex = stage.workbench.dropCue.userData.targetIndex;
  assert.notEqual(targetIndex, movingIndex);
  stage.controller.pointerUp(pointerAtWorld(stage, canvas, 62, targetPoint));

  const after = stage.getState();
  assert.equal(stage.controller.getState(), "idle");
  assert.equal(after.assembledOrder.length, MAX_SOLO_STACK_LAYERS);
  assert.equal(after.assembledOrder[targetIndex], movingId);
  assert.notDeepEqual(after.assembledOrder, before.assembledOrder);
  assert.deepEqual(after.inventory, inventoryBefore);
  stage.dispose();
});

test("sixty maximum-tuned layers fit portrait and landscape at both pitch extremes", () => {
  const { stage } = harness();
  const initialView = stage.controller.getCameraView();
  const maximumTuning = {
    version: 1,
    global: { presentationScale: 0.9 },
    ingredients: {
      "top-bun": { scaleX: 1.6, scaleY: 2.5, scaleZ: 1.6, sinkY: 0 },
    },
  };
  for (let index = 0; index < MAX_SOLO_STACK_LAYERS; index += 1) {
    const sourceId = stage.getState().binSources["top-bun"];
    assert.equal(stage.dropLayer(sourceId, { kind: "prep" }), true);
    stage.tick((index + 1) * 500);
  }

  stage.setTuning(maximumTuning);

  const distances = new Map();
  for (const [viewport, aspect] of [
    ["portrait 390x844", 390 / 844],
    ["landscape 844x390", 844 / 390],
  ]) {
    stage.host.camera.aspect = aspect;
    stage.host.camera.updateProjectionMatrix();

    for (const [pitchName, pitch] of [
      ["minPitch", -1.18],
      ["maxPitch", 1.56],
    ]) {
      const current = stage.controller.getCameraView();
      stage.controller.setCameraView({
        target: current.target,
        yaw: 0.73,
        pitch,
        distance: 5,
      }, "test-extreme-view");
      stage.setTuning(maximumTuning);

      const normal = stage.controller.getCameraView();
      assert.ok(Math.abs(normal.yaw - 0.73) < 1e-9, `${viewport} ${pitchName} normal yaw`);
      assert.ok(Math.abs(normal.pitch - pitch) < 1e-9, `${viewport} ${pitchName} normal pitch`);
      assertStackFitsCamera(stage, `${viewport} ${pitchName} normal`);
      distances.set(`${viewport}:${pitchName}`, normal.distance);

      assert.equal(stage.setBurgerFocus(true), true);
      const focused = stage.controller.getCameraView();
      assert.ok(Math.abs(focused.yaw - normal.yaw) < 1e-9, `${viewport} ${pitchName} focus yaw`);
      assert.ok(Math.abs(focused.pitch - normal.pitch) < 1e-9, `${viewport} ${pitchName} focus pitch`);
      assertStackFitsCamera(stage, `${viewport} ${pitchName} focus`);

      stage.host.camera.far = 10;
      assert.equal(stage.resetCamera(), true);
      assert.equal(stage.isBurgerFocused(), true);
      assertStackFitsCamera(stage, `${viewport} ${pitchName} focused reset`);
      assert.ok(stage.host.camera.far > 10, `${viewport} ${pitchName} extends the far plane`);

      assert.equal(stage.setBurgerFocus(false), false);
      const restored = stage.controller.getCameraView();
      assert.ok(Math.abs(restored.yaw - normal.yaw) < 1e-9, `${viewport} ${pitchName} restored yaw`);
      assert.ok(Math.abs(restored.pitch - normal.pitch) < 1e-9, `${viewport} ${pitchName} restored pitch`);
      assertStackFitsCamera(stage, `${viewport} ${pitchName} restored normal`);

      assert.equal(stage.resetCamera(), true);
      const reset = stage.controller.getCameraView();
      assert.ok(reset.distance > initialView.distance + 1, `${viewport} ${pitchName} reset re-fits stack`);
      assertStackFitsCamera(stage, `${viewport} ${pitchName} reset normal`);
    }
  }

  assert.notEqual(
    distances.get("portrait 390x844:maxPitch"),
    distances.get("landscape 844x390:maxPitch"),
    "camera fit responds to aspect instead of using a height-only multiplier",
  );

  stage.host.camera.aspect = 844 / 390;
  stage.host.camera.updateProjectionMatrix();
  const beforeResize = stage.controller.getCameraView();
  stage.controller.setCameraView({
    target: beforeResize.target,
    yaw: 0.73,
    pitch: 1.56,
    distance: 5,
  }, "test-before-resize");
  stage.setTuning(maximumTuning);
  const landscapeDistance = stage.controller.getCameraView().distance;
  const resizeCalls = stage.host.resizes;
  stage.host.camera.aspect = 390 / 844;
  stage.host.camera.updateProjectionMatrix();
  assert.equal(stage.resize(), true);
  assert.equal(stage.host.resizes, resizeCalls + 1);
  assert.ok(stage.controller.getCameraView().distance > landscapeDistance);
  assertStackFitsCamera(stage, "live resize to portrait");

  stage.host.camera.aspect = 390 / 844;
  stage.host.camera.updateProjectionMatrix();
  const collapsed = stage.controller.getCameraView();
  stage.controller.setCameraView({
    target: collapsed.target,
    yaw: 0.73,
    pitch: 0.28,
    distance: 5,
  }, "test-expanded-stack");
  stage.setTuning(maximumTuning);
  assertStackFitsCamera(stage, "collapsed before expansion");
  assert.equal(stage.toggleExpanded(), true);
  stage.tick(40_000);
  assert.ok(
    stage.controller.getCameraView().distance > 220,
    "expanded geometry fit must not be clipped by the old orbit-distance ceiling",
  );
  assertStackFitsCamera(stage, "expanded stack");
  assert.equal(stage.toggleExpanded(), false);
  stage.tick(41_000);
  assertStackFitsCamera(stage, "collapsed after expansion");

  stage.host.camera.aspect = 390 / 844;
  stage.host.camera.updateProjectionMatrix();
  const zoomedOut = stage.controller.getCameraView();
  stage.controller.setCameraView({
    target: zoomedOut.target,
    yaw: 0.73,
    pitch: -1.18,
    distance: 320,
  }, "test-maximum-distance");
  stage.host.camera.far = 10;
  stage.setTuning(maximumTuning);
  assert.equal(stage.controller.getCameraView().distance, 320);
  assertStackFitsCamera(stage, "maximum-distance far plane", { requireTight: false });
  assert.ok(stage.host.camera.far > 320);
  stage.dispose();
});

test("a quick pointer regrab stays continuous while cancelling the old snap transition", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas } = harness({
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  stage.dropLayer("patty", { kind: "prep" });
  const patty = stage.burger.getLayer("patty");
  const contactBeforeRegrab = visibleLayerInterval(patty).bottom;
  const effectiveBottomSink = Math.min(stage.getTuning().ingredients.patty.sinkY, 0.03);
  const expectedContactY = stage.workbench.prep.supportY - effectiveBottomSink;
  const targetScaleY = expectedLayerScale(stage, "patty")[1];
  const targetPositionY = stage.workbench.prep.supportY
    - effectiveBottomSink
    - patty.userData.stackMinY * targetScaleY;
  assert.ok(Math.abs(contactBeforeRegrab - expectedContactY) < 1e-9);

  const pointer = pointerAtWorld(
    stage,
    canvas,
    54,
    patty.userData.selectableSurface.getWorldPosition(new THREE.Vector3()),
  );
  stage.controller.pointerDown(pointer);
  assert.equal(stage.controller.getState(), "dragging-layer");
  const pickedY = patty.position.y;
  assert.deepEqual(
    patty.scale.toArray(),
    expectedLayerScale(stage, "patty"),
    "regrabbing never promotes the transient pop scale to authority",
  );

  stage.controller.pointerMove(pointer);
  assert.ok(
    Math.abs(patty.position.y - pickedY) < 1e-6,
    `same-coordinate drag jumps ${patty.position.y - pickedY}`,
  );

  stage.controller.pointerUp(pointer);
  stage.rotateSelected(Math.PI / 3);

  stage.tick(95);
  assert.ok(Math.abs(stage.burger.getLayer("patty").rotation.y - Math.PI / 3) < 1e-9);
  assert.ok(Math.abs(stage.getState().rotations.patty - Math.PI / 3) < 1e-9);
  assert.ok(Math.abs(patty.position.y - targetPositionY) < 1e-9);
  assert.ok(Math.abs(visibleLayerInterval(patty).bottom - contactBeforeRegrab) < 1e-9);
  assert.deepEqual(vibrations, []);
  assert.equal(updates.some(({ reason }) => reason === "invalid-drop"), false);
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
  stage.applySauceStroke(sampleStroke("ketchup"));
  stage.applySauceStroke(sampleStroke("mustard"));
  stage.applySauceStroke(sampleStroke("ketchup"));

  assert.deepEqual(stage.getState().strokes.map(({ sauce }) => sauce), [
    "ketchup", "mustard", "ketchup",
  ]);
  assert.deepEqual(stage.burger.getSnapshot().strokes.map(({ sauce }) => sauce), [
    "ketchup", "mustard", "ketchup",
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
    stroke: sampleStroke("house-sauce", "cheese"),
  });
  configuration.onSauceCancel({ gestureId: "sauce-2", reason: "pointercancel" });
  assert.equal(stage.burger.getLayer("cheese").children.some((child) => (
    child.userData.preview === true
  )), false);
  assert.equal(stage.getState().strokes.length, 1, "cancel leaves state unchanged");
  stage.dispose();
});

test("highlight ghost and sauce visuals inherit tuned scale without identity or state churn", () => {
  const { stage, configuration } = stageHarnessWithConfiguration({
    reducedMotion: true,
    tuning: {
      version: 1,
      global: { presentationScale: 0.8 },
      ingredients: {
        patty: { scaleX: 1.5, scaleY: 2.2, scaleZ: 0.7, sinkY: 0.03 },
      },
    },
  });
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.dropLayer("patty", { kind: "prep" });
  stage.applySauceStroke(sampleStroke("house-sauce", "patty"));
  const patty = stage.burger.getLayer("patty");
  const sauce = patty.children.find(({ userData }) => userData.sauceStroke);
  const shell = stage.burger.selectionFeedback;
  const ghost = stage.burger.dropPreview;
  const cookingState = stage.getState();

  configuration.onPick({ id: "patty" });
  configuration.onMove({ id: "patty", reason: "drag", point: prepIntentPoints(stage).top });
  stage.host.scene.updateMatrixWorld(true);
  assert.strictEqual(stage.getState(), cookingState);
  assert.strictEqual(shell.parent, patty);
  assert.ok(shell.children.every(({ material }) => material.transparent && material.opacity < 1));
  assert.strictEqual(sauce.parent, patty);
  assert.strictEqual(ghost.parent, stage.burger.root);
  const layerWorldScale = patty.getWorldScale(new THREE.Vector3());
  assert.deepEqual(shell.getWorldScale(new THREE.Vector3()).toArray(), layerWorldScale.toArray());
  assert.deepEqual(sauce.getWorldScale(new THREE.Vector3()).toArray(), layerWorldScale.toArray());
  assert.deepEqual(ghost.getWorldScale(new THREE.Vector3()).toArray(), expectedLayerScale(stage, "patty"));

  stage.setTuning({
    version: 1,
    global: { presentationScale: 0.86 },
    ingredients: {
      patty: { scaleX: 0.65, scaleY: 2.5, scaleZ: 1.6, sinkY: 0.06 },
    },
  });

  assert.strictEqual(stage.getState(), cookingState);
  assert.strictEqual(stage.burger.selectionFeedback, shell);
  assert.strictEqual(stage.burger.dropPreview, ghost);
  assert.strictEqual(sauce.parent, patty);
  stage.host.scene.updateMatrixWorld(true);
  assert.deepEqual(
    sauce.getWorldScale(new THREE.Vector3()).toArray(),
    patty.getWorldScale(new THREE.Vector3()).toArray(),
  );
  configuration.onPick({ id: "patty" });
  configuration.onMove({ id: "patty", reason: "drag", point: prepIntentPoints(stage).top });
  assert.strictEqual(stage.burger.selectionFeedback, shell);
  assert.strictEqual(shell.parent, patty);
  assert.strictEqual(stage.burger.dropPreview, ghost);
  assert.deepEqual(ghost.scale.toArray(), expectedLayerScale(stage, "patty"));
  assert.strictEqual(stage.getState(), cookingState);
  stage.dispose();
});

test("completion freezes editing, shows a real 3d celebration, then allows adjustment", () => {
  const { stage } = harness();
  loadedLayerIds(stage).forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));

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

test("finish silently cancels a real active drag", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas } = harness({
    reducedMotion: true,
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  loadedLayerIds(stage).forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));
  const patty = stage.burger.getLayer("patty");
  const authoritativeTransform = readLayerTransform(patty);
  const surfaceWorld = patty.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 51, surfaceWorld));
  const prepWorld = stage.workbench.root.localToWorld(new THREE.Vector3(0.2, 0.42, 0));
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 51, prepWorld));
  assert.equal(stage.controller.getState(), "dragging-layer");
  assert.equal(updates.at(-1).dropIntent?.kind, "prep");
  updates.length = 0;

  assert.equal(stage.finish(), true);

  assert.deepEqual(vibrations, []);
  assert.deepEqual(updates.map(({ reason }) => reason), ["finish"]);
  assert.equal(stage.controller.getState(), "idle");
  assert.equal(stage.getState().finished, true);
  assert.equal(stage.burger.dropPreview.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  assert.deepEqual(readLayerTransform(patty), authoritativeTransform);
  stage.dispose();
});

test("undo silently cancels a real active drag when restoring finished state", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas } = harness({
    reducedMotion: true,
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  loadedLayerIds(stage).forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));
  stage.finish();
  stage.continueEditing();
  const patty = stage.burger.getLayer("patty");
  const authoritativeTransform = readLayerTransform(patty);
  const surfaceWorld = patty.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 52, surfaceWorld));
  const prepWorld = stage.workbench.root.localToWorld(new THREE.Vector3(-0.2, 0.42, 0));
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 52, prepWorld));
  assert.equal(stage.controller.getState(), "dragging-layer");
  assert.equal(updates.at(-1).dropIntent?.kind, "prep");
  updates.length = 0;

  assert.equal(stage.undo(), true);

  assert.deepEqual(vibrations, []);
  assert.deepEqual(updates.map(({ reason }) => reason), ["undo"]);
  assert.equal(stage.controller.getState(), "idle");
  assert.equal(stage.getState().finished, true);
  assert.equal(stage.burger.dropPreview.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  assert.deepEqual(readLayerTransform(patty), authoritativeTransform);
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
  loadedLayerIds(stage).forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));
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
  stage.applySauceStroke(sampleStroke("house-sauce", "bottom-bun"));
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
  stage.applySauceStroke(sampleStroke("ketchup", "bottom-bun"));
  assert.equal(stage.getTutorial().step, "assemble");

  assert.equal(stage.undo(), true);
  assert.equal(stage.getState().strokes.length, 0);
  assert.equal(stage.getTutorial().step, "sauce");
  assert.equal(stage.undo(), true);
  assert.equal(stage.getState().rotations["bottom-bun"], 0);
  assert.equal(stage.getTutorial().step, "rotate");

  stage.rotateSelected(0.4);
  stage.applySauceStroke(sampleStroke("ketchup", "bottom-bun"));
  stage.dropLayer("patty", { kind: "prep" });
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

test("dispose silently cancels a real active drag before releasing resources", () => {
  const updates = [];
  const vibrations = [];
  const { stage, canvas, host, configuration } = harness({
    reducedMotion: true,
    onChange: (detail) => updates.push(detail),
    vibrate: (pattern) => vibrations.push(pattern),
  });
  const patty = stage.burger.getLayer("patty");
  const surfaceWorld = patty.userData.selectableSurface
    .getWorldPosition(new THREE.Vector3());
  stage.controller.pointerDown(pointerAtWorld(stage, canvas, 53, surfaceWorld));
  const prepWorld = stage.workbench.root.localToWorld(new THREE.Vector3(0, 0.42, 0));
  stage.controller.pointerMove(pointerAtWorld(stage, canvas, 53, prepWorld));
  assert.equal(stage.controller.getState(), "dragging-layer");
  assert.equal(updates.at(-1).dropIntent?.kind, "prep");
  updates.length = 0;

  stage.dispose();

  assert.doesNotThrow(() => configuration.onInvalid({ reason: "disposed" }));
  assert.deepEqual(vibrations, []);
  assert.equal(updates.some(({ reason }) => reason === "invalid-drop"), false);
  assert.equal(stage.controller.getState(), "idle");
  assert.equal(host.disposed, 1);
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
      workbenchFactory: fail("workbench", (Three, options) => createCookingWorkbench3D(Three, options)),
      burgerFactory: fail("burger", (Three, options) => createBurgerModel3D(Three, options)),
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
  assert.equal(changes.at(-1).progress, "1/60");
  assert.equal(changes.at(-1).tutorial.step, "pick");
  assert.equal(JSON.stringify(stage.getState()).includes("HTMLElement"), false);
  stage.dispose();
});

test("selects and preserves a non-destructive burger reference across reset", () => {
  const changes = [];
  const { stage } = harness({ onChange: (detail) => changes.push(detail) });
  stage.dropLayer("bottom-bun", { kind: "prep" });
  assert.equal(stage.selectReferenceRecipe("classic-beef"), true);
  assert.equal(stage.getState().referenceRecipeId, "classic-beef");
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun"]);
  assert.equal(changes.at(-1).reason, "reference-recipe");

  assert.equal(stage.selectReferenceRecipe("classic-beef"), false);
  assert.equal(stage.selectReferenceRecipe("tower-double-beef"), true);
  stage.reset();
  assert.equal(stage.getState().referenceRecipeId, "tower-double-beef");
  assert.deepEqual(stage.getState().assembledOrder, []);
  assert.throws(() => stage.selectReferenceRecipe("not-a-recipe"), /reference recipe/i);
  stage.dispose();
});

test("tutorial reconciles an already complete burger immediately after the first sauce", () => {
  const { stage } = harness();
  stage.selectLayer("bottom-bun");
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.rotateSelected(0.2);
  for (const layerId of loadedLayerIds(stage).filter((id) => id !== "bottom-bun")) {
    stage.dropLayer(layerId, { kind: "prep" });
  }
  assert.equal(stage.getState().complete, true);
  assert.equal(stage.getTutorial().step, "sauce");

  stage.applySauceStroke(sampleStroke("ketchup"));
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
  loadedLayerIds(stage).forEach((layerId) => stage.dropLayer(layerId, { kind: "prep" }));
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
