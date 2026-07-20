import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { createCookingInteractionController } from "../app/static/cooking-interaction-controller.mjs";
import { createCookingWorkbench3D } from "../app/static/cooking-workbench-3d.mjs";
import { createBurgerModel3D } from "../app/static/burger-model-3d.mjs";
import { createCondimentTools3D } from "../app/static/condiment-tools-3d.mjs";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  dispatch(type, event = {}) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event);
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createCanvas(width = 200, height = 200) {
  const canvas = new FakeEventTarget();
  canvas.captured = new Set();
  canvas.released = [];
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
  canvas.setPointerCapture = (id) => canvas.captured.add(id);
  canvas.hasPointerCapture = (id) => canvas.captured.has(id);
  canvas.releasePointerCapture = (id) => {
    canvas.captured.delete(id);
    canvas.released.push(id);
  };
  return canvas;
}

function pointer(pointerId, clientX, clientY, extra = {}) {
  return {
    pointerId,
    clientX,
    clientY,
    pointerType: "touch",
    preventDefault() {},
    ...extra,
  };
}

function closeVector(actual, expected, epsilon = 1e-9) {
  assert.ok(actual.distanceTo(expected) <= epsilon, [
    `expected ${expected.toArray().join(",")}`,
    `received ${actual.toArray().join(",")}`,
  ].join("; "));
}

function createPouringScene() {
  const canvas = createCanvas();
  const documentTarget = new FakeEventTarget();
  documentTarget.hidden = false;
  const scene = new THREE.Scene();
  const workbench = createCookingWorkbench3D(THREE);
  scene.add(workbench.root);
  const burger = createBurgerModel3D(THREE);
  workbench.prep.anchor.add(burger.root);
  burger.root.position.y = 0.48;
  burger.setExpanded(true);
  const tools = createCondimentTools3D(THREE, { toolDocks: workbench.toolDocks });
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
  camera.position.set(0, 12, 14);
  camera.lookAt(0, 0, 0);
  scene.updateMatrixWorld(true);
  return {
    canvas,
    documentTarget,
    scene,
    workbench,
    burger,
    tools,
    camera,
    dispose() {
      tools.dispose();
      burger.dispose();
      workbench.dispose();
    },
  };
}

function layerWorldPoint(burger, layerId, normalizedX, normalizedZ) {
  const layer = burger.getLayer(layerId);
  const surface = layer.userData.selectableSurface;
  surface.geometry.computeBoundingBox();
  const bounds = surface.geometry.boundingBox;
  const radiusX = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
  const radiusZ = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
  return {
    object: surface,
    point: surface.localToWorld(new THREE.Vector3(
      normalizedX * radiusX,
      bounds.max.y,
      normalizedZ * radiusZ,
    )),
  };
}

test("uses a real Three raycaster against explicit surfaces and ignores decorations", () => {
  const canvas = createCanvas();
  const documentTarget = new FakeEventTarget();
  documentTarget.hidden = false;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 5, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const layer = new THREE.Group();
  layer.userData.foodLayer = Object.freeze({ food: "test-food", layerId: "base" });
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.5, 2),
    new THREE.MeshBasicMaterial(),
  );
  surface.userData.cookingSelectable = Object.freeze({
    kind: "food-layer", food: "test-food", layerId: "base",
  });
  layer.add(surface);

  const decoration = new THREE.Mesh(
    new THREE.SphereGeometry(2),
    new THREE.MeshBasicMaterial(),
  );
  decoration.position.set(0, 2, 2);
  decoration.updateMatrixWorld(true);
  layer.updateMatrixWorld(true);

  const picks = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    selectableSurfaces: [surface],
    draggables: [{ id: "base", object: layer, surfaces: [surface] }],
    onPick: (detail) => picks.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(1, 100, 100));

  assert.equal(controller.getState(), "dragging-layer");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].id, "base");
  assert.equal(picks[0].surface, surface);
  assert.notEqual(picks[0].surface, decoration);
  assert.deepEqual([...canvas.captured], [1]);
  controller.dispose();
});

test("captures and drags one layer over the prep plane with lift, then drops without losing pose", () => {
  const canvas = createCanvas();
  const documentTarget = new FakeEventTarget();
  documentTarget.hidden = false;
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(1, 2, 3);
  layer.rotation.set(0.2, 0.3, 0.4);
  layer.scale.set(1.1, 1.2, 1.3);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const moves = [];
  const drops = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    draggables: [{ id: "filling", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 10, 0, clientY / 10),
    dragLift: 0.45,
    prepBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    onMove: (detail) => moves.push(detail),
    onDrop: (detail) => drops.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(7, 10, 20));
  canvas.dispatch("pointermove", pointer(7, 30, 40));

  assert.deepEqual(layer.position.toArray(), [3, 2.45, 5]);
  assert.equal(layer.rotation.x, 0.2);
  assert.equal(layer.rotation.y, 0.3);
  assert.equal(layer.rotation.z, 0.4);
  assert.deepEqual(layer.scale.toArray(), [1.1, 1.2, 1.3]);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].id, "filling");
  assert.deepEqual(moves[0].pose.position, { x: 3, y: 2.45, z: 5 });

  canvas.dispatch("pointerup", pointer(7, 30, 40));

  assert.deepEqual(layer.position.toArray(), [3, 2, 5]);
  assert.equal(drops.length, 1);
  assert.equal(drops[0].id, "filling");
  assert.equal(drops[0].targetIndex, null);
  assert.equal(controller.getState(), "idle");
  assert.deepEqual(canvas.released, [7]);
  controller.dispose();
});

test("projects drag motion through the active camera onto the real prep plane", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const layer = new THREE.Group();
  layer.position.y = 1;
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "layer", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    prepPlaneY: 0,
    dragLift: 0.3,
  });

  canvas.dispatch("pointerdown", pointer(1, 100, 100));
  canvas.dispatch("pointermove", pointer(1, 150, 100));

  assert.ok(layer.position.x > 3, "screen-right movement follows the camera-aware plane ray");
  assert.ok(Math.abs(layer.position.z) < 1e-9);
  assert.equal(layer.position.y, 1.3);
  controller.dispose();
});

test("resolves a valid drop to an injected world anchor and exposes reorder intent", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  parent.position.set(10, 0, -2);
  const layer = new THREE.Group();
  layer.position.set(1, 2, 3);
  layer.rotation.set(0.1, 0.6, -0.2);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  parent.add(layer);
  const anchor = new THREE.Object3D();
  anchor.position.set(-4, 1.5, 7);
  scene.add(parent, anchor);
  scene.updateMatrixWorld(true);
  const drops = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 10, 0, clientY / 10),
    resolveDrop: ({ id }) => ({ valid: id === "patty", anchor, targetIndex: 2 }),
    onDrop: (detail) => drops.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(1, 10, 10));
  canvas.dispatch("pointermove", pointer(1, 20, 20));
  canvas.dispatch("pointerup", pointer(1, 20, 20));

  const expectedLocal = parent.worldToLocal(anchor.getWorldPosition(new THREE.Vector3()));
  assert.deepEqual(layer.position.toArray(), expectedLocal.toArray());
  assert.equal(layer.rotation.x, 0.1);
  assert.equal(layer.rotation.y, 0.6);
  assert.equal(layer.rotation.z, -0.2);
  assert.equal(drops.length, 1);
  assert.equal(drops[0].targetIndex, 2);
  assert.equal(drops[0].anchor, anchor);
  controller.dispose();
});

