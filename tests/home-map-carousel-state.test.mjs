import test from "node:test";
import assert from "node:assert/strict";

import {
  HOME_MAP_KEY,
  HOME_MAPS,
  cardWheelPose,
  changeMapIndex,
  mapIndexToPhysicalSlide,
  normalizeMapIndex,
  physicalSlideToMapIndex,
  resolveSwipe,
} from "../app/static/home-map-carousel-state.mjs";

test("map catalog exposes burger first and locked sushi second", () => {
  assert.equal(HOME_MAP_KEY, "burger-home-map-v1");
  assert.deepEqual(HOME_MAPS.map(({ id, available }) => [id, available]), [
    ["burger", true],
    ["sushi", false],
  ]);
});

test("map navigation wraps at both edges", () => {
  assert.equal(changeMapIndex(0, -1), 1);
  assert.equal(changeMapIndex(0, 1), 1);
  assert.equal(changeMapIndex(1, 1), 0);
  assert.equal(changeMapIndex(1, -1), 0);
  assert.equal(changeMapIndex(1, 0), 1);
});

test("logical maps map through the two invisible boundary clones", () => {
  assert.equal(mapIndexToPhysicalSlide(0), 1);
  assert.equal(mapIndexToPhysicalSlide(1), 2);
  assert.equal(physicalSlideToMapIndex(0), 1);
  assert.equal(physicalSlideToMapIndex(1), 0);
  assert.equal(physicalSlideToMapIndex(2), 1);
  assert.equal(physicalSlideToMapIndex(3), 0);
});

test("swipe resolves by distance or velocity and otherwise returns", () => {
  assert.equal(resolveSwipe({ deltaX: -90, width: 400, velocityX: 0 }), 1);
  assert.equal(resolveSwipe({ deltaX: -44, width: 390, velocityX: -0.2 }), 1);
  assert.equal(resolveSwipe({ deltaX: 20, width: 400, velocityX: 0 }), 0);
  assert.equal(resolveSwipe({ deltaX: 18, width: 400, velocityX: 0.8 }), -1);
});

test("card wheel keeps the active map forward and tilts both neighbours inward", () => {
  assert.deepEqual(cardWheelPose(0), {
    translatePercent: 0,
    rotateY: 0,
    scale: 1,
    opacity: 1,
    zIndex: 30,
  });
  assert.deepEqual(cardWheelPose(-1), {
    translatePercent: -72,
    rotateY: 52,
    scale: 0.84,
    opacity: 0.72,
    zIndex: 19,
  });
  assert.deepEqual(cardWheelPose(1), {
    translatePercent: 72,
    rotateY: -52,
    scale: 0.84,
    opacity: 0.72,
    zIndex: 19,
  });
  assert.equal(cardWheelPose(2).opacity, 0);
});

test("invalid stored map indexes fall back to burger", () => {
  assert.equal(normalizeMapIndex("1"), 1);
  assert.equal(normalizeMapIndex("bad"), 0);
  assert.equal(normalizeMapIndex(9), 0);
});
