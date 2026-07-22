import test from "node:test";
import assert from "node:assert/strict";

import {
  SLOT_CONTROL_COMPACT_WIDTH,
  SLOT_CONTROL_GAP,
  SLOT_CONTROL_HIT_SIZE,
  SLOT_CONTROL_MAX_ANCHOR_DISTANCE,
  layoutWorkbenchSlotControls,
} from "../app/static/workbench-slot-control-layout.mjs";
import { WORKBENCH_SLOTS } from "../app/static/workbench-loadout.mjs";

const VIEWPORT = Object.freeze({ width: 390, height: 844 });
const BASE_ANCHORS = Object.freeze([
  ["bread-left-1", "bread", 70, 290],
  ["bread-left-2", "bread", 72, 350],
  ["bread-left-3", "bread", 68, 410],
  ["filling-back-1", "filling", 90, 92],
  ["filling-back-2", "filling", 155, 94],
  ["filling-back-3", "filling", 220, 90],
  ["filling-back-4", "filling", 285, 93],
  ["sauce-right-1", "sauce", 320, 290],
  ["sauce-right-2", "sauce", 318, 350],
  ["sauce-right-3", "sauce", 322, 410],
].map(([slotId, region, x, y]) => Object.freeze({
  slotId,
  region,
  x,
  y,
  visible: true,
})));

function allControls(result) {
  return [
    ...result.individual,
    ...result.regionFallbacks,
  ];
}

function assertNoOverlap(result, size = SLOT_CONTROL_HIT_SIZE, gap = SLOT_CONTROL_GAP) {
  const controls = allControls(result);
  for (let left = 0; left < controls.length; left += 1) {
    for (let right = left + 1; right < controls.length; right += 1) {
      const a = controls[left];
      const b = controls[right];
      const separated = Math.abs(a.x - b.x) >= size + gap
        || Math.abs(a.y - b.y) >= size + gap;
      assert.equal(separated, true, `${a.slotId ?? a.region} overlaps ${b.slotId ?? b.region}`);
    }
  }
}

function assertWithinViewport(result, viewport, safeInset = 8) {
  const half = SLOT_CONTROL_HIT_SIZE / 2;
  for (const control of allControls(result)) {
    assert.ok(control.x - half >= safeInset);
    assert.ok(control.x + half <= viewport.width - safeInset);
    assert.ok(control.y - half >= safeInset);
    assert.ok(control.y + half <= viewport.height - safeInset);
  }
}

function assertWithinAnchorDistance(result) {
  for (const control of result.individual) {
    const distance = Math.hypot(
      control.x - control.anchorX,
      control.y - control.anchorY,
    );
    assert.ok(distance <= SLOT_CONTROL_MAX_ANCHOR_DISTANCE + 1e-9);
  }
}

function assertAllSlotsAccountedFor(result) {
  const ids = [
    ...result.individual.map(({ slotId }) => slotId),
    ...result.regionFallbacks.flatMap(({ slotIds }) => slotIds),
  ];
  assert.deepEqual(ids.toSorted(), WORKBENCH_SLOTS.map(({ slotId }) => slotId).toSorted());
  assert.equal(new Set(ids).size, WORKBENCH_SLOTS.length);
}

test("publishes the mobile hit-area, spacing, distance, and compact-width contract", () => {
  assert.equal(SLOT_CONTROL_HIT_SIZE, 52);
  assert.equal(SLOT_CONTROL_GAP, 8);
  assert.equal(SLOT_CONTROL_MAX_ANCHOR_DISTANCE, 96);
  assert.equal(SLOT_CONTROL_COMPACT_WIDTH, 360);
});

