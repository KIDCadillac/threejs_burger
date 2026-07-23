export const COMPETITION_MODEL_VERSION = "burger-model:2026-07-22";

const VALIDATION_MESSAGES = Object.freeze({
  valid: "原作合格，可以交给对手复刻",
  "snapshot-invalid": "原作数据异常，请重新制作",
  "layer-count": "原作需要刚好 8 层食材",
  "bottom-bun": "第一层必须是下层面包",
  "top-bun": "最后一层必须是上层面包",
  "filling-variety": "中间需要至少 3 种不同夹料",
  "sauce-required": "原作至少需要使用 1 种酱料",
});

const validation = (code) => Object.freeze({
  valid: code === "valid",
  code,
  message: VALIDATION_MESSAGES[code],
});

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function freezePoint(point, label) {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new TypeError(`${label} must be an [x, z] pair`);
  }
  return Object.freeze([
    finite(point[0], `${label}[0]`),
    finite(point[1], `${label}[1]`),
  ]);
}

function gridCell(value) {
  return Math.min(5, Math.max(0, Math.floor((value + 1) * 3)));
}

function coverageCells(points) {
  const cells = new Set();
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])) * 18),
    );
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const x = start[0] + (end[0] - start[0]) * progress;
      const z = start[1] + (end[1] - start[1]) * progress;
      cells.add(`${gridCell(x)}:${gridCell(z)}`);
    }
  }
  return Object.freeze([...cells].sort());
}

export function createReplicaCompetitionSnapshot(state, {
  modelVersion = COMPETITION_MODEL_VERSION,
  placementRadii = {},
} = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("state must be a solo cooking state");
  }
  if (!Array.isArray(state.assembledOrder)) {
    throw new TypeError("state.assembledOrder must be an array");
  }
  if (!state.instances || typeof state.instances !== "object") {
    throw new TypeError("state.instances must be an object");
  }
  if (typeof modelVersion !== "string" || !modelVersion) {
    throw new TypeError("modelVersion must be a non-empty string");
  }

  const layers = state.assembledOrder.map((layerId, index) => {
    const ingredientId = state.instances[layerId];
    if (typeof layerId !== "string" || typeof ingredientId !== "string") {
      throw new TypeError(`assembled layer ${index} is invalid`);
    }
    const offset = state.offsets?.[layerId] ?? { x: 0, z: 0 };
    const configuredRadius = Number(placementRadii[ingredientId]);
    return Object.freeze({
      layerId,
      ingredientId,
      x: finite(offset.x ?? 0, `offsets.${layerId}.x`),
      z: finite(offset.z ?? 0, `offsets.${layerId}.z`),
      yaw: finite(state.rotations?.[layerId] ?? 0, `rotations.${layerId}`),
      placementRadius: Number.isFinite(configuredRadius) && configuredRadius > 0
        ? configuredRadius
        : 1,
    });
  });
  const layerIndices = new Map(layers.map(({ layerId }, index) => [layerId, index]));
  const strokes = (state.strokes ?? []).map((stroke, index) => {
    const targetLayerIndex = layerIndices.get(stroke?.layerId);
    if (!Number.isInteger(targetLayerIndex)) {
      throw new TypeError(`stroke ${index} must target an assembled layer`);
    }
    if (typeof stroke.sauce !== "string" || !stroke.sauce) {
      throw new TypeError(`stroke ${index}.sauce must be a string`);
    }
    const points = Object.freeze((stroke.points ?? []).map((point, pointIndex) => (
      freezePoint(point, `strokes[${index}].points[${pointIndex}]`)
    )));
    if (points.length < 2) throw new TypeError(`stroke ${index} must contain at least 2 points`);
    return Object.freeze({
      sauceId: stroke.sauce,
      targetLayerIndex,
      amount: finite(stroke.amount, `strokes[${index}].amount`),
      points,
      cells: coverageCells(points),
    });
  });

  return Object.freeze({
    version: 1,
    modelVersion,
    food: "burger",
    layers: Object.freeze(layers),
    strokes: Object.freeze(strokes),
  });
}

export function validateReplicaOriginal(snapshot) {
  if (!snapshot || snapshot.food !== "burger" || !Array.isArray(snapshot.layers)
    || !Array.isArray(snapshot.strokes)) {
    return validation("snapshot-invalid");
  }
  if (snapshot.layers.length !== 8) return validation("layer-count");
  if (snapshot.layers[0]?.ingredientId !== "bottom-bun") return validation("bottom-bun");
  if (snapshot.layers[7]?.ingredientId !== "top-bun") return validation("top-bun");
  const fillingTypes = new Set(
    snapshot.layers.slice(1, -1).map(({ ingredientId }) => ingredientId),
  );
  if (fillingTypes.size < 3) return validation("filling-variety");
  if (snapshot.strokes.length < 1) return validation("sauce-required");
  return validation("valid");
}

export function createReplicaPublicSummary(snapshot) {
  const result = validateReplicaOriginal(snapshot);
  return Object.freeze({
    version: Number(snapshot?.version) || 1,
    modelVersion: typeof snapshot?.modelVersion === "string"
      ? snapshot.modelVersion
      : COMPETITION_MODEL_VERSION,
    layerCount: Array.isArray(snapshot?.layers) ? snapshot.layers.length : 0,
    sauceStrokeCount: Array.isArray(snapshot?.strokes) ? snapshot.strokes.length : 0,
    valid: result.valid,
  });
}
