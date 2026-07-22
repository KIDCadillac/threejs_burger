import {
  BURGER_RECIPES,
  SOLO_BURGER_INGREDIENT_IDS,
  SOLO_COOKING_SAUCE_IDS,
} from "./burger-recipes.mjs";
import {
  WORKBENCH_REGION_OPTIONS,
  WORKBENCH_SLOTS,
  getWorkbenchSlot,
  normalizeWorkbenchLoadout,
} from "./workbench-loadout.mjs";

const MAX_HISTORY = 32;
const MAX_STROKES = 64;
const MAX_POINTS = 24;
export const MAX_SOLO_STACK_LAYERS = 60;
export const SOLO_INGREDIENT_STOCK = 999;

const INGREDIENT_STATION_SLOTS = Object.freeze(
  WORKBENCH_SLOTS.filter(({ region }) => region !== "sauce"),
);
const INGREDIENT_STATION_SLOT_IDS = new Set(
  INGREDIENT_STATION_SLOTS.map(({ slotId }) => slotId),
);

function requireLayer(layerId) {
  if (!SOLO_BURGER_INGREDIENT_IDS.includes(layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
}

function requireReferenceRecipe(referenceRecipeId) {
  if (referenceRecipeId === null) return null;
  if (
    typeof referenceRecipeId !== "string"
    || !BURGER_RECIPES.some(({ id }) => id === referenceRecipeId)
  ) {
    throw new TypeError(`Unknown burger reference recipe: ${String(referenceRecipeId)}`);
  }
  return referenceRecipeId;
}

function requireInstance(state, layerId) {
  if (typeof layerId !== "string" || !state.instances?.[layerId]) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
  return state.instances[layerId];
}

function requireEditable(state) {
  if (state.finished) throw new Error("Finished cooking is frozen until editing continues");
}

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function freezeStroke(stroke, instances) {
  if (!SOLO_COOKING_SAUCE_IDS.includes(stroke?.sauce)) {
    throw new TypeError(`Unknown sauce: ${String(stroke?.sauce)}`);
  }
  if (instances) {
    if (!instances[stroke?.layerId]) {
      throw new TypeError(`Unknown burger layer: ${String(stroke?.layerId)}`);
    }
  } else {
    requireLayer(stroke?.layerId);
  }
  const amount = finite(stroke.amount, "stroke.amount");
  if (amount < 0.01 || amount > 1) throw new TypeError("stroke.amount is outside bounds");
  if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > MAX_POINTS) {
    throw new TypeError(`stroke.points must contain 2 to ${MAX_POINTS} points`);
  }
  const points = stroke.points.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError(`stroke.points[${index}] must be an [x, z] pair`);
    }
    const x = finite(point[0], `stroke.points[${index}][0]`);
    const z = finite(point[1], `stroke.points[${index}][1]`);
    if (x < -1 || x > 1 || z < -1 || z > 1) {
      throw new TypeError("stroke points are outside the food surface");
    }
    return Object.freeze([x, z]);
  });
  return Object.freeze({
    sauce: stroke.sauce,
    layerId: stroke.layerId,
    amount,
    points: Object.freeze(points),
  });
}

function freezeLocations(locations, instances) {
  return Object.freeze(Object.fromEntries(Object.keys(instances).map((id) => [
    id,
    Object.freeze({ ...locations[id] }),
  ])));
}

function freezeRotations(rotations, instances) {
  return Object.freeze(Object.fromEntries(Object.keys(instances).map((id) => [id, rotations[id]])));
}

function freezeOffsets(offsets, instances) {
  return Object.freeze(Object.fromEntries(Object.keys(instances).map((id) => {
    const offset = offsets?.[id] ?? { x: 0, z: 0 };
    return [id, Object.freeze({
      x: finite(offset.x, `offsets.${id}.x`),
      z: finite(offset.z, `offsets.${id}.z`),
    })];
  })));
}

function freezeInstances(instances) {
  return Object.freeze({ ...instances });
}

function freezeIngredientRecord(record) {
  return Object.freeze(Object.fromEntries(
    SOLO_BURGER_INGREDIENT_IDS.map((id) => [id, record[id]]),
  ));
}

function freezeStationSources(record) {
  return Object.freeze(Object.fromEntries(
    INGREDIENT_STATION_SLOTS.map(({ slotId }) => [slotId, record[slotId]]),
  ));
}

