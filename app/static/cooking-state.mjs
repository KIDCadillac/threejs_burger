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

const detachStroke = (stroke) => ({
  ...stroke,
  points: stroke.points.map((point) => [...point]),
});

const assertLayerId = (layerId) => {
  if (!BURGER_LAYER_IDS.includes(layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
};

export function createCookingState() {
  const layers = BURGER_LAYER_IDS.map((id, order) => Object.freeze({
    id,
    order,
    pose: Object.freeze({ x: 0, z: 0, yaw: 0 }),
  }));
  return Object.freeze({
    food: "burger",
    expanded: false,
    layers: Object.freeze(layers),
    strokes: Object.freeze([]),
  });
}

export function moveLayer(state, layerId, pose) {
  assertLayerId(layerId);
  const layer = state.layers.find(({ id }) => id === layerId);

  if (!layer) {
    throw new TypeError(`State does not contain burger layer: ${layerId}`);
  }

  const movedLayer = Object.freeze({
    ...layer,
    pose: Object.freeze({
      x: clampFiniteNumber(pose?.x, -1, 1),
      z: clampFiniteNumber(pose?.z, -1, 1),
      yaw: clampFiniteNumber(pose?.yaw, -Math.PI, Math.PI),
    }),
  });
  return Object.freeze({
    ...state,
    layers: Object.freeze(
      state.layers.map((item) => (item === layer ? movedLayer : item)),
    ),
  });
}

export function reorderLayer(state, layerId, targetIndex) {
  assertLayerId(layerId);
  const ordered = [...state.layers].sort((left, right) => left.order - right.order);
  const sourceIndex = ordered.findIndex(({ id }) => id === layerId);

  if (sourceIndex === -1) {
    throw new TypeError(`State does not contain burger layer: ${layerId}`);
  }

  const [selectedLayer] = ordered.splice(sourceIndex, 1);
  const insertionIndex = Math.round(clampFiniteNumber(targetIndex, 0, ordered.length));
  ordered.splice(insertionIndex, 0, selectedLayer);
  return Object.freeze({
    ...state,
    layers: Object.freeze(ordered.map((layer, order) => (
      layer.order === order ? layer : Object.freeze({ ...layer, order })
    ))),
  });
}

export function addSauceStroke(state, stroke) {
  if (!SAUCE_KEYS.includes(stroke?.sauce)) {
    throw new TypeError(`Unknown sauce: ${String(stroke?.sauce)}`);
  }
  assertLayerId(stroke?.layerId);

  const validPoints = Array.isArray(stroke.points)
    ? stroke.points.filter((point) => Array.isArray(point) && point.length === 2)
    : [];
  if (validPoints.length < 2) {
    throw new TypeError("Sauce strokes require at least two valid points");
  }

  const points = Object.freeze(validPoints.slice(0, MAX_POINTS).map((point) => (
    Object.freeze([
      clampFiniteNumber(point?.[0], -1, 1),
      clampFiniteNumber(point?.[1], -1, 1),
    ])
  )));
  const nextStroke = Object.freeze({
    sauce: stroke.sauce,
    layerId: stroke.layerId,
    amount: clampFiniteNumber(stroke.amount, 0.01, 1),
    points,
  });
  return Object.freeze({
    ...state,
    strokes: Object.freeze([...state.strokes, nextStroke].slice(-MAX_STROKES)),
  });
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
    strokes: state.strokes.map(detachStroke),
  };
}
