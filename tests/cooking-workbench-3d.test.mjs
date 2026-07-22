import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { BURGER_LAYER_IDS, SAUCE_KEYS } from "../app/static/cooking-state.mjs";
import { createCookingWorkbench3D } from "../app/static/cooking-workbench-3d.mjs";

function createSwitchableSlotDescriptors() {
  return [
    { slotId: "bread-left-1", contentId: "bottom-bun", kind: "ingredient", region: "bread", index: 0 },
    { slotId: "bread-left-2", contentId: "middle-bun", kind: "ingredient", region: "bread", index: 1 },
    { slotId: "bread-left-3", contentId: "top-bun", kind: "ingredient", region: "bread", index: 2 },
    { slotId: "filling-back-1", contentId: "patty", kind: "ingredient", region: "filling", index: 0 },
    { slotId: "filling-back-2", contentId: "patty", kind: "ingredient", region: "filling", index: 1 },
    { slotId: "filling-back-3", contentId: "tomato", kind: "ingredient", region: "filling", index: 2 },
    { slotId: "filling-back-4", contentId: "lettuce", kind: "ingredient", region: "filling", index: 3 },
    { slotId: "sauce-right-1", contentId: "ketchup", kind: "tool", region: "sauce", index: 0 },
    { slotId: "sauce-right-2", contentId: "ketchup", kind: "tool", region: "sauce", index: 1 },
    { slotId: "sauce-right-3", contentId: "house-sauce", kind: "tool", region: "sauce", index: 2 },
  ];
}

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

test("derives prep supportY and drop anchor from the plate geometry", () => {
  const scaledPlateThree = {
    ...THREE,
    Mesh: class extends THREE.Mesh {
      constructor(geometry, material) {
        super(geometry, material);
        if (geometry instanceof THREE.CylinderGeometry
          && geometry.parameters.height === 0.16
          && geometry.parameters.radiusTop > 1.5
          && geometry.parameters.radiusBottom > 1.5) {
          this.scale.y = 1.75;
        }
      }
    },
  };
  const workbench = createCookingWorkbench3D(scaledPlateThree);
  const { plate } = workbench.prep;
  plate.geometry.computeBoundingBox();
  const expectedSupportY = plate.position.y
    + plate.geometry.boundingBox.max.y * plate.scale.y;

  assert.strictEqual(plate.scale.y, 1.75);
  assert.notStrictEqual(
    expectedSupportY,
    plate.position.y + plate.geometry.boundingBox.max.y,
  );
  assert.strictEqual(workbench.prep.supportY, expectedSupportY);
  assert.strictEqual(workbench.prep.dropAnchor.position.y, expectedSupportY);
  assert.strictEqual(workbench.layout.prep.supportY, expectedSupportY);
  assert.strictEqual(Object.isFrozen(workbench.prep), true);
  assert.throws(() => {
    workbench.prep.supportY = expectedSupportY + 1;
  }, TypeError);
  assert.strictEqual(workbench.prep.supportY, expectedSupportY);

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
  assert.ok(layout.ingredients.every(({ halfExtent }) => halfExtent.x >= 0.69
    && halfExtent.z >= 0.69), "ingredient bins visibly support the larger food scale");
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

test("arranges switchable slots into left bread, back filling, and right sauce regions", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    slotDescriptors: createSwitchableSlotDescriptors(),
  });
  const bread = workbench.ingredientSlots.filter(({ region }) => region === "bread");
  const filling = workbench.ingredientSlots.filter(({ region }) => region === "filling");
  const sauce = workbench.toolDocks.filter(({ region }) => region === "sauce");

  assert.equal(bread.length, 3);
  assert.ok(bread.every(({ bin }) => bin.position.x < 0));
  assert.equal(new Set(bread.map(({ bin }) => bin.position.z)).size, 3);
  assert.equal(filling.length, 4);
  assert.ok(filling.every(({ bin }) => bin.position.z < 0));
  assert.equal(new Set(filling.map(({ bin }) => bin.position.x)).size, 4);
  assert.equal(sauce.length, 3);
  assert.ok(sauce.every(({ dock }) => dock.position.x > 0));
  assert.equal(new Set(sauce.map(({ dock }) => dock.position.z)).size, 3);

  const firstPatty = workbench.getStationBySlot("filling-back-1");
  const secondPatty = workbench.getStationBySlot("filling-back-2");
  const patties = workbench.getStationsByContent("ingredient", "patty");
  const ketchupDocks = workbench.getStationsByContent("tool", "ketchup");
  assert.equal(workbench.getStation("ingredient", "patty"), firstPatty);
  assert.deepEqual(patties, [firstPatty, secondPatty]);
  assert.equal(Object.isFrozen(patties), true);
  assert.deepEqual(ketchupDocks.map(({ slotId }) => slotId), ["sauce-right-1", "sauce-right-2"]);
  assert.equal(Object.isFrozen(ketchupDocks), true);

  assert.equal(workbench.setSlotHighlighted("filling-back-2", true), true);
  assert.equal(firstPatty.highlight.visible, false);
  assert.equal(secondPatty.highlight.visible, true);
  assert.equal(workbench.setHighlighted("ingredient", "patty", true), true);
  assert.equal(firstPatty.highlight.visible, true, "content lookup highlights the first matching slot");
  assert.equal(workbench.setSlotHighlighted("missing-slot", true), false);

  workbench.dispose();
});