function freezeInstanceHomes(record, instances) {
  return Object.freeze(Object.fromEntries(
    Object.entries(record)
      .filter(([id, slotId]) => (
        Object.hasOwn(instances, id) && INGREDIENT_STATION_SLOT_IDS.has(slotId)
      )),
  ));
}

function referencedInstanceIds(snapshot, stationSources = null) {
  const referenced = new Set([
    ...snapshot.assembledOrder,
    ...snapshot.strokes.map(({ layerId }) => layerId),
  ]);
  if (stationSources) {
    Object.values(stationSources).forEach((id) => referenced.add(id));
  } else if (!snapshot.instanceHomes) {
    Object.values(snapshot.binSources).forEach((id) => {
      if (typeof id === "string") referenced.add(id);
    });
  }
  return referenced;
}

function selectInstanceRecords(snapshot, referenced) {
  const instances = {};
  const locations = {};
  const rotations = {};
  const offsets = {};
  Object.keys(snapshot.instances).forEach((id) => {
    if (!referenced.has(id)) return;
    instances[id] = snapshot.instances[id];
    locations[id] = snapshot.locations[id];
    rotations[id] = snapshot.rotations[id];
    offsets[id] = snapshot.offsets?.[id] ?? { x: 0, z: 0 };
  });
  return { instances, locations, rotations, offsets };
}

function stationSession(state, overrides = {}) {
  if (!state?.stationContents) return null;
  return {
    stationContents: overrides.stationContents ?? state.stationContents,
    stationSources: overrides.stationSources ?? state.stationSources,
    instanceHomes: overrides.instanceHomes ?? state.instanceHomes,
  };
}

function allocateInstanceId(instances, ingredientId, nextInstanceSequence) {
  if (!Object.hasOwn(instances, ingredientId)) {
    return { instanceId: ingredientId, nextInstanceSequence };
  }
  let instanceId;
  do {
    instanceId = `${ingredientId}#${nextInstanceSequence}`;
    nextInstanceSequence += 1;
  } while (Object.hasOwn(instances, instanceId));
  return { instanceId, nextInstanceSequence };
}

function deriveStationBinSources(stationContents, stationSources) {
  const binSources = Object.fromEntries(
    SOLO_BURGER_INGREDIENT_IDS.map((ingredientId) => [ingredientId, undefined]),
  );
  INGREDIENT_STATION_SLOTS.forEach(({ slotId }) => {
    const ingredientId = stationContents[slotId];
    if (binSources[ingredientId] === undefined) {
      binSources[ingredientId] = stationSources[slotId];
    }
  });
  return binSources;
}

function reconcileStationSnapshot(snapshot, session) {
  const stationContents = normalizeWorkbenchLoadout(session.stationContents);
  const assembled = new Set(snapshot.assembledOrder);
  const instances = { ...snapshot.instances };
  const locations = Object.fromEntries(
    Object.keys(instances).map((id) => [id, { ...snapshot.locations[id] }]),
  );
  const rotations = { ...snapshot.rotations };
  const offsets = Object.fromEntries(Object.keys(instances).map((id) => [
    id,
    snapshot.offsets?.[id] ?? { x: 0, z: 0 },
  ]));
  // A sauce stroke owns its target just like the assembled stack and the active station do.
  const strokedLayers = new Set(snapshot.strokes.map(({ layerId }) => layerId));
  const stationSources = {};
  const instanceHomes = {
    ...session.instanceHomes,
    ...(snapshot.instanceHomes ?? {}),
  };
  const selectedSources = new Set();
  let nextInstanceSequence = snapshot.nextInstanceSequence;

  INGREDIENT_STATION_SLOTS.forEach(({ slotId }) => {
    const ingredientId = stationContents[slotId];
    let sourceId = session.stationSources?.[slotId];
    const historicalLocation = snapshot.locations[sourceId];
    const historicalSlotId = snapshot.instanceHomes?.[sourceId]
      ?? (historicalLocation?.kind === "bin" ? historicalLocation.slotId : undefined);
    const strokedSourceMovedSlots = strokedLayers.has(sourceId)
      && typeof historicalSlotId === "string"
      && historicalSlotId !== slotId;
    const sourceConflicts = typeof sourceId !== "string"
      || selectedSources.has(sourceId)
      || (Object.hasOwn(instances, sourceId) && instances[sourceId] !== ingredientId)
      || assembled.has(sourceId)
      || strokedSourceMovedSlots;
    if (sourceConflicts) {
      const allocated = allocateInstanceId(instances, ingredientId, nextInstanceSequence);
      sourceId = allocated.instanceId;
      nextInstanceSequence = allocated.nextInstanceSequence;
    }
    instances[sourceId] = ingredientId;
    locations[sourceId] = { kind: "bin", slotId };
    if (!Number.isFinite(rotations[sourceId])) rotations[sourceId] = 0;
    if (!offsets[sourceId]) offsets[sourceId] = { x: 0, z: 0 };
    stationSources[slotId] = sourceId;
    instanceHomes[sourceId] = slotId;
    selectedSources.add(sourceId);
  });

  Object.keys(instances).forEach((id) => {
    if (assembled.has(id) || selectedSources.has(id) || strokedLayers.has(id)) return;
    const location = locations[id];
    if (
      location?.kind === "bin"
      && typeof location.slotId === "string"
      && INGREDIENT_STATION_SLOT_IDS.has(location.slotId)
    ) {
      delete instances[id];
      delete locations[id];
      delete rotations[id];
      delete offsets[id];
    }
  });

  return {
    snapshot: {
      ...snapshot,
      instances,
      locations,
      rotations,
      offsets,
      binSources: deriveStationBinSources(stationContents, stationSources),
      nextInstanceSequence,
    },
    session: { stationContents, stationSources, instanceHomes },
  };
}