test("rolls an outside drop and pointer cancellation back to the exact prior transform", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(0.5, 1.25, -0.75);
  layer.rotation.set(0.31, -0.42, 0.23, "ZYX");
  layer.scale.set(0.9, 1.2, 1.1);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const prior = {
    position: layer.position.toArray(),
    quaternion: layer.quaternion.toArray(),
    scale: layer.scale.toArray(),
    order: layer.rotation.order,
  };
  const invalid = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "bun", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX, 0, clientY),
    prepBounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
    onInvalid: (detail) => invalid.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(2, 0, 0));
  canvas.dispatch("pointermove", pointer(2, 20, 20));
  canvas.dispatch("pointerup", pointer(2, 20, 20));
  assert.deepEqual(layer.position.toArray(), prior.position);
  assert.deepEqual(layer.quaternion.toArray(), prior.quaternion);
  assert.deepEqual(layer.scale.toArray(), prior.scale);
  assert.equal(layer.rotation.order, prior.order);
  assert.equal(invalid[0].reason, "outside-prep");

  canvas.dispatch("pointerdown", pointer(3, 0, 0));
  canvas.dispatch("pointermove", pointer(3, 2, 2));
  canvas.dispatch("pointercancel", pointer(3, 2, 2));
  assert.deepEqual(layer.position.toArray(), prior.position);
  assert.deepEqual(layer.quaternion.toArray(), prior.quaternion);
  assert.equal(invalid[1].reason, "pointer-cancel");
  assert.deepEqual(canvas.released, [2, 3]);
  controller.dispose();
});

test("reprojects the pointer-up event before deciding whether a drop is inside prep", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(0.5, 1.25, -0.75);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const prior = layer.position.toArray();
  const drops = [];
  const invalid = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "bun", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX, 0, clientY),
    prepBounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
    onDrop: (detail) => drops.push(detail),
    onInvalid: (detail) => invalid.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(17, 0, 0));
  canvas.dispatch("pointerup", pointer(17, 20, 20));

  assert.deepEqual(layer.position.toArray(), prior);
  assert.equal(drops.length, 0);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].reason, "outside-prep");
  assert.equal(controller.getState(), "idle");
  assert.deepEqual([...canvas.captured], []);
  assert.deepEqual(canvas.released, [17]);
  controller.dispose();
});

test("treats an unprojectable pointer-up as an outside drop", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(0.5, 1.25, -0.75);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const prior = layer.position.toArray();
  const invalid = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "bun", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => (
      clientX === 20 && clientY === 20 ? null : new THREE.Vector3(clientX, 0, clientY)
    ),
    onInvalid: (detail) => invalid.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(18, 0, 0));
  canvas.dispatch("pointerup", pointer(18, 20, 20));

  assert.deepEqual(layer.position.toArray(), prior);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].reason, "outside-prep");
  assert.equal(controller.getState(), "idle");
  assert.deepEqual(canvas.released, [18]);
  controller.dispose();
});

test("rejects thrown or malformed drop resolutions without leaking mutations or capture", () => {
  const cases = [
    ["resolver throws", () => { throw new Error("resolver failed"); }],
    ["null", () => null],
    ["non-object", () => 42],
    ["missing valid flag", () => ({ targetIndex: 0 })],
    ["non-boolean valid flag", () => ({ valid: "yes" })],
    ["scalar anchor", () => ({ valid: true, anchor: 0 })],
    ["bad anchor", () => ({ valid: true, anchor: { position: { x: 1, y: Infinity, z: 2 } } })],
    ["negative target index", () => ({ valid: true, targetIndex: -1 })],
    ["fractional target index", () => ({ valid: true, targetIndex: 1.5 })],
  ];

  for (const [label, resolveDrop] of cases) {
    const canvas = createCanvas();
    const camera = new THREE.PerspectiveCamera();
    const layer = new THREE.Group();
    layer.position.set(0.5, 1.25, -0.75);
    layer.rotation.set(0.31, -0.42, 0.23, "ZYX");
    layer.scale.set(0.9, 1.2, 1.1);
    const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    layer.add(surface);
    const prior = {
      position: layer.position.toArray(),
      quaternion: layer.quaternion.toArray(),
      scale: layer.scale.toArray(),
      order: layer.rotation.order,
    };
    const invalid = [];
    const controller = createCookingInteractionController({
      THREE,
      canvas,
      camera,
      draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
      raycast: () => ({ object: surface, point: new THREE.Vector3() }),
      projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX, 0, clientY),
      resolveDrop,
      onInvalid: (detail) => invalid.push(detail),
    });

    canvas.dispatch("pointerdown", pointer(19, 0, 0));
    canvas.dispatch("pointermove", pointer(19, 2, 2));
    assert.doesNotThrow(() => canvas.dispatch("pointerup", pointer(19, 2, 2)), label);

    assert.deepEqual(layer.position.toArray(), prior.position, `${label}: position`);
    assert.deepEqual(layer.quaternion.toArray(), prior.quaternion, `${label}: rotation`);
    assert.deepEqual(layer.scale.toArray(), prior.scale, `${label}: scale`);
    assert.equal(layer.rotation.order, prior.order, `${label}: order`);
    assert.equal(invalid.length, 1, `${label}: invalid callback`);
    assert.match(invalid[0].reason, /drop/, `${label}: reason`);
    assert.ok(invalid[0].error instanceof Error, `${label}: surfaced error`);
    assert.equal(controller.getState(), "idle", `${label}: state`);
    assert.deepEqual([...canvas.captured], [], `${label}: capture`);
    assert.deepEqual(canvas.released, [19], `${label}: released`);
    assert.equal(canvas.listenerCount("pointerup"), 1, `${label}: listener remains usable`);
    controller.dispose();
  }
});

test("validates an Object3D anchor world position before committing a drop", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(0.5, 1.25, -0.75);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const prior = layer.position.toArray();
  const anchor = new THREE.Object3D();
  anchor.position.set(Infinity, 2, 3);
  const invalid = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: () => new THREE.Vector3(),
    resolveDrop: () => ({ valid: true, anchor, targetIndex: 0 }),
    onInvalid: (detail) => invalid.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(20, 0, 0));
  assert.doesNotThrow(() => canvas.dispatch("pointerup", pointer(20, 0, 0)));

  assert.deepEqual(layer.position.toArray(), prior);
  assert.equal(invalid.length, 1);
  assert.ok(invalid[0].error instanceof Error);
  assert.equal(controller.getState(), "idle");
  assert.deepEqual(canvas.released, [20]);
  controller.dispose();
});

