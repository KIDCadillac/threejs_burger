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
  shiftBufferedCardOffset,
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

test("advancing the wheel recycles only the card that leaves the five-card buffer", () => {
  assert.deepEqual(
    [-2, -1, 0, 1, 2].map((offset) => shiftBufferedCardOffset(offset, 1)),
    [2, -2, -1, 0, 1],
  );
  assert.deepEqual(
    [-2, -1, 0, 1, 2].map((offset) => shiftBufferedCardOffset(offset, -1)),
    [-1, 0, 1, 2, -2],
  );
});

test("swipe resolves by distance or velocity and otherwise returns", () => {
  assert.equal(resolveSwipe({ deltaX: -90, width: 400, velocityX: 0 }), 1);
  assert.equal(resolveSwipe({ deltaX: -44, width: 390, velocityX: -0.2 }), 1);
  assert.equal(resolveSwipe({ deltaX: -26, width: 390, velocityX: -0.1 }), 1);
  assert.equal(resolveSwipe({ deltaX: 20, width: 400, velocityX: 0 }), 0);
  assert.equal(resolveSwipe({ deltaX: 18, width: 400, velocityX: 0.8 }), -1);
});

test("drag progress preserves the same clamped pose through pointer release", () => {
  assert.equal(typeof carouselState.dragProgressFromDelta, "function");
  assert.equal(carouselState.dragProgressFromDelta({ deltaX: -72, width: 400 }), 0.25);
  assert.equal(carouselState.dragProgressFromDelta({ deltaX: 72, width: 400 }), -0.25);
  assert.equal(carouselState.dragProgressFromDelta({ deltaX: -900, width: 400 }), 1);
  assert.equal(carouselState.dragProgressFromDelta({ deltaX: 900, width: 400 }), -1);
});

test("the current shop closes while the incoming shop opens with the drag", () => {
  assert.equal(typeof carouselState.shopOpenProgress, "function");
  assert.equal(carouselState.shopOpenProgress({ offset: 0, dragProgress: 0.65 }), 0.35);
  assert.equal(carouselState.shopOpenProgress({ offset: 1, dragProgress: 0.4 }), 0.4);
  assert.equal(carouselState.shopOpenProgress({ offset: -1, dragProgress: 0.4 }), 0);
  assert.equal(carouselState.shopOpenProgress({ offset: -1, dragProgress: -0.6 }), 0.6);
  assert.equal(carouselState.shopOpenProgress({ offset: 1, dragProgress: -0.6 }), 0);
  assert.equal(carouselState.shopOpenProgress({ offset: 2, dragProgress: 1 }), 0);
});

test("release animation duration follows only the remaining travel", () => {
  assert.equal(typeof carouselState.wheelSettleDuration, "function");
  assert.equal(carouselState.wheelSettleDuration({
    fromProgress: 0.9,
    targetProgress: 1,
  }), 141);
  assert.equal(carouselState.wheelSettleDuration({
    fromProgress: 0.2,
    targetProgress: 1,
  }), 284);
  assert.equal(carouselState.wheelSettleDuration({
    fromProgress: -0.45,
    targetProgress: 0,
  }), 212);
  assert.equal(carouselState.wheelSettleDuration({
    fromProgress: 0.2,
    targetProgress: 1,
    reducedMotion: true,
  }), 0);
});

test("shop doors settle more slowly than cards, with closing slower than opening", () => {
  assert.equal(typeof carouselState.shopDoorDuration, "function");
  assert.equal(carouselState.shopDoorDuration({
    fromProgress: 1,
    targetProgress: 0,
  }), 760);
  assert.equal(carouselState.shopDoorDuration({
    fromProgress: 0,
    targetProgress: 1,
  }), 440);
  assert.equal(carouselState.shopDoorDuration({
    fromProgress: 0.4,
    targetProgress: 0.4,
  }), 0);
  assert.equal(carouselState.shopDoorDuration({
    fromProgress: 1,
    targetProgress: 0,
    reducedMotion: true,
  }), 0);
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

test("latest-frame scheduler can flush the final pointer pose before transitions resume", () => {
  const queued = [];
  const cancelled = [];
  const rendered = [];
  const scheduler = createLatestFrameScheduler({
    requestFrame(callback) {
      queued.push(callback);
      return 7;
    },
    cancelFrame(id) {
      cancelled.push(id);
    },
    render(value) {
      rendered.push(value);
    },
  });

  scheduler.schedule(0.2);
  scheduler.schedule(0.55);
  scheduler.flush();

  assert.deepEqual(cancelled, [7]);
  assert.deepEqual(rendered, [0.55]);
});

test("invalid stored map indexes fall back to burger", () => {
  assert.equal(normalizeMapIndex("1"), 1);
  assert.equal(normalizeMapIndex("bad"), 0);
  assert.equal(normalizeMapIndex(9), 0);
});
