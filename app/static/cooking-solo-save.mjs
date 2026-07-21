import {
  BURGER_RECIPES,
  SOLO_BURGER_INGREDIENT_IDS,
  SOLO_COOKING_SAUCE_IDS,
} from "./burger-recipes.mjs";
import {
  MAX_SOLO_STACK_LAYERS,
  SOLO_INGREDIENT_STOCK,
} from "./cooking-solo-state.mjs";
import {
  WORKBENCH_REGION_OPTIONS,
  WORKBENCH_SLOTS,
} from "./workbench-loadout.mjs";

const SAVE_VERSION = 1;
const MAX_STROKES = 64;
const MAX_STROKE_POINTS = 24;
const MIN_STROKE_AMOUNT = 0.01;
const MAX_STROKE_AMOUNT = 1;
const MAX_INSTANCE_ID_LENGTH = 128;
const MAX_SERIALIZED_SAVE_CHARS = 256 * 1024;
const MAX_SAVE_INSTANCES = 256;
const MAX_NEXT_INSTANCE_SEQUENCE = 1_000_000;

const RECIPE_IDS = new Set(BURGER_RECIPES.map(({ id }) => id));
const INGREDIENT_IDS = new Set(SOLO_BURGER_INGREDIENT_IDS);
const SAUCE_IDS = new Set(SOLO_COOKING_SAUCE_IDS);
const ALL_SLOT_IDS = WORKBENCH_SLOTS.map(({ slotId }) => slotId);
const INGREDIENT_SLOTS = WORKBENCH_SLOTS.filter(({ region }) => region !== "sauce");
const INGREDIENT_SLOT_IDS = INGREDIENT_SLOTS.map(({ slotId }) => slotId);
const INGREDIENT_SLOT_ID_SET = new Set(INGREDIENT_SLOT_IDS);
const SLOT_BY_ID = new Map(WORKBENCH_SLOTS.map((slot) => [slot.slotId, slot]));

function fail(message) {
  throw new TypeError(`Invalid solo cooking save: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function requireExactKeys(record, keys, label) {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) {
    fail(`${label} has the wrong keys`);
  }
}

function requireSafeId(value, label) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > MAX_INSTANCE_ID_LENGTH
    || value === "__proto__"
    || value === "prototype"
    || value === "constructor"
  ) {
    fail(`${label} is not a safe instance id`);
  }
  return value;
}

function requireFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be finite`);
  }
  return value;
}

function requireInteger(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside bounds`);
  }
  return value;
}

function cloneInstances(value) {
  const record = requireRecord(value, "instances");
  const ids = Object.keys(record).sort();
  if (ids.length > MAX_SAVE_INSTANCES) {
    fail(`instances must contain at most ${MAX_SAVE_INSTANCES} entries`);
  }
  const instances = {};
  ids.forEach((id) => {
    requireSafeId(id, "instances key");
    if (!INGREDIENT_IDS.has(record[id])) fail(`instances.${id} has an unknown ingredient`);
    instances[id] = record[id];
  });
  return instances;
}

function validateInstanceSequences(instances, nextInstanceSequence) {
  Object.entries(instances).forEach(([instanceId, ingredientId]) => {
    if (instanceId === ingredientId) return;
    const prefix = `${ingredientId}#`;
    if (!instanceId.startsWith(prefix)) {
      fail(`instances.${instanceId} has a non-canonical id`);
    }
    const suffixText = instanceId.slice(prefix.length);
    if (!/^\d+$/.test(suffixText)) {
      fail(`instances.${instanceId} has a non-numeric sequence`);
    }
    const suffix = Number(suffixText);
    if (
      !Number.isSafeInteger(suffix)
      || suffix < 2
      || suffix >= nextInstanceSequence
    ) {
      fail(`instances.${instanceId} has an invalid sequence`);
    }
  });
}