test("cleans up pointer state before invoking drop and invalid callbacks", () => {
  for (const callbackKind of ["drop", "invalid"]) {
    const canvas = createCanvas();
    const camera = new THREE.PerspectiveCamera();
    const layer = new THREE.Group();
    layer.position.set(0.5, 1.25, -0.75);
    const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    layer.add(surface);
    const prior = layer.position.toArray();
    const anchor = new THREE.Object3D();
    anchor.position.set(3, 4, 5);
    const callbackError = new Error(`${callbackKind} callback failed`);
    const controller = createCookingInteractionController({
      THREE,
      canvas,
      camera,
      draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
      raycast: () => ({ object: surface, point: new THREE.Vector3() }),
      projectToPrep: () => new THREE.Vector3(),
      resolveDrop: () => (
        callbackKind === "drop"
          ? { valid: true, anchor, targetIndex: 0 }
          : { valid: false, reason: "occupied" }
      ),
      onDrop: () => { throw callbackError; },
      onInvalid: () => { throw callbackError; },
    });

    canvas.dispatch("pointerdown", pointer(21, 0, 0));
    assert.throws(
      () => canvas.dispatch("pointerup", pointer(21, 0, 0)),
      (error) => error === callbackError,
      callbackKind,
    );

    assert.equal(controller.getState(), "idle", `${callbackKind}: state`);
    assert.deepEqual([...canvas.captured], [], `${callbackKind}: capture`);
    assert.deepEqual(canvas.released, [21], `${callbackKind}: released`);
    if (callbackKind === "drop") {
      assert.deepEqual(layer.position.toArray(), anchor.position.toArray(), "drop remains committed");
    } else {
      assert.deepEqual(layer.position.toArray(), prior, "invalid drop is rolled back");
    }
    controller.dispose();
  }
});

test("selects and rotates a layer without disturbing its remaining transform", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(0.4, 1.2, -0.8);
  layer.rotation.set(0.2, 0.3, -0.1);
  layer.scale.set(1.2, 0.8, 1.1);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const selections = [];
  const moves = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "cheese", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: () => new THREE.Vector3(),
    onSelection: (detail) => selections.push(detail),
    onMove: (detail) => moves.push(detail),
  });
  canvas.dispatch("pointerdown", pointer(1, 10, 10));
  canvas.dispatch("pointerup", pointer(1, 10, 10));
  const position = layer.position.toArray();
  const scale = layer.scale.toArray();

  assert.equal(controller.rotateSelected(0.4), true);
  assert.deepEqual(layer.position.toArray(), position);
  assert.deepEqual(layer.scale.toArray(), scale);
  assert.equal(layer.rotation.x, 0.2);
  assert.ok(Math.abs(layer.rotation.y - 0.7) < 1e-12);
  assert.equal(layer.rotation.z, -0.1);
  assert.deepEqual(selections.map(({ id, selected }) => [id, selected]), [["cheese", true]]);
  assert.equal(moves.at(-1).reason, "rotate");
  assert.equal(controller.getSelectedId(), "cheese");
  controller.rotateSelected(Math.PI * 8);
  assert.ok(Math.abs(layer.rotation.y - 0.7) < 1e-12, "full turns stay in serializable yaw bounds");
  controller.dispose();
});

test("recognizes current burger cookingSelectable metadata without explicit registration", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.userData.foodLayer = Object.freeze({ food: "burger", layerId: "tomato" });
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  surface.userData.cookingSelectable = Object.freeze({
    kind: "food-layer", food: "burger", layerId: "tomato",
  });
  layer.add(surface);
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    selectableSurfaces: [surface],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: () => new THREE.Vector3(),
  });

  canvas.dispatch("pointerdown", pointer(1, 1, 1));
  assert.equal(controller.getState(), "dragging-layer");
  assert.equal(controller.getSelectedId(), "tomato");
  canvas.dispatch("pointercancel", pointer(1, 1, 1));
  controller.dispose();
});

test("orbits blank or prep space with bounded yaw and pitch", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const changes = [];
  const limits = {
    minYaw: -0.4, maxYaw: 0.5,
    minPitch: 0.25, maxPitch: 0.8,
    minDistance: 6, maxDistance: 18,
  };
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    raycast: () => null,
    cameraTarget: { x: 0, y: 0, z: 0 },
    orbitLimits: limits,
    orbitSensitivity: 0.01,
    onCameraChange: (detail) => changes.push(detail),
  });
  limits.minYaw = -99;

  canvas.dispatch("pointerdown", pointer(9, 100, 100));
  assert.equal(controller.getState(), "orbiting");
  canvas.dispatch("pointermove", pointer(9, 1000, -1000));

  assert.equal(changes.at(-1).yaw, -0.4);
  assert.equal(changes.at(-1).pitch, 0.8);
  assert.ok(Math.abs(camera.position.length() - Math.hypot(5, 10)) < 1e-9);
  canvas.dispatch("pointerup", pointer(9, 1000, -1000));
  assert.equal(controller.getState(), "idle");
  assert.deepEqual(canvas.released, [9]);
  controller.dispose();
});

test("pinches within zoom limits and resumes one-pointer orbit without a jump", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    raycast: () => null,
    orbitLimits: {
      minYaw: -1, maxYaw: 1,
      minPitch: 0.2, maxPitch: 1.2,
      minDistance: 6, maxDistance: 16,
    },
  });

  canvas.dispatch("pointerdown", pointer(1, 50, 100));
  canvas.dispatch("pointerdown", pointer(2, 100, 100));
  assert.equal(controller.getState(), "pinching");
  canvas.dispatch("pointermove", pointer(2, 200, 100));
  assert.ok(Math.abs(camera.position.length() - 6) < 1e-9, "zoom-in clamps at minimum distance");

  canvas.dispatch("pointerup", pointer(2, 200, 100));
  assert.equal(controller.getState(), "orbiting");
  const beforeStationaryMove = camera.position.clone();
  canvas.dispatch("pointermove", pointer(1, 50, 100));
  assert.ok(camera.position.distanceTo(beforeStationaryMove) < 1e-12, "resume baseline does not jump");
  canvas.dispatch("pointermove", pointer(1, 40, 100));
  assert.ok(camera.position.distanceTo(beforeStationaryMove) > 0.01);

  canvas.dispatch("pointerdown", pointer(3, 60, 100));
  canvas.dispatch("pointermove", pointer(3, 51, 100));
  assert.ok(camera.position.length() <= 16 + 1e-9);
  assert.ok(camera.position.length() >= 6 - 1e-9);
  controller.dispose();
});

test("twists the selected layer with two fingers and resumes dragging without a jump", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 6, 12);
  camera.lookAt(0, 0, 0);
  const layer = new THREE.Group();
  layer.position.y = 1;
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "lettuce", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 10, 0, clientY / 10),
    dragLift: 0.4,
  });

  canvas.dispatch("pointerdown", pointer(1, 50, 100));
  canvas.dispatch("pointerdown", pointer(2, 100, 100));
  canvas.dispatch("pointermove", pointer(2, 50, 150));
  assert.ok(Math.abs(layer.rotation.y - Math.PI / 2) < 1e-12);

  canvas.dispatch("pointerup", pointer(2, 50, 150));
  assert.equal(controller.getState(), "dragging-layer");
  const beforeStationaryMove = layer.position.clone();
  canvas.dispatch("pointermove", pointer(1, 50, 100));
  assert.ok(layer.position.distanceTo(beforeStationaryMove) < 1e-12);
  canvas.dispatch("pointermove", pointer(1, 60, 110));
  assert.ok(layer.position.distanceTo(beforeStationaryMove) > 1);
  canvas.dispatch("pointerup", pointer(1, 60, 110));
  assert.ok(Math.abs(layer.rotation.y - Math.PI / 2) < 1e-12);
  assert.equal(layer.position.y, 1);
  controller.dispose();
});