test("canonicalizes switchable station order regardless of descriptor order", () => {
  const descriptors = createSwitchableSlotDescriptors();
  const ordered = createCookingWorkbench3D(THREE, { slotDescriptors: descriptors });
  const shuffled = createCookingWorkbench3D(THREE, {
    slotDescriptors: [...descriptors].reverse(),
  });
  const ingredientSlotIds = [
    "bread-left-1",
    "bread-left-2",
    "bread-left-3",
    "filling-back-1",
    "filling-back-2",
    "filling-back-3",
    "filling-back-4",
  ];
  const toolDockIds = ["sauce-right-1", "sauce-right-2", "sauce-right-3"];
  const allSlotIds = [...ingredientSlotIds, ...toolDockIds];
  const selectableOrder = (workbench) => workbench.selectableSurfaces
    .slice(1)
    .map(({ userData: { cookingSelectable } }) => `station:${cookingSelectable.slotId}`);
  const expectedSelectableOrder = allSlotIds.map((slotId) => `station:${slotId}`);

  for (const { slotId } of descriptors) {
    const orderedStation = ordered.getStationBySlot(slotId);
    const shuffledStation = shuffled.getStationBySlot(slotId);
    const orderedGroup = orderedStation.bin ?? orderedStation.dock;
    const shuffledGroup = shuffledStation.bin ?? shuffledStation.dock;
    assert.deepEqual(
      shuffledGroup.position.toArray(),
      orderedGroup.position.toArray(),
      `${slotId} moved when descriptors were reordered`,
    );
  }
  for (const workbench of [ordered, shuffled]) {
    assert.deepEqual(workbench.ingredientSlots.map(({ slotId }) => slotId), ingredientSlotIds);
    assert.deepEqual(workbench.toolDocks.map(({ slotId }) => slotId), toolDockIds);
    assert.deepEqual(workbench.layout.ingredients.map(({ slotId }) => slotId), ingredientSlotIds);
    assert.deepEqual(workbench.layout.tools.map(({ slotId }) => slotId), toolDockIds);
    assert.deepEqual(selectableOrder(workbench), expectedSelectableOrder);
    assert.deepEqual(
      workbench.getStationsByContent("ingredient", "patty").map(({ slotId }) => slotId),
      ["filling-back-1", "filling-back-2"],
    );
    assert.equal(workbench.getStation("ingredient", "patty").slotId, "filling-back-1");
    assert.equal(workbench.setHighlighted("ingredient", "patty", true), true);
    assert.equal(workbench.getStationBySlot("filling-back-1").highlight.visible, true);
    assert.equal(workbench.getStationBySlot("filling-back-2").highlight.visible, false);
  }

  ordered.dispose();
  shuffled.dispose();
});

