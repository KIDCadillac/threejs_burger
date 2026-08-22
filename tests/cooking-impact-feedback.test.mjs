import assert from "node:assert/strict";
import test from "node:test";

import {
  getCookingImpactProfile,
  sampleCookingImpactParticle,
} from "../cooking-impact-feedback.mjs";

test("impact palettes are food-specific and buns throw more crumbs than garnish", () => {
  const bun = getCookingImpactProfile("top-bun");
  const pickle = getCookingImpactProfile("pickle");

  assert.notDeepEqual(bun.colors, pickle.colors);
  assert.ok(bun.count > pickle.count);
});

test("impact particles launch outward, arc, fade, and settle deterministically", () => {
  const start = sampleCookingImpactParticle({ index: 2, elapsedMs: 0, strength: 0.8 });
  const peak = sampleCookingImpactParticle({ index: 2, elapsedMs: 215, strength: 0.8 });
  const end = sampleCookingImpactParticle({ index: 2, elapsedMs: 430, strength: 0.8 });

  assert.equal(start.progress, 0);
  assert.ok(Math.hypot(start.x, start.z) > 0);
  assert.ok(Math.hypot(peak.x, peak.z) > Math.hypot(start.x, start.z));
  assert.ok(peak.y > start.y);
  assert.ok(Math.abs(peak.x) > 0);
  assert.ok(peak.opacity < start.opacity);
  assert.equal(end.opacity, 0);
  assert.equal(end.done, true);
});