test("defensively updates explicit surfaces and dynamically registers recipe-agnostic draggables", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const prep = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  const initialSurfaces = [prep];
  let currentHit = null;
  const observedSurfaceLists = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    selectableSurfaces: initialSurfaces,
    raycast: ({ surfaces }) => {
      observedSurfaceLists.push(surfaces);
      return currentHit;
    },
    projectToPrep: () => new THREE.Vector3(),
  });
  initialSurfaces.length = 0;

  const layer = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const recordSurfaces = [surface];
  controller.registerDraggable({ id: "custom-filling", object: layer, surfaces: recordSurfaces });
  recordSurfaces.length = 0;
  currentHit = { object: surface, point: new THREE.Vector3() };
  canvas.dispatch("pointerdown", pointer(1, 1, 1, { pointerType: "pen" }));
  assert.deepEqual(observedSurfaceLists[0], [prep, surface]);
  assert.equal(controller.getSelectedId(), "custom-filling");
  canvas.dispatch("pointerup", pointer(1, 1, 1));

  assert.throws(
    () => controller.registerDraggable({ id: "custom-filling", object: new THREE.Group() }),
    /duplicate/i,
  );
  assert.throws(
    () => controller.registerDraggable({ id: "other", object: layer, surfaces: [new THREE.Mesh()] }),
    /duplicate/i,
  );
  assert.throws(
    () => controller.registerDraggable({ id: "other", object: new THREE.Group(), surfaces: [surface] }),
    /duplicate/i,
  );
  assert.equal(controller.unregisterDraggable("custom-filling"), true);
  assert.equal(controller.unregisterDraggable("custom-filling"), false);

  const replacement = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  const replacementList = [replacement];
  controller.setSelectableSurfaces(replacementList);
  replacementList.length = 0;
  assert.deepEqual(controller.getSelectableSurfaces(), [replacement]);
  assert.equal(Object.isFrozen(controller.getSelectableSurfaces()), true);
  currentHit = { object: surface, point: new THREE.Vector3() };
  canvas.dispatch("pointerdown", pointer(2, 1, 1, { pointerType: "mouse" }));
  assert.equal(controller.getState(), "orbiting", "unregistered food stays non-draggable");
  canvas.dispatch("pointerup", pointer(2, 1, 1));
  controller.dispose();
});

test("lost capture, hidden documents, and WebGL loss cancel safely and pause new gestures", () => {
  const canvas = createCanvas();
  const documentTarget = new FakeEventTarget();
  documentTarget.hidden = false;
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(1, 2, 3);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const invalid = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    draggables: [{ id: "layer", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX, 0, clientY),
    onInvalid: ({ reason }) => invalid.push(reason),
  });
  const start = layer.position.toArray();

  canvas.dispatch("pointerdown", pointer(1, 0, 0));
  canvas.dispatch("pointermove", pointer(1, 2, 2));
  canvas.dispatch("lostpointercapture", pointer(1, 2, 2));
  assert.deepEqual(layer.position.toArray(), start);
  assert.equal(invalid.at(-1), "lost-pointer-capture");
  assert.equal(controller.getState(), "idle");

  canvas.dispatch("pointerdown", pointer(2, 0, 0));
  documentTarget.hidden = true;
  documentTarget.dispatch("visibilitychange");
  assert.deepEqual(layer.position.toArray(), start);
  assert.equal(invalid.at(-1), "document-hidden");
  canvas.dispatch("pointerdown", pointer(3, 0, 0));
  assert.equal(controller.getState(), "idle", "hidden controller ignores new pointers");
  documentTarget.hidden = false;
  documentTarget.dispatch("visibilitychange");

  canvas.dispatch("pointerdown", pointer(4, 0, 0));
  canvas.dispatch("webglcontextlost", { preventDefault() {} });
  assert.deepEqual(layer.position.toArray(), start);
  assert.equal(invalid.at(-1), "webgl-context-lost");
  canvas.dispatch("pointerdown", pointer(5, 0, 0));
  assert.equal(controller.getState(), "idle", "lost context pauses new pointers");
  canvas.dispatch("webglcontextrestored");
  canvas.dispatch("pointerdown", pointer(6, 0, 0));
  assert.equal(controller.getState(), "dragging-layer");
  canvas.dispatch("pointercancel", pointer(6, 0, 0));
  controller.dispose();
});

test("dispose restores active work, releases captures, and removes every listener once", () => {
  const canvas = createCanvas();
  const documentTarget = new FakeEventTarget();
  documentTarget.hidden = false;
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(-1, 0.5, 2);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    draggables: [{ id: "layer", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX, 0, clientY),
  });
  const start = layer.position.toArray();
  const canvasEvents = [
    "pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture",
    "webglcontextlost", "webglcontextrestored",
  ];
  assert.ok(canvasEvents.every((type) => canvas.listenerCount(type) === 1));
  assert.equal(documentTarget.listenerCount("visibilitychange"), 1);
  assert.equal(documentTarget.listenerCount("pointermove"), 0, "no global scroll-blocking pointer listener");

  canvas.dispatch("pointerdown", pointer(8, 0, 0));
  canvas.dispatch("pointermove", pointer(8, 4, 4));
  controller.dispose();
  controller.dispose();

  assert.deepEqual(layer.position.toArray(), start);
  assert.deepEqual([...canvas.captured], []);
  assert.ok(canvasEvents.every((type) => canvas.listenerCount(type) === 0));
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(controller.getState(), "idle");
});

test("exposes programmatic pointer methods and resets the camera to its initial view", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1, 5, 10);
  camera.lookAt(0, 0, 0);
  const initialPosition = camera.position.clone();
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    raycast: () => null,
  });

  controller.pointerDown({ pointerId: 1, x: 100, y: 100, pointerType: "touch" });
  controller.pointerMove({ pointerId: 1, x: 140, y: 70, pointerType: "touch" });
  controller.pointerUp({ pointerId: 1, x: 140, y: 70, pointerType: "touch" });
  assert.ok(camera.position.distanceTo(initialPosition) > 0.1);
  assert.equal(controller.resetCamera(), true);
  assert.ok(camera.position.distanceTo(initialPosition) < 1e-12);

  controller.pointerDown({ pointerId: 2, x: 100, y: 100, pointerType: "touch" });
  controller.pointerCancel({ pointerId: 2, x: 100, y: 100, pointerType: "touch" });
  assert.equal(controller.getState(), "idle");
  controller.dispose();
  assert.equal(controller.resetCamera(), false);
});

