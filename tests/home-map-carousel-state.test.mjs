import test from "node:test";
import assert from "node:assert/strict";

import * as carouselState from "../app/static/home-map-carousel-state.mjs";
import {
  HOME_MAP_KEY,
  HOME_MAPS,
  activeCardAccessoryPose,
  changeMapIndex,
  createLatestFrameScheduler,
  normalizeMapIndex,
  resolveSwipe,
  streetShopPose,
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

test("street shop pose keeps the active store forward and pulls readable neighbours beside it", () => {
  assert.deepEqual(streetShopPose(0), {
    translatePercent: 0,
    translateYPercent: 0,
    scale: 1,
    opacity: 1,
    zIndex: 30,
    shadeOpacity: 0,
  });
  assert.deepEqual(streetShopPose(-1), {
    translatePercent: -88,
    translateYPercent: 2.5,
    scale: 0.9,
    opacity: 0.8,
    zIndex: 18,
    shadeOpacity: 0.22,
  });
  assert.deepEqual(streetShopPose(1), {
    translatePercent: 88,
    translateYPercent: 2.5,
    scale: 0.9,
    opacity: 0.8,
    zIndex: 18,
    shadeOpacity: 0.22,
  });
  const halfway = streetShopPose(0.5);
  assert.ok(halfway.scale > streetShopPose(1).scale);
  assert.ok(halfway.scale < streetShopPose(0).scale);
  assert.ok(halfway.translateYPercent > 0);
  assert.ok(halfway.translateYPercent < streetShopPose(1).translateYPercent);
  assert.ok(halfway.shadeOpacity > 0);
  assert.ok(halfway.shadeOpacity < streetShopPose(1).shadeOpacity);
  assert.equal(streetShopPose(2).opacity, 0);
});

test("active card accessory shares the active card pose during drag", () => {
  assert.deepEqual(activeCardAccessoryPose(0), streetShopPose(0));
  assert.deepEqual(activeCardAccessoryPose(0.5), streetShopPose(-0.5));
  assert.deepEqual(activeCardAccessoryPose(-1), streetShopPose(1));
});

test("latest-frame scheduler renders only the newest drag progress once per frame", () => {
  const queued = [];
  const cancelled = [];
  const rendered = [];
  let nextId = 1;
  const scheduler = createLatestFrameScheduler({
    requestFrame(callback) {
      const id = nextId++;
      queued.push({ id, callback });
      return id;
    },
    cancelFrame(id) {
      cancelled.push(id);
    },
    render(value) {
      rendered.push(value);
    },
  });

  scheduler.schedule(0.1);
  scheduler.schedule(0.4);
  scheduler.schedule(0.8);
  assert.equal(queued.length, 1);
  queued.shift().callback();
  assert.deepEqual(rendered, [0.8]);

  scheduler.schedule(-0.5);
  scheduler.cancel();
  assert.deepEqual(cancelled, [2]);
  assert.deepEqual(rendered, [0.8]);
});

test("invalid stored map indexes fall back to burger", () => {
  assert.equal(normalizeMapIndex("1"), 1);
  assert.equal(normalizeMapIndex("bad"), 0);
  assert.equal(normalizeMapIndex(9), 0);
});
