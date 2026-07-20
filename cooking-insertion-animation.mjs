const DURATIONS = Object.freeze({
  pick: 90,
  top: 300,
  bottom: 380,
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
  stackOffsetY: 0,
  stackCompression: 0,
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
  if (!KINDS.has(kind)) throw new TypeError("kind must be pick, top, bottom, or home");
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
    stackOffsetY: 0,
    stackCompression: 0,
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

  if (motion.kind === "top") {
    if (progress < 0.22) {
      const phaseProgress = progress / 0.22;
      result.phase = "anticipate";
      result.arrival = easeInOutCubic(phaseProgress) * 0.25;
      result.stackCompression = easeOutCubic(phaseProgress);
    } else if (progress < 0.56) {
      const phaseProgress = (progress - 0.22) / 0.34;
      result.phase = "impact";
      result.arrival = 0.25 + easeInOutCubic(phaseProgress) * 0.75;
      result.selectedOffsetY = -motion.thickness * 0.06 * easeOutCubic(phaseProgress);
      result.stackCompression = 1 - phaseProgress * 0.35;
      result.impact = phaseProgress >= 0.72;
    } else if (progress < 0.82) {
      const phaseProgress = (progress - 0.56) / 0.26;
      result.phase = "rebound";
      result.arrival = 1;
      result.selectedOffsetY = motion.thickness * 0.12 * Math.sin(Math.PI * phaseProgress);
      result.stackCompression = (1 - phaseProgress) * 0.65;
    } else {
      const phaseProgress = (progress - 0.82) / 0.18;
      result.phase = "settle";
      result.arrival = 1;
      result.selectedOffsetY = motion.thickness * 0.025 * Math.sin(Math.PI * phaseProgress);
    }
    return Object.freeze(result);
  }

  if (motion.kind === "bottom") {
    if (progress < 0.24) {
      const phaseProgress = progress / 0.24;
      result.phase = "open";
      result.arrival = easeInOutCubic(phaseProgress) * 0.18;
      result.stackOffsetY = (motion.thickness + 0.08) * easeOutCubic(phaseProgress);
    } else if (progress < 0.58) {
      const phaseProgress = (progress - 0.24) / 0.34;
      result.phase = "insert";
      result.arrival = 0.18 + easeInOutCubic(phaseProgress) * 0.65;
      result.stackOffsetY = motion.thickness + 0.08;
      result.selectedOffsetY = motion.thickness * (0.45 - phaseProgress * 0.9);
    } else if (progress < 0.82) {
      const phaseProgress = (progress - 0.58) / 0.24;
      result.phase = "exit";
      result.arrival = 0.83 + easeInOutCubic(phaseProgress) * 0.17;
      result.stackOffsetY = (motion.thickness + 0.08) * (1 - easeOutCubic(phaseProgress));
      result.selectedOffsetY = -motion.thickness * 0.12
        * Math.sin(Math.PI * (0.5 + phaseProgress * 0.5));
      result.impact = phaseProgress >= 0.55;
    } else {
      const phaseProgress = (progress - 0.82) / 0.18;
      result.phase = "rebound";
      result.arrival = 1;
      result.selectedOffsetY = motion.thickness * 0.055 * Math.sin(Math.PI * phaseProgress);
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
