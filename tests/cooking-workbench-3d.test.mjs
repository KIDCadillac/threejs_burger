import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { BURGER_LAYER_IDS, SAUCE_KEYS } from "../app/static/cooking-state.mjs";
import { createCookingWorkbench3D } from "../app/static/cooking-workbench-3d.mjs";

test("builds a real Three workbench with default prep, ingredient, and tool stations", () => {
  const workbench = createCookingWorkbench3D(THREE);

  assert.ok(workbench.root instanceof THREE.Group);
  assert.ok(workbench.prep.anchor instanceof THREE.Object3D);
  assert.ok(workbench.prep.surface instanceof THREE.Mesh);
  assert.deepEqual(workbench.ingredientSlots.map(({ id }) => id), BURGER_LAYER_IDS);
  assert.deepEqual(workbench.toolDocks.map(({ id }) => id), SAUCE_KEYS);
  assert.ok(workbench.ingredientSlots.every(({ bin }) => bin instanceof THREE.Group));
  assert.ok(workbench.toolDocks.every(({ dock }) => dock instanceof THREE.Group));

  workbench.dispose();
});

test("supports recipe-specific station identifiers without adding food semantics", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    ingredientIds: ["rice", "nori", "salmon"],
    toolIds: ["knife", "brush"],
  });

  assert.deepEqual(workbench.ingredientSlots.map(({ id }) => id), ["rice", "nori", "salmon"]);
  assert.deepEqual(workbench.toolDocks.map(({ id }) => id), ["knife", "brush"]);
  assert.equal(workbench.root.getObjectByName("ingredient:rice"), workbench.ingredientSlots[0].bin);
  assert.equal(workbench.root.getObjectByName("tool:knife"), workbench.toolDocks[0].dock);

  workbench.dispose();
});

test("rejects malformed, duplicate, and excessive station identifiers", () => {
  const invalidOptions = [
    { ingredientIds: "rice" },
    { ingredientIds: [] },
    { ingredientIds: [""] },
    { ingredientIds: ["rice", " rice "] },
    { ingredientIds: ["rice"], toolIds: ["rice"] },
    { ingredientIds: Array.from({ length: 13 }, (_, index) => `ingredient-${index}`) },
    { ingredientIds: ["rice"], toolIds: Array.from({ length: 9 }, (_, index) => `tool-${index}`) },
  ];

  for (const options of invalidOptions) {
    assert.throws(() => createCookingWorkbench3D(THREE, options), TypeError);
  }
});

test("lays stations around a clear central assembly area inside portrait-friendly bounds", () => {
  const workbench = createCookingWorkbench3D(THREE);
  const layout = workbench.getLayout();
  const stations = [...layout.ingredients, ...layout.tools];
  const transformKeys = stations.map(({ position }) => (
    `${position.x.toFixed(4)},${position.y.toFixed(4)},${position.z.toFixed(4)}`
  ));

  assert.equal(new Set(transformKeys).size, stations.length);
  assert.ok(layout.ingredients.some(({ position }) => position.z < -2.5), "ingredients need a back row");
  assert.ok(layout.ingredients.some(({ position }) => Math.abs(position.x) > 3.5), "ingredients need side bins");
  assert.ok(layout.tools.every(({ position }) => position.z > 2.5), "tools stay near the reachable front edge");

  for (const station of stations) {
    const outsidePrepX = station.bounds.maxX <= layout.prep.bounds.minX
      || station.bounds.minX >= layout.prep.bounds.maxX;
    const outsidePrepZ = station.bounds.maxZ <= layout.prep.bounds.minZ
      || station.bounds.minZ >= layout.prep.bounds.maxZ;
    assert.equal(outsidePrepX || outsidePrepZ, true, `${station.kind}:${station.id} overlaps prep`);
    assert.ok(station.bounds.minX >= -5.3 && station.bounds.maxX <= 5.3);
    assert.ok(station.bounds.minZ >= -4.9 && station.bounds.maxZ <= 4.9);
  }

  assert.ok(Object.isFrozen(layout));
  assert.equal(workbench.getLayout(), layout, "layout metadata remains stable for controllers");
  workbench.dispose();
});

