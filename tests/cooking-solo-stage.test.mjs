import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { BURGER_LAYER_IDS } from "../app/static/cooking-state.mjs";
import { createCookingInteractionController } from "../app/static/cooking-interaction-controller.mjs";
import { createSoloCookingStage } from "../app/static/cooking-solo-stage.mjs";

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

test("places seven actual independent layer groups into their matching U-shaped bins", () => {
  const { stage } = harness();

  assert.ok(stage.binLayerScale >= 0.5, "bin food remains large enough for a phone touch target");
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

test("fills a phone canvas while keeping the complete workbench inside the camera", () => {
  const { stage, host } = harness();
  host.camera.aspect = 390 / 544;
  host.camera.updateProjectionMatrix();
  host.camera.updateMatrixWorld(true);
  const { bounds } = stage.workbench.getLayout();
  let maximumX = 0;
  let maximumY = 0;
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [-0.5, 1.5]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const point = new THREE.Vector3(x, y, z).project(host.camera);
        maximumX = Math.max(maximumX, Math.abs(point.x));
        maximumY = Math.max(maximumY, Math.abs(point.y));
      }
    }
  }
  assert.ok(maximumX >= 0.8, `workbench wastes phone width: ${maximumX}`);
  assert.ok(maximumX <= 1 && maximumY <= 1, "workbench stays fully visible");
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

test("repeated mixed sauce callbacks create volumetric burger tubes and update composition", () => {
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
  assert.ok(sauceMeshes.every(({ geometry }) => geometry instanceof THREE.TubeGeometry));
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

test("stage state and tutorial remain DOM-free and notify concise progress", () => {
  const changes = [];
  const { stage } = harness({ onChange: (detail) => changes.push(detail) });
  stage.dropLayer("bottom-bun", { kind: "prep" });

  assert.equal(stage.getState().assembledOrder.length, 1);
  assert.equal(changes.at(-1).progress, "1/7");
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