test("keeps switchable station identity stable while changing its region-valid content", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    slotDescriptors: createSwitchableSlotDescriptors(),
  });
  const station = workbench.getStationBySlot("filling-back-2");
  const originalPosition = station.bin.position.clone();
  const originalControlMetadata = station.controlAnchor.userData.workbenchSlotControl;
  const identities = {
    station,
    bin: station.bin,
    surface: station.surface,
    pickupAnchor: station.pickupAnchor,
    dropAnchor: station.dropAnchor,
    controlAnchor: station.controlAnchor,
  };

  assert.equal(Object.isFrozen(station), true);
  assert.equal(station.slotId, "filling-back-2");
  assert.equal(station.contentId, "patty");
  assert.equal(station.id, "patty");
  assert.equal(station.kind, "ingredient");
  assert.equal(station.region, "filling");
  assert.equal(station.index, 1);
  assert.throws(() => { station.slotId = "replacement"; }, TypeError);

  assert.equal(workbench.setStationContent("filling-back-2", "cheese"), true);
  assert.equal(workbench.getStationBySlot("filling-back-2"), identities.station);
  assert.equal(station.contentId, "cheese");
  assert.equal(station.id, "cheese");
  assert.equal(workbench.getStationsByContent("ingredient", "patty").length, 1);
  assert.deepEqual(workbench.getStationsByContent("ingredient", "cheese"), [station]);
  assert.deepEqual(station.bin.position, originalPosition);
  assert.equal(station.bin, identities.bin);
  assert.equal(station.surface, identities.surface);
  assert.equal(station.pickupAnchor, identities.pickupAnchor);
  assert.equal(station.dropAnchor, identities.dropAnchor);
  assert.equal(station.controlAnchor, identities.controlAnchor);
  assert.equal(station.controlAnchor.userData.workbenchSlotControl, originalControlMetadata);

  for (const metadata of [
    station.bin.userData.cookingStation,
    station.surface.userData.cookingSelectable,
    station.pickupAnchor.userData.cookingAnchor,
    station.dropAnchor.userData.cookingAnchor,
  ]) {
    assert.equal(metadata.slotId, "filling-back-2");
    assert.equal(metadata.contentId, "cheese");
    assert.equal(metadata.id, "cheese");
    assert.equal(metadata.region, "filling");
    assert.equal(Object.isFrozen(metadata), true);
  }
  assert.throws(
    () => workbench.setStationContent("filling-back-2", "ketchup"),
    TypeError,
  );
  assert.throws(
    () => workbench.setStationContent("missing-slot", "cheese"),
    TypeError,
  );
  assert.equal(station.contentId, "cheese");

  workbench.dispose();
});

test("validates switchable slot descriptors and permits repeated region content", () => {
  const valid = createSwitchableSlotDescriptors();
  const replace = (targetIndex, replacement) => valid.map((descriptor, index) => (
    index === targetIndex ? { ...descriptor, ...replacement } : descriptor
  ));
  const invalidOptions = [
    { slotDescriptors: "not-an-array" },
    { slotDescriptors: [] },
    { slotDescriptors: [null] },
    { slotDescriptors: replace(0, { slotId: "" }) },
    { slotDescriptors: replace(0, { contentId: "" }) },
    { slotDescriptors: replace(0, { kind: "tool" }) },
    { slotDescriptors: replace(7, { kind: "ingredient" }) },
    { slotDescriptors: replace(0, { region: "pantry" }) },
    { slotDescriptors: replace(0, { contentId: "patty" }) },
    { slotDescriptors: replace(3, { contentId: "bottom-bun" }) },
    { slotDescriptors: replace(7, { contentId: "cheese" }) },
    { slotDescriptors: replace(0, { index: -1 }) },
    { slotDescriptors: replace(0, { index: 0.5 }) },
    { slotDescriptors: replace(1, { slotId: valid[0].slotId }) },
    { slotDescriptors: replace(1, { slotId: ` ${valid[0].slotId} ` }) },
  ];

  for (const options of invalidOptions) {
    assert.throws(() => createCookingWorkbench3D(THREE, options), TypeError);
  }

  const workbench = createCookingWorkbench3D(THREE, { slotDescriptors: valid });
  assert.equal(workbench.getStationsByContent("ingredient", "patty").length, 2);
  assert.equal(workbench.getStationsByContent("tool", "ketchup").length, 2);
  workbench.dispose();
});

