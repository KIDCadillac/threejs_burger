const clamp01 = (value) => Math.min(1, Math.max(0, value));

const finite = (value, fallback = 0) => (
  Number.isFinite(value) ? value : fallback
);

const SAFE_STABILITY = Object.freeze({
  level: "safe",
  risk: 0,
  centerX: 0,
  centerZ: 0,
  directionX: 0,
  directionZ: 0,
  maxShear: 0,
  heightFactor: 0,
  amplitude: 0,
  frequency: 0,
});

export function analyzeCookingStackStability(layers = []) {
  if (!Array.isArray(layers) || layers.length < 2) return SAFE_STABILITY;

  const normalized = layers.map((layer) => ({
    x: finite(layer?.x),
    z: finite(layer?.z),
    mass: Math.max(0.05, finite(layer?.mass, 0.5)),
    radius: Math.max(0.35, finite(layer?.radius, 0.82)),
  }));
  const totalMass = normalized.reduce((sum, layer) => sum + layer.mass, 0);
  const centerX = normalized.reduce((sum, layer) => sum + layer.x * layer.mass, 0) / totalMass;
  const centerZ = normalized.reduce((sum, layer) => sum + layer.z * layer.mass, 0) / totalMass;
  const centerDistance = Math.hypot(centerX, centerZ);
  let maxShear = 0;

  for (let supportIndex = 0; supportIndex < normalized.length - 1; supportIndex += 1) {
    const upper = normalized.slice(supportIndex + 1);
    const upperMass = upper.reduce((sum, layer) => sum + layer.mass, 0);
    const upperX = upper.reduce((sum, layer) => sum + layer.x * layer.mass, 0) / upperMass;
    const upperZ = upper.reduce((sum, layer) => sum + layer.z * layer.mass, 0) / upperMass;
    const support = normalized[supportIndex];
    const shear = Math.hypot(upperX - support.x, upperZ - support.z) / support.radius;
    maxShear = Math.max(maxShear, shear);
  }

  const heightFactor = clamp01((normalized.length - 2) / 5);
  const centerRisk = centerDistance / 0.72;
  const rawRisk = (centerRisk * 0.48 + maxShear * 0.72) * (0.72 + heightFactor * 0.5);
  const risk = Math.max(0, rawRisk);
  const level = risk >= 0.88 ? "critical" : risk >= 0.5 ? "warning" : "safe";
  const directionLength = centerDistance > 0.001
    ? centerDistance
    : Math.hypot(
      normalized.at(-1).x - normalized[0].x,
      normalized.at(-1).z - normalized[0].z,
    );
  const fallbackX = normalized.at(-1).x - normalized[0].x;
  const fallbackZ = normalized.at(-1).z - normalized[0].z;
  const directionX = directionLength > 0.001
    ? (centerDistance > 0.001 ? centerX : fallbackX) / directionLength
    : 0;
  const directionZ = directionLength > 0.001
    ? (centerDistance > 0.001 ? centerZ : fallbackZ) / directionLength
    : 0;
  const strength = clamp01((risk - 0.42) / 0.72);

  return Object.freeze({
    level,
    risk,
    centerX,
    centerZ,
    directionX,
    directionZ,
    maxShear,
    heightFactor,
    amplitude: level === "safe" ? 0 : 0.012 + strength * 0.052,
    frequency: level === "critical" ? 0.021 : 0.013,
  });
}

export function sampleCookingStackWobble(analysis, now, startedAt = 0) {
  if (!analysis || analysis.level === "safe" || !Number.isFinite(now)) {
    return Object.freeze({ offsetX: 0, offsetZ: 0, rotationX: 0, rotationZ: 0 });
  }
  const elapsed = Math.max(0, now - finite(startedAt));
  const pulse = Math.sin(elapsed * analysis.frequency);
  const counterPulse = Math.sin(elapsed * analysis.frequency * 1.71 + 0.8);
  const amplitude = analysis.amplitude;
  return Object.freeze({
    offsetX: analysis.directionX * amplitude * 0.3 + pulse * amplitude * 0.22,
    offsetZ: analysis.directionZ * amplitude * 0.24 + counterPulse * amplitude * 0.16,
    rotationX: analysis.directionZ * amplitude + counterPulse * amplitude * 0.42,
    rotationZ: -analysis.directionX * amplitude + pulse * amplitude * 0.48,
  });
}

export function sampleCookingCollapseLayer({
  index = 0,
  count = 1,
  elapsedMs = 0,
  directionX = 1,
  directionZ = 0,
  durationMs = 880,
} = {}) {
  const progress = clamp01(finite(elapsedMs) / Math.max(1, finite(durationMs, 880)));
  const rank = count <= 1 ? 1 : index / (count - 1);
  const side = index % 2 === 0 ? -1 : 1;
  const outward = 0.82 + rank * 1.28;
  const perpendicularX = -directionZ * side;
  const perpendicularZ = directionX * side;
  const hop = Math.sin(Math.PI * progress) * (0.34 + rank * 0.48);
  const fall = progress ** 2 * (1.28 + rank * 0.72);
  return Object.freeze({
    progress,
    offsetX: (directionX * outward + perpendicularX * (0.22 + rank * 0.28)) * progress,
    offsetZ: (directionZ * outward + perpendicularZ * (0.22 + rank * 0.28)) * progress,
    offsetY: hop - fall,
    rotationX: side * progress * (0.55 + rank * 0.8),
    rotationZ: -directionX * progress * (0.7 + rank * 1.15),
    done: progress >= 1,
  });
}
