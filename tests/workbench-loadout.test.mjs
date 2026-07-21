import test from "node:test";
import assert from "node:assert/strict";

import {
  WORKBENCH_LOADOUT_STORAGE_KEY,
  WORKBENCH_REGION_OPTIONS,
  WORKBENCH_SLOTS,
  createDefaultWorkbenchLoadout,
  getWorkbenchSlot,
  loadWorkbenchLoadout,
  normalizeWorkbenchLoadout,
  resetWorkbenchLoadout,
  saveWorkbenchLoadout,
  setWorkbenchSlotContent,
} from "../app/static/workbench-loadout.mjs";

const EXPECTED_SLOTS = [
  { slotId: "bread-left-1", region: "bread", defaultContentId: "bottom-bun" },
  { slotId: "bread-left-2", region: "bread", defaultContentId: "middle-bun" },
  { slotId: "bread-left-3", region: "bread", defaultContentId: "top-bun" },
  { slotId: "filling-back-1", region: "filling", defaultContentId: "patty" },
  { slotId: "filling-back-2", region: "filling", defaultContentId: "cheese" },
  { slotId: "filling-back-3", region: "filling", defaultContentId: "tomato" },
  { slotId: "filling-back-4", region: "filling", defaultContentId: "lettuce" },
  { slotId: "sauce-right-1", region: "sauce", defaultContentId: "ketchup" },
  { slotId: "sauce-right-2", region: "sauce", defaultContentId: "mustard" },
  { slotId: "sauce-right-3", region: "sauce", defaultContentId: "house-sauce" },
];

const EXPECTED_DEFAULT_LOADOUT = Object.fromEntries(
  EXPECTED_SLOTS.map(({ slotId, defaultContentId }) => [slotId, defaultContentId]),
);

function assertFrozenLoadout(loadout) {
  assert.equal(Object.isFrozen(loadout), true);
  assert.throws(() => {
    loadout["filling-back-1"] = "onion";
  }, TypeError);
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    values,
  };
}

test("publishes ten unique frozen physical slots and frozen regional options", () => {
  assert.deepEqual(WORKBENCH_SLOTS, EXPECTED_SLOTS);
  assert.equal(new Set(WORKBENCH_SLOTS.map(({ slotId }) => slotId)).size, 10);
  assert.equal(Object.isFrozen(WORKBENCH_SLOTS), true);
  for (const slot of WORKBENCH_SLOTS) assert.equal(Object.isFrozen(slot), true);

  assert.deepEqual(WORKBENCH_REGION_OPTIONS, {
    bread: ["bottom-bun", "middle-bun", "top-bun"],
    filling: ["patty", "cheese", "tomato", "lettuce", "pickle", "onion"],
    sauce: ["ketchup", "mustard", "house-sauce"],
  });
  assert.equal(Object.isFrozen(WORKBENCH_REGION_OPTIONS), true);
  for (const options of Object.values(WORKBENCH_REGION_OPTIONS)) {
    assert.equal(Object.isFrozen(options), true);
  }
  assert.equal(WORKBENCH_LOADOUT_STORAGE_KEY, "solo-cooking-workbench-loadout:v1");
});

test("creates the complete default workbench layout as a fresh frozen config", () => {
  const first = createDefaultWorkbenchLoadout();
  const second = createDefaultWorkbenchLoadout();

  assert.deepEqual(first, EXPECTED_DEFAULT_LOADOUT);
  assert.deepEqual(Object.keys(first), EXPECTED_SLOTS.map(({ slotId }) => slotId));
  assert.notStrictEqual(first, second);
  assertFrozenLoadout(first);
  assertFrozenLoadout(second);
});

test("allows repeated content while preserving the original frozen loadout", () => {
  const initial = createDefaultWorkbenchLoadout();
  const twoPatties = setWorkbenchSlotContent(initial, "filling-back-2", "patty");
  const threePatties = setWorkbenchSlotContent(twoPatties, "filling-back-3", "patty");

  assert.equal(initial["filling-back-2"], "cheese");
  assert.equal(twoPatties["filling-back-1"], "patty");
  assert.equal(twoPatties["filling-back-2"], "patty");
  assert.equal(threePatties["filling-back-3"], "patty");
  assertFrozenLoadout(twoPatties);
  assertFrozenLoadout(threePatties);
});

test("rejects unknown slots, unknown content, and cross-region content", () => {
  const loadout = createDefaultWorkbenchLoadout();

  assert.throws(() => getWorkbenchSlot("missing-slot"), TypeError);
  assert.throws(
    () => setWorkbenchSlotContent(loadout, "missing-slot", "patty"),
    TypeError,
  );
  assert.throws(
    () => setWorkbenchSlotContent(loadout, "filling-back-1", "dragon-fruit"),
    TypeError,
  );
  assert.throws(
    () => setWorkbenchSlotContent(loadout, "filling-back-1", "bottom-bun"),
    TypeError,
  );
  assert.throws(
    () => setWorkbenchSlotContent(loadout, "sauce-right-1", "onion"),
    TypeError,
  );
  assert.strictEqual(getWorkbenchSlot("bread-left-2"), WORKBENCH_SLOTS[1]);
});

