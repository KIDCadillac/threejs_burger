import { BURGER_LAYER_IDS, SAUCE_KEYS } from "./cooking-state.mjs";

const MAX_HISTORY = 32;
const MAX_STROKES = 64;
const MAX_POINTS = 24;

function requireLayer(layerId) {
  if (!BURGER_LAYER_IDS.includes(layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
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

function freezeStroke(stroke) {
  if (!SAUCE_KEYS.includes(stroke?.sauce)) {
    throw new TypeError(`Unknown sauce: ${String(stroke?.sauce)}`);
  }
  requireLayer(stroke?.layerId);
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

function freezeLocations(locations) {
  return Object.freeze(Object.fromEntries(BURGER_LAYER_IDS.map((id) => [
    id,
    Object.freeze({ ...locations[id] }),
  ])));
}

function freezeRotations(rotations) {
  return Object.freeze(Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, rotations[id]])));
}

function bareSnapshot(state) {
  return Object.freeze({
    assembledOrder: Object.freeze([...state.assembledOrder]),
    locations: freezeLocations(state.locations),
    rotations: freezeRotations(state.rotations),
    strokes: Object.freeze(state.strokes.map((stroke) => freezeStroke(stroke))),
    finished: Boolean(state.finished),
  });
}

function buildState(snapshot, history = []) {
  const assembledOrder = Object.freeze([...snapshot.assembledOrder]);
  return Object.freeze({
    assembledOrder,
    locations: freezeLocations(snapshot.locations),
    rotations: freezeRotations(snapshot.rotations),
    strokes: Object.freeze(snapshot.strokes.map((stroke) => freezeStroke(stroke))),
    complete: assembledOrder.length === BURGER_LAYER_IDS.length,
    finished: Boolean(snapshot.finished),
    history: Object.freeze([...history]),
  });
}

function edited(state, changes) {
  const history = [...state.history, bareSnapshot(state)].slice(-MAX_HISTORY);
  return buildState({ ...bareSnapshot(state), ...changes }, history);
}

export function createSoloCookingState() {
  return buildState({
    assembledOrder: [],
    locations: Object.fromEntries(BURGER_LAYER_IDS.map((id, index) => [
      id, { kind: "bin", index },
    ])),
    rotations: Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, 0])),
    strokes: [],
    finished: false,
  });
}

export function placeSoloLayer(state, layerId, targetIndex = state.assembledOrder.length) {
  requireEditable(state);
  requireLayer(layerId);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > state.assembledOrder.length) {
    throw new TypeError("targetIndex must be a valid stack insertion index");
  }
  const order = state.assembledOrder.filter((id) => id !== layerId);
  const adjustedIndex = Math.min(targetIndex, order.length);
  order.splice(adjustedIndex, 0, layerId);
  const locations = Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, state.locations[id]]));
  order.forEach((id, index) => { locations[id] = { kind: "prep", index }; });
  return edited(state, { assembledOrder: order, locations, finished: false });
}

export function removeSoloLayer(state, layerId) {
  requireEditable(state);
  requireLayer(layerId);
  if (state.locations[layerId].kind === "bin") return state;
  const order = state.assembledOrder.filter((id) => id !== layerId);
  const locations = Object.fromEntries(BURGER_LAYER_IDS.map((id) => [id, state.locations[id]]));
  locations[layerId] = { kind: "bin", index: BURGER_LAYER_IDS.indexOf(layerId) };
  order.forEach((id, index) => { locations[id] = { kind: "prep", index }; });
  return edited(state, { assembledOrder: order, locations, finished: false });
}

export function rotateSoloLayer(state, layerId, yaw) {
  requireEditable(state);
  requireLayer(layerId);
  const raw = finite(yaw, "yaw");
  const normalized = Math.atan2(Math.sin(raw), Math.cos(raw));
  return edited(state, { rotations: { ...state.rotations, [layerId]: normalized } });
}

export function addSoloSauceStroke(state, stroke) {
  requireEditable(state);
  const normalized = freezeStroke(stroke);
  return edited(state, { strokes: [...state.strokes, normalized].slice(-MAX_STROKES) });
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
  const remaining = BURGER_LAYER_IDS.filter((id) => !state.assembledOrder.includes(id));
  return {
    food: "burger",
    layerOrder: [...state.assembledOrder, ...remaining],
    layerPoses: Object.fromEntries(BURGER_LAYER_IDS.map((id) => [
      id, { x: 0, z: 0, yaw: state.rotations[id] },
    ])),
    strokes: state.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => [...point]),
    })),
  };
}
