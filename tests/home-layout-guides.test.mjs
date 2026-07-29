import assert from "node:assert/strict";
import test from "node:test";

import {
  alignmentPatch,
  normalizeAlignmentSettings,
  snapDragLayout,
} from "../home-layout-guides.mjs";

const referenceRect = {
  left: 0,
  top: 0,
  right: 100,
  bottom: 80,
  width: 100,
  height: 80,
};

test("normalizes editor alignment settings", () => {
  assert.deepEqual(
    normalizeAlignmentSettings({
      snapping: 0,
      showGrid: 1,
      gridSize: 999,
      inset: -20,
      threshold: 99,
    }),
    {
      snapping: false,
      showGrid: true,
      gridSize: 64,
      inset: 0,
      threshold: 24,
    },
  );
});

test("aligns an element to container edges and centers", () => {
  const value = { x: 5, y: 7 };
  const elementRect = {
    left: 30,
    top: 20,
    right: 50,
    bottom: 30,
    width: 20,
    height: 10,
  };

  assert.deepEqual(
    alignmentPatch({
      mode: "left",
      value,
      elementRect,
      referenceRect,
      inset: 10,
    }),
    { x: -15 },
  );
  assert.deepEqual(
    alignmentPatch({
      mode: "hcenter",
      value,
      elementRect,
      referenceRect,
    }),
    { x: 15 },
  );
  assert.deepEqual(
    alignmentPatch({
      mode: "right",
      value,
      elementRect,
      referenceRect,
      inset: 10,
    }),
    { x: 45 },
  );
  assert.deepEqual(
    alignmentPatch({
      mode: "vcenter",
      value,
      elementRect,
      referenceRect,
    }),
    { y: 22 },
  );
});

test("snaps dragging to container lines before the grid", () => {
  const result = snapDragLayout({
    startValue: { x: 0, y: 0 },
    startRect: {
      left: 23,
      top: 17,
      right: 43,
      bottom: 27,
      width: 20,
      height: 10,
    },
    referenceRect,
    deltaX: -16,
    deltaY: 18,
    settings: {
      snapping: true,
      showGrid: true,
      gridSize: 8,
      inset: 0,
      threshold: 7,
    },
  });

  assert.equal(result.x, -23);
  assert.equal(result.snapX, "left");
  assert.equal(result.y, 18);
  assert.equal(result.snapY, "middle");
});

test("uses the selected grid size when no edge guide is close", () => {
  const result = snapDragLayout({
    startValue: { x: 0, y: 0 },
    startRect: {
      left: 10,
      top: 10,
      right: 20,
      bottom: 20,
      width: 10,
      height: 10,
    },
    referenceRect: {
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
    },
    deltaX: 3,
    deltaY: 11,
    settings: {
      snapping: true,
      showGrid: true,
      gridSize: 8,
      inset: 0,
      threshold: 2,
    },
  });

  assert.equal(result.x, 6);
  assert.equal(result.y, 14);
  assert.equal(result.snapX, "grid");
  assert.equal(result.snapY, "grid");
});
