import test from "node:test";
import assert from "node:assert/strict";

import {
  addSoloSauceStroke,
  createSoloCookingState,
  finishSoloCooking,
  placeSoloLayer,
  rotateSoloLayer,
} from "../app/static/cooking-solo-state.mjs";
import {
  decodeSoloSave,
  hydrateSoloCookingState,
  serializeSoloSave,
} from "../app/static/cooking-solo-save.mjs";
import { createDefaultWorkbenchLoadout } from "../app/static/workbench-loadout.mjs";

const PERSISTED_FIELDS = Object.freeze([
  "assembledOrder",
  "instances",
  "locations",
  "rotations",
  "binSources",
  "inventory",
  "nextInstanceSequence",
  "strokes",
  "referenceRecipeId",
  "finished",
  "stationContents",
  "stationSources",
  "instanceHomes",
]);

function stroke(sauce, layerId, amount = 0.45) {
  return {
    sauce,
    layerId,
    amount,
    points: [[-0.6, -0.25], [0, 0.4], [0.65, -0.1]],
  };
}

function makeDuplicateSlotState({ layers = 4, finished = false } = {}) {
  const loadout = {
    ...createDefaultWorkbenchLoadout(),
    "filling-back-2": "patty",
  };
  let state = createSoloCookingState({
    referenceRecipeId: "double-melty-cheese",
    loadout,
  });

  for (let index = 0; index < layers; index += 1) {
    const slotId = index % 2 === 0 ? "filling-back-1" : "filling-back-2";
    const sourceId = state.stationSources[slotId];
    state = placeSoloLayer(state, sourceId, state.assembledOrder.length, { replenish: true });
  }

  if (state.assembledOrder.length) {
    state = rotateSoloLayer(state, state.assembledOrder[0], Math.PI / 3);
    state = addSoloSauceStroke(
      state,
      stroke("house-sauce", state.assembledOrder.at(-1), 0.72),
    );
  }
  return finished ? finishSoloCooking(state) : state;
}

function roundTrip(state) {
  const serialized = serializeSoloSave(state);
  const decoded = decodeSoloSave(serialized);
  assert.ok(decoded);
  assert.equal(decoded.version, 1);
  const hydrated = hydrateSoloCookingState(decoded.state);
  assert.ok(hydrated);
  return { serialized, decoded, hydrated };
}

function mutateSerialized(serialized, mutate) {
  const payload = JSON.parse(serialized);
  mutate(payload);
  return JSON.stringify(payload);
}

test("round-trips all persisted fields while dropping history and deriving complete", () => {
  const state = makeDuplicateSlotState({ layers: 6, finished: true });
  const { serialized, decoded, hydrated } = roundTrip(state);

  assert.deepEqual(Object.keys(decoded.state), PERSISTED_FIELDS);
  for (const field of PERSISTED_FIELDS) {
    assert.deepEqual(hydrated[field], state[field], field);
  }
  assert.deepEqual(hydrated.history, []);
  assert.equal(hydrated.complete, true);
  assert.equal(Object.hasOwn(JSON.parse(serialized).state, "history"), false);
  assert.equal(Object.hasOwn(JSON.parse(serialized).state, "complete"), false);
  assert.equal(Object.isFrozen(hydrated), true);
  assert.equal(Object.isFrozen(hydrated.strokes[0].points), true);
});

test("preserves duplicate ingredient slots as distinct sources and homes", () => {
  const state = makeDuplicateSlotState({ layers: 2 });
  const { hydrated } = roundTrip(state);

  const first = hydrated.stationSources["filling-back-1"];
  const second = hydrated.stationSources["filling-back-2"];
  assert.equal(hydrated.stationContents["filling-back-1"], "patty");
  assert.equal(hydrated.stationContents["filling-back-2"], "patty");
  assert.notEqual(first, second);
  assert.equal(hydrated.instances[first], "patty");
  assert.equal(hydrated.instances[second], "patty");
  assert.equal(hydrated.instanceHomes[first], "filling-back-1");
  assert.equal(hydrated.instanceHomes[second], "filling-back-2");
});

test("encodes every undefined bin source explicitly and restores it as undefined", () => {
  const state = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  assert.equal(state.binSources.onion, undefined);

  const serialized = serializeSoloSave(state);
  const wire = JSON.parse(serialized);
  assert.deepEqual(Object.keys(wire.state.binSources), [
    "bottom-bun",
    "patty",
    "cheese",
    "tomato",
    "lettuce",
    "pickle",
    "top-bun",
    "onion",
    "middle-bun",
  ]);
  assert.equal(wire.state.binSources.onion, null);

  const hydrated = hydrateSoloCookingState(decodeSoloSave(serialized).state);
  assert.equal(Object.hasOwn(hydrated.binSources, "onion"), true);
  assert.equal(hydrated.binSources.onion, undefined);
});

