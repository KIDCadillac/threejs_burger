import test from "node:test";
import assert from "node:assert/strict";

import { resolveSoloLayerDrop } from "../app/static/cooking-drop-intent.mjs";

const BASE = Object.freeze({
  prepBounds: Object.freeze({ minX: -2.55, maxX: 2.55, minZ: -1.65, maxZ: 1.65 }),
  homeBounds: Object.freeze({ minX: 3.5, maxX: 4.7, minZ: -2.2, maxZ: -1 }),
  assembledCount: 3,
  magnetPadding: 0.36,
});

test("left and right plate drops share the same predictable insertion slot", () => {
  const left = resolveSoloLayerDrop({ ...BASE, point: { x: -2, z: -1 } });
  const right = resolveSoloLayerDrop({ ...BASE, point: { x: 2, z: -1 } });

  assert.deepEqual(left, {
    kind: "prep", intent: "insert", targetIndex: 3, slotCount: 4,
  });
  assert.deepEqual(right, {
    kind: "prep", intent: "insert", targetIndex: 3, slotCount: 4,
  });
  assert.ok(Object.isFrozen(left));
  assert.ok(Object.isFrozen(right));
});

test("two layers expose bottom, middle, and top insertion slots", () => {
  const input = { ...BASE, assembledCount: 2 };
  assert.deepEqual(resolveSoloLayerDrop({ ...input, point: { x: 0, z: 1.45 } }), {
    kind: "prep", intent: "insert", targetIndex: 0, slotCount: 3,
  });
  assert.deepEqual(resolveSoloLayerDrop({ ...input, point: { x: 0, z: 0 } }), {
    kind: "prep", intent: "insert", targetIndex: 1, slotCount: 3,
  });
  assert.deepEqual(resolveSoloLayerDrop({ ...input, point: { x: 0, z: -1.45 } }), {
    kind: "prep", intent: "insert", targetIndex: 2, slotCount: 3,
  });
});

test("each prep depth maps monotonically to one of count plus one slots", () => {
  const indexes = [1.6, 0.8, 0, -0.8, -1.6].map((z) => (
    resolveSoloLayerDrop({ ...BASE, assembledCount: 4, point: { x: 0, z } }).targetIndex
  ));
  assert.deepEqual(indexes, [0, 1, 2, 3, 4]);
});

test("a stack with no assembled layers exposes one insertion slot", () => {
  assert.deepEqual(resolveSoloLayerDrop({ ...BASE, assembledCount: 0, point: { x: 0, z: 1.2 } }), {
    kind: "prep", intent: "insert", targetIndex: 0, slotCount: 1,
  });
});

test("an expanded home magnet accepts forgiving returns without stealing distant drops", () => {
  assert.deepEqual(resolveSoloLayerDrop({ ...BASE, point: { x: 4.95, z: -1.4 } }), {
    kind: "bin", intent: "home", targetIndex: null,
  });
  assert.deepEqual(resolveSoloLayerDrop({ ...BASE, point: { x: 6, z: 3 } }), {
    kind: "invalid", intent: "invalid", targetIndex: null,
  });
});

test("validates detached finite bounds, points, counts, and padding", () => {
  const invalid = [
    { ...BASE, point: null },
    { ...BASE, point: { x: Number.NaN, z: 0 } },
    { ...BASE, prepBounds: { minX: 1, maxX: -1, minZ: 0, maxZ: 1 }, point: { x: 0, z: 0 } },
    { ...BASE, homeBounds: { minX: 0, maxX: 1, minZ: 0 }, point: { x: 0, z: 0 } },
    { ...BASE, assembledCount: -1, point: { x: 0, z: 0 } },
    { ...BASE, magnetPadding: -0.1, point: { x: 0, z: 0 } },
  ];
  for (const input of invalid) assert.throws(() => resolveSoloLayerDrop(input), TypeError);

  const mutable = {
    prepBounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    homeBounds: { minX: 2, maxX: 3, minZ: 2, maxZ: 3 },
    assembledCount: 1,
    magnetPadding: 0.2,
    point: { x: 0, z: 0 },
  };
  const result = resolveSoloLayerDrop(mutable);
  mutable.prepBounds.maxZ = -99;
  mutable.point.z = 99;
  assert.deepEqual(result, {
    kind: "prep", intent: "insert", targetIndex: 1, slotCount: 2,
  });
});
