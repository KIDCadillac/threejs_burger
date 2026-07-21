import { BURGER_LAYER_IDS, SAUCE_KEYS } from "./cooking-state.mjs";

const MAX_HISTORY = 32;
const MAX_STROKES = 64;
const MAX_POINTS = 24;
export const MAX_SOLO_STACK_LAYERS = 20;
export const SOLO_INGREDIENT_STOCK = 999;

function requireLayer(layerId) {
  if (!BURGER_LAYER_IDS.includes(layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
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
  if (!SAUCE_KEYS.includes(stroke?.sauce)) {
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

function freezeInstances(instances) {
  return Object.freeze({ ...instances });
}

function freezeIngredientRecord(record) {
  return Object.freeze(Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, record[id]])));
}

function bareSnapshot(state) {
  return Object.freeze({
    assembledOrder: Object.freeze([...state.assembledOrder]),
    instances: freezeInstances(state.instances),
    locations: freezeLocations(state.locations, state.instances),
    rotations: freezeRotations(state.rotations, state.instances),
    binSources: freezeIngredientRecord(state.binSources),
    inventory: freezeIngredientRecord(state.inventory),
    nextInstanceSequence: state.nextInstanceSequence,
    strokes: Object.freeze(state.strokes.map((stroke) => freezeStroke(stroke, state.instances))),
    finished: Boolean(state.finished),
  });
}

function buildState(snapshot, history = []) {
  const assembledOrder = Object.freeze([...snapshot.assembledOrder]);
  const instances = freezeInstances(snapshot.instances);
  return Object.freeze({
    assembledOrder,
    instances,
    locations: freezeLocations(snapshot.locations, instances),
    rotations: freezeRotations(snapshot.rotations, instances),
    binSources: freezeIngredientRecord(snapshot.binSources),
    inventory: freezeIngredientRecord(snapshot.inventory),
    nextInstanceSequence: snapshot.nextInstanceSequence,
    strokes: Object.freeze(snapshot.strokes.map((stroke) => freezeStroke(stroke, instances))),
    complete: assembledOrder.length >= BURGER_LAYER_IDS.length,
    finished: Boolean(snapshot.finished),
    history: Object.freeze([...history]),
  });
}

function edited(state, changes) {
  const history = [...state.history, bareSnapshot(state)].slice(-MAX_HISTORY);
  return buildState({ ...bareSnapshot(state), ...changes }, history);
}

export function createSoloCookingState() {
  const instances = Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, id]));
  return buildState({
    assembledOrder: [],
    instances,
    locations: Object.fromEntries(BURGER_LAYER_IDS.map((id, index) => [
      id, { kind: "bin", index },
    ])),
    rotations: Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, 0])),
    binSources: Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, id])),
    inventory: Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, SOLO_INGREDIENT_STOCK])),
    nextInstanceSequence: 2,
    strokes: [],
    finished: false,
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
  const binSources = { ...state.binSources };
  const inventory = { ...state.inventory };
  let nextInstanceSequence = state.nextInstanceSequence;
  if (replenish && !alreadyAssembled && binSources[ingredientId] === layerId) {
    let replacementId;
    do {
      replacementId = `${ingredientId}#${nextInstanceSequence}`;
      nextInstanceSequence += 1;
    } while (instances[replacementId]);
    instances[replacementId] = ingredientId;
    locations[replacementId] = { kind: "bin", index: BURGER_LAYER_IDS.indexOf(ingredientId) };
    rotations[replacementId] = 0;
    binSources[ingredientId] = replacementId;
    inventory[ingredientId] = Math.max(0, inventory[ingredientId] - 1);
  }
  order.forEach((id, index) => { locations[id] = { kind: "prep", index }; });
  return edited(state, {
    assembledOrder: order,
    instances,
    locations,
    rotations,
    binSources,
    inventory,
    nextInstanceSequence,
    finished: false,
  });
}

export function removeSoloLayer(state, layerId, { consolidate = false } = {}) {
  requireEditable(state);
  const ingredientId = requireInstance(state, layerId);
  if (state.locations[layerId].kind === "bin") return state;
  const order = state.assembledOrder.filter((id) => id !== layerId);
  const instances = { ...state.instances };
  const locations = Object.fromEntries(Object.keys(instances).map((id) => [id, state.locations[id]]));
  const rotations = { ...state.rotations };
  const binSources = { ...state.binSources };
  const inventory = { ...state.inventory };
  let strokes = state.strokes;
  const returnedId = layerId;
  if (consolidate && binSources[ingredientId] !== layerId) {
    const previousSourceId = binSources[ingredientId];
    delete instances[previousSourceId];
    delete locations[previousSourceId];
    delete rotations[previousSourceId];
    strokes = strokes.filter((stroke) => stroke.layerId !== previousSourceId);
    binSources[ingredientId] = returnedId;
    inventory[ingredientId] = Math.min(SOLO_INGREDIENT_STOCK, inventory[ingredientId] + 1);
  }
  if (instances[returnedId]) {
    locations[returnedId] = { kind: "bin", index: BURGER_LAYER_IDS.indexOf(ingredientId) };
  }
  order.forEach((id, index) => { locations[id] = { kind: "prep", index }; });
  return edited(state, {
    assembledOrder: order,
    instances,
    locations,
    rotations,
    binSources,
    inventory,
    strokes,
    finished: false,
  });
}

export function rotateSoloLayer(state, layerId, yaw) {
  requireEditable(state);
  requireInstance(state, layerId);
  const raw = finite(yaw, "yaw");
  const normalized = Math.atan2(Math.sin(raw), Math.cos(raw));
  return edited(state, { rotations: { ...state.rotations, [layerId]: normalized } });
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
  if (!state.complete) throw new Error("All seven layers must be assembled before finishing");
  return edited(state, { finished: true });
}

export function continueSoloCooking(state) {
  if (!state.finished) return state;
  return edited(state, { finished: false });
}

export function undoSoloCooking(state) {
  if (!state.history.length) return state;
  const previous = state.history[state.history.length - 1];
  return buildState(previous, state.history.slice(0, -1));
}

export function resetSoloCookingState() {
  return createSoloCookingState();
}

export function serializeSoloComposition(state) {
  const remaining = Object.keys(state.instances).filter((id) => !state.assembledOrder.includes(id));
  return {
    food: "burger",
    layerOrder: [...state.assembledOrder, ...remaining],
    layerTypes: { ...state.instances },
    layerPoses: Object.fromEntries(Object.keys(state.instances).map((id) => [
      id, { x: 0, z: 0, yaw: state.rotations[id] },
    ])),
    strokes: state.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => [...point]),
    })),
  };
}