function ingredientFitsSlot(ingredientId, slotId) {
  const slot = SLOT_BY_ID.get(slotId);
  return Boolean(
    slot
    && slot.region !== "sauce"
    && WORKBENCH_REGION_OPTIONS[slot.region].includes(ingredientId),
  );
}

function cloneAssembledOrder(value, instances) {
  if (!Array.isArray(value) || value.length > MAX_SOLO_STACK_LAYERS) {
    fail(`assembledOrder must contain at most ${MAX_SOLO_STACK_LAYERS} layers`);
  }
  const seen = new Set();
  return value.map((rawId, index) => {
    const id = requireSafeId(rawId, `assembledOrder[${index}]`);
    if (!Object.hasOwn(instances, id)) fail(`assembledOrder[${index}] is missing`);
    if (seen.has(id)) fail(`assembledOrder contains duplicate ${id}`);
    seen.add(id);
    return id;
  });
}

function cloneLocations(value, instances, assembledOrder, explicitStations) {
  const record = requireRecord(value, "locations");
  const instanceIds = Object.keys(instances);
  requireExactKeys(record, instanceIds, "locations");
  const assembledIndex = new Map(assembledOrder.map((id, index) => [id, index]));
  const locations = {};
  instanceIds.forEach((id) => {
    const location = requireRecord(record[id], `locations.${id}`);
    if (location.kind === "prep") {
      if (Object.keys(location).length !== 2 || !Object.hasOwn(location, "index")) {
        fail(`locations.${id} has malformed prep coordinates`);
      }
      const index = requireInteger(location.index, `locations.${id}.index`, 0);
      if (assembledIndex.get(id) !== index) fail(`locations.${id}.index does not match the stack`);
      locations[id] = Object.freeze({ kind: "prep", index });
      return;
    }
    if (location.kind !== "bin" || assembledIndex.has(id)) {
      fail(`locations.${id} must be a valid bin or prep location`);
    }
    if (explicitStations) {
      if (
        Object.keys(location).length !== 2
        || !Object.hasOwn(location, "slotId")
        || !INGREDIENT_SLOT_ID_SET.has(location.slotId)
      ) {
        fail(`locations.${id} has an invalid station slot`);
      }
      if (!ingredientFitsSlot(instances[id], location.slotId)) {
        fail(`locations.${id} is assigned across workbench regions`);
      }
      locations[id] = Object.freeze({ kind: "bin", slotId: location.slotId });
      return;
    }
    if (Object.keys(location).length !== 2 || !Object.hasOwn(location, "index")) {
      fail(`locations.${id} has malformed legacy bin coordinates`);
    }
    const index = requireInteger(
      location.index,
      `locations.${id}.index`,
      0,
      SOLO_BURGER_INGREDIENT_IDS.length - 1,
    );
    if (SOLO_BURGER_INGREDIENT_IDS[index] !== instances[id]) {
      fail(`locations.${id}.index does not match its ingredient`);
    }
    locations[id] = Object.freeze({ kind: "bin", index });
  });
  return locations;
}

function cloneRotations(value, instances) {
  const record = requireRecord(value, "rotations");
  const instanceIds = Object.keys(instances);
  requireExactKeys(record, instanceIds, "rotations");
  const rotations = {};
  instanceIds.forEach((id) => {
    const yaw = requireFinite(record[id], `rotations.${id}`);
    if (yaw < -Math.PI || yaw > Math.PI) fail(`rotations.${id} is outside bounds`);
    rotations[id] = yaw;
  });
  return rotations;
}

function cloneIngredientRecord(value, label, normalizeValue) {
  const record = requireRecord(value, label);
  requireExactKeys(record, SOLO_BURGER_INGREDIENT_IDS, label);
  return Object.fromEntries(SOLO_BURGER_INGREDIENT_IDS.map((ingredientId) => [
    ingredientId,
    normalizeValue(record[ingredientId], `${label}.${ingredientId}`, ingredientId),
  ]));
}