function bareSnapshot(state, { includeStationSession = false } = {}) {
  const referenced = referencedInstanceIds(state, state.stationSources);
  const { instances, locations, rotations, offsets } = selectInstanceRecords(state, referenced);
  return Object.freeze({
    assembledOrder: Object.freeze([...state.assembledOrder]),
    instances: freezeInstances(instances),
    locations: freezeLocations(locations, instances),
    rotations: freezeRotations(rotations, instances),
    offsets: freezeOffsets(offsets, instances),
    binSources: freezeIngredientRecord(state.binSources),
    inventory: freezeIngredientRecord(state.inventory),
    nextInstanceSequence: state.nextInstanceSequence,
    strokes: Object.freeze(state.strokes.map((stroke) => freezeStroke(stroke, state.instances))),
    finished: Boolean(state.finished),
    ...(state.instanceHomes ? {
      instanceHomes: freezeInstanceHomes(state.instanceHomes, instances),
    } : {}),
    ...(includeStationSession && state.stationContents ? {
      stationContents: normalizeWorkbenchLoadout(state.stationContents),
      stationSources: freezeStationSources(state.stationSources),
    } : {}),
  });
}

function buildState(
  snapshot,
  history = [],
  referenceRecipeId = null,
  session = null,
  { reconcileStations = false } = {},
) {
  let resolvedSnapshot = snapshot;
  let resolvedSession = session;
  if (resolvedSession && reconcileStations) {
    const reconciled = reconcileStationSnapshot(snapshot, resolvedSession);
    resolvedSnapshot = reconciled.snapshot;
    resolvedSession = reconciled.session;
  }
  if (resolvedSession) {
    const referenced = referencedInstanceIds(resolvedSnapshot, resolvedSession.stationSources);
    const pruned = selectInstanceRecords(resolvedSnapshot, referenced);
    resolvedSnapshot = {
      ...resolvedSnapshot,
      ...pruned,
    };
  }
  const assembledOrder = Object.freeze([...resolvedSnapshot.assembledOrder]);
  const instances = freezeInstances(resolvedSnapshot.instances);
  const state = {
    assembledOrder,
    instances,
    locations: freezeLocations(resolvedSnapshot.locations, instances),
    rotations: freezeRotations(resolvedSnapshot.rotations, instances),
    offsets: freezeOffsets(resolvedSnapshot.offsets, instances),
    binSources: freezeIngredientRecord(resolvedSnapshot.binSources),
    inventory: freezeIngredientRecord(resolvedSnapshot.inventory),
    nextInstanceSequence: resolvedSnapshot.nextInstanceSequence,
    strokes: Object.freeze(
      resolvedSnapshot.strokes.map((stroke) => freezeStroke(stroke, instances)),
    ),
    complete: assembledOrder.length >= 2,
    finished: Boolean(resolvedSnapshot.finished),
    history: Object.isFrozen(history) ? history : Object.freeze([...history]),
    referenceRecipeId: requireReferenceRecipe(referenceRecipeId),
  };
  if (resolvedSession) {
    state.stationContents = normalizeWorkbenchLoadout(resolvedSession.stationContents);
    state.stationSources = freezeStationSources(resolvedSession.stationSources);
    state.instanceHomes = freezeInstanceHomes(resolvedSession.instanceHomes, instances);
  }
  return Object.freeze(state);
}

