export const BURGER_LAYER_IDS = Object.freeze([
  "bottom-bun",
  "patty",
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "top-bun",
]);

export const SAUCE_KEYS = Object.freeze(["chili", "mustard", "sour", "sticky"]);

const MAX_STROKES = 64;
const MAX_POINTS = 24;

const clampFiniteNumber = (value, minimum, maximum) => {
  const finiteValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const clampedValue = Math.min(maximum, Math.max(minimum, finiteValue));
  return Object.is(clampedValue, -0) ? 0 : clampedValue;
};

const copyStroke = (stroke) => ({
  ...stroke,
  points: stroke.points.map((point) => [...point]),
});

const copyState = (state) => ({
  ...state,
  layers: state.layers.map((layer) => ({
    ...layer,
    pose: { ...layer.pose },
  })),
  strokes: state.strokes.map(copyStroke),
});

const assertLayerId = (layerId) => {
  if (!BURGER_LAYER_IDS.includes(layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
};

export function createCookingState() {
  return {
    food: "burger",
    expanded: false,
    layers: BURGER_LAYER_IDS.map((id, order) => ({
      id,
      order,
      pose: { x: 0, z: 0, yaw: 0 },
    })),
    strokes: [],
  };
}

export function moveLayer(state, layerId, pose) {
  assertLayerId(layerId);
  const next = copyState(state);
  const layer = next.layers.find(({ id }) => id === layerId);

  if (!layer) {
    throw new TypeError(`State does not contain burger layer: ${layerId}`);
  }

  layer.pose = {
    x: clampFiniteNumber(pose?.x, -1, 1),
    z: clampFiniteNumber(pose?.z, -1, 1),
    yaw: clampFiniteNumber(pose?.yaw, -Math.PI, Math.PI),
  };
  return next;
}

export function reorderLayer(state, layerId, targetIndex) {
  assertLayerId(layerId);
  const next = copyState(state);
  const ordered = next.layers.sort((left, right) => left.order - right.order);
  const sourceIndex = ordered.findIndex(({ id }) => id === layerId);

  if (sourceIndex === -1) {
    throw new TypeError(`State does not contain burger layer: ${layerId}`);
  }

  const [selectedLayer] = ordered.splice(sourceIndex, 1);
  const insertionIndex = Math.round(clampFiniteNumber(targetIndex, 0, ordered.length));
  ordered.splice(insertionIndex, 0, selectedLayer);
  next.layers = ordered.map((layer, order) => ({ ...layer, order }));
  return next;
}

export function addSauceStroke(state, stroke) {
  if (!SAUCE_KEYS.includes(stroke?.sauce)) {
    throw new TypeError(`Unknown sauce: ${String(stroke?.sauce)}`);
  }
  assertLayerId(stroke?.layerId);

  const next = copyState(state);
  next.strokes.push({
    sauce: stroke.sauce,
    layerId: stroke.layerId,
    amount: clampFiniteNumber(stroke.amount, 0.01, 1),
    points: stroke.points.slice(0, MAX_POINTS).map((point) => [
      clampFiniteNumber(point?.[0], -1, 1),
      clampFiniteNumber(point?.[1], -1, 1),
    ]),
  });
  next.strokes = next.strokes.slice(-MAX_STROKES);
  return next;
}

export function serializeComposition(state) {
  return {
    food: "burger",
    layerOrder: [...state.layers]
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id),
    layerPoses: Object.fromEntries(
      state.layers.map(({ id, pose }) => [id, { ...pose }]),
    ),
    strokes: state.strokes.map(copyStroke),
  };
}
