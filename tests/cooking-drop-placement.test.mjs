import assert from "node:assert/strict";
import test from "node:test";

import { resolveCookingDropPlacement } from "../cooking-drop-placement.mjs";

test("drop placement uses the same retained position and yaw for preview and commit", () => {
  const releasePose = {
    position: { x: 0.71, y: 1.4, z: -0.29 },
    rotation: { x: 0.2, y: Math.PI * 2.25, z: -0.1 },
  };
  const preview = resolveCookingDropPlacement(releasePose);
  const commit = resolveCookingDropPlacement(releasePose);

  assert.deepEqual(preview, commit);
  assert.ok(preview.offset.x > 0.2);
  assert.ok(preview.offset.z < -0.08);
  assert.ok(Math.abs(preview.yaw - Math.PI / 4) < 1e-9);
});

test("drop placement centers tiny pointer noise and clamps extreme offsets", () => {
  const centered = resolveCookingDropPlacement({
    position: { x: 0.04, z: -0.03 },
    rotation: { y: 0 },
  });
  const clamped = resolveCookingDropPlacement({
    position: { x: 20, z: 0 },
    rotation: { y: 0 },
  });

  assert.deepEqual(centered.offset, { x: 0, z: 0 });
  assert.deepEqual(clamped.offset, { x: 0.76, z: 0 });
});
