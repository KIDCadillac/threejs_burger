import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_MAPS,
  createMapCardWindow,
  shiftBufferedCardOffset,
  streetShopPose,
} from "../home-map-carousel-state.mjs";

test("sushi shop is an available independent game route", () => {
  const sushi = HOME_MAPS.find(({ id }) => id === "sushi");
  assert.equal(sushi.available, true);
  assert.equal(sushi.href, "./sushi.html");
  assert.match(sushi.actionLabel, /寿司/);
});

test("homepage keeps five shops in one continuous horizontal row", () => {
  assert.deepEqual(
    createMapCardWindow(0, 2).map(({ offset, mapIndex }) => [
      offset,
      mapIndex,
    ]),
    [
      [-2, 0],
      [-1, 1],
      [0, 0],
      [1, 1],
      [2, 0],
    ],
  );
});

test("left and right neighbors use mirrored row positions", () => {
  const left = streetShopPose(-1);
  const center = streetShopPose(0);
  const right = streetShopPose(1);

  assert.equal(center.translatePercent, 0);
  assert.equal(center.scale, 1);
  assert.equal(center.opacity, 1);
  assert.equal(right.translatePercent, 104);
  assert.equal(right.opacity, 1);
  assert.equal(left.translatePercent, -right.translatePercent);
  assert.equal(left.translateYPercent, right.translateYPercent);
  assert.equal(left.scale, right.scale);
  assert.equal(left.opacity, right.opacity);
  assert.equal(streetShopPose(2).opacity, 0);
});

test("buffered cards recycle symmetrically when moving out and returning", () => {
  const offsets = [-2, -1, 0, 1, 2];
  const forward = offsets.map((offset) =>
    shiftBufferedCardOffset(offset, 1),
  );
  const returned = forward.map((offset) =>
    shiftBufferedCardOffset(offset, -1),
  );

  assert.deepEqual(forward, [2, -2, -1, 0, 1]);
  assert.deepEqual(returned, offsets);
});
