import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { createCookingInteractionController } from "../app/static/cooking-interaction-controller.mjs";

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
