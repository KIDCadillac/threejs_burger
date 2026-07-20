import test from "node:test";
import assert from "node:assert/strict";
import {
  createCookingMotion,
  sampleCookingMotion,
} from "../app/static/cooking-insertion-animation.mjs";

test("top insertion anticipates, impacts, overshoots, and settles", () => {
  const motion = createCookingMotion({ kind: "top", startedAt: 100, thickness: 0.5 });
  assert.equal(sampleCookingMotion(motion, 100).phase, "anticipate");
  assert.equal(sampleCookingMotion(motion, 220).phase, "impact");
  assert.ok(sampleCookingMotion(motion, 280).selectedOffsetY > 0);
  assert.deepEqual(sampleCookingMotion(motion, 400), {
    phase: "settled",
    progress: 1,
    arrival: 1,
    selectedOffsetY: 0,
    stackOffsetY: 0,
    stackCompression: 0,
    selectedScaleXz: 1,
    selectedScaleY: 1,
    impact: false,
    done: true,
  });
});

test("bottom insertion lifts the old stack before the new layer exits below", () => {
  const motion = createCookingMotion({ kind: "bottom", startedAt: 0, thickness: 0.6 });
  const opening = sampleCookingMotion(motion, 70);
  const exit = sampleCookingMotion(motion, 250);
  assert.equal(opening.phase, "open");
  assert.ok(opening.stackOffsetY > 0);
  assert.equal(exit.phase, "exit");
  assert.ok(exit.selectedOffsetY < 0);
  assert.equal(sampleCookingMotion(motion, 380).done, true);
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
    kind: "bottom",
    startedAt: 0,
    thickness: 0.4,
    reducedMotion: true,
  });
  assert.equal(sampleCookingMotion(reduced, 0).done, true);
});

test("motion creation rejects unknown kinds and non-finite inputs", () => {
  assert.throws(() => createCookingMotion({ kind: "physics", startedAt: 0, thickness: 1 }));
  assert.throws(() => createCookingMotion({ kind: "top", startedAt: NaN, thickness: 1 }));
  assert.throws(() => createCookingMotion({ kind: "top", startedAt: 0, thickness: 0 }));
  assert.throws(() => sampleCookingMotion(null, 0));
  assert.throws(() => sampleCookingMotion(
    createCookingMotion({ kind: "top", startedAt: 0, thickness: 1 }),
    NaN,
  ));
});