test("requires exactly three bread, four filling, and three sauce descriptors", () => {
  const valid = createSwitchableSlotDescriptors();
  const invalidTopologies = [
    valid.filter(({ region }) => region !== "bread"),
    valid.filter(({ region }) => region !== "filling"),
    valid.filter(({ region }) => region !== "sauce"),
    valid.filter(({ slotId }) => slotId !== "bread-left-3"),
    valid.filter(({ slotId }) => slotId !== "filling-back-4"),
    valid.filter(({ slotId }) => slotId !== "sauce-right-3"),
    [...valid, { ...valid[0], slotId: "bread-left-4", index: 3 }],
    [...valid, { ...valid[3], slotId: "filling-back-5", index: 4 }],
    [...valid, { ...valid[7], slotId: "sauce-right-4", index: 3 }],
  ];

  for (const slotDescriptors of invalidTopologies) {
    assert.throws(
      () => createCookingWorkbench3D(THREE, { slotDescriptors }),
      { name: "TypeError", message: /fixed 3\/4\/3 topology/ },
    );
  }
});

test("requires each switchable region index exactly once without gaps", () => {
  const valid = createSwitchableSlotDescriptors();
  const replaceIndex = (slotId, index) => valid.map((descriptor) => (
    descriptor.slotId === slotId ? { ...descriptor, index } : descriptor
  ));
  const invalidIndexes = [
    replaceIndex("bread-left-3", 1),
    replaceIndex("bread-left-3", 3),
    replaceIndex("filling-back-4", 2),
    replaceIndex("filling-back-4", 4),
    replaceIndex("sauce-right-3", 1),
    replaceIndex("sauce-right-3", 3),
  ];

  for (const slotDescriptors of invalidIndexes) {
    assert.throws(
      () => createCookingWorkbench3D(THREE, { slotDescriptors }),
      { name: "TypeError", message: /fixed 3\/4\/3 topology/ },
    );
  }
});

test("adds one stable non-raycast control anchor per switchable slot", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    slotDescriptors: createSwitchableSlotDescriptors(),
  });
  workbench.root.updateMatrixWorld(true);
  const stations = [...workbench.ingredientSlots, ...workbench.toolDocks];
  const anchors = stations.map(({ controlAnchor }) => controlAnchor);
  const exposed = workbench.getSlotControlAnchors();

  assert.equal(new Set(anchors).size, stations.length);
  assert.equal(workbench.selectableSurfaces.length, 1 + stations.length);
  assert.equal(Object.isFrozen(exposed), true);
  assert.deepEqual(exposed.map(({ slotId }) => slotId), stations.map(({ slotId }) => slotId));
  for (const [index, station] of stations.entries()) {
    assert.ok(station.controlAnchor instanceof THREE.Object3D);
    assert.equal(station.controlAnchor.parent, station.bin ?? station.dock);
    assert.ok(!workbench.selectableSurfaces.includes(station.controlAnchor));
    assert.deepEqual(station.controlAnchor.userData.workbenchSlotControl, {
      slotId: station.slotId,
      region: station.region,
    });
    assert.equal(Object.isFrozen(station.controlAnchor.userData.workbenchSlotControl), true);
    assert.equal(Object.hasOwn(station.controlAnchor.userData.workbenchSlotControl, "contentId"), false);
    assert.equal(exposed[index].anchor, station.controlAnchor);
    assert.equal(Object.isFrozen(exposed[index]), true);
    assert.ok(
      Math.hypot(station.controlAnchor.position.x, station.controlAnchor.position.z) > 0.5,
      "control anchor is offset from the material surface",
    );
    assert.ok(
      Math.hypot(station.controlAnchor.position.x, station.controlAnchor.position.z) < 1.5,
      "control anchor remains close to its slot",
    );
    assert.equal(station.controlAnchor.children.length, 0);
  }

  workbench.dispose();
  workbench.dispose();

  assert.equal(workbench.setSlotHighlighted("bread-left-1", true), false);
  assert.equal(workbench.setStationContent("bread-left-1", "top-bun"), false);
});