test("applies the final pointer-up projection before resolving a valid drop", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(1, 2, 3);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const drops = [];
  const resolverWorldPositions = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX, 0, clientY),
    resolveDrop: () => {
      resolverWorldPositions.push(layer.getWorldPosition(new THREE.Vector3()).toArray());
      return { valid: true };
    },
    onDrop: (detail) => drops.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(31, 0, 0));
  canvas.dispatch("pointerup", pointer(31, 5, 7));

  assert.deepEqual(layer.position.toArray(), [6, 2, 10]);
  assert.deepEqual(resolverWorldPositions, [[6, 2.35, 10]]);
  assert.equal(drops.length, 1);
  assert.deepEqual(drops[0].point, { x: 5, y: 0, z: 7 });
  assert.deepEqual(canvas.released, [31]);
  controller.dispose();
});

test("rolls pointer-down back transactionally when initialization callbacks throw", () => {
  for (const stage of ["raycast", "projection", "selection", "pick"]) {
    const canvas = createCanvas();
    const camera = new THREE.PerspectiveCamera();
    const layer = new THREE.Group();
    layer.position.set(1, 2, 3);
    layer.rotation.set(0.2, -0.4, 0.1);
    layer.scale.set(1.2, 0.8, 1.1);
    const priorSelectionFlag = layer.userData.cookingInteractionSelected;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    layer.add(surface);
    const prior = {
      position: layer.position.toArray(),
      quaternion: layer.quaternion.toArray(),
      scale: layer.scale.toArray(),
    };
    const expected = new Error(`${stage} failed`);
    const controller = createCookingInteractionController({
      THREE,
      canvas,
      camera,
      draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
      raycast: () => {
        if (stage === "raycast") throw expected;
        return { object: surface, point: new THREE.Vector3() };
      },
      projectToPrep: () => {
        if (stage === "projection") throw expected;
        return new THREE.Vector3();
      },
      onSelection: ({ selected }) => {
        if (selected && stage === "selection") throw expected;
      },
      onPick: () => {
        if (stage === "pick") throw expected;
      },
    });

    assert.throws(
      () => canvas.dispatch("pointerdown", pointer(32, 0, 0)),
      (error) => error === expected,
      stage,
    );
    assert.equal(controller.getState(), "idle", `${stage}: state`);
    assert.equal(controller.getSelectedId(), null, `${stage}: selection`);
    assert.deepEqual([...canvas.captured], [], `${stage}: capture`);
    assert.deepEqual(canvas.released, [32], `${stage}: released`);
    assert.deepEqual(layer.position.toArray(), prior.position, `${stage}: position`);
    assert.deepEqual(layer.quaternion.toArray(), prior.quaternion, `${stage}: rotation`);
    assert.deepEqual(layer.scale.toArray(), prior.scale, `${stage}: scale`);
    assert.equal(
      layer.userData.cookingInteractionSelected, priorSelectionFlag, `${stage}: selection flag`,
    );
    controller.dispose();
  }
});

test("does not start a stale drag when selection unregisters the picked layer", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const layer = new THREE.Group();
  layer.position.set(1, 2, 3);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  const invalid = [];
  let controller;
  controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: () => new THREE.Vector3(),
    onSelection: ({ id, selected }) => {
      if (selected) controller.unregisterDraggable(id);
    },
    onInvalid: (detail) => invalid.push(detail),
  });

  canvas.dispatch("pointerdown", pointer(33, 0, 0));

  assert.equal(controller.getState(), "idle");
  assert.equal(controller.getSelectedId(), null);
  assert.equal(controller.unregisterDraggable("patty"), false);
  assert.deepEqual(layer.position.toArray(), [1, 2, 3]);
  assert.equal(layer.userData.cookingInteractionSelected, false);
  assert.deepEqual([...canvas.captured], []);
  assert.deepEqual(canvas.released, [33]);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].reason, "unregistered");
  controller.dispose();
});

test("dispose removes every listener even when mandatory cancellation observers throw", () => {
  for (const failureStage of ["invalid", "selection"]) {
    const canvas = createCanvas();
    const documentTarget = new FakeEventTarget();
    documentTarget.hidden = false;
    const camera = new THREE.PerspectiveCamera();
    const layer = new THREE.Group();
    const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    layer.add(surface);
    const expected = new Error(`${failureStage} observer failed`);
    let controller;
    controller = createCookingInteractionController({
      THREE,
      canvas,
      camera,
      documentTarget,
      draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
      raycast: () => ({ object: surface, point: new THREE.Vector3() }),
      projectToPrep: () => new THREE.Vector3(),
      onInvalid: () => {
        if (failureStage === "invalid") throw expected;
        controller.unregisterDraggable("patty");
      },
      onSelection: ({ selected }) => {
        if (!selected && failureStage === "selection") throw expected;
      },
    });
    const canvasEvents = [
      "pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture",
      "webglcontextlost", "webglcontextrestored",
    ];
    canvas.dispatch("pointerdown", pointer(34, 0, 0));

    assert.throws(() => controller.dispose(), (error) => error === expected, failureStage);

    assert.equal(controller.getState(), "idle", `${failureStage}: state`);
    assert.deepEqual([...canvas.captured], [], `${failureStage}: capture`);
    assert.deepEqual(canvas.released, [34], `${failureStage}: released`);
    assert.ok(canvasEvents.every((type) => canvas.listenerCount(type) === 0), failureStage);
    assert.equal(documentTarget.listenerCount("visibilitychange"), 0, failureStage);
    assert.doesNotThrow(() => controller.dispose(), `${failureStage}: idempotent`);
  }
});

test("settles an unanchored drop at its exact world target under a transformed parent", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  parent.position.set(4, -2, 6);
  parent.rotation.set(0.4, -0.7, 0.25);
  parent.scale.set(2, 0.5, 1.5);
  const layer = new THREE.Group();
  layer.position.set(1, 2, 3);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  layer.add(surface);
  parent.add(layer);
  scene.add(parent);
  scene.updateMatrixWorld(true);
  const startWorld = layer.getWorldPosition(new THREE.Vector3());
  const expectedWorld = startWorld.clone().add(new THREE.Vector3(5, 0, 7));
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    draggables: [{ id: "patty", object: layer, surfaces: [surface] }],
    raycast: () => ({ object: surface, point: new THREE.Vector3() }),
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX, 0, clientY),
    dragLift: 0.8,
  });

  canvas.dispatch("pointerdown", pointer(35, 0, 0));
  canvas.dispatch("pointerup", pointer(35, 5, 7));
  scene.updateMatrixWorld(true);

  const settledWorld = layer.getWorldPosition(new THREE.Vector3());
  assert.ok(settledWorld.distanceTo(expectedWorld) < 1e-9, [
    `expected ${expectedWorld.toArray().join(",")}`,
    `received ${settledWorld.toArray().join(",")}`,
  ].join("; "));
  controller.dispose();
});

test("rejects a parented camera because orbit math is defined in world space", () => {
  const canvas = createCanvas();
  const cameraParent = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  cameraParent.add(camera);

  assert.throws(
    () => createCookingInteractionController({ THREE, canvas, camera }),
    /camera must not be parented/i,
  );
});