test("keeps maximum custom station counts physically separated", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    ingredientIds: Array.from({ length: 12 }, (_, index) => `ingredient-${index}`),
    toolIds: Array.from({ length: 8 }, (_, index) => `tool-${index}`),
  });
  const layout = workbench.getLayout();
  const stations = [...layout.ingredients, ...layout.tools];
  const overlaps = (left, right) => (
    left.bounds.minX < right.bounds.maxX
    && left.bounds.maxX > right.bounds.minX
    && left.bounds.minZ < right.bounds.maxZ
    && left.bounds.maxZ > right.bounds.minZ
  );

  for (let leftIndex = 0; leftIndex < stations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < stations.length; rightIndex += 1) {
      assert.equal(
        overlaps(stations[leftIndex], stations[rightIndex]),
        false,
        `${stations[leftIndex].id} overlaps ${stations[rightIndex].id}`,
      );
    }
  }

  workbench.dispose();
});

test("provides a camera view that contains the whole workbench on a narrow phone", () => {
  const workbench = createCookingWorkbench3D(THREE);
  const { bounds, camera: view } = workbench.getLayout();
  const camera = new THREE.PerspectiveCamera(view.fov, view.minPortraitAspect, view.near, view.far);
  camera.position.set(view.position.x, view.position.y, view.position.z);
  camera.lookAt(view.target.x, view.target.y, view.target.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [-0.5, 0.8]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(projected.x) <= 1, `x=${x} is outside portrait view`);
        assert.ok(Math.abs(projected.y) <= 1, `z=${z} is outside portrait view`);
        assert.ok(projected.z >= -1 && projected.z <= 1);
      }
    }
  }

  workbench.dispose();
});

test("exposes stable pickup/drop anchors and controller lookup metadata", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    ingredientIds: ["rice", "nori"],
    toolIds: ["knife"],
  });
  const rice = workbench.getStation("ingredient", "rice");
  const knife = workbench.getStation("tool", "knife");

  assert.equal(rice, workbench.ingredientSlots[0]);
  assert.equal(knife, workbench.toolDocks[0]);
  assert.equal(workbench.getStation("ingredient", "missing"), null);
  assert.ok(rice.pickupAnchor instanceof THREE.Object3D);
  assert.ok(rice.dropAnchor instanceof THREE.Object3D);
  assert.equal(rice.pickupAnchor.parent, rice.bin);
  assert.equal(rice.dropAnchor.parent, rice.bin);
  assert.deepEqual(rice.bin.userData.cookingStation, {
    kind: "ingredient",
    id: "rice",
    index: 0,
  });
  assert.deepEqual(knife.dock.userData.cookingStation, {
    kind: "tool",
    id: "knife",
    index: 0,
  });
  assert.ok(Object.isFrozen(workbench.ingredientSlots));
  assert.ok(Object.isFrozen(workbench.toolDocks));
  assert.ok(Object.isFrozen(rice));
  assert.ok(Object.isFrozen(rice.bin.userData.cookingStation));
  assert.ok(Object.isFrozen(rice.pickupAnchor.userData.cookingAnchor));
  assert.ok(rice.pickupAnchor.position.y > rice.dropAnchor.position.y);

  workbench.dispose();
});