test("round-trips an exact sixty-layer burger and rejects layer sixty-one", () => {
  const state = makeDuplicateSlotState({ layers: 60, finished: true });
  const { serialized, hydrated } = roundTrip(state);
  assert.equal(hydrated.assembledOrder.length, 60);

  const invalid = mutateSerialized(serialized, ({ state: saved }) => {
    const copiedId = saved.assembledOrder[0];
    const extraId = "patty#saved-extra";
    saved.assembledOrder.push(extraId);
    saved.instances[extraId] = saved.instances[copiedId];
    saved.locations[extraId] = { kind: "prep", index: 60 };
    saved.rotations[extraId] = 0;
    saved.instanceHomes[extraId] = saved.instanceHomes[copiedId];
  });
  assert.equal(decodeSoloSave(invalid), null);
});

test("loads a valid small v1 save and ignores future versions", () => {
  const state = makeDuplicateSlotState({ layers: 2 });
  const serialized = serializeSoloSave(state);

  const restored = hydrateSoloCookingState(decodeSoloSave(serialized).state);
  assert.deepEqual(restored.assembledOrder, state.assembledOrder);

  const future = mutateSerialized(serialized, (payload) => { payload.version = 2; });
  assert.equal(decodeSoloSave(future), null);
});

test("returns null instead of throwing for corrupt serialized input", () => {
  const inputs = [
    null,
    undefined,
    "",
    "not-json",
    "null",
    "[]",
    JSON.stringify({ version: 1 }),
  ];
  for (const input of inputs) {
    assert.doesNotThrow(() => decodeSoloSave(input));
    assert.equal(decodeSoloSave(input), null);
  }
  assert.doesNotThrow(() => hydrateSoloCookingState(null));
  assert.equal(hydrateSoloCookingState(null), null);
});

test("rejects duplicate or missing instance references", () => {
  const serialized = serializeSoloSave(makeDuplicateSlotState({ layers: 4 }));
  const duplicate = mutateSerialized(serialized, ({ state }) => {
    state.assembledOrder[1] = state.assembledOrder[0];
  });
  const missing = mutateSerialized(serialized, ({ state }) => {
    delete state.instances[state.assembledOrder[0]];
  });
  const duplicateStationSource = mutateSerialized(serialized, ({ state }) => {
    state.stationSources["filling-back-2"] = state.stationSources["filling-back-1"];
  });

  assert.equal(decodeSoloSave(duplicate), null);
  assert.equal(decodeSoloSave(missing), null);
  assert.equal(decodeSoloSave(duplicateStationSource), null);
});

test("rejects invalid locations, slot homes, rotations, counters, and inventory", () => {
  const serialized = serializeSoloSave(makeDuplicateSlotState({ layers: 4 }));
  const cases = [
    ({ state }) => { state.locations[state.assembledOrder[0]] = { kind: "prep", index: 99 }; },
    ({ state }) => { state.instanceHomes[state.assembledOrder[0]] = "sauce-right-1"; },
    ({ state }) => { state.rotations[state.assembledOrder[0]] = null; },
    ({ state }) => { state.rotations[state.assembledOrder[0]] = Math.PI + 0.01; },
    ({ state }) => { state.nextInstanceSequence = -1; },
    ({ state }) => { state.inventory.patty = 1000; },
    ({ state }) => { state.binSources.patty = "missing-instance"; },
  ];

  for (const mutate of cases) {
    assert.equal(decodeSoloSave(mutateSerialized(serialized, mutate)), null);
  }
});

test("rejects malformed, out-of-range, or dangling sauce strokes", () => {
  const serialized = serializeSoloSave(makeDuplicateSlotState({ layers: 4 }));
  const cases = [
    ({ state }) => { state.strokes[0].sauce = "unknown-sauce"; },
    ({ state }) => { state.strokes[0].layerId = "missing-instance"; },
    ({ state }) => { state.strokes[0].amount = 0; },
    ({ state }) => { state.strokes[0].amount = 1.1; },
    ({ state }) => { state.strokes[0].points = [[0, 0]]; },
    ({ state }) => { state.strokes[0].points[0] = [2, 0]; },
    ({ state }) => { state.strokes[0].points[0] = [0, null]; },
  ];

  for (const mutate of cases) {
    assert.equal(decodeSoloSave(mutateSerialized(serialized, mutate)), null);
  }
});

test("serializer is deterministic and refuses malformed in-memory state", () => {
  const state = makeDuplicateSlotState({ layers: 3 });
  assert.equal(serializeSoloSave(state), serializeSoloSave(state));

  const malformed = {
    ...state,
    assembledOrder: [...state.assembledOrder, state.assembledOrder[0]],
  };
  assert.throws(() => serializeSoloSave(malformed), TypeError);
});