test("bottle surfaces win over food, drag camera-aware, tilt, preview, and commit a frozen stroke", () => {
  const harness = createPouringScene();
  const { canvas, camera, documentTarget, burger, tools } = harness;
  const chili = tools.get("chili");
  const homePosition = chili.root.position.clone();
  const homeQuaternion = chili.root.quaternion.clone();
  const committed = [];
  let nozzleQueries = 0;
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    documentTarget,
    selectableSurfaces: burger.selectableSurfaces,
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    prepPlaneY: 0.48,
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(
      (clientX - 100) / 20,
      0.48,
      (clientY - 100) / 20,
    ),
    raycast: ({ kind, surfaces, event }) => {
      if (kind === "condiment") {
        assert.deepEqual(surfaces, tools.selectableSurfaces);
        return { object: chili.body, point: chili.body.getWorldPosition(new THREE.Vector3()) };
      }
      if (kind === "nozzle") {
        nozzleQueries += 1;
        assert.deepEqual(surfaces, burger.selectableSurfaces);
        return layerWorldPoint(
          burger,
          "patty",
          (event.clientX - 100) / 50,
          (event.clientY - 100) / 50,
        );
      }
      throw new Error(`unexpected hit-test kind: ${kind}`);
    },
    onSauceStroke: (stroke) => {
      assert.equal(Object.isFrozen(stroke), true);
      assert.equal(Object.isFrozen(stroke.points), true);
      assert.ok(stroke.points.every(Object.isFrozen));
      committed.push(stroke);
      burger.addSauceStroke(stroke);
    },
  });

  canvas.dispatch("pointerdown", pointer(81, 100, 100, { pressure: 0.35 }));
  assert.equal(controller.getState(), "dragging-bottle");
  assert.deepEqual([...canvas.captured], [81]);
  assert.equal(chili.root.userData.active, true);
  canvas.dispatch("pointermove", pointer(81, 108, 104, { pressure: 0.5 }));
  canvas.dispatch("pointermove", pointer(81, 120, 110, { pressure: 0.7 }));

  assert.ok(chili.root.position.distanceTo(homePosition) > 0.2);
  assert.ok(chili.root.quaternion.angleTo(homeQuaternion) > 0.01);
  assert.equal(tools.previewRoot.children.length, 1);
  const preview = tools.previewRoot.children[0];
  assert.ok(preview instanceof THREE.Mesh, "live sauce preview is a volumetric mesh");
  assert.ok(preview.geometry instanceof THREE.BufferGeometry);
  assert.ok(preview.geometry.userData.tubeRadius > 0, "preview tube has nonzero radius");
  assert.ok(preview.geometry.userData.tubeRadialSegments >= 3);
  assert.ok(preview.geometry.userData.tubeRadialSegments <= 6, "mobile radial budget");
  assert.equal(preview.raycast, tools.noRaycast);
  assert.ok(preview.geometry.getAttribute("position").count <= 25 * 6);
  assert.ok(preview.geometry.drawRange.count <= 24 * 6 * 6, "mobile triangle budget");
  assert.ok(nozzleQueries >= 2);

  canvas.dispatch("pointerup", pointer(81, 120, 110, { pressure: 0.7 }));

  assert.equal(controller.getState(), "idle");
  assert.deepEqual(canvas.released, [81]);
  assert.equal(committed.length, 1);
  assert.equal(committed[0].sauce, "chili");
  assert.equal(committed[0].layerId, "patty");
  assert.ok(committed[0].points.length >= 2);
  assert.ok(committed[0].amount >= 0.01 && committed[0].amount <= 1);
  assert.equal(burger.serializeComposition().strokes.length, 1);
  assert.equal(tools.previewRoot.children.length, 0);
  assert.ok(chili.root.position.distanceTo(homePosition) < 1e-9);
  assert.ok(chili.root.quaternion.angleTo(homeQuaternion) < 1e-9);
  assert.equal(chili.root.userData.active, false);
  controller.dispose();
  harness.dispose();
});

test("reuses one bounded volumetric preview and disposes it exactly once", () => {
  const harness = createPouringScene();
  const {
    canvas, camera, burger, tools, scene,
  } = harness;
  const chili = tools.get("chili");
  const geometries = [];
  const materials = [];
  const instrumentedTHREE = {
    ...THREE,
    BufferGeometry: class extends THREE.BufferGeometry {
      constructor(...args) {
        super(...args);
        this.disposeCalls = 0;
        geometries.push(this);
      }

      dispose() {
        this.disposeCalls += 1;
        super.dispose();
      }
    },
    MeshStandardMaterial: class extends THREE.MeshStandardMaterial {
      constructor(...args) {
        super(...args);
        this.disposeCalls = 0;
        materials.push(this);
      }

      dispose() {
        this.disposeCalls += 1;
        super.dispose();
      }
    },
  };
  let activeLayer = "patty";
  let latestTarget = null;
  const controller = createCookingInteractionController({
    THREE: instrumentedTHREE,
    canvas,
    camera,
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(
      clientX / 40,
      0.48,
      clientY / 40,
    ),
    raycast: ({ kind, event }) => {
      if (kind === "condiment") {
        return { object: chili.body, point: chili.body.getWorldPosition(new THREE.Vector3()) };
      }
      latestTarget = layerWorldPoint(
        burger,
        activeLayer,
        ((event.clientX % 20) - 10) / 20,
        ((event.clientY % 20) - 10) / 20,
      );
      return latestTarget;
    },
  });

  canvas.dispatch("pointerdown", pointer(812, 10, 10));
  for (let index = 0; index < 60; index += 1) {
    activeLayer = index % 2 ? "cheese" : "patty";
    canvas.dispatch("pointermove", pointer(812, 20 + index, 30 + index));
  }

  assert.equal(geometries.length, 1, "pointer moves and layer splits reuse one geometry");
  assert.equal(materials.length, 1, "pointer moves and layer splits reuse one material");
  const preview = tools.previewRoot.children[0];
  assert.ok(preview instanceof THREE.Mesh);
  assert.equal(preview.material.color.getHex(), 0xd83c2c, "mesh keeps sauce color");
  const { tubePointCount, tubeRadialSegments, tubeRadius } = preview.geometry.userData;
  assert.ok(tubeRadius > 0);
  assert.ok(tubePointCount >= 2 && tubePointCount <= 25);
  assert.ok(tubeRadialSegments >= 3 && tubeRadialSegments <= 6);
  const position = preview.geometry.getAttribute("position");
  const ringCenter = (ringIndex) => {
    const center = new THREE.Vector3();
    for (let side = 0; side < tubeRadialSegments; side += 1) {
      center.add(new THREE.Vector3().fromBufferAttribute(
        position,
        ringIndex * tubeRadialSegments + side,
      ));
    }
    return preview.localToWorld(center.multiplyScalar(1 / tubeRadialSegments));
  };
  scene.updateMatrixWorld(true);
  closeVector(
    ringCenter(0),
    chili.nozzleAnchor.getWorldPosition(new THREE.Vector3()),
    1e-5,
  );
  closeVector(ringCenter(tubePointCount - 1), latestTarget.point, 1e-5);
  assert.equal(preview.raycast, tools.noRaycast);
  assert.ok(preview.geometry.drawRange.count / 3 <= 240, "preview stays under 240 triangles");

  canvas.dispatch("pointerup", pointer(812, 80, 90));
  assert.equal(tools.previewRoot.children.length, 0);
  assert.equal(geometries[0].disposeCalls, 1);
  assert.equal(materials[0].disposeCalls, 1);
  controller.dispose();
  assert.equal(geometries[0].disposeCalls, 1, "controller dispose is idempotent for preview");
  assert.equal(materials[0].disposeCalls, 1, "controller dispose is idempotent for material");
  harness.dispose();
});