function cloneBinSources(value, instances, locations, { wire, explicitStations }) {
  return cloneIngredientRecord(value, "binSources", (rawValue, label, ingredientId) => {
    const sourceId = wire && rawValue === null ? undefined : rawValue;
    if (sourceId === undefined) return undefined;
    requireSafeId(sourceId, label);
    if (!Object.hasOwn(instances, sourceId)) fail(`${label} references a missing instance`);
    if (instances[sourceId] !== ingredientId) fail(`${label} references the wrong ingredient`);
    if (explicitStations && locations[sourceId].kind !== "bin") {
      fail(`${label} must reference a bin instance`);
    }
    return sourceId;
  });
}

function cloneInventory(value) {
  return cloneIngredientRecord(value, "inventory", (count, label) => (
    requireInteger(count, label, 0, SOLO_INGREDIENT_STOCK)
  ));
}

function cloneReferenceRecipeId(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !RECIPE_IDS.has(value)) {
    fail("referenceRecipeId is unknown");
  }
  return value;
}

function cloneStationContents(value) {
  const record = requireRecord(value, "stationContents");
  requireExactKeys(record, ALL_SLOT_IDS, "stationContents");
  return Object.fromEntries(WORKBENCH_SLOTS.map(({ slotId, region }) => {
    const contentId = record[slotId];
    if (!WORKBENCH_REGION_OPTIONS[region].includes(contentId)) {
      fail(`stationContents.${slotId} is invalid`);
    }
    return [slotId, contentId];
  }));
}

function cloneStationSources(value, stationContents, instances, locations) {
  const record = requireRecord(value, "stationSources");
  requireExactKeys(record, INGREDIENT_SLOT_IDS, "stationSources");
  const seen = new Set();
  return Object.fromEntries(INGREDIENT_SLOTS.map(({ slotId }) => {
    const sourceId = requireSafeId(record[slotId], `stationSources.${slotId}`);
    if (seen.has(sourceId)) fail(`stationSources repeats ${sourceId}`);
    if (!Object.hasOwn(instances, sourceId)) fail(`stationSources.${slotId} is missing`);
    if (instances[sourceId] !== stationContents[slotId]) {
      fail(`stationSources.${slotId} does not match its station content`);
    }
    if (locations[sourceId].kind !== "bin" || locations[sourceId].slotId !== slotId) {
      fail(`stationSources.${slotId} is not in its slot`);
    }
    seen.add(sourceId);
    return [slotId, sourceId];
  }));
}

function cloneInstanceHomes(value, instances, locations) {
  const record = requireRecord(value, "instanceHomes");
  const instanceIds = Object.keys(instances);
  requireExactKeys(record, instanceIds, "instanceHomes");
  const homes = {};
  instanceIds.forEach((id) => {
    const slotId = record[id];
    if (!INGREDIENT_SLOT_ID_SET.has(slotId)) fail(`instanceHomes.${id} is invalid`);
    if (!ingredientFitsSlot(instances[id], slotId)) {
      fail(`instanceHomes.${id} is assigned across workbench regions`);
    }
    if (locations[id].kind === "bin" && locations[id].slotId !== slotId) {
      fail(`instanceHomes.${id} conflicts with its bin location`);
    }
    homes[id] = slotId;
  });
  return homes;
}

function validateStationConsistency({
  stationContents,
  stationSources,
  instanceHomes,
  binSources,
}) {
  INGREDIENT_SLOT_IDS.forEach((slotId) => {
    if (instanceHomes[stationSources[slotId]] !== slotId) {
      fail(`stationSources.${slotId} conflicts with its home`);
    }
  });
  const expectedBinSources = Object.fromEntries(
    SOLO_BURGER_INGREDIENT_IDS.map((ingredientId) => [ingredientId, undefined]),
  );
  INGREDIENT_SLOT_IDS.forEach((slotId) => {
    const ingredientId = stationContents[slotId];
    if (expectedBinSources[ingredientId] === undefined) {
      expectedBinSources[ingredientId] = stationSources[slotId];
    }
  });
  SOLO_BURGER_INGREDIENT_IDS.forEach((ingredientId) => {
    if (binSources[ingredientId] !== expectedBinSources[ingredientId]) {
      fail(`binSources.${ingredientId} conflicts with station sources`);
    }
  });
}