test("lays bread, filling, and sauce controls on deterministic screen rails", () => {
  const first = layoutWorkbenchSlotControls({ viewport: VIEWPORT, anchors: BASE_ANCHORS });
  const second = layoutWorkbenchSlotControls({ viewport: VIEWPORT, anchors: BASE_ANCHORS });

  assert.deepEqual(first, second);
  assert.equal(first.regionFallbacks.length, 0);
  assert.deepEqual(
    first.individual.map(({ slotId }) => slotId),
    WORKBENCH_SLOTS.map(({ slotId }) => slotId),
  );
  assert.ok(first.individual.filter(({ region }) => region === "bread").every(({ x }) => x === 34));
  assert.ok(first.individual.filter(({ region }) => region === "filling").every(({ y }) => y === 34));
  assert.ok(first.individual.filter(({ region }) => region === "sauce").every(({ x }) => x === 356));
  assertNoOverlap(first);
  assertWithinViewport(first, VIEWPORT);
  assertWithinAnchorDistance(first);
  assertAllSlotsAccountedFor(first);
  assert.equal(Object.isFrozen(first), true);
  assert.ok(first.individual.every(Object.isFrozen));
});

test("moves an offscreen slot into its region fallback without losing visible siblings", () => {
  const anchors = BASE_ANCHORS.map((anchor) => (
    anchor.slotId === "filling-back-3"
      ? Object.freeze({ ...anchor, visible: false })
      : anchor
  ));
  const result = layoutWorkbenchSlotControls({ viewport: VIEWPORT, anchors });

  assert.equal(result.individual.some(({ slotId }) => slotId === "filling-back-3"), false);
  assert.equal(result.individual.some(({ slotId }) => slotId === "filling-back-2"), true);
  assert.deepEqual(result.regionFallbacks, [{
    region: "filling",
    slotIds: ["filling-back-3"],
    x: 195,
    y: 810,
  }]);
  assertNoOverlap(result);
  assertAllSlotsAccountedFor(result);
});

test("falls an entire region back when its rail would exceed the anchor-distance limit", () => {
  const anchors = BASE_ANCHORS.map((anchor) => (
    anchor.region === "bread"
      ? Object.freeze({ ...anchor, x: 260 })
      : anchor
  ));
  const result = layoutWorkbenchSlotControls({ viewport: VIEWPORT, anchors });
  const breadFallback = result.regionFallbacks.find(({ region }) => region === "bread");

  assert.deepEqual(breadFallback?.slotIds, [
    "bread-left-1",
    "bread-left-2",
    "bread-left-3",
  ]);
  assert.equal(result.individual.some(({ region }) => region === "bread"), false);
  assertNoOverlap(result);
  assertAllSlotsAccountedFor(result);
});

test("compact viewports expose exactly three region controls", () => {
  const viewport = { width: 359, height: 568 };
  const result = layoutWorkbenchSlotControls({ viewport, anchors: BASE_ANCHORS });

  assert.deepEqual(result.individual, []);
  assert.deepEqual(
    result.regionFallbacks.map(({ region, slotIds }) => [region, slotIds.length]),
    [["bread", 3], ["filling", 4], ["sauce", 3]],
  );
  assertNoOverlap(result);
  assertWithinViewport(result, viewport);
  assertAllSlotsAccountedFor(result);
});

test("keeps all controls safe across eight yaw and three pitch projections", () => {
  for (let yaw = 0; yaw < 8; yaw += 1) {
    for (let pitch = 0; pitch < 3; pitch += 1) {
      const anchors = BASE_ANCHORS.map((anchor, index) => Object.freeze({
        ...anchor,
        x: anchor.x + Math.sin((yaw / 8) * Math.PI * 2) * 10,
        y: anchor.y + (pitch - 1) * 8,
        visible: !((yaw === 3 || yaw === 4) && index === pitch),
      }));
      const result = layoutWorkbenchSlotControls({ viewport: VIEWPORT, anchors });

      assertNoOverlap(result);
      assertWithinViewport(result, VIEWPORT);
      assertWithinAnchorDistance(result);
      assertAllSlotsAccountedFor(result);
    }
  }
});

test("rejects malformed viewports and ignores duplicate or foreign anchor records", () => {
  assert.throws(
    () => layoutWorkbenchSlotControls({ viewport: { width: 0, height: 844 }, anchors: [] }),
    TypeError,
  );
  const result = layoutWorkbenchSlotControls({
    viewport: VIEWPORT,
    anchors: [
      ...BASE_ANCHORS,
      { ...BASE_ANCHORS[0], x: 999 },
      { slotId: "foreign", region: "bread", x: 20, y: 20, visible: true },
    ],
  });
  assertAllSlotsAccountedFor(result);
});
