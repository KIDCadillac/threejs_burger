import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";

test("vendored Three.js is pinned to r185 and exposes WebGL primitives", () => {
  assert.equal(THREE.REVISION, "185");
  assert.equal(typeof THREE.WebGLRenderer, "function");
  assert.equal(typeof THREE.Raycaster, "function");
  assert.equal(typeof THREE.MeshPhysicalMaterial, "function");
});