function edited(state, changes, { preservePreviousStation = false } = {}) {
  const history = [
    ...state.history,
    bareSnapshot(state, { includeStationSession: preservePreviousStation }),
  ].slice(-MAX_HISTORY);
  return buildState(
    { ...bareSnapshot(state), ...changes },
    history,
    state.referenceRecipeId,
    stationSession(state, changes),
  );
}

function discardHistoricalStationSessions(history) {
  let changed = false;
  const cookingHistory = history.map((snapshot) => {
    if (!snapshot.stationContents) return snapshot;
    changed = true;
    const {
      stationContents: _stationContents,
      stationSources: _stationSources,
      ...cookingSnapshot
    } = snapshot;
    return Object.freeze(cookingSnapshot);
  });
  return changed ? Object.freeze(cookingHistory) : history;
}

export function createSoloCookingState({ referenceRecipeId = null, loadout } = {}) {
  requireReferenceRecipe(referenceRecipeId);
  if (loadout !== undefined) {
    const stationContents = normalizeWorkbenchLoadout(loadout);
    const instances = {};
    const locations = {};
    const rotations = {};
    const offsets = {};
    const stationSources = {};
    const instanceHomes = {};
    let nextInstanceSequence = 2;

    INGREDIENT_STATION_SLOTS.forEach(({ slotId }) => {
      const ingredientId = stationContents[slotId];
      const allocated = allocateInstanceId(instances, ingredientId, nextInstanceSequence);
      const instanceId = allocated.instanceId;
      nextInstanceSequence = allocated.nextInstanceSequence;
      instances[instanceId] = ingredientId;
      locations[instanceId] = { kind: "bin", slotId };
      rotations[instanceId] = 0;
      offsets[instanceId] = { x: 0, z: 0 };
      stationSources[slotId] = instanceId;
      instanceHomes[instanceId] = slotId;
    });

    return buildState({
      assembledOrder: [],
      instances,
      locations,
      rotations,
      offsets,
      binSources: deriveStationBinSources(stationContents, stationSources),
      inventory: Object.fromEntries(
        SOLO_BURGER_INGREDIENT_IDS.map((id) => [id, SOLO_INGREDIENT_STOCK]),
      ),
      nextInstanceSequence,
      strokes: [],
      finished: false,
    }, [], referenceRecipeId, { stationContents, stationSources, instanceHomes });
  }
  const instances = Object.fromEntries(SOLO_BURGER_INGREDIENT_IDS.map((id) => [id, id]));
  return buildState({
    assembledOrder: [],
    instances,
    locations: Object.fromEntries(SOLO_BURGER_INGREDIENT_IDS.map((id, index) => [
      id, { kind: "bin", index },
    ])),
    rotations: Object.fromEntries(SOLO_BURGER_INGREDIENT_IDS.map((id) => [id, 0])),
    offsets: Object.fromEntries(SOLO_BURGER_INGREDIENT_IDS.map((id) => [
      id, { x: 0, z: 0 },
    ])),
    binSources: Object.fromEntries(SOLO_BURGER_INGREDIENT_IDS.map((id) => [id, id])),
    inventory: Object.fromEntries(
      SOLO_BURGER_INGREDIENT_IDS.map((id) => [id, SOLO_INGREDIENT_STOCK]),
    ),
    nextInstanceSequence: 2,
    strokes: [],
    finished: false,
  }, [], referenceRecipeId);
}

export function selectSoloReferenceRecipe(state, referenceRecipeId) {
  const selected = requireReferenceRecipe(referenceRecipeId);
  if (state.referenceRecipeId === selected) return state;
  return Object.freeze({ ...state, referenceRecipeId: selected });
}