function cloneStrokes(value, instances) {
  if (!Array.isArray(value) || value.length > MAX_STROKES) {
    fail(`strokes must contain at most ${MAX_STROKES} entries`);
  }
  return value.map((rawStroke, strokeIndex) => {
    const stroke = requireRecord(rawStroke, `strokes[${strokeIndex}]`);
    if (!SAUCE_IDS.has(stroke.sauce)) fail(`strokes[${strokeIndex}].sauce is unknown`);
    const layerId = requireSafeId(stroke.layerId, `strokes[${strokeIndex}].layerId`);
    if (!Object.hasOwn(instances, layerId)) fail(`strokes[${strokeIndex}].layerId is missing`);
    const amount = requireFinite(stroke.amount, `strokes[${strokeIndex}].amount`);
    if (amount < MIN_STROKE_AMOUNT || amount > MAX_STROKE_AMOUNT) {
      fail(`strokes[${strokeIndex}].amount is outside bounds`);
    }
    if (
      !Array.isArray(stroke.points)
      || stroke.points.length < 2
      || stroke.points.length > MAX_STROKE_POINTS
    ) {
      fail(`strokes[${strokeIndex}].points is malformed`);
    }
    const points = stroke.points.map((point, pointIndex) => {
      if (!Array.isArray(point) || point.length !== 2) {
        fail(`strokes[${strokeIndex}].points[${pointIndex}] is not a pair`);
      }
      const x = requireFinite(point[0], `strokes[${strokeIndex}].points[${pointIndex}][0]`);
      const z = requireFinite(point[1], `strokes[${strokeIndex}].points[${pointIndex}][1]`);
      if (x < -1 || x > 1 || z < -1 || z > 1) {
        fail(`strokes[${strokeIndex}].points[${pointIndex}] is outside bounds`);
      }
      return Object.freeze([x, z]);
    });
    return Object.freeze({
      sauce: stroke.sauce,
      layerId,
      amount,
      points: Object.freeze(points),
    });
  });
}

function freezeRecord(record) {
  return Object.freeze(record);
}

function validateSnapshot(value, { wire = false } = {}) {
  const saved = requireRecord(value, "state");
  const instances = cloneInstances(saved.instances);
  const assembledOrder = cloneAssembledOrder(saved.assembledOrder, instances);
  const stationValues = [saved.stationContents, saved.stationSources, saved.instanceHomes];
  const hasStations = stationValues.every((entry) => entry !== null && entry !== undefined);
  const hasPartialStations = stationValues.some((entry) => entry !== null && entry !== undefined);
  if (!hasStations && hasPartialStations) fail("station records must be saved together");
  const locations = cloneLocations(saved.locations, instances, assembledOrder, hasStations);
  const rotations = cloneRotations(saved.rotations, instances);
  const binSources = cloneBinSources(saved.binSources, instances, locations, {
    wire,
    explicitStations: hasStations,
  });
  const inventory = cloneInventory(saved.inventory);
  const nextInstanceSequence = requireInteger(
    saved.nextInstanceSequence,
    "nextInstanceSequence",
    2,
    MAX_NEXT_INSTANCE_SEQUENCE,
  );
  validateInstanceSequences(instances, nextInstanceSequence);
  const strokes = cloneStrokes(saved.strokes, instances);
  const referenceRecipeId = cloneReferenceRecipeId(saved.referenceRecipeId);
  if (typeof saved.finished !== "boolean") fail("finished must be boolean");
  if (saved.finished && assembledOrder.length < 2) fail("finished requires a complete burger");

  let stationContents = null;
  let stationSources = null;
  let instanceHomes = null;
  if (hasStations) {
    stationContents = cloneStationContents(saved.stationContents);
    stationSources = cloneStationSources(
      saved.stationSources,
      stationContents,
      instances,
      locations,
    );
    instanceHomes = cloneInstanceHomes(saved.instanceHomes, instances, locations);
    validateStationConsistency({ stationContents, stationSources, instanceHomes, binSources });
  }

  return Object.freeze({
    assembledOrder: Object.freeze(assembledOrder),
    instances: freezeRecord(instances),
    locations: freezeRecord(locations),
    rotations: freezeRecord(rotations),
    binSources: freezeRecord(binSources),
    inventory: freezeRecord(inventory),
    nextInstanceSequence,
    strokes: Object.freeze(strokes),
    referenceRecipeId,
    finished: saved.finished,
    stationContents: stationContents ? freezeRecord(stationContents) : null,
    stationSources: stationSources ? freezeRecord(stationSources) : null,
    instanceHomes: instanceHomes ? freezeRecord(instanceHomes) : null,
  });
}

