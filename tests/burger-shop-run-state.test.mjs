import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBurgerShopEvent,
  BURGER_SHOP_ORDER_MS,
  createBurgerShopRun,
} from "../app/static/burger-shop-run-state.mjs";

const at = (state, now, event) => applyBurgerShopEvent(
  state,
  event,
  { now: () => now },
);

function beginCooking({ runId = "run-1", startedAt = 1_000 } = {}) {
  let state = createBurgerShopRun({ runId, now: () => startedAt });
  state = at(state, startedAt + 100, { type: "customer.arrived" });
  state = at(state, startedAt + 1_000, { type: "order.previewed" });
  return state;
}

test("runs arrival, preview, cooking, serving, tasting and the next order", () => {
  let state = beginCooking();
  assert.equal(state.phase, "cooking");
  assert.equal(state.deadlineAt, 47_000);

  state = at(state, 12_000, {
    type: "order.served",
    snapshot: { assembledOrder: ["b0", "p0"] },
  });
  state = at(state, 12_100, { type: "order.scored", score: 800 });
  state = at(state, 14_000, { type: "tasting.finished" });
  state = at(state, 15_000, { type: "order.next" });

  assert.equal(state.phase, "customer-arrival");
  assert.equal(state.orderNumber, 2);
  assert.equal(state.totalScore, 800);
  assert.equal(state.orders.length, 1);
});

test("timeout and serve at the same deadline settle only once", () => {
  const state = beginCooking({ runId: "run-2", startedAt: 0 });
  const served = at(state, state.deadlineAt, {
    type: "order.served",
    snapshot: { assembledOrder: [] },
  });
  const duplicate = at(served, state.deadlineAt, { type: "clock.tick" });

  assert.equal(served.phase, "serving");
  assert.strictEqual(duplicate, served);
});

test("clock timeout serves an empty snapshot", () => {
  const state = beginCooking({ runId: "run-timeout", startedAt: 0 });
  const timedOut = at(state, state.deadlineAt, { type: "clock.tick" });

  assert.equal(timedOut.phase, "serving");
  assert.deepEqual(timedOut.servedSnapshot, { assembledOrder: [] });
});

test("three scored orders finish one run", () => {
  let state = createBurgerShopRun({ runId: "run-3", now: () => 0 });
  for (let order = 1; order <= 3; order += 1) {
    state = at(state, order * 100, { type: "customer.arrived" });
    state = at(state, order * 100 + 1, { type: "order.previewed" });
    state = at(state, order * 100 + 2, {
      type: "order.served",
      snapshot: { assembledOrder: [] },
    });
    state = at(state, order * 100 + 3, { type: "order.scored", score: 700 });
    state = at(state, order * 100 + 4, { type: "tasting.finished" });
    state = at(state, order * 100 + 5, { type: "order.next" });
  }

  assert.equal(state.phase, "run-result");
  assert.equal(state.totalScore, 2_100);
  assert.equal(state.orders.length, 3);
});

test("invalid events, late manual serve and duplicate scoring do not mutate state", () => {
  const cooking = beginCooking({ runId: "run-invalid", startedAt: 0 });
  assert.strictEqual(
    at(cooking, 3_000, { type: "order.scored", score: 1_000 }),
    cooking,
  );
  assert.strictEqual(
    at(cooking, cooking.deadlineAt + 1, {
      type: "order.served",
      snapshot: { assembledOrder: ["late"] },
    }),
    cooking,
  );

  const serving = at(cooking, 4_000, {
    type: "order.served",
    snapshot: { assembledOrder: ["b0"] },
  });
  const tasting = at(serving, 4_100, { type: "order.scored", score: 500 });
  assert.strictEqual(
    at(tasting, 4_200, { type: "order.scored", score: 500 }),
    tasting,
  );
});

test("exposes a stable forty-five second order duration", () => {
  assert.equal(BURGER_SHOP_ORDER_MS, 45_000);
});