export function setSoloStationContent(state, slotId, contentId) {
  const slot = getWorkbenchSlot(slotId);
  if (!WORKBENCH_REGION_OPTIONS[slot.region].includes(contentId)) {
    throw new TypeError(
      `Content ${String(contentId)} is not valid for ${slot.region} slot ${slotId}`,
    );
  }
  const session = stationSession(state);
  if (!session) {
    throw new TypeError("Station content can only be changed in explicit loadout mode");
  }
  if (session.stationContents[slotId] === contentId) return state;

  const stationContents = normalizeWorkbenchLoadout({
    ...session.stationContents,
    [slotId]: contentId,
  });
  const history = discardHistoricalStationSessions(state.history);
  if (slot.region === "sauce") {
    return Object.freeze({ ...state, stationContents, history });
  }

  const instances = { ...state.instances };
  const locations = Object.fromEntries(
    Object.keys(instances).map((id) => [id, state.locations[id]]),
  );
  const rotations = { ...state.rotations };
  const offsets = { ...state.offsets };
  const stationSources = { ...session.stationSources };
  const instanceHomes = { ...session.instanceHomes };
  const previousSourceId = stationSources[slotId];
  const previousSourceHasStrokes = state.strokes.some(
    ({ layerId }) => layerId === previousSourceId,
  );
  if (
    !previousSourceHasStrokes
    && instances[previousSourceId]
    && locations[previousSourceId]?.kind === "bin"
    && locations[previousSourceId]?.slotId === slotId
  ) {
    delete instances[previousSourceId];
    delete locations[previousSourceId];
    delete rotations[previousSourceId];
    delete offsets[previousSourceId];
  }

  const allocated = allocateInstanceId(instances, contentId, state.nextInstanceSequence);
  const sourceId = allocated.instanceId;
  instances[sourceId] = contentId;
  locations[sourceId] = { kind: "bin", slotId };
  rotations[sourceId] = 0;
  offsets[sourceId] = { x: 0, z: 0 };
  stationSources[slotId] = sourceId;
  instanceHomes[sourceId] = slotId;

  return buildState({
    ...bareSnapshot(state),
    instances,
    locations,
    rotations,
    offsets,
    binSources: deriveStationBinSources(stationContents, stationSources),
    nextInstanceSequence: allocated.nextInstanceSequence,
  }, history, state.referenceRecipeId, {
    stationContents,
    stationSources,
    instanceHomes,
  });
}

export function placeSoloLayer(
  state,
  layerId,
  targetIndex = state.assembledOrder.length,
  { replenish = false } = {},
) {
  requireEditable(state);
  const ingredientId = requireInstance(state, layerId);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > state.assembledOrder.length) {
    throw new TypeError("targetIndex must be a valid stack insertion index");
  }
  const alreadyAssembled = state.assembledOrder.includes(layerId);
  if (!alreadyAssembled && state.assembledOrder.length >= MAX_SOLO_STACK_LAYERS) {
    throw new Error(`A burger can contain at most ${MAX_SOLO_STACK_LAYERS} layers`);
  }
  const order = state.assembledOrder.filter((id) => id !== layerId);
  const adjustedIndex = Math.min(targetIndex, order.length);
  order.splice(adjustedIndex, 0, layerId);
  const instances = { ...state.instances };
  const locations = Object.fromEntries(Object.keys(instances).map((id) => [id, state.locations[id]]));
  const rotations = { ...state.rotations };
  const offsets = { ...state.offsets };
  let binSources = { ...state.binSources };
  const inventory = { ...state.inventory };
  const session = stationSession(state);
  const stationSources = session ? { ...session.stationSources } : null;
  const instanceHomes = session ? { ...session.instanceHomes } : null;
  let nextInstanceSequence = state.nextInstanceSequence;
  const sourceSlotId = state.locations[layerId]?.kind === "bin"
    ? state.locations[layerId].slotId
    : undefined;
  const isExplicitStationSource = session
    && typeof sourceSlotId === "string"
    && stationSources[sourceSlotId] === layerId;
  if (replenish && !alreadyAssembled && isExplicitStationSource) {
    const allocated = allocateInstanceId(instances, ingredientId, nextInstanceSequence);
    const replacementId = allocated.instanceId;
    nextInstanceSequence = allocated.nextInstanceSequence;
    instances[replacementId] = ingredientId;
    locations[replacementId] = { kind: "bin", slotId: sourceSlotId };
    rotations[replacementId] = 0;
    offsets[replacementId] = { x: 0, z: 0 };
    stationSources[sourceSlotId] = replacementId;
    instanceHomes[layerId] = sourceSlotId;
    instanceHomes[replacementId] = sourceSlotId;
    inventory[ingredientId] = Math.max(0, inventory[ingredientId] - 1);
    binSources = deriveStationBinSources(session.stationContents, stationSources);
  } else if (
    !session
    && replenish
    && !alreadyAssembled
    && binSources[ingredientId] === layerId
  ) {
    const allocated = allocateInstanceId(instances, ingredientId, nextInstanceSequence);
    const replacementId = allocated.instanceId;
    nextInstanceSequence = allocated.nextInstanceSequence;
    instances[replacementId] = ingredientId;
    locations[replacementId] = {
      kind: "bin",
      index: SOLO_BURGER_INGREDIENT_IDS.indexOf(ingredientId),
    };
    rotations[replacementId] = 0;
    offsets[replacementId] = { x: 0, z: 0 };
    binSources[ingredientId] = replacementId;
    inventory[ingredientId] = Math.max(0, inventory[ingredientId] - 1);
  }
  order.forEach((id, index) => { locations[id] = { kind: "prep", index }; });
  return edited(state, {
    assembledOrder: order,
    instances,
    locations,
    rotations,
    offsets,
    binSources,
    inventory,
    nextInstanceSequence,
    finished: false,
    ...(session ? {
      stationContents: session.stationContents,
      stationSources,
      instanceHomes,
    } : {}),
  });
}

