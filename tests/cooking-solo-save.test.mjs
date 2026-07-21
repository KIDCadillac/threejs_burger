import test from "node:test";
import assert from "node:assert/strict";

import {
  addSoloSauceStroke,
  createSoloCookingState,
  finishSoloCooking,
  placeSoloLayer,
  removeSoloLayer,
  rotateSoloLayer,
  setSoloStationContent,
  undoSoloCooking,
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

function renameInstance(saved, oldId, newId) {
  saved.instances[newId] = saved.instances[oldId];
  saved.locations[newId] = saved.locations[oldId];
  saved.rotations[newId] = saved.rotations[oldId];
  if (Object.hasOwn(saved.instanceHomes ?? {}, oldId)) {
    saved.instanceHomes[newId] = saved.instanceHomes[oldId];
    delete saved.instanceHomes[oldId];
  }
  saved.assembledOrder = saved.assembledOrder.map((id) => (id === oldId ? newId : id));
  saved.strokes.forEach((entry) => {
    if (entry.layerId === oldId) entry.layerId = newId;
  });
  Object.keys(saved.binSources).forEach((ingredientId) => {
    if (saved.binSources[ingredientId] === oldId) saved.binSources[ingredientId] = newId;
  });
  Object.keys(saved.stationSources ?? {}).forEach((slotId) => {
    if (saved.stationSources[slotId] === oldId) saved.stationSources[slotId] = newId;
  });
  delete saved.instances[oldId];
  delete saved.locations[oldId];
  delete saved.rotations[oldId];
}

function handwrittenLegacyV1() {
  const instances = Object.fromEntries([
    ["bottom-bun", "bottom-bun"],
    ["patty", "patty"],
    ["cheese", "cheese"],
    ["tomato", "tomato"],
    ["lettuce", "lettuce"],
    ["pickle", "pickle"],
    ["top-bun", "top-bun"],
    ["onion", "onion"],
    ["middle-bun", "middle-bun"],
  ]);
  return JSON.stringify({
    version: 1,
    state: {
      assembledOrder: ["bottom-bun", "patty"],
      instances,
      locations: Object.fromEntries(Object.entries(instances).map(([id, ingredientId], index) => [
        id,
        index < 2 ? { kind: "prep", index } : { kind: "bin", index },
      ])),
      rotations: Object.fromEntries(Object.keys(instances).map((id) => [id, 0])),
      binSources: Object.fromEntries(Object.keys(instances).map((id) => [id, id])),
      inventory: Object.fromEntries(Object.keys(instances).map((id) => [id, 999])),
      nextInstanceSequence: 2,
      strokes: [],
      referenceRecipeId: null,
      finished: false,
    },
  });
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

test("loads a handwritten legacy v1 save with all three station fields absent", () => {
  const decoded = decodeSoloSave(handwrittenLegacyV1());
  assert.ok(decoded);
  assert.equal(decoded.state.stationContents, null);
  assert.equal(decoded.state.stationSources, null);
  assert.equal(decoded.state.instanceHomes, null);

  const hydrated = hydrateSoloCookingState(decoded.state);
  assert.deepEqual(hydrated.assembledOrder, ["bottom-bun", "patty"]);
  assert.equal(Object.hasOwn(hydrated, "stationContents"), false);
  assert.equal(hydrated.complete, true);
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

test("rejects ingredient homes and bin locations assigned across workbench regions", () => {
  const serialized = serializeSoloSave(makeDuplicateSlotState({ layers: 4 }));
  const pattyInBreadHome = mutateSerialized(serialized, ({ state }) => {
    state.instanceHomes[state.assembledOrder[0]] = "bread-left-1";
  });
  const bunInFillingHome = mutateSerialized(serialized, ({ state }) => {
    const bunId = state.stationSources["bread-left-1"];
    state.instanceHomes[bunId] = "filling-back-1";
    state.locations[bunId] = { kind: "bin", slotId: "filling-back-1" };
  });

  assert.equal(decodeSoloSave(pattyInBreadHome), null);
  assert.equal(decodeSoloSave(bunInFillingHome), null);
});

test("a hydrated slot state can return a layer and undo to the exact saved home", () => {
  const original = makeDuplicateSlotState({ layers: 4 });
  const restored = hydrateSoloCookingState(decodeSoloSave(serializeSoloSave(original)).state);
  const returnedId = restored.assembledOrder[1];
  const homeSlotId = restored.instanceHomes[returnedId];

  const returned = removeSoloLayer(restored, returnedId, { consolidate: true });
  assert.equal(returned.stationSources[homeSlotId], returnedId);
  assert.deepEqual(returned.locations[returnedId], { kind: "bin", slotId: homeSlotId });

  const undone = undoSoloCooking(returned);
  assert.deepEqual(undone.assembledOrder, restored.assembledOrder);
  assert.equal(undone.instanceHomes[returnedId], homeSlotId);
  assert.ok(Object.values(undone.stationSources).every((id) => undone.instances[id]));
});

test("undoing a returned hydrated layer restores the saved replacement content in its home slot", () => {
  let original = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  const pattyId = original.stationSources["filling-back-1"];
  original = placeSoloLayer(original, pattyId, 0, { replenish: true });
  original = setSoloStationContent(original, "filling-back-1", "cheese");
  const restored = roundTrip(original).hydrated;
  const cheeseSource = restored.stationSources["filling-back-1"];

  assert.equal(restored.stationContents["filling-back-1"], "cheese");
  assert.equal(restored.instances[cheeseSource], "cheese");
  assert.equal(restored.instanceHomes[pattyId], "filling-back-1");

  const returned = removeSoloLayer(restored, pattyId, { consolidate: true });
  assert.equal(returned.stationContents["filling-back-1"], "patty");
  assert.equal(returned.stationSources["filling-back-1"], pattyId);

  const undone = undoSoloCooking(returned);
  assert.deepEqual(undone.assembledOrder, restored.assembledOrder);
  assert.deepEqual(undone.stationContents, restored.stationContents);
  assert.deepEqual(undone.stationSources, restored.stationSources);
  assert.equal(undone.instances[cheeseSource], "cheese");
  assert.deepEqual(undone.locations[cheeseSource], {
    kind: "bin",
    slotId: "filling-back-1",
  });
  assert.deepEqual(undone.history, []);
});

test("rejects an oversized save before calling JSON.parse", () => {
  const oversized = " ".repeat((256 * 1024) + 1);
  const originalParse = JSON.parse;
  let parseCalls = 0;
  JSON.parse = (...args) => {
    parseCalls += 1;
    return originalParse(...args);
  };
  try {
    assert.equal(decodeSoloSave(oversized), null);
  } finally {
    JSON.parse = originalParse;
  }
  assert.equal(parseCalls, 0);
});

test("rejects coherent instance floods above the live-state bound", () => {
  const payload = JSON.parse(handwrittenLegacyV1());
  payload.state.assembledOrder = [];
  payload.state.locations["bottom-bun"] = { kind: "bin", index: 0 };
  payload.state.locations.patty = { kind: "bin", index: 1 };
  for (let index = 0; index < 257; index += 1) {
    const id = `patty#${index + 2}`;
    payload.state.instances[id] = "patty";
    payload.state.locations[id] = { kind: "bin", index: 1 };
    payload.state.rotations[id] = 0;
  }
  payload.state.nextInstanceSequence = 259;
  const serialized = JSON.stringify(payload);
  assert.ok(serialized.length < 256 * 1024);
  assert.equal(decodeSoloSave(serialized), null);

  const fiveThousandSeven = JSON.parse(handwrittenLegacyV1());
  for (let index = 0; index < 5007; index += 1) {
    fiveThousandSeven.state.instances[`patty#flood-${index}`] = "patty";
  }
  assert.equal(decodeSoloSave(JSON.stringify(fiveThousandSeven)), null);
});

test("rejects unsafe sequence and numeric suffix boundaries", () => {
  const serialized = serializeSoloSave(makeDuplicateSlotState({ layers: 4 }));
  const maxSafe = mutateSerialized(serialized, ({ state }) => {
    state.nextInstanceSequence = Number.MAX_SAFE_INTEGER;
  });
  const overPracticalLimit = mutateSerialized(serialized, ({ state }) => {
    state.nextInstanceSequence = 1_000_001;
  });
  const collidingNextSuffix = mutateSerialized(serialized, ({ state }) => {
    const oldId = state.assembledOrder[0];
    renameInstance(state, oldId, "patty#1000000");
    state.nextInstanceSequence = 1_000_000;
  });

  assert.equal(decodeSoloSave(maxSafe), null);
  assert.equal(decodeSoloSave(overPracticalLimit), null);
  assert.equal(decodeSoloSave(collidingNextSuffix), null);
});

test("rejects prototype-shaped instance keys without throwing", () => {
  const payload = JSON.parse(handwrittenLegacyV1());
  payload.state.instances.constructor = "patty";
  payload.state.locations.constructor = { kind: "bin", index: 1 };
  payload.state.rotations.constructor = 0;
  assert.doesNotThrow(() => decodeSoloSave(JSON.stringify(payload)));
  assert.equal(decodeSoloSave(JSON.stringify(payload)), null);

  const protoText = handwrittenLegacyV1().replace(
    '"instances":{',
    '"instances":{"__proto__":"patty",',
  );
  assert.doesNotThrow(() => decodeSoloSave(protoText));
  assert.equal(decodeSoloSave(protoText), null);
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
