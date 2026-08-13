import assert from "node:assert/strict";
import test from "node:test";

import {
  createCookingMotion,
  getCookingMaterialPhysics,
  sampleCookingMotion,
} from "../cooking-insertion-animation.mjs";

test("insert motion preserves full release scale and falls before first contact", () => {
  const motion = createCookingMotion({
    kind: "insert", startedAt: 100, thickness: 1, ingredientId: "patty",
  });
  const start = sampleCookingMotion(motion, 100);
  const air = sampleCookingMotion(motion, 100 + 560 * 0.3);

  assert.equal(start.phase, "fall");
  assert.equal(start.arrival, 0);
  assert.equal(start.verticalArrival, 0);
  assert.equal(start.selectedScaleXz, 1);
  assert.equal(start.selectedScaleY, 1);
  assert.equal(start.impact, false);
  assert.equal(air.phase, "fall");
  assert.ok(air.arrival > 0 && air.arrival < 1);
  assert.ok(air.verticalArrival > 0 && air.verticalArrival < air.arrival);
  assert.equal(air.selectedOffsetY, 0);
});

test("insert motion has one squash-and-spread contact followed by a settled rebound", () => {
  const motion = createCookingMotion({
    kind: "insert", startedAt: 0, thickness: 1, ingredientId: "bottom-bun",
  });
  const contact = sampleCookingMotion(motion, 560 * 0.66);
  const rebound = sampleCookingMotion(motion, 560 * 0.86);
  const end = sampleCookingMotion(motion, 560);

  assert.equal(contact.phase, "contact");
  assert.equal(contact.arrival, 1);
  assert.ok(contact.selectedScaleXz > 1);
  assert.ok(contact.selectedScaleY < 1);
  assert.ok(contact.supportCompression > 0);
  assert.ok(contact.supportLoad > 0);
  assert.equal(contact.impact, true);
  assert.equal(rebound.phase, "rebound");
  assert.ok(rebound.selectedScaleY > 1);
  assert.ok(rebound.supportCompression < 0);
  assert.ok(rebound.supportLoad < 0);
  assert.deepEqual(end, {
    phase: "settled",
    progress: 1,
    arrival: 1,
    verticalArrival: 1,
    selectedOffsetY: 0,
    upperOffsetY: 0,
    supportCompression: 0,
    supportLoad: 0,
    selectedScaleXz: 1,
    selectedScaleY: 1,
    impact: false,
    done: true,
  });
});

test("soft bun deforms visibly more than hard sliced garnish", () => {
  const bun = createCookingMotion({
    kind: "insert", startedAt: 0, thickness: 1, ingredientId: "top-bun",
  });
  const pickle = createCookingMotion({
    kind: "insert", startedAt: 0, thickness: 1, ingredientId: "pickle",
  });
  const bunContact = sampleCookingMotion(bun, 560 * 0.63);
  const pickleContact = sampleCookingMotion(pickle, 560 * 0.63);

  assert.ok(getCookingMaterialPhysics("top-bun").compliance
    > getCookingMaterialPhysics("pickle").compliance);
  assert.ok(1 - bunContact.selectedScaleY > 1 - pickleContact.selectedScaleY);
  assert.ok(bunContact.selectedScaleXz - 1 > pickleContact.selectedScaleXz - 1);
});