test("aims the bottle nozzle at the same world target across camera yaws and a transformed parent", () => {
  const aimedDirections = [];
  for (const cameraYaw of [0, Math.PI / 2]) {
    const harness = createPouringScene();
    const {
      canvas, camera, burger, tools, scene, workbench,
    } = harness;
    workbench.root.position.set(2.4, 0.7, -1.6);
    workbench.root.rotation.set(0.12, 0.68, -0.08);
    workbench.root.scale.set(1.25, 0.85, 1.1);
    camera.position.set(
      Math.sin(cameraYaw) * 16,
      12,
      Math.cos(cameraYaw) * 16,
    );
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    const chili = tools.get("chili");
    const targetHit = layerWorldPoint(burger, "patty", 0.55, -0.35);
    const targetWorld = targetHit.point.clone();
    const dragWorld = targetWorld.clone().add(new THREE.Vector3(-0.72, 0, 0.46));
    const controller = createCookingInteractionController({
      THREE,
      canvas,
      camera,
      condimentTools: tools,
      foodSurfaces: burger.selectableSurfaces,
      bottleLift: 1.45,
      maxBottleTilt: Math.PI / 3,
      projectToPrep: () => dragWorld.clone(),
      raycast: ({ kind }) => (kind === "condiment"
        ? { object: chili.body, point: chili.body.getWorldPosition(new THREE.Vector3()) }
        : { object: targetHit.object, point: targetWorld.clone() }),
    });

    canvas.dispatch("pointerdown", pointer(813, 100, 100, { pressure: 0.5 }));
    canvas.dispatch("pointermove", pointer(813, 112, 109, { pressure: 0.65 }));
    scene.updateMatrixWorld(true);

    const bottleOrigin = chili.root.localToWorld(new THREE.Vector3());
    const nozzleDirection = chili.root.localToWorld(new THREE.Vector3(0, -1, 0))
      .sub(bottleOrigin)
      .normalize();
    const expectedDirection = targetWorld.clone().sub(
      chili.root.getWorldPosition(new THREE.Vector3()),
    ).normalize();
    assert.ok(nozzleDirection.dot(expectedDirection) > 0.995, [
      `camera yaw ${cameraYaw}: nozzle must lean at food target`,
      `nozzle ${nozzleDirection.toArray().join(",")}`,
      `target ${expectedDirection.toArray().join(",")}`,
    ].join("; "));
    assert.ok([
      chili.root.quaternion.x,
      chili.root.quaternion.y,
      chili.root.quaternion.z,
      chili.root.quaternion.w,
    ].every(Number.isFinite), "transformed-parent aim must stay finite");
    aimedDirections.push(nozzleDirection);

    canvas.dispatch("pointercancel", pointer(813, 112, 109));
    controller.dispose();
    harness.dispose();
  }
  assert.ok(aimedDirections[0].dot(aimedDirections[1]) > 0.999999, [
    "the same world drag target must not change when the camera rotates",
    aimedDirections.map((value) => value.toArray().join(",")).join(" vs "),
  ].join("; "));
});

test("real camera rays pick an exact bottle solid and its gravity stream hits only real food solids", () => {
  const harness = createPouringScene();
  const { canvas, camera, burger, tools, scene } = harness;
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const toScreen = (worldPoint) => {
    const ndc = worldPoint.clone().project(camera);
    return { x: (ndc.x + 1) * 100, y: (1 - ndc.y) * 100 };
  };
  const bottlePoint = toScreen(tools.get("chili").body.getWorldPosition(new THREE.Vector3()));
  const prepPoint = toScreen(new THREE.Vector3(0, 0.48, 0));
  const strokes = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    prepPlaneY: 0.48,
    onSauceStroke: (stroke) => strokes.push(stroke),
  });

  canvas.dispatch("pointerdown", pointer(811, bottlePoint.x, bottlePoint.y));
  assert.equal(controller.getState(), "dragging-bottle");
  canvas.dispatch("pointermove", pointer(811, prepPoint.x - 6, prepPoint.y));
  canvas.dispatch("pointermove", pointer(811, prepPoint.x + 6, prepPoint.y));
  canvas.dispatch("pointerup", pointer(811, prepPoint.x + 6, prepPoint.y));

  assert.equal(strokes.length, 1);
  assert.ok(burger.selectableSurfaces.some((surface) => (
    surface.userData.cookingSelectable.layerId === strokes[0].layerId
  )));
  controller.dispose();
  harness.dispose();
});

test("thins sauce points, caps them at 24, and safely splits a gesture when layers change", () => {
  const harness = createPouringScene();
  const { canvas, camera, burger, tools } = harness;
  const mustard = tools.get("mustard");
  const strokes = [];
  let activeLayer = "cheese";
  let nozzleSample = 0;
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 20, 0, clientY / 20),
    raycast: ({ kind, event }) => {
      if (kind === "condiment") {
        return { object: mustard.cap, point: mustard.cap.getWorldPosition(new THREE.Vector3()) };
      }
      if (kind === "nozzle") {
        const value = -0.9 + (nozzleSample % 20) * 0.09;
        const row = Math.floor(nozzleSample / 20) * 0.12 - 0.3;
        nozzleSample += 1;
        return layerWorldPoint(burger, activeLayer, value, row);
      }
      return null;
    },
    onSauceStroke: (stroke) => strokes.push(stroke),
  });

  canvas.dispatch("pointerdown", pointer(82, 10, 10));
  for (let index = 0; index < 80; index += 1) {
    if (index === 42) activeLayer = "tomato";
    canvas.dispatch("pointermove", pointer(82, 14 + index * 1.15, 20 + index));
  }
  canvas.dispatch("pointerup", pointer(82, 110, 100));

  assert.deepEqual(strokes.map(({ layerId }) => layerId), ["cheese", "tomato"]);
  for (const stroke of strokes) {
    assert.equal(stroke.points.length, 24, "each long segment is capped at 24 points");
    for (let index = 1; index < stroke.points.length; index += 1) {
      const [x0, z0] = stroke.points[index - 1];
      const [x1, z1] = stroke.points[index];
      assert.ok(Math.hypot(x1 - x0, z1 - z0) >= 0.04 - 1e-9);
    }
  }
  assert.equal(tools.previewRoot.children.length, 0);
  controller.dispose();
  harness.dispose();
});

