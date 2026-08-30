import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../vendor/three.module.min.js";

import { createSushiFishPrep3D } from "../sushi-fish-prep-3d.mjs";
import { createSushiState } from "../sushi-state.mjs";

test("whole salmon prep preserves useful head, frame and skin as visible 3D parts", () => {
  const prep = createSushiFishPrep3D(THREE);
  prep.applyState(createSushiState({
    scaleStrokes: 3,
    headCollarReserved: true,
    filleted: true,
    fishFrameReserved: true,
    pinBonesRemoved: 3,
    skinReserved: true,
    sliceCuts: 2,
  }));

  assert.ok(prep.root.getObjectByName("whole-salmon:head"));
  assert.equal(prep.root.getObjectByName("sushi-prep:reserved-fish-frame").visible, true);
  assert.ok(prep.root.getObjectByName("salmon-fillet:skin"));
  assert.equal(prep.root.getObjectByName("sushi-prep:prepared-nigiri-slice").visible, true);
  assert.ok(prep.root.getObjectByName("byproduct:head-collar"));
  assert.ok(prep.root.getObjectByName("byproduct:fish-frame"));
  assert.ok(prep.root.getObjectByName("byproduct:salmon-skin"));
  prep.root.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => assert.equal(material.map ?? null, null));
  });
  prep.dispose();
});

test("fish prep exposes a knife, tweezers and six visible technique guides", () => {
  const prep = createSushiFishPrep3D(THREE);
  assert.ok(prep.root.getObjectByName("sushi-tool:deba-knife"));
  assert.ok(prep.root.getObjectByName("sushi-tool:bone-tweezers"));
  assert.ok(prep.root.getObjectByName("prep-guide:head-collar"));
  assert.ok(prep.root.getObjectByName("prep-guide:fillet"));
  assert.ok(prep.root.getObjectByName("prep-guide:skin"));
  assert.ok(prep.root.getObjectByName("prep-guide:slice:-0.38"));
  prep.dispose();
});

test("each completed pull cut leaves one more visible sushi slice in the transfer area", () => {
  const prep = createSushiFishPrep3D(THREE);
  prep.applyState(createSushiState({
    scaleStrokes: 3,
    headCollarReserved: true,
    filleted: true,
    fishFrameReserved: true,
    pinBonesRemoved: 3,
    skinReserved: true,
    sliceCuts: 1,
  }));
  const slices = prep.root.getObjectByName("sushi-prep:prepared-nigiri-slice");
  assert.equal(slices.visible, true);
  assert.deepEqual(slices.children.map((slice) => slice.visible), [true, false]);
  prep.dispose();
});