test("raycasting adjacent bins returns selectable solids and never decorative meshes", () => {
  const workbench = createCookingWorkbench3D(THREE, {
    ingredientIds: Array.from({ length: 12 }, (_, index) => `ingredient-${index}`),
    toolIds: [],
  });
  workbench.root.updateMatrixWorld(true);
  const first = workbench.getStation("ingredient", "ingredient-5");
  const second = workbench.getStation("ingredient", "ingredient-7");
  const boundaryZ = (first.bin.position.z + second.bin.position.z) / 2;
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(first.bin.position.x, 5, boundaryZ),
    new THREE.Vector3(0, -1, 0),
  );

  assert.ok(Object.isFrozen(workbench.selectableSurfaces));
  assert.equal(
    workbench.selectableSurfaces.length,
    1 + workbench.ingredientSlots.length + workbench.toolDocks.length,
  );
  assert.ok(workbench.selectableSurfaces.includes(workbench.prep.surface));
  assert.ok(workbench.selectableSurfaces.includes(first.surface));
  assert.ok(Object.isFrozen(first.surface.userData.cookingSelectable));
  assert.deepEqual(first.surface.userData.cookingSelectable, {
    kind: "ingredient",
    id: "ingredient-5",
    index: 5,
  });

  assert.deepEqual(raycaster.intersectObject(workbench.root, true), []);
  workbench.setHighlighted("ingredient", first.id, true);
  workbench.setHighlighted("ingredient", second.id, true);
  assert.deepEqual(raycaster.intersectObject(workbench.root, true), []);

  raycaster.ray.origin.set(first.bin.position.x, 5, first.bin.position.z);
  const directHits = raycaster.intersectObjects(workbench.selectableSurfaces, false);
  assert.deepEqual([...new Set(directHits.map(({ object }) => object))], [first.surface]);
  const rootHits = raycaster.intersectObject(workbench.root, true);
  assert.deepEqual([...new Set(rootHits.map(({ object }) => object))], [first.surface]);

  workbench.dispose();
});

test("layout bounds and half extents describe selectable solids, not decoration", () => {
  const workbench = createCookingWorkbench3D(THREE);
  workbench.root.updateMatrixWorld(true);
  const layout = workbench.getLayout();
  const cases = [
    [layout.prep, workbench.prep.surface],
    ...layout.ingredients.map((entry) => [entry, workbench.getStation("ingredient", entry.id).surface]),
    ...layout.tools.map((entry) => [entry, workbench.getStation("tool", entry.id).surface]),
  ];
  const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6);

  for (const [entry, selectableSurface] of cases) {
    const solid = new THREE.Box3().setFromObject(selectableSurface);
    closeTo(entry.bounds.minX, solid.min.x);
    closeTo(entry.bounds.maxX, solid.max.x);
    closeTo(entry.bounds.minZ, solid.min.z);
    closeTo(entry.bounds.maxZ, solid.max.z);
    closeTo(entry.halfExtent.x, (solid.max.x - solid.min.x) / 2);
    closeTo(entry.halfExtent.z, (solid.max.z - solid.min.z) / 2);
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

test("reuses one close-fitting prep cue for every indexed insertion gap", () => {
  const workbench = createCookingWorkbench3D(THREE);
  assert.equal(workbench.dropCue.visible, false);
  workbench.setDropCue({ targetIndex: 1, y: 1.6, radius: 0.92 });
  assert.equal(workbench.dropCue.visible, true);
  assert.equal(workbench.dropCue.userData.targetIndex, 1);
  assert.equal(workbench.dropCue.position.y, 1.6);
  assert.ok(workbench.dropCue.scale.x < 1.1);
  assert.throws(() => workbench.setDropCue({ targetIndex: -1, y: 1, radius: 1 }), TypeError);
  assert.throws(() => workbench.setDropCue({ targetIndex: 0, y: NaN, radius: 1 }), TypeError);
  assert.throws(() => workbench.setDropCue({ targetIndex: 0, y: 1, radius: 0 }), TypeError);
  workbench.clearDropCue();
  assert.equal(workbench.dropCue.visible, false);
  assert.equal(Object.hasOwn(workbench.dropCue.userData, "targetIndex"), false);
  workbench.dispose();
});