test("supports repeated mixed condiment gestures on arbitrary burger layers", () => {
  const harness = createPouringScene();
  const { canvas, camera, burger, tools } = harness;
  const strokes = [];
  let selectedSauce = "sour";
  let selectedLayer = "lettuce";
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 25, 0, clientY / 25),
    raycast: ({ kind, event }) => {
      const bottle = tools.get(selectedSauce);
      if (kind === "condiment") {
        return { object: bottle.nozzle, point: bottle.nozzle.getWorldPosition(new THREE.Vector3()) };
      }
      if (kind === "nozzle") {
        return layerWorldPoint(
          burger,
          selectedLayer,
          (event.clientX - 100) / 40,
          (event.clientY - 100) / 40,
        );
      }
      return null;
    },
    onSauceStroke: (stroke) => strokes.push(stroke),
  });

  for (const [pointerId, sauce, layerId] of [
    [91, "sour", "lettuce"],
    [92, "sticky", "top-bun"],
    [93, "sour", "pickle"],
  ]) {
    selectedSauce = sauce;
    selectedLayer = layerId;
    canvas.dispatch("pointerdown", pointer(pointerId, 100, 100));
    canvas.dispatch("pointermove", pointer(pointerId, 106, 104));
    canvas.dispatch("pointermove", pointer(pointerId, 116, 112));
    canvas.dispatch("pointerup", pointer(pointerId, 116, 112));
  }

  assert.deepEqual(strokes.map(({ sauce, layerId }) => [sauce, layerId]), [
    ["sour", "lettuce"],
    ["sticky", "top-bun"],
    ["sour", "pickle"],
  ]);
  controller.dispose();
  harness.dispose();
});

test("discards short and no-target bottle gestures but still returns exactly to dock", () => {
  const harness = createPouringScene();
  const { canvas, camera, tools } = harness;
  const sticky = tools.get("sticky");
  const home = sticky.root.position.clone();
  const committed = [];
  let foodHit = null;
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    condimentTools: tools,
    foodSurfaces: [],
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 10, 0, clientY / 10),
    raycast: ({ kind }) => (kind === "condiment"
      ? { object: sticky.body, point: sticky.body.getWorldPosition(new THREE.Vector3()) }
      : foodHit),
    onSauceStroke: (stroke) => committed.push(stroke),
  });

  canvas.dispatch("pointerdown", pointer(101, 10, 10));
  canvas.dispatch("pointermove", pointer(101, 30, 30));
  canvas.dispatch("pointerup", pointer(101, 30, 30));
  assert.equal(committed.length, 0);
  assert.ok(sticky.root.position.distanceTo(home) < 1e-9);

  const fakeLayer = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  fakeLayer.userData.cookingSelectable = Object.freeze({
    kind: "food-layer", food: "burger", layerId: "patty",
  });
  foodHit = { object: fakeLayer, point: new THREE.Vector3() };
  controller.setFoodSurfaces([fakeLayer]);
  canvas.dispatch("pointerdown", pointer(102, 10, 10));
  canvas.dispatch("pointermove", pointer(102, 11, 11));
  canvas.dispatch("pointerup", pointer(102, 11, 11));
  assert.equal(committed.length, 0, "a one-point stroke is discarded");
  assert.ok(sticky.root.position.distanceTo(home) < 1e-9);
  fakeLayer.geometry.dispose();
  fakeLayer.material.dispose();
  controller.dispose();
  harness.dispose();
});

test("cancel, hidden document, context loss, and ignored second touch roll back without committing", () => {
  for (const cancellation of [
    "pointercancel", "hidden", "lostpointercapture", "webglcontextlost",
  ]) {
    const harness = createPouringScene();
    const { canvas, camera, documentTarget, burger, tools } = harness;
    const bottle = tools.get("chili");
    const home = bottle.root.position.clone();
    const committed = [];
    const controller = createCookingInteractionController({
      THREE,
      canvas,
      camera,
      documentTarget,
      condimentTools: tools,
      foodSurfaces: burger.selectableSurfaces,
      projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 10, 0, clientY / 10),
      raycast: ({ kind, event }) => (kind === "condiment"
        ? { object: bottle.body, point: bottle.body.getWorldPosition(new THREE.Vector3()) }
        : layerWorldPoint(burger, "patty", event.clientX / 100, event.clientY / 100)),
      onSauceStroke: (stroke) => committed.push(stroke),
    });
    canvas.dispatch("pointerdown", pointer(111, 10, 10));
    canvas.dispatch("pointermove", pointer(111, 20, 20));
    canvas.dispatch("pointerdown", pointer(112, 40, 40));
    assert.equal(controller.getState(), "dragging-bottle", "second pointer is ignored");
    assert.equal(canvas.captured.has(112), false);
    if (cancellation === "hidden") {
      documentTarget.hidden = true;
      documentTarget.dispatch("visibilitychange");
    } else {
      canvas.dispatch(cancellation, pointer(111, 20, 20));
    }
    assert.equal(controller.getState(), "idle", cancellation);
    assert.equal(committed.length, 0, cancellation);
    assert.equal(tools.previewRoot.children.length, 0, cancellation);
    assert.ok(bottle.root.position.distanceTo(home) < 1e-9, cancellation);
    assert.equal(canvas.captured.has(111), false, cancellation);
    controller.dispose();
    harness.dispose();
  }
});

test("cleans up and docks before propagating a sauce callback error", () => {
  const harness = createPouringScene();
  const { canvas, camera, burger, tools } = harness;
  const bottle = tools.get("mustard");
  const home = bottle.root.position.clone();
  const expected = new Error("save failed");
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 10, 0, clientY / 10),
    raycast: ({ kind, event }) => (kind === "condiment"
      ? { object: bottle.body, point: bottle.body.getWorldPosition(new THREE.Vector3()) }
      : layerWorldPoint(burger, "bottom-bun", event.clientX / 50, event.clientY / 50)),
    onSauceStroke: () => { throw expected; },
  });
  canvas.dispatch("pointerdown", pointer(121, 2, 2));
  canvas.dispatch("pointermove", pointer(121, 12, 12));
  canvas.dispatch("pointermove", pointer(121, 22, 22));

  assert.throws(() => canvas.dispatch("pointerup", pointer(121, 22, 22)), expected);
  assert.equal(controller.getState(), "idle");
  assert.equal(tools.previewRoot.children.length, 0);
  assert.equal(canvas.captured.has(121), false);
  assert.ok(bottle.root.position.distanceTo(home) < 1e-9);
  assert.doesNotThrow(() => controller.dispose());
  harness.dispose();
});

test("dispose during an active bottle gesture removes preview and never commits", () => {
  const harness = createPouringScene();
  const { canvas, camera, burger, tools } = harness;
  const bottle = tools.get("sour");
  const home = bottle.root.position.clone();
  const committed = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    projectToPrep: ({ clientX, clientY }) => new THREE.Vector3(clientX / 10, 0, clientY / 10),
    raycast: ({ kind, event }) => (kind === "condiment"
      ? { object: bottle.cap, point: bottle.cap.getWorldPosition(new THREE.Vector3()) }
      : layerWorldPoint(burger, "pickle", event.clientX / 50, event.clientY / 50)),
    onSauceStroke: (stroke) => committed.push(stroke),
  });
  canvas.dispatch("pointerdown", pointer(131, 2, 2));
  canvas.dispatch("pointermove", pointer(131, 12, 12));
  assert.equal(tools.previewRoot.children.length, 1);

  controller.dispose();
  assert.equal(committed.length, 0);
  assert.equal(tools.previewRoot.children.length, 0);
  assert.equal(canvas.captured.has(131), false);
  assert.ok(bottle.root.position.distanceTo(home) < 1e-9);
  harness.dispose();
});