test("normalizes partial old configs in canonical order and falls back per invalid slot", () => {
  const normalized = normalizeWorkbenchLoadout({
    "bread-left-1": "top-bun",
    "bread-left-2": "patty",
    "filling-back-1": "onion",
    "filling-back-2": null,
    "sauce-right-2": "house-sauce",
    "sauce-right-3": "ketchup",
    obsolete: "discard-me",
  });

  assert.deepEqual(normalized, {
    ...EXPECTED_DEFAULT_LOADOUT,
    "bread-left-1": "top-bun",
    "filling-back-1": "onion",
    "sauce-right-2": "house-sauce",
    "sauce-right-3": "ketchup",
  });
  assert.deepEqual(Object.keys(normalized), EXPECTED_SLOTS.map(({ slotId }) => slotId));
  assertFrozenLoadout(normalized);

  for (const value of [null, undefined, "old-config", [], 42]) {
    const fallback = normalizeWorkbenchLoadout(value);
    assert.deepEqual(fallback, EXPECTED_DEFAULT_LOADOUT);
    assertFrozenLoadout(fallback);
  }
});

test("normalization keeps stored content when Object.hasOwn is unavailable", () => {
  const originalHasOwn = Object.hasOwn;
  try {
    Object.hasOwn = undefined;
    const normalized = normalizeWorkbenchLoadout({ "filling-back-1": "onion" });
    assert.equal(normalized["filling-back-1"], "onion");
  } finally {
    Object.hasOwn = originalHasOwn;
  }
});

test("normalization falls back when inspecting the input shape throws", () => {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  let normalized;

  assert.doesNotThrow(() => {
    normalized = normalizeWorkbenchLoadout(revocable.proxy);
  });
  assert.deepEqual(normalized, EXPECTED_DEFAULT_LOADOUT);
  assertFrozenLoadout(normalized);
});

test("loads and normalizes persisted configs and falls back for missing or malformed JSON", () => {
  const storage = createMemoryStorage({
    [WORKBENCH_LOADOUT_STORAGE_KEY]: JSON.stringify({
      "filling-back-1": "pickle",
      "filling-back-2": "bottom-bun",
      "sauce-right-3": "mustard",
    }),
  });
  const loaded = loadWorkbenchLoadout(storage);

  assert.equal(loaded["filling-back-1"], "pickle");
  assert.equal(loaded["filling-back-2"], "cheese");
  assert.equal(loaded["sauce-right-3"], "mustard");
  assertFrozenLoadout(loaded);

  const malformed = createMemoryStorage({
    [WORKBENCH_LOADOUT_STORAGE_KEY]: "{not-json",
  });
  assert.deepEqual(loadWorkbenchLoadout(malformed), EXPECTED_DEFAULT_LOADOUT);
  assert.deepEqual(loadWorkbenchLoadout(createMemoryStorage()), EXPECTED_DEFAULT_LOADOUT);
});

test("loading tolerates unavailable storage and read exceptions", () => {
  const unreadable = {
    getItem() {
      throw new DOMException("denied", "SecurityError");
    },
  };

  assert.doesNotThrow(() => loadWorkbenchLoadout(unreadable));
  assert.deepEqual(loadWorkbenchLoadout(unreadable), EXPECTED_DEFAULT_LOADOUT);
  assert.deepEqual(loadWorkbenchLoadout(null), EXPECTED_DEFAULT_LOADOUT);
  assert.doesNotThrow(() => loadWorkbenchLoadout());
  assertFrozenLoadout(loadWorkbenchLoadout());
});

test("saving writes canonical JSON and returns the frozen config even when writes fail", () => {
  const storage = createMemoryStorage();
  const saved = saveWorkbenchLoadout({
    "filling-back-1": "pickle",
    "filling-back-2": "bottom-bun",
    "sauce-right-1": "mustard",
    obsolete: true,
  }, storage);

  assert.deepEqual(saved, {
    ...EXPECTED_DEFAULT_LOADOUT,
    "filling-back-1": "pickle",
    "sauce-right-1": "mustard",
  });
  assert.equal(
    storage.values.get(WORKBENCH_LOADOUT_STORAGE_KEY),
    JSON.stringify(saved),
  );
  assertFrozenLoadout(saved);

  const unwritable = {
    setItem() {
      throw new DOMException("full", "QuotaExceededError");
    },
  };
  const unsaved = saveWorkbenchLoadout({ "filling-back-1": "onion" }, unwritable);
  assert.equal(unsaved["filling-back-1"], "onion");
  assertFrozenLoadout(unsaved);
  assert.doesNotThrow(() => saveWorkbenchLoadout({}, null));
  assert.doesNotThrow(() => saveWorkbenchLoadout({}));
});

test("saving falls back when inspecting the input shape throws", () => {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  const storage = createMemoryStorage();
  let saved;

  assert.doesNotThrow(() => {
    saved = saveWorkbenchLoadout(revocable.proxy, storage);
  });
  assert.deepEqual(saved, EXPECTED_DEFAULT_LOADOUT);
  assert.equal(
    storage.values.get(WORKBENCH_LOADOUT_STORAGE_KEY),
    JSON.stringify(EXPECTED_DEFAULT_LOADOUT),
  );
  assertFrozenLoadout(saved);
});

test("reset removes the persisted config and returns defaults despite removal errors", () => {
  const storage = createMemoryStorage({
    [WORKBENCH_LOADOUT_STORAGE_KEY]: JSON.stringify({ "filling-back-1": "onion" }),
  });
  const reset = resetWorkbenchLoadout(storage);

  assert.equal(storage.values.has(WORKBENCH_LOADOUT_STORAGE_KEY), false);
  assert.deepEqual(reset, EXPECTED_DEFAULT_LOADOUT);
  assertFrozenLoadout(reset);

  const unremovable = {
    removeItem() {
      throw new DOMException("denied", "SecurityError");
    },
  };
  assert.doesNotThrow(() => resetWorkbenchLoadout(unremovable));
  assert.deepEqual(resetWorkbenchLoadout(unremovable), EXPECTED_DEFAULT_LOADOUT);
  assert.doesNotThrow(() => resetWorkbenchLoadout(null));
  assert.doesNotThrow(() => resetWorkbenchLoadout());
});
