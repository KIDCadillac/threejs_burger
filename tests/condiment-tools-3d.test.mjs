import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { SAUCE_KEYS } from "../app/static/cooking-state.mjs";
import { createCookingWorkbench3D } from "../app/static/cooking-workbench-3d.mjs";
import { createCondimentTools3D } from "../app/static/condiment-tools-3d.mjs";

function closeVector(actual, expected, epsilon = 1e-9) {
  assert.ok(actual.distanceTo(expected) <= epsilon, [
    `expected ${expected.toArray().join(",")}`,
    `received ${actual.toArray().join(",")}`,
  ].join("; "));
}

test("builds four real low-poly condiment bottles on their workbench docks", () => {
  const workbench = createCookingWorkbench3D(THREE);
  const tools = createCondimentTools3D(THREE, { toolDocks: workbench.toolDocks });
  workbench.root.add(tools.root);
  workbench.root.updateMatrixWorld(true);

  assert.ok(tools.root instanceof THREE.Group);
  assert.deepEqual([...tools.bottles.keys()], SAUCE_KEYS);
  assert.equal(tools.selectableSurfaces.length, SAUCE_KEYS.length * 3);
  assert.ok(Object.isFrozen(tools.selectableSurfaces));
  for (const sauce of SAUCE_KEYS) {
    const bottle = tools.get(sauce);
    assert.ok(bottle.root instanceof THREE.Group);
    assert.ok(bottle.body instanceof THREE.Mesh);
    assert.ok(bottle.cap instanceof THREE.Mesh);
    assert.ok(bottle.nozzle instanceof THREE.Mesh);
    assert.ok(bottle.nozzleAnchor instanceof THREE.Object3D);
    assert.equal(Object.isFrozen(bottle.metadata), true);
    assert.deepEqual(bottle.metadata, { kind: "condiment-bottle", sauce, id: sauce });
    assert.ok(bottle.selectableSurfaces.every((surface) => surface.isMesh));
    assert.ok(bottle.selectableSurfaces.every((surface) => (
      surface.userData.cookingSelectable === bottle.metadata
    )));
    const dock = workbench.getStation("tool", sauce);
    const expected = dock.pickupAnchor.getWorldPosition(new THREE.Vector3());
    closeVector(bottle.root.getWorldPosition(new THREE.Vector3()), expected);
  }

  const meshes = [];
  tools.root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  assert.ok(meshes.length <= 24, `mobile bottle mesh budget exceeded: ${meshes.length}`);
  assert.ok(meshes.every(({ material }) => !material.map), "tools use no bitmap textures");
  tools.dispose();
  workbench.dispose();
});

test("only explicit bottle solids raycast while decoration and preview do not", () => {
  const workbench = createCookingWorkbench3D(THREE);
  const tools = createCondimentTools3D(THREE, { toolDocks: workbench.toolDocks });
  workbench.root.add(tools.root);
  workbench.root.updateMatrixWorld(true);
  const chili = tools.get("chili");
  const center = chili.body.getWorldPosition(new THREE.Vector3());
  const raycaster = new THREE.Raycaster(
    center.clone().add(new THREE.Vector3(0, 0, 4)),
    new THREE.Vector3(0, 0, -1),
  );
  const explicitHits = raycaster.intersectObjects(tools.selectableSurfaces, false);
  const recursiveHits = raycaster.intersectObject(tools.root, true);

  assert.ok(explicitHits.some(({ object }) => chili.selectableSurfaces.includes(object)));
  assert.ok(recursiveHits.length > 0);
  assert.ok(recursiveHits.every(({ object }) => tools.selectableSurfaces.includes(object)));
  assert.equal(tools.previewRoot.raycast, tools.noRaycast);
  assert.ok(chili.decoration.every((object) => object.raycast === tools.noRaycast));
  tools.dispose();
  workbench.dispose();
});

test("tilts, activates, and returns a bottle to its exact immutable home pose", () => {
  const workbench = createCookingWorkbench3D(THREE);
  const tools = createCondimentTools3D(THREE, { toolDocks: workbench.toolDocks });
  workbench.root.add(tools.root);
  const chili = tools.get("chili");
  const homePosition = chili.root.position.clone();
  const homeQuaternion = chili.root.quaternion.clone();
  const homeScale = chili.root.scale.clone();

  tools.setActive("chili", true);
  assert.equal(chili.root.userData.active, true);
  assert.ok(chili.root.scale.x > homeScale.x);
  tools.setTilt("chili", { x: 99, z: -99 });
  assert.ok(Math.abs(chili.root.rotation.x) <= Math.PI / 3 + 1e-9);
  assert.ok(Math.abs(chili.root.rotation.z) <= Math.PI / 3 + 1e-9);
  chili.root.position.set(5, 6, 7);

  assert.equal(tools.dock("chili"), true);
  assert.equal(chili.root.userData.active, false);
  closeVector(chili.root.position, homePosition);
  assert.ok(chili.root.quaternion.angleTo(homeQuaternion) < 1e-9);
  closeVector(chili.root.scale, homeScale);
  assert.throws(() => tools.setTilt("ketchup", { x: 0, z: 0 }), /unknown condiment/i);
  assert.throws(() => tools.setTilt("chili", { x: Number.NaN, z: 0 }), /finite/i);
  tools.dispose();
  workbench.dispose();
});

test("validates exact sauce docks and disposes shared resources once", () => {
  const workbench = createCookingWorkbench3D(THREE);
  assert.throws(
    () => createCondimentTools3D(THREE, { toolDocks: workbench.toolDocks.slice(0, 3) }),
    /exactly match sauce keys/i,
  );
  assert.throws(
    () => createCondimentTools3D(THREE, {
      toolDocks: [workbench.toolDocks[0], workbench.toolDocks[0], ...workbench.toolDocks.slice(2)],
    }),
    /duplicate|exactly match/i,
  );

  const disposals = [];
  const instrument = (Base, type) => class extends Base {
    dispose() {
      disposals.push(this);
      super.dispose();
    }
  };
  const instrumented = {
    ...THREE,
    CylinderGeometry: instrument(THREE.CylinderGeometry, "geometry"),
    SphereGeometry: instrument(THREE.SphereGeometry, "geometry"),
    TorusGeometry: instrument(THREE.TorusGeometry, "geometry"),
    MeshStandardMaterial: instrument(THREE.MeshStandardMaterial, "material"),
  };
  const tools = createCondimentTools3D(instrumented, { toolDocks: workbench.toolDocks });
  tools.dispose();
  tools.dispose();
  assert.ok(disposals.length > 0);
  assert.equal(new Set(disposals).size, disposals.length, "each shared resource is disposed once");
  assert.equal(tools.root.parent, null);
  assert.equal(tools.dock("chili"), false);
  workbench.dispose();
});
