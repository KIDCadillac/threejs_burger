const BOUND_KEYS = Object.freeze(["minX", "maxX", "minZ", "maxZ"]);

function copyBounds(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const result = {};
  for (const key of BOUND_KEYS) {
    if (!Number.isFinite(value[key])) throw new TypeError(`${label}.${key} must be finite`);
    result[key] = value[key];
  }
  if (result.minX > result.maxX || result.minZ > result.maxZ) {
    throw new TypeError(`${label} minimums must not exceed maximums`);
  }
  return result;
}

function contains(bounds, point) {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

export function resolveSoloLayerDrop({
  point,
  prepBounds,
  homeBounds,
  assembledCount,
  magnetPadding = 0.36,
} = {}) {
  if (!point || typeof point !== "object" || Array.isArray(point)
    || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    throw new TypeError("point must contain finite x and z coordinates");
  }
  const prep = copyBounds(prepBounds, "prepBounds");
  const home = copyBounds(homeBounds, "homeBounds");
  if (!Number.isInteger(assembledCount) || assembledCount < 0) {
    throw new TypeError("assembledCount must be a non-negative integer");
  }
  if (!Number.isFinite(magnetPadding) || magnetPadding < 0) {
    throw new TypeError("magnetPadding must be a non-negative finite number");
  }

  if (contains(prep, point)) {
    const slotCount = assembledCount + 1;
    const normalizedDepth = (prep.maxZ - point.z) / (prep.maxZ - prep.minZ);
    const targetIndex = Math.max(
      0,
      Math.min(assembledCount, Math.floor(normalizedDepth * slotCount)),
    );
    return Object.freeze({
      kind: "prep",
      intent: "insert",
      targetIndex,
      slotCount,
    });
  }

  const magneticHome = {
    minX: home.minX - magnetPadding,
    maxX: home.maxX + magnetPadding,
    minZ: home.minZ - magnetPadding,
    maxZ: home.maxZ + magnetPadding,
  };
  if (contains(magneticHome, point)) {
    return Object.freeze({ kind: "bin", intent: "home", targetIndex: null });
  }
  return Object.freeze({ kind: "invalid", intent: "invalid", targetIndex: null });
}
