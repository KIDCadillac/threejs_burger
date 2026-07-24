import test from "node:test";
import assert from "node:assert/strict";

import * as carouselState from "../app/static/home-map-carousel-state.mjs";
import {
  HOME_MAP_KEY,
  HOME_MAPS,
  cardWheelPose,
  changeMapIndex,
  normalizeMapIndex,
  resolveSwipe,
} from "../app/static/home-map-carousel-state.mjs";

test("buffer reset waits through one painted frame before restoring transitions", () => {
  assert.equal(typeof carouselState.afterNextPaint, "function");
  const queued = [];
  let restored = false;
  const requestFrame = (callback) => queued.push(callback);

  carouselState.afterNextPaint(requestFrame, () => {
    restored = true;
  });

  assert.equal(queued.length, 1);
  queued.shift()();
  assert.equal(restored, false);
  assert.equal(queued.length, 1);
  queued.shift()();
  assert.equal(restored, true);
});

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

test("buffered wheel always supplies two cards on both sides", () => {
  assert.equal(typeof carouselState.createMapCardWindow, "function");
  assert.deepEqual(carouselState.createMapCardWindow(0, 2), [
    { offset: -2, mapIndex: 0 },
    { offset: -1, mapIndex: 1 },
    { offset: 0, mapIndex: 0 },
    { offset: 1, mapIndex: 1 },
    { offset: 2, mapIndex: 0 },
  ]);
  assert.deepEqual(carouselState.createMapCardWindow(1, 2), [
    { offset: -2, mapIndex: 1 },
    { offset: -1, mapIndex: 0 },
    { offset: 0, mapIndex: 1 },
    { offset: 1, mapIndex: 0 },
    { offset: 2, mapIndex: 1 },
  ]);
});

test("swipe resolves by distance or velocity and otherwise returns", () => {
  assert.equal(resolveSwipe({ deltaX: -90, width: 400, velocityX: 0 }), 1);
  assert.equal(resolveSwipe({ deltaX: -44, width: 390, velocityX: -0.2 }), 1);
  assert.equal(resolveSwipe({ deltaX: -26, width: 390, velocityX: -0.1 }), 1);
  assert.equal(resolveSwipe({ deltaX: 20, width: 400, velocityX: 0 }), 0);
  assert.equal(resolveSwipe({ deltaX: 18, width: 400, velocityX: 0.8 }), -1);
});

test("card wheel keeps the active map forward and turns readable neighbours 45 degrees", () => {
  assert.deepEqual(cardWheelPose(0), {
    translatePercent: 0,
    rotateY: 0,
    scale: 1,
    opacity: 1,
    zIndex: 30,
  });
  assert.deepEqual(cardWheelPose(-1), {
    translatePercent: -62,
    rotateY: 45,
    scale: 0.9,
    opacity: 0.88,
    zIndex: 18,
  });
  assert.deepEqual(cardWheelPose(1), {
    translatePercent: 62,
    rotateY: -45,
    scale: 0.9,
    opacity: 0.88,
    zIndex: 18,
  });
  assert.equal(cardWheelPose(2).opacity, 0);
});

test("invalid stored map indexes fall back to burger", () => {
  assert.equal(normalizeMapIndex("1"), 1);
  assert.equal(normalizeMapIndex("bad"), 0);
  assert.equal(normalizeMapIndex(9), 0);
});
