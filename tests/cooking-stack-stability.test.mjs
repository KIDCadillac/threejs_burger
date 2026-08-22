import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeCookingStackStability,
  sampleCookingCollapseLayer,
  sampleCookingStackWobble,
} from "../cooking-stack-stability.mjs";
import {
  createSoloCookingState,
  placeSoloLayer,
  undoSoloCooking,
} from "../cooking-solo-state.mjs";

const layer = (x = 0, z = 0, mass = 0.6) => ({ x, z, mass, radius: 0.82 });

test("a centered tall burger stays stable", () => {
  const result = analyzeCookingStackStability([
    layer(), layer(0.01), layer(-0.01), layer(0.015), layer(-0.005),
  ]);
  assert.equal(result.level, "safe");
  assert.ok(result.risk < 0.1);
  assert.deepEqual(sampleCookingStackWobble(result, 500, 0), {
    offsetX: 0, offsetZ: 0, rotationX: 0, rotationZ: 0,
  });
});

test("height and cumulative offset turn the same placement into a warning", () => {
  const short = analyzeCookingStackStability([layer(), layer(0.42)]);
  const tall = analyzeCookingStackStability([
    layer(), layer(0.16), layer(0.3), layer(0.45), layer(0.58),
  ]);
  assert.equal(short.level, "safe");
  assert.equal(tall.level, "warning");
  assert.ok(tall.risk > short.risk);
  assert.ok(tall.directionX > 0.9);
});

test("a sharply sheared high stack becomes critical", () => {
  const result = analyzeCookingStackStability([
    layer(-0.4), layer(-0.18), layer(0.18), layer(0.5), layer(0.74, 0.1, 1.25),
  ]);
  assert.equal(result.level, "critical");
  assert.ok(result.maxShear > 0.7);
  const frame = sampleCookingStackWobble(result, 720, 100);
  assert.ok(Math.abs(frame.rotationZ) > 0.01);
});

test("collapse separates layers instead of moving the stack as one block", () => {
  const bottom = sampleCookingCollapseLayer({ index: 0, count: 5, elapsedMs: 440 });
  const top = sampleCookingCollapseLayer({ index: 4, count: 5, elapsedMs: 440 });
  const end = sampleCookingCollapseLayer({ index: 4, count: 5, elapsedMs: 880 });
  assert.notEqual(bottom.offsetX, top.offsetX);
  assert.notEqual(bottom.offsetZ, top.offsetZ);
  assert.ok(top.offsetY > bottom.offsetY);
  assert.equal(end.done, true);
  assert.ok(end.offsetY < 0);
});

test("a retained landing offset is part of the same undoable placement", () => {
  const initial = createSoloCookingState();
  const placed = placeSoloLayer(initial, "bottom-bun", 0, {
    placementOffset: { x: 0.28, z: -0.12 },
    placementYaw: Math.PI / 3,
  });
  assert.deepEqual(placed.offsets["bottom-bun"], { x: 0.28, z: -0.12 });
  assert.ok(Math.abs(placed.rotations["bottom-bun"] - Math.PI / 3) < 1e-9);
  assert.equal(placed.history.length, 1);
  const undone = undoSoloCooking(placed);
  assert.deepEqual(undone.assembledOrder, []);
  assert.deepEqual(undone.offsets["bottom-bun"], { x: 0, z: 0 });
  assert.equal(undone.rotations["bottom-bun"], 0);
});
