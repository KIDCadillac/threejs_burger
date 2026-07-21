const DURATIONS = Object.freeze({
  pick: 90,
  insert: 380,
  home: 240,
});

const KINDS = new Set(Object.keys(DURATIONS));
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value) => 1 - (1 - clamp01(value)) ** 3;
const easeInOutCubic = (value) => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
};

const settled = Object.freeze({
  phase: "settled",
  progress: 1,
  arrival: 1,
  selectedOffsetY: 0,
  upperOffsetY: 0,
  selectedScaleXz: 1,
  selectedScaleY: 1,
  impact: false,
  done: true,
});

export function createCookingMotion({
  kind,
  startedAt,
  thickness,
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

  const result = {
    phase: motion.kind,
    progress,
    arrival: 0,
    selectedOffsetY: 0,
    upperOffsetY: 0,
    selectedScaleXz: 1,
    selectedScaleY: 1,
    impact: false,
    done: false,
  };

  if (motion.kind === "pick") {
    const pulse = Math.sin(Math.PI * progress);
    result.phase = progress < 0.45 ? "squash" : "release";
    result.selectedScaleXz = 1 + pulse * 0.055;
    result.selectedScaleY = 1 - pulse * 0.07;
    return Object.freeze(result);
  }

  if (motion.kind === "insert") {
    if (progress < 0.28) {
      const phaseProgress = progress / 0.28;
      result.phase = "open";
      result.arrival = easeOutCubic(phaseProgress) * 0.55;
      result.selectedScaleXz = 0.64 + easeOutCubic(phaseProgress) * 0.18;
      result.selectedScaleY = result.selectedScaleXz;
      result.selectedOffsetY = motion.thickness * 0.025 * Math.sin(Math.PI * phaseProgress);
    } else if (progress < 0.58) {
      const phaseProgress = (progress - 0.28) / 0.3;
      result.phase = "pop";
      result.arrival = 0.55 + easeOutCubic(phaseProgress) * 0.3;
      result.selectedScaleXz = 0.82 + easeOutCubic(phaseProgress) * 0.265;
      result.selectedScaleY = result.selectedScaleXz;
      result.selectedOffsetY = motion.thickness * 0.02 * Math.sin(Math.PI * phaseProgress);
    } else if (progress < 0.82) {
      const phaseProgress = (progress - 0.58) / 0.24;
      result.phase = "settle";
      result.arrival = 0.85 + easeOutCubic(phaseProgress) * 0.15;
      result.selectedScaleXz = 1.085 - easeInOutCubic(phaseProgress) * 0.113;
      result.selectedScaleY = result.selectedScaleXz;
      result.selectedOffsetY = motion.thickness * 0.035 * Math.sin(Math.PI * phaseProgress);
      result.impact = phaseProgress >= 0.25;
    } else {
      const phaseProgress = (progress - 0.82) / 0.18;
      result.phase = "rebound";
      result.arrival = 1;
      result.selectedScaleXz = 0.972 + easeOutCubic(phaseProgress) * 0.028;
      result.selectedScaleY = result.selectedScaleXz;
      result.selectedOffsetY = motion.thickness * 0.018 * Math.sin(Math.PI * phaseProgress);
    }
    return Object.freeze(result);
  }

  if (progress < 0.55) {
    result.phase = "travel";
    result.arrival = easeInOutCubic(progress / 0.55);
  } else if (progress < 0.82) {
    const phaseProgress = (progress - 0.55) / 0.27;
    result.phase = "impact";
    result.arrival = 1;
    result.selectedOffsetY = -motion.thickness * 0.09 * Math.sin(Math.PI * phaseProgress);
    result.impact = phaseProgress >= 0.5;
  } else {
    const phaseProgress = (progress - 0.82) / 0.18;
    result.phase = "rebound";
    result.arrival = 1;
    result.selectedOffsetY = motion.thickness * 0.04 * Math.sin(Math.PI * phaseProgress);
  }
  return Object.freeze(result);
}