export function removeSoloLayer(
  state,
  layerId,
  { consolidate = false, targetSlotId } = {},
) {
  requireEditable(state);
  const ingredientId = requireInstance(state, layerId);
  if (state.locations[layerId].kind === "bin") return state;
  const order = state.assembledOrder.filter((id) => id !== layerId);
  const instances = { ...state.instances };
  const locations = Object.fromEntries(Object.keys(instances).map((id) => [id, state.locations[id]]));
  const rotations = { ...state.rotations };
  const offsets = { ...state.offsets };
  let binSources = { ...state.binSources };
  const inventory = { ...state.inventory };
  const session = stationSession(state);
  const stationContents = session ? { ...session.stationContents } : null;
  const stationSources = session ? { ...session.stationSources } : null;
  const instanceHomes = session ? { ...session.instanceHomes } : null;
  let strokes = state.strokes;
  let stationSessionChanged = false;
  const returnedId = layerId;
  const homeSlotId = session ? instanceHomes[returnedId] : undefined;
  let returnSlotId = homeSlotId;
  if (targetSlotId !== undefined) {
    if (!session || typeof homeSlotId !== "string") {
      throw new TypeError("A target station slot requires explicit loadout mode");
    }
    const homeSlot = getWorkbenchSlot(homeSlotId);
    const targetSlot = getWorkbenchSlot(targetSlotId);
    if (
      targetSlot.region === "sauce"
      || targetSlot.region !== homeSlot.region
      || !WORKBENCH_REGION_OPTIONS[targetSlot.region].includes(ingredientId)
    ) {
      throw new TypeError("Returned ingredients must stay within their station region");
    }
    returnSlotId = targetSlotId;
  }
  if (
    consolidate
    && session
    && typeof returnSlotId === "string"
    && INGREDIENT_STATION_SLOT_IDS.has(returnSlotId)
  ) {
    const previousSourceId = stationSources[returnSlotId];
    if (
      previousSourceId !== returnedId
      && instances[previousSourceId]
      && locations[previousSourceId]?.kind === "bin"
      && locations[previousSourceId]?.slotId === returnSlotId
    ) {
      delete instances[previousSourceId];
      delete locations[previousSourceId];
      delete rotations[previousSourceId];
      delete offsets[previousSourceId];
      strokes = strokes.filter((stroke) => stroke.layerId !== previousSourceId);
    }
    stationContents[returnSlotId] = ingredientId;
    stationSources[returnSlotId] = returnedId;
    instanceHomes[returnedId] = returnSlotId;
    stationSessionChanged = true;
    locations[returnedId] = { kind: "bin", slotId: returnSlotId };
    binSources = deriveStationBinSources(stationContents, stationSources);
    inventory[ingredientId] = Math.min(SOLO_INGREDIENT_STOCK, inventory[ingredientId] + 1);
  } else if (consolidate && binSources[ingredientId] !== layerId) {
    const previousSourceId = binSources[ingredientId];
    delete instances[previousSourceId];
    delete locations[previousSourceId];
    delete rotations[previousSourceId];
    delete offsets[previousSourceId];
    strokes = strokes.filter((stroke) => stroke.layerId !== previousSourceId);
    binSources[ingredientId] = returnedId;
    inventory[ingredientId] = Math.min(SOLO_INGREDIENT_STOCK, inventory[ingredientId] + 1);
  }
  if (instances[returnedId]) {
    offsets[returnedId] = { x: 0, z: 0 };
    locations[returnedId] = session && typeof returnSlotId === "string"
      ? { kind: "bin", slotId: returnSlotId }
      : {
        kind: "bin",
        index: SOLO_BURGER_INGREDIENT_IDS.indexOf(ingredientId),
      };
  }
  order.forEach((id, index) => { locations[id] = { kind: "prep", index }; });
  return edited(state, {
    assembledOrder: order,
    instances,
    locations,
    rotations,
    offsets,
    binSources,
    inventory,
    strokes,
    finished: false,
    ...(session ? {
      stationContents,
      stationSources,
      instanceHomes,
    } : {}),
  }, { preservePreviousStation: stationSessionChanged });
}

