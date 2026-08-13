const DURATIONS = Object.freeze({
  pick: 90,
  insert: 560,
  home: 240,
});

const KINDS = new Set(Object.keys(DURATIONS));
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const easeOutCubic = (value) => 1 - (1 - clamp01(value)) ** 3;
const easeInOutCubic = (value) => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
};

// Values describe visible cooking behaviour rather than rigid-body density.
// Soft bread spreads and settles; dense meat compresses less; sliced garnish
// transfers very little load. Every value is deterministic for repeatable QA.
export const MATERIAL_PHYSICS = Object.freeze({
  "bottom-bun": Object.freeze({ mass: 0.68, compliance: 0.145, damping: 0.78, lateralSpread: 0.52 }),
  "top-bun": Object.freeze({ mass: 0.58, compliance: 0.16, damping: 0.76, lateralSpread: 0.55 }),
  patty: Object.freeze({ mass: 1.25, compliance: 0.075, damping: 0.86, lateralSpread: 0.38 }),
  cheese: Object.freeze({ mass: 0.18, compliance: 0.12, damping: 0.9, lateralSpread: 0.64 }),
  bacon: Object.freeze({ mass: 0.22, compliance: 0.045, damping: 0.9, lateralSpread: 0.34 }),
  lettuce: Object.freeze({ mass: 0.1, compliance: 0.11, damping: 0.88, lateralSpread: 0.62 }),
  pickle: Object.freeze({ mass: 0.16, compliance: 0.028, damping: 0.93, lateralSpread: 0.24 }),
  onion: Object.freeze({ mass: 0.11, compliance: 0.035, damping: 0.92, lateralSpread: 0.28 }),
  tomato: Object.freeze({ mass: 0.26, compliance: 0.055, damping: 0.9, lateralSpread: 0.36 }),
  default: Object.freeze({ mass: 0.55, compliance: 0.07, damping: 0.87, lateralSpread: 0.4 }),
});

export function getCookingMaterialPhysics(ingredientId) {
  return MATERIAL_PHYSICS[ingredientId] ?? MATERIAL_PHYSICS.default;
}

const settled = Object.freeze({
  phase: "settled",
  progress: 1,
  arrival: 1,
  verticalArrival: 1,
  selectedOffsetY: 0,
  upperOffsetY: 0,
  supportCompression: 0,
  supportLoad: 0,
  selectedScaleXz: 1,
  selectedScaleY: 1,
  impact: false,
  done: true,
});

export function createCookingMotion({
  kind,
  startedAt,
  thickness,
  ingredientId = "default",
  reducedMotion = false,
} = {}) {
  if (!KINDS.has(kind)) throw new TypeError("kind must be pick, insert, or home");
  if (!Number.isFinite(startedAt)) throw new TypeError("startedAt must be finite");
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new TypeError("thickness must be a positive finite number");
  }
  return Object.freeze({
    kind,
    startedAt,
    thickness,
    ingredientId,
    material: getCookingMaterialPhysics(ingredientId),
    reducedMotion: Boolean(reducedMotion),
  });
}

export function sampleCookingMotion(motion, now) {
  if (!motion || !KINDS.has(motion.kind) || !Number.isFinite(now)) {
    throw new TypeError("motion and now must be valid");
  }
  if (motion.reducedMotion) return settled;

  const duration = DURATIONS[motion.kind];
  const progress = clamp01((now - motion.startedAt) / duration);
  if (progress >= 1) return settled;

  const material = motion.material ?? getCookingMaterialPhysics(motion.ingredientId);
  const result = {
    phase: motion.kind,
    progress,
    arrival: 0,
    verticalArrival: 0,
    selectedOffsetY: 0,
    upperOffsetY: 0,
    supportCompression: 0,
    supportLoad: 0,
    selectedScaleXz: 1,
    selectedScaleY: 1,
    impact: false,
    done: false,
  };

  if (motion.kind === "pick") {
    const pulse = Math.sin(Math.PI * progress);
    result.phase = progress < 0.45 ? "squash" : "release";
    result.selectedScaleXz = 1 + pulse * material.compliance * 0.38;
    result.selectedScaleY = 1 - pulse * material.compliance * 0.5;
    return Object.freeze(result);
  }

  if (motion.kind === "insert") {
    if (progress < 0.52) {
      const fallTime = progress / 0.52;
      result.phase = "fall";
      // Horizontal travel is easy to follow, while Y follows constant
      // acceleration from rest: distance = 1/2*g*t^2. There is no air arc.
      result.arrival = easeOutCubic(fallTime);
      result.verticalArrival = fallTime ** 2;
    } else if (progress < 0.74) {
      const contactTime = (progress - 0.52) / 0.22;
      const contact = Math.sin(Math.PI * contactTime);
      const squash = clamp(
        material.compliance * (0.62 + material.mass * 0.24) * contact,
        0,
        0.16,
      );
      result.phase = "contact";
      result.arrival = 1;
      result.verticalArrival = 1;
      result.selectedScaleXz = 1 + squash * material.lateralSpread;
      result.selectedScaleY = 1 - squash;
      result.supportLoad = contact * material.mass;
      // Kept as a scalar debug summary; the stage converts supportLoad using
      // each lower layer's own compliance instead of applying one global squash.
      result.supportCompression = contact * material.mass * 0.02;
      result.impact = contactTime >= 0.06;
    } else {
      const reboundTime = (progress - 0.74) / 0.26;
      const rebound = Math.sin(Math.PI * reboundTime) * (1 - reboundTime);
      const reboundAmount = material.compliance * (1 - material.damping) * rebound;
      result.phase = "rebound";
      result.arrival = 1;
      result.verticalArrival = 1;
      result.selectedScaleXz = 1 - reboundAmount * material.lateralSpread * 0.55;
      result.selectedScaleY = 1 + reboundAmount;
      result.selectedOffsetY = motion.thickness * reboundAmount * 0.22;
      result.upperOffsetY = motion.thickness * reboundAmount * 0.08;
      result.supportLoad = -material.mass * (1 - material.damping) * rebound * 0.16;
      result.supportCompression = result.supportLoad * 0.02;
    }
    return Object.freeze(result);
  }

  if (progress < 0.55) {
    result.phase = "travel";
    result.arrival = easeInOutCubic(progress / 0.55);
    result.verticalArrival = result.arrival;
  } else if (progress < 0.82) {
    const phaseProgress = (progress - 0.55) / 0.27;
    result.phase = "impact";
    result.arrival = 1;
    result.verticalArrival = 1;
    result.selectedOffsetY = -motion.thickness * 0.09 * Math.sin(Math.PI * phaseProgress);
    result.impact = phaseProgress >= 0.5;
  } else {
    const phaseProgress = (progress - 0.82) / 0.18;
    result.phase = "rebound";
    result.arrival = 1;
    result.verticalArrival = 1;
    result.selectedOffsetY = motion.thickness * 0.04 * Math.sin(Math.PI * phaseProgress);
  }
  return Object.freeze(result);
}
