import test from "node:test";
import assert from "node:assert/strict";

import {
  HOME_MAP_MODE_IDS,
  HOME_MODES,
  changeModeIndex,
  changeModeIndexForMap,
  lockGestureAxis,
  modeIndexForMap,
  normalizeBusinessOpen,
  normalizeModeIndex,
  resolveModeSwipe,
} from "../app/static/home-mode-switch-state.mjs";

test("home modes normalize and cycle in both directions", () => {
  assert.equal(HOME_MODES.length, 4);
  assert.equal(normalizeModeIndex("2"), 2);
  assert.equal(normalizeModeIndex(99), 0);
  assert.equal(changeModeIndex(3, 1), 0);
  assert.equal(changeModeIndex(0, -1), 3);
});

test("each shop card owns its available mode sequence", () => {
  assert.deepEqual(HOME_MAP_MODE_IDS, {
    burger: ["practice", "cookbook", "duel"],
    sushi: ["sushi"],
  });
  assert.equal(modeIndexForMap("burger", 3), 0);
  assert.equal(modeIndexForMap("burger", 1), 1);
  assert.equal(modeIndexForMap("sushi", 0), 3);
  assert.equal(changeModeIndexForMap("burger", 2, 1), 0);
  assert.equal(changeModeIndexForMap("burger", 0, -1), 2);
  assert.equal(changeModeIndexForMap("sushi", 0, 1), 3);
});

test("gesture axis locks only after a dominant movement", () => {
  assert.equal(lockGestureAxis({ deltaX: 5, deltaY: 8 }), null);
  assert.equal(lockGestureAxis({ deltaX: 30, deltaY: 8 }), "horizontal");
  assert.equal(lockGestureAxis({ deltaX: 8, deltaY: 30 }), "vertical");
  assert.equal(lockGestureAxis({ deltaX: 20, deltaY: 18 }), null);
});

test("vertical swipe cycles with distance or velocity", () => {
  assert.equal(resolveModeSwipe({ deltaY: -90, height: 400, velocityY: -0.2 }), 1);
  assert.equal(resolveModeSwipe({ deltaY: 90, height: 400, velocityY: 0.2 }), -1);
  assert.equal(resolveModeSwipe({ deltaY: -20, height: 400, velocityY: -0.8 }), 1);
  assert.equal(resolveModeSwipe({ deltaY: 12, height: 400, velocityY: 0.1 }), 0);
});

test("business state accepts only the persisted open value", () => {
  assert.equal(normalizeBusinessOpen("open"), true);
  assert.equal(normalizeBusinessOpen(true), true);
  assert.equal(normalizeBusinessOpen("closed"), false);
  assert.equal(normalizeBusinessOpen(null), false);
});