test("uses procedural low-poly meshes for the counter, raised bins, board, plate, and docks", () => {
  const workbench = createCookingWorkbench3D(THREE);
  const allMeshes = [];
  workbench.root.traverse((object) => {
    if (object instanceof THREE.Mesh) allMeshes.push(object);
  });

  assert.ok(workbench.counter instanceof THREE.Mesh);
  assert.ok(workbench.prep.board instanceof THREE.Mesh);
  assert.ok(workbench.prep.plate instanceof THREE.Mesh);
  assert.ok(workbench.prep.plate.geometry instanceof THREE.CylinderGeometry);
  assert.ok(workbench.ingredientSlots.every(({ bin }) => (
    bin.children.filter((child) => child instanceof THREE.Mesh).length >= 6
  )), "each raised bin has a tray, rim pieces, shadow, and highlight affordance");
  assert.ok(workbench.toolDocks.every(({ dock }) => (
    dock.children.filter((child) => child instanceof THREE.Mesh).length >= 3
  )), "each tool dock is dimensional, not a flat image");
  assert.ok(allMeshes.every(({ geometry }) => geometry instanceof THREE.BufferGeometry));
  assert.ok(allMeshes.every(({ material }) => {
    const materials = Array.isArray(material) ? material : [material];
    return materials.every((item) => item.map == null);
  }), "workbench does not hide bitmap or SVG art in material maps");

  const binColors = new Set(workbench.ingredientSlots.map(({ surface }) => surface.material.color.getHex()));
  assert.ok(binColors.size >= 3, "warm bin materials have restrained color variation");
  workbench.dispose();
});

test("highlights selectable stations without changing neighboring stations", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    ingredientIds: ["rice", "nori"],
    toolIds: ["knife"],
  });
  const rice = workbench.getStation("ingredient", "rice");
  const nori = workbench.getStation("ingredient", "nori");

  assert.equal(rice.highlight.visible, false);
  assert.equal(nori.highlight.visible, false);
  assert.equal(workbench.setHighlighted("ingredient", "rice", true), true);
  assert.equal(rice.highlight.visible, true);
  assert.equal(nori.highlight.visible, false);
  assert.equal(workbench.setHighlighted("ingredient", "missing", true), false);
  assert.equal(workbench.setHighlighted("ingredient", "rice", false), true);
  assert.equal(rice.highlight.visible, false);
  workbench.setHighlighted("ingredient", "nori", true);
  workbench.setHighlighted("tool", "knife", true);
  workbench.clearHighlights();
  assert.equal(nori.highlight.visible, false);
  assert.equal(workbench.getStation("tool", "knife").highlight.visible, false);

  workbench.dispose();
});

test("disposes shared geometry and material resources once and remains idempotent", () => {
  const createdResources = [];
  const instrument = (Base) => class extends Base {
    constructor(...args) {
      super(...args);
      this.disposeCount = 0;
      this.dispose = () => { this.disposeCount += 1; };
      createdResources.push(this);
    }
  };
  const instrumentedThree = {
    ...THREE,
    BoxGeometry: instrument(THREE.BoxGeometry),
    CircleGeometry: instrument(THREE.CircleGeometry),
    CylinderGeometry: instrument(THREE.CylinderGeometry),
    RingGeometry: instrument(THREE.RingGeometry),
    TorusGeometry: instrument(THREE.TorusGeometry),
    MeshBasicMaterial: instrument(THREE.MeshBasicMaterial),
    MeshStandardMaterial: instrument(THREE.MeshStandardMaterial),
  };
  const workbench = createCookingWorkbench3D(instrumentedThree, {
    ingredientIds: ["rice"],
    toolIds: [],
  });
  const scene = new THREE.Scene();
  scene.add(workbench.root);
  const geometryUses = new Map();
  const materialUses = new Map();
  workbench.root.traverse((object) => {
    if (object.geometry) {
      geometryUses.set(object.geometry, (geometryUses.get(object.geometry) ?? 0) + 1);
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material) materialUses.set(material, (materialUses.get(material) ?? 0) + 1);
    }
  });
  assert.ok([...geometryUses.values()].some((uses) => uses > 1));
  assert.ok([...materialUses.values()].some((uses) => uses > 1));

  workbench.dispose();
  workbench.dispose();

  assert.ok(createdResources.length > geometryUses.size + materialUses.size, "unused optional resources were tracked");
  assert.ok(createdResources.every(({ disposeCount }) => disposeCount === 1));
  assert.equal(workbench.root.parent, null, "disposed workbench detaches before a scene host disposes");
  assert.equal(workbench.setHighlighted("ingredient", "rice", true), false);
});
