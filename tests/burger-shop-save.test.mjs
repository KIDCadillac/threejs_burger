import test from "node:test";
import assert from "node:assert/strict";

import { createBurgerOrder } from "../app/static/burger-order-generator.mjs";
import {
  applyBurgerShopEvent,
  createBurgerShopRun,
} from "../app/static/burger-shop-run-state.mjs";
import {
  BURGER_SHOP_SAVE_KEY,
  createBurgerShopSave,
} from "../app/static/burger-shop-save.mjs";
import { SOLO_AUTOSAVE_STORAGE_KEY } from "../app/static/cooking-solo-autosave.mjs";
import {
  createSoloCookingState,
  placeSoloLayer,
} from "../app/static/cooking-solo-state.mjs";
import { createDefaultWorkbenchLoadout } from "../app/static/workbench-loadout.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    values,
    calls,
    getItem(key) {
      calls.push(["get", key]);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.push(["set", key, String(value)]);
      values.set(key, String(value));
    },
    removeItem(key) {
      calls.push(["remove", key]);
      values.delete(key);
    },
  };
}

function cookingRun() {
  let run = createBurgerShopRun({ runId: "saved-run", now: () => 1_000 });
  run = applyBurgerShopEvent(run, { type: "customer.arrived" }, { now: () => 1_100 });
  run = applyBurgerShopEvent(run, { type: "order.previewed" }, { now: () => 2_000 });
  return run;
}

function cookingState() {
  const initial = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  return placeSoloLayer(initial, initial.stationSources["bread-left-1"], 0, {
    replenish: true,
  });
}

test("round-trips a run, legal order, hydrated cooking state and settings", () => {
  const storage = memoryStorage();
  const save = createBurgerShopSave({ storage, now: () => 10_000 });
  const run = cookingRun();
  const order = createBurgerOrder({ orderNumber: 1, random: () => 0 });
  const food = cookingState();

  assert.equal(save.save({
    run,
    order,
    cookingState: food,
    settings: { muted: true, haptics: false, reducedMotion: true },
  }), true);

  const restored = createBurgerShopSave({
    storage,
    now: () => 50_000,
  }).load();

  assert.equal(restored.run.runId, run.runId);
  assert.equal(restored.run.deadlineAt, 87_000);
  assert.equal(restored.remainingMs, 37_000);
  assert.deepEqual(restored.order, order);
  assert.deepEqual(restored.cookingState.assembledOrder, food.assembledOrder);
  assert.deepEqual(restored.settings, {
    muted: true,
    haptics: false,
    reducedMotion: true,
  });
  assert.equal(Object.isFrozen(restored), true);
});

test("uses an independent key and never touches the free-cooking autosave", () => {
  const storage = memoryStorage({ [SOLO_AUTOSAVE_STORAGE_KEY]: "free-burger" });
  const save = createBurgerShopSave({ storage, now: () => 10_000 });

  save.save({
    run: cookingRun(),
    order: createBurgerOrder({ orderNumber: 1, random: () => 0 }),
    cookingState: cookingState(),
    settings: {},
  });
  save.clear();

  assert.notEqual(BURGER_SHOP_SAVE_KEY, SOLO_AUTOSAVE_STORAGE_KEY);
  assert.equal(storage.values.get(SOLO_AUTOSAVE_STORAGE_KEY), "free-burger");
});

test("malformed, unknown-version and illegal-order saves fail closed", () => {
  for (const serialized of [
    "not-json",
    JSON.stringify({ version: 999 }),
    JSON.stringify({
      version: 1,
      run: cookingRun(),
      order: { orderNumber: 1, layers: [], sauces: [] },
      cookingSave: "{}",
      remainingMs: 1,
      settings: {},
    }),
  ]) {
    const storage = memoryStorage({ [BURGER_SHOP_SAVE_KEY]: serialized });
    assert.equal(createBurgerShopSave({ storage }).load(), null);
  }
});

test("expired deadlines save zero remaining time instead of refreshing the clock", () => {
  const storage = memoryStorage();
  const save = createBurgerShopSave({ storage, now: () => 100_000 });
  assert.equal(save.save({
    run: cookingRun(),
    order: createBurgerOrder({ orderNumber: 1, random: () => 0 }),
    cookingState: cookingState(),
    settings: {},
  }), true);

  const restored = createBurgerShopSave({ storage, now: () => 200_000 }).load();
  assert.equal(restored.remainingMs, 0);
  assert.equal(restored.run.deadlineAt, 200_000);
});

test("storage denial and quota errors never block a run", () => {
  const denied = {
    getItem() { throw new DOMException("denied", "SecurityError"); },
    setItem() { throw new DOMException("full", "QuotaExceededError"); },
    removeItem() { throw new DOMException("denied", "SecurityError"); },
  };
  const save = createBurgerShopSave({ storage: denied });

  assert.equal(save.load(), null);
  assert.equal(save.save({
    run: cookingRun(),
    order: createBurgerOrder({ orderNumber: 1, random: () => 0 }),
    cookingState: cookingState(),
    settings: {},
  }), false);
  assert.equal(save.clear(), false);
});