function encodeSnapshot(snapshot) {
  return {
    assembledOrder: [...snapshot.assembledOrder],
    instances: { ...snapshot.instances },
    locations: Object.fromEntries(Object.entries(snapshot.locations).map(([id, location]) => [
      id,
      { ...location },
    ])),
    rotations: { ...snapshot.rotations },
    binSources: Object.fromEntries(SOLO_BURGER_INGREDIENT_IDS.map((ingredientId) => [
      ingredientId,
      snapshot.binSources[ingredientId] ?? null,
    ])),
    inventory: { ...snapshot.inventory },
    nextInstanceSequence: snapshot.nextInstanceSequence,
    strokes: snapshot.strokes.map((stroke) => ({
      sauce: stroke.sauce,
      layerId: stroke.layerId,
      amount: stroke.amount,
      points: stroke.points.map((point) => [...point]),
    })),
    referenceRecipeId: snapshot.referenceRecipeId,
    finished: snapshot.finished,
    stationContents: snapshot.stationContents ? { ...snapshot.stationContents } : null,
    stationSources: snapshot.stationSources ? { ...snapshot.stationSources } : null,
    instanceHomes: snapshot.instanceHomes ? { ...snapshot.instanceHomes } : null,
  };
}

export function serializeSoloSave(state) {
  let snapshot;
  try {
    snapshot = validateSnapshot(state);
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError("Invalid solo cooking save state", { cause: error });
  }
  return JSON.stringify({
    version: SAVE_VERSION,
    state: encodeSnapshot(snapshot),
  });
}

export function decodeSoloSave(serialized) {
  try {
    if (
      typeof serialized !== "string"
      || serialized.length === 0
      || serialized.length > MAX_SERIALIZED_SAVE_CHARS
    ) return null;
    const payload = JSON.parse(serialized);
    if (!isRecord(payload) || payload.version !== SAVE_VERSION) return null;
    return Object.freeze({
      version: SAVE_VERSION,
      state: validateSnapshot(payload.state, { wire: true }),
    });
  } catch {
    return null;
  }
}

export function hydrateSoloCookingState(snapshot) {
  try {
    const saved = validateSnapshot(snapshot);
    const state = {
      assembledOrder: saved.assembledOrder,
      instances: saved.instances,
      locations: saved.locations,
      rotations: saved.rotations,
      binSources: saved.binSources,
      inventory: saved.inventory,
      nextInstanceSequence: saved.nextInstanceSequence,
      strokes: saved.strokes,
      complete: saved.assembledOrder.length >= 2,
      finished: saved.finished,
      history: Object.freeze([]),
      referenceRecipeId: saved.referenceRecipeId,
    };
    if (saved.stationContents) {
      state.stationContents = saved.stationContents;
      state.stationSources = saved.stationSources;
      state.instanceHomes = saved.instanceHomes;
    }
    return Object.freeze(state);
  } catch {
    return null;
  }
}
