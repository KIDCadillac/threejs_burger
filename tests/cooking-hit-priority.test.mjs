import assert from "node:assert/strict";
import test from "node:test";

import { choosePrioritizedCookingHit } from "../cooking-interaction-controller.mjs";

test("station ingredients can win a screen-space overlap with the assembled burger", () => {
  const assembled = { distance: 2, object: { id: "assembled" } };
  const stationIngredient = { distance: 5, object: { id: "station" } };
  const chosen = choosePrioritizedCookingHit(
    [assembled, stationIngredient],
    (hit) => hit.object.id === "station" ? 1 : 0,
  );

  assert.equal(chosen, stationIngredient);
});
test("nearest raycast hit remains first when priorities are equal", () => {
  const nearest = { distance: 1, object: { id: "nearest" } };
  const farther = { distance: 3, object: { id: "farther" } };

  assert.equal(choosePrioritizedCookingHit([nearest, farther]), nearest);
  assert.equal(choosePrioritizedCookingHit([]), null);
});
