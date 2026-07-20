import test from "node:test";
import assert from "node:assert/strict";
import {
  createCookingMotion,
  sampleCookingMotion,
} from "../app/static/cooking-insertion-animation.mjs";

test("insert opens a gap and pops the selected layer locally without dropping below target", () => {
  const motion = createCookingMotion({ kind: "insert", startedAt: 0, thickness: 0.6 });
  const opening = sampleCookingMotion(motion, 70);
  const insertion = sampleCookingMotion(motion, 190);
  assert.equal(opening.phase, "open");
  assert.ok(opening.selectedScaleXz < 1);
  assert.equal(opening.selectedScaleXz, opening.selectedScaleY);
  assert.ok(opening.selectedOffsetY >= 0);
  assert.ok(insertion.arrival > opening.arrival);
  assert.ok(insertion.selectedScaleXz > 1, "the local pop briefly overshoots");
  assert.equal(insertion.selectedScaleXz, insertion.selectedScaleY);
  assert.ok(insertion.selectedOffsetY >= 0, "insert never travels below its final layer");
  assert.deepEqual(sampleCookingMotion(motion, 380), {
    phase: "settled",
    progress: 1,
    arrival: 1,
    selectedOffsetY: 0,
    upperOffsetY: 0,
    selectedScaleXz: 1,
    selectedScaleY: 1,
    impact: false,
    done: true,
  });
  const rebound = sampleCookingMotion(motion, 320);
  assert.equal(rebound.phase, "rebound");
  assert.ok(rebound.selectedScaleXz > 0.95 && rebound.selectedScaleXz < 1.02);
  assert.ok(rebound.selectedOffsetY >= 0);
});

test("pick and home motions return to identity while reduced motion settles immediately", () => {
  const pick = createCookingMotion({ kind: "pick", startedAt: 0, thickness: 0.4 });
  assert.ok(sampleCookingMotion(pick, 30).selectedScaleXz > 1);
  assert.ok(sampleCookingMotion(pick, 30).selectedScaleY < 1);
  assert.equal(sampleCookingMotion(pick, 90).done, true);

  const home = createCookingMotion({ kind: "home", startedAt: 0, thickness: 0.4 });
  assert.equal(sampleCookingMotion(home, 150).phase, "impact");
  assert.ok(sampleCookingMotion(home, 150).selectedOffsetY < 0);
  assert.equal(sampleCookingMotion(home, 240).done, true);

  const reduced = createCookingMotion({
    kind: "insert",
    startedAt: 0,
    thickness: 0.4,
    reducedMotion: true,
  });
  assert.equal(sampleCookingMotion(reduced, 0).done, true);
});

test("motion creation rejects unknown kinds and non-finite inputs", () => {
  assert.throws(() => createCookingMotion({ kind: "physics", startedAt: 0, thickness: 1 }));
  assert.throws(() => createCookingMotion({ kind: "insert", startedAt: NaN, thickness: 1 }));
  assert.throws(() => createCookingMotion({ kind: "insert", startedAt: 0, thickness: 0 }));
  assert.throws(() => sampleCookingMotion(null, 0));
  assert.throws(() => sampleCookingMotion(
    createCookingMotion({ kind: "insert", startedAt: 0, thickness: 1 }),
    NaN,
  ));
});