export function rotateSoloLayer(state, layerId, yaw) {
  requireEditable(state);
  requireInstance(state, layerId);
  const raw = finite(yaw, "yaw");
  const normalized = Math.atan2(Math.sin(raw), Math.cos(raw));
  return edited(state, { rotations: { ...state.rotations, [layerId]: normalized } });
}

export function moveSoloLayer(state, layerId, offset, { maxRadius = 1.45 } = {}) {
  requireEditable(state);
  requireInstance(state, layerId);
  if (!state.assembledOrder.includes(layerId)) {
    throw new TypeError("Only assembled layers can be moved");
  }
  const x = finite(offset?.x, "offset.x");
  const z = finite(offset?.z, "offset.z");
  const radius = finite(maxRadius, "maxRadius");
  if (radius <= 0) throw new TypeError("maxRadius must be positive");
  const length = Math.hypot(x, z);
  const scale = length > radius ? radius / length : 1;
  return edited(state, {
    offsets: {
      ...state.offsets,
      [layerId]: { x: x * scale, z: z * scale },
    },
  });
}

export function reorderSoloLayer(state, layerId, direction) {
  requireEditable(state);
  requireInstance(state, layerId);
  if (direction !== -1 && direction !== 1) {
    throw new TypeError("direction must be -1 or 1");
  }
  const from = state.assembledOrder.indexOf(layerId);
  if (from < 0) throw new TypeError("Only assembled layers can be reordered");
  const target = from + direction;
  if (target < 0 || target >= state.assembledOrder.length) return state;
  return placeSoloLayer(state, layerId, target);
}

export function addSoloSauceStroke(state, stroke) {
  return addSoloSauceStrokes(state, [stroke]);
}

export function addSoloSauceStrokes(state, strokes) {
  requireEditable(state);
  if (!Array.isArray(strokes) || !strokes.length) {
    throw new TypeError("strokes must be a non-empty array");
  }
  const normalized = strokes.map((stroke) => freezeStroke(stroke, state.instances));
  return edited(state, { strokes: [...state.strokes, ...normalized].slice(-MAX_STROKES) });
}

export function finishSoloCooking(state) {
  requireEditable(state);
  if (!state.complete) throw new Error("至少放上 2 层食材后才能完成料理");
  return edited(state, { finished: true });
}

export function continueSoloCooking(state) {
  if (!state.finished) return state;
  return edited(state, { finished: false });
}

export function undoSoloCooking(state) {
  if (!state.history.length) return state;
  const previous = state.history[state.history.length - 1];
  const previousSession = stationSession(previous) ?? stationSession(state);
  return buildState(
    previous,
    state.history.slice(0, -1),
    state.referenceRecipeId,
    previousSession,
    { reconcileStations: Boolean(previousSession) },
  );
}

export function resetSoloCookingState(state) {
  return createSoloCookingState({
    referenceRecipeId: state?.referenceRecipeId ?? null,
    ...(state?.stationContents ? { loadout: state.stationContents } : {}),
  });
}

export function serializeSoloComposition(state) {
  const remaining = Object.keys(state.instances).filter((id) => !state.assembledOrder.includes(id));
  return {
    food: "burger",
    layerOrder: [...state.assembledOrder, ...remaining],
    layerTypes: { ...state.instances },
    layerPoses: Object.fromEntries(Object.keys(state.instances).map((id) => [
      id, {
        x: state.offsets?.[id]?.x ?? 0,
        z: state.offsets?.[id]?.z ?? 0,
        yaw: state.rotations[id],
      },
    ])),
    strokes: state.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => [...point]),
    })),
  };
}
