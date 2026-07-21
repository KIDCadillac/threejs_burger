import test from "node:test";
import assert from "node:assert/strict";

import {
  SOLO_AUTOSAVE_STORAGE_KEY,
  createSoloAutosave,
} from "../app/static/cooking-solo-autosave.mjs";
import {
  createSoloCookingState,
  placeSoloLayer,
} from "../app/static/cooking-solo-state.mjs";
import { serializeSoloSave } from "../app/static/cooking-solo-save.mjs";
import { createDefaultWorkbenchLoadout } from "../app/static/workbench-loadout.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    values,
    calls,
    getItem(key) { calls.push(["get", key]); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(["set", key, String(value)]); values.set(key, String(value)); },
    removeItem(key) { calls.push(["remove", key]); values.delete(key); },
  };
}

function stateWithOneLayer() {
  const initial = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const source = initial.stationSources["bread-left-1"];
  return placeSoloLayer(initial, source, 0, { replenish: true });
}

test("loads and hydrates the latest valid local burger without restoring undo history", () => {
  const expected = stateWithOneLayer();
  const storage = memoryStorage({
    [SOLO_AUTOSAVE_STORAGE_KEY]: serializeSoloSave(expected),
  });
  const autosave = createSoloAutosave({ storage });

  const restored = autosave.load();

  assert.deepEqual(restored.assembledOrder, expected.assembledOrder);
  assert.deepEqual(restored.stationContents, expected.stationContents);
  assert.deepEqual(restored.history, []);
  assert.equal(Object.isFrozen(restored), true);
  assert.deepEqual(storage.calls, [["get", SOLO_AUTOSAVE_STORAGE_KEY]]);
});

test("malformed, unknown-version, and oversized saves fail closed", () => {
  for (const serialized of [
    "not-json",
    JSON.stringify({ version: 999, state: {} }),
    "x".repeat(300_000),
  ]) {
    const storage = memoryStorage({ [SOLO_AUTOSAVE_STORAGE_KEY]: serialized });
    assert.equal(createSoloAutosave({ storage }).load(), null);
  }
});

test("save writes only distinct canonical states and never replaces a good save with invalid data", () => {
  const storage = memoryStorage();
  const autosave = createSoloAutosave({ storage });
  const state = stateWithOneLayer();

  assert.equal(autosave.save(state), true);
  assert.equal(autosave.save(state), false);
  assert.equal(storage.calls.filter(([kind]) => kind === "set").length, 1);
  const saved = storage.values.get(SOLO_AUTOSAVE_STORAGE_KEY);

  assert.equal(autosave.save({ broken: true }), false);
  assert.equal(storage.values.get(SOLO_AUTOSAVE_STORAGE_KEY), saved);
});

test("a loaded save is deduplicated until the state actually changes", () => {
  const state = stateWithOneLayer();
  const serialized = serializeSoloSave(state);
  const storage = memoryStorage({ [SOLO_AUTOSAVE_STORAGE_KEY]: serialized });
  const autosave = createSoloAutosave({ storage });

  const restored = autosave.load();
  assert.equal(autosave.save(restored), false);
  assert.equal(storage.calls.filter(([kind]) => kind === "set").length, 0);

  const nextSource = restored.stationSources["filling-back-1"];
  const changed = placeSoloLayer(restored, nextSource, 1, { replenish: true });
  assert.equal(autosave.save(changed), true);
  assert.equal(storage.calls.filter(([kind]) => kind === "set").length, 1);
});

test("storage denial and quota errors never prevent cooking", () => {
  const unreadable = { getItem() { throw new DOMException("denied", "SecurityError"); } };
  assert.equal(createSoloAutosave({ storage: unreadable }).load(), null);

  const unwritable = {
    getItem() { return null; },
    setItem() { throw new DOMException("full", "QuotaExceededError"); },
    removeItem() { throw new DOMException("denied", "SecurityError"); },
  };
  const autosave = createSoloAutosave({ storage: unwritable });
  assert.equal(autosave.save(stateWithOneLayer()), false);
  assert.equal(autosave.clear(), false);
});

test("clear removes the local burger and resets deduplication", () => {
  const storage = memoryStorage();
  const autosave = createSoloAutosave({ storage });
  const state = stateWithOneLayer();
  autosave.save(state);

  assert.equal(autosave.clear(), true);
  assert.equal(storage.values.has(SOLO_AUTOSAVE_STORAGE_KEY), false);
  assert.equal(autosave.save(state), true);
  assert.equal(storage.calls.filter(([kind]) => kind === "set").length, 2);
});
