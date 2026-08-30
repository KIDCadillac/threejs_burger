import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../vendor/three.module.min.js";

import { createSushiChefMentor3D } from "../sushi-chef-mentor-3d.mjs";

test("the sushi mentor is a texture-free procedural chef with an angry pose", () => {
  const mentor = createSushiChefMentor3D(THREE);
  assert.equal(mentor.root.userData.sushiMentor, true);
  assert.ok(mentor.root.getObjectByName("mentor:chef-hat"));
  assert.ok(mentor.root.getObjectByName("mentor:pointing-arm"));
  mentor.show("error", 100, 900);
  mentor.tick(180);
  assert.equal(mentor.getState().tone, "error");
  mentor.root.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => assert.equal(material.map ?? null, null));
  });
  mentor.dispose();
});
