import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../vendor/three.module.min.js";

import {
  createSushiIngredient3D,
  createSushiNigiriModel3D,
} from "../sushi-model-3d.mjs";

test("sushi ingredients expose real texture-free selectable surfaces", () => {
  for (const ingredientId of ["rice-bed", "salmon-slice"]) {
    const ingredient = createSushiIngredient3D(THREE, ingredientId);
    assert.equal(ingredient.root.userData.foodLayer.food, "sushi");
    assert.equal(ingredient.surface.userData.cookingSelectable.ingredientId, ingredientId);
    ingredient.root.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        assert.equal(material.map ?? null, null);
        assert.equal(material.normalMap ?? null, null);
      });
    });
    ingredient.dispose();
  }
});

test("assembled nigiri keeps rice below salmon", () => {
  const nigiri = createSushiNigiriModel3D(THREE);
  const [rice, salmon] = nigiri.ingredients;
  assert.equal(nigiri.root.userData.foodModel.food, "sushi");
  assert.ok(rice.root.position.y < salmon.root.position.y);
  assert.equal(nigiri.root.children.length, 2);
  nigiri.dispose();
});
