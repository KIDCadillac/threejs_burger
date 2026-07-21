import test from "node:test";
import assert from "node:assert/strict";

import {
  BURGER_TUNING_INGREDIENT_IDS,
  BURGER_TUNING_INGREDIENT_LABELS,
  BURGER_TUNING_STORAGE_KEY,
  DEFAULT_BURGER_TUNING,
  loadBurgerTuning,
  normalizeBurgerTuning,
  resetBurgerIngredient,
  saveBurgerTuning,
  serializeBurgerTuning,
} from "../app/static/burger-tuning.mjs";

const EXPECTED_DEFAULTS = {
  version: 1,
  global: { presentationScale: 0.72 },
  ingredients: {
    "bottom-bun": { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.012 },
    patty: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0 },
    cheese: { scaleX: 1, scaleY: 1.45, scaleZ: 1, sinkY: 0.008 },
    tomato: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0 },
    lettuce: { scaleX: 1, scaleY: 1.55, scaleZ: 1, sinkY: 0.008 },
    pickle: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0 },
    onion: { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.006 },
    "middle-bun": { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.012 },
    "top-bun": { scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.008 },
  },
};

function assertFrozenTree(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertFrozenTree(child);
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

test("burger tuning exposes nine canonical ingredients, Chinese labels, and deeply frozen defaults", () => {
  assert.equal(BURGER_TUNING_STORAGE_KEY, "solo-cooking-burger-tuning:v1");
  assert.deepEqual(BURGER_TUNING_INGREDIENT_IDS, [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle",
    "onion", "middle-bun", "top-bun",
  ]);
  assert.deepEqual(BURGER_TUNING_INGREDIENT_LABELS, {
    "bottom-bun": "下层面包",
    patty: "牛肉饼",
    cheese: "芝士",
    tomato: "番茄",
    lettuce: "生菜",
    pickle: "酸黄瓜",
    onion: "洋葱碎",
    "middle-bun": "中层面包",
    "top-bun": "上层面包",
  });
  assert.equal(Object.isFrozen(BURGER_TUNING_INGREDIENT_IDS), true);
  assert.equal(Object.isFrozen(BURGER_TUNING_INGREDIENT_LABELS), true);
  assert.deepEqual(DEFAULT_BURGER_TUNING, EXPECTED_DEFAULTS);
  assert.deepEqual(Object.keys(DEFAULT_BURGER_TUNING.ingredients), [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle",
    "onion", "middle-bun", "top-bun",
  ]);
  assertFrozenTree(DEFAULT_BURGER_TUNING);
  assert.throws(() => {
    DEFAULT_BURGER_TUNING.ingredients.cheese.scaleY = 2;
  }, TypeError);
});

test("normalization rebuilds partial input in canonical order and strips obsolete fields", () => {
  const normalized = normalizeBurgerTuning({
    obsoleteRoot: "drop-me",
    ingredients: {
      obsoleteIngredient: { scaleX: 1.3 },
      cheese: {
        sinkY: 0.03,
        scaleZ: 0.9,
        obsoleteField: 42,
      },
      "bottom-bun": { scaleX: 1.2 },
    },
    global: { obsoleteField: true, presentationScale: 0.8 },
    version: 1,
  });

  assert.deepEqual(normalized, {
    ...EXPECTED_DEFAULTS,
    global: { presentationScale: 0.8 },
    ingredients: {
      ...EXPECTED_DEFAULTS.ingredients,
      "bottom-bun": { ...EXPECTED_DEFAULTS.ingredients["bottom-bun"], scaleX: 1.2 },
      cheese: { ...EXPECTED_DEFAULTS.ingredients.cheese, scaleZ: 0.9, sinkY: 0.03 },
    },
  });
  assert.deepEqual(Object.keys(normalized), ["version", "global", "ingredients"]);
  assert.deepEqual(Object.keys(normalized.global), ["presentationScale"]);
  assert.deepEqual(Object.keys(normalized.ingredients), [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle",
    "onion", "middle-bun", "top-bun",
  ]);
  assert.deepEqual(Object.keys(normalized.ingredients.cheese), [
    "scaleX", "scaleY", "scaleZ", "sinkY",
  ]);
  assertFrozenTree(normalized);
});

test("invalid fields use their own defaults while finite out-of-range fields are clamped", () => {
  const normalized = normalizeBurgerTuning({
    version: 1,
    global: { presentationScale: Number.NaN },
    ingredients: {
      "bottom-bun": {
        scaleX: Number.POSITIVE_INFINITY,
        scaleY: null,
        scaleZ: "1.2",
        sinkY: Number.NEGATIVE_INFINITY,
      },
      patty: { scaleX: 0.2, scaleY: 4, scaleZ: 99, sinkY: -0.5 },
      cheese: { sinkY: 1 },
    },
  });

  assert.deepEqual(normalized.global, { presentationScale: 0.72 });
  assert.deepEqual(normalized.ingredients["bottom-bun"], {
    scaleX: 1, scaleY: 1, scaleZ: 1, sinkY: 0.012,
  });
  assert.deepEqual(normalized.ingredients.patty, {
    scaleX: 0.6, scaleY: 2.5, scaleZ: 1.6, sinkY: 0,
  });
  assert.equal(normalized.ingredients.cheese.sinkY, 0.18);
  assert.equal(normalizeBurgerTuning({
    version: 1,
    global: { presentationScale: 4 },
  }).global.presentationScale, 0.9);
  assert.equal(normalizeBurgerTuning({
    version: 1,
    global: { presentationScale: -4 },
  }).global.presentationScale, 0.55);
});

test("any non-v1 document falls back to the complete canonical defaults", () => {
  for (const value of [
    null,
    {},
    { version: "1", global: { presentationScale: 0.9 } },
    { version: 2, ingredients: { patty: { scaleY: 2 } } },
  ]) {
    assert.deepEqual(normalizeBurgerTuning(value), EXPECTED_DEFAULTS);
  }
});

test("normalization results cannot be mutated across calls", () => {
  const input = {
    version: 1,
    global: { presentationScale: 0.8 },
    ingredients: { patty: { scaleY: 1.4 } },
  };
  const first = normalizeBurgerTuning(input);
  assert.notStrictEqual(first, input);
  assert.throws(() => {
    first.ingredients.patty.scaleY = 2;
  }, TypeError);

  input.global.presentationScale = 0.6;
  input.ingredients.patty.scaleY = 2;
  const second = normalizeBurgerTuning({ version: 1 });
  assert.equal(first.global.presentationScale, 0.8);
  assert.equal(first.ingredients.patty.scaleY, 1.4);
  assert.deepEqual(second, EXPECTED_DEFAULTS);
  assertFrozenTree(second);
});

test("serialization always emits stable canonical JSON", () => {
  const first = {
    ingredients: {
      cheese: { sinkY: 0.02, scaleY: 1.8 },
      patty: { scaleX: 1.2 },
    },
    global: { presentationScale: 0.84 },
    version: 1,
  };
  const second = {
    version: 1,
    global: { presentationScale: 0.84, removed: true },
    ingredients: {
      patty: { scaleX: 1.2 },
      removed: { scaleX: 1.5 },
      cheese: { scaleY: 1.8, sinkY: 0.02 },
    },
  };

  assert.equal(serializeBurgerTuning(first), serializeBurgerTuning(second));
  assert.equal(
    serializeBurgerTuning(first),
    JSON.stringify(normalizeBurgerTuning(first), null, 2),
  );
  assert.match(serializeBurgerTuning(first), /\n  "global":/);
  assert.equal(
    serializeBurgerTuning({ version: 2 }),
    JSON.stringify(EXPECTED_DEFAULTS, null, 2),
  );
});

test("resetting one ingredient preserves every other normalized tuning value", () => {
  const tuned = normalizeBurgerTuning({
    version: 1,
    global: { presentationScale: 0.88 },
    ingredients: {
      patty: { scaleY: 1.3 },
      cheese: { scaleX: 1.2, scaleY: 2, scaleZ: 0.8, sinkY: 0.04 },
      lettuce: { sinkY: 0.05 },
    },
  });
  const reset = resetBurgerIngredient(tuned, "cheese");

  assert.deepEqual(reset.ingredients.cheese, EXPECTED_DEFAULTS.ingredients.cheese);
  assert.strictEqual(reset.global.presentationScale, tuned.global.presentationScale);
  assert.deepEqual(reset.ingredients.patty, tuned.ingredients.patty);
  assert.deepEqual(reset.ingredients.lettuce, tuned.ingredients.lettuce);
  assert.equal(tuned.ingredients.cheese.scaleY, 2);
  assertFrozenTree(reset);
});

test("loading parses and normalizes persisted tuning", () => {
  const storage = memoryStorage({
    [BURGER_TUNING_STORAGE_KEY]: JSON.stringify({
      version: 1,
      global: { presentationScale: 0.86 },
      ingredients: { lettuce: { scaleY: 9, sinkY: 0.04 } },
    }),
  });

  const loaded = loadBurgerTuning({ storage });

  assert.equal(loaded.global.presentationScale, 0.86);
  assert.equal(loaded.ingredients.lettuce.scaleY, 2.5);
  assert.equal(loaded.ingredients.lettuce.sinkY, 0.04);
  assertFrozenTree(loaded);
});

test("loading tolerates malformed data, SecurityError reads, and a throwing storage getter", () => {
  const malformed = memoryStorage({ [BURGER_TUNING_STORAGE_KEY]: "{not-json" });
  assert.deepEqual(loadBurgerTuning({ storage: malformed }), EXPECTED_DEFAULTS);

  const unreadable = {
    getItem() {
      throw new DOMException("denied", "SecurityError");
    },
  };
  assert.doesNotThrow(() => loadBurgerTuning({ storage: unreadable }));
  assert.deepEqual(loadBurgerTuning({ storage: unreadable }), EXPECTED_DEFAULTS);

  const globalTarget = {};
  let getterReads = 0;
  Object.defineProperty(globalTarget, "localStorage", {
    get() {
      getterReads += 1;
      throw new DOMException("denied", "SecurityError");
    },
  });
  assert.deepEqual(loadBurgerTuning({ globalTarget }), EXPECTED_DEFAULTS);
  assert.equal(getterReads, 1);
});

test("saving writes canonical JSON and reports whether persistence succeeded", () => {
  const storage = memoryStorage();
  const value = {
    ingredients: { cheese: { scaleY: 1.9 } },
    version: 1,
    global: { presentationScale: 0.8 },
  };

  assert.equal(saveBurgerTuning(value, { storage }), true);
  assert.equal(
    storage.values.get(BURGER_TUNING_STORAGE_KEY),
    serializeBurgerTuning(value),
  );
  assert.deepEqual(loadBurgerTuning({ storage }), normalizeBurgerTuning(value));
});

test("saving tolerates QuotaError writes and a throwing storage getter", () => {
  const fullStorage = {
    setItem() {
      throw new DOMException("full", "QuotaExceededError");
    },
  };
  assert.doesNotThrow(() => saveBurgerTuning({ version: 1 }, { storage: fullStorage }));
  assert.equal(saveBurgerTuning({ version: 1 }, { storage: fullStorage }), false);

  const globalTarget = {};
  let getterReads = 0;
  Object.defineProperty(globalTarget, "localStorage", {
    get() {
      getterReads += 1;
      throw new DOMException("denied", "SecurityError");
    },
  });
  assert.equal(saveBurgerTuning({ version: 1 }, { globalTarget }), false);
  assert.equal(getterReads, 1);
});
