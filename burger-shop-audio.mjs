const CUES = Object.freeze({
  pick: Object.freeze({ frequency: 330, duration: 0.055, wave: "sine", haptic: 8 }),
  drop: Object.freeze({ frequency: 220, duration: 0.075, wave: "triangle", haptic: 10 }),
  correct: Object.freeze({ frequency: 660, duration: 0.12, wave: "sine", haptic: [10, 18, 10] }),
  bell: Object.freeze({ frequency: 880, duration: 0.24, wave: "sine", haptic: [16, 24, 18] }),
  tick: Object.freeze({ frequency: 440, duration: 0.04, wave: "square", haptic: 5 }),
  result: Object.freeze({ frequency: 523, duration: 0.3, wave: "triangle", haptic: [12, 20, 12] }),
});

export function createBurgerShopAudio({
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
  navigatorTarget = globalThis.navigator ?? null,
  muted = false,
  haptics = true,
} = {}) {
  let context = null;
  let isMuted = Boolean(muted);
  let hasHaptics = Boolean(haptics);
  let disposed = false;

  const getContext = () => {
    if (disposed || !AudioContextClass) return null;
    if (context && context.state !== "closed") return context;
    try {
      context = new AudioContextClass();
      return context;
    } catch {
      context = null;
      return null;
    }
  };

  const vibrate = (pattern) => {
    if (!hasHaptics || pattern === undefined) return;
    try { navigatorTarget?.vibrate?.(pattern); } catch { /* optional haptic */ }
  };

  return Object.freeze({
    play(name) {
      const cue = CUES[name];
      if (disposed || isMuted || !cue) return false;
      const audioContext = getContext();
      if (!audioContext) return false;
      try {
        if (audioContext.state === "suspended" || audioContext.state === "interrupted") {
          audioContext.resume?.().catch?.(() => {});
        }
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const startAt = Number(audioContext.currentTime) || 0;
        const stopAt = startAt + cue.duration;
        oscillator.type = cue.wave;
        oscillator.frequency.setValueAtTime(cue.frequency, startAt);
        gain.gain.setValueAtTime(0.075, startAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startAt);
        oscillator.stop(stopAt);
        vibrate(cue.haptic);
        return true;
      } catch {
        return false;
      }
    },
    setMuted(value) {
      isMuted = Boolean(value);
      return isMuted;
    },
    setHaptics(value) {
      hasHaptics = Boolean(value);
      return hasHaptics;
    },
    async pause() {
      if (!context || context.state !== "running") return false;
      try {
        await context.suspend?.();
        return true;
      } catch {
        return false;
      }
    },
    async resume() {
      if (!context || !["suspended", "interrupted"].includes(context.state)) return false;
      try {
        await context.resume?.();
        return true;
      } catch {
        return false;
      }
    },
    async dispose() {
      if (disposed) return false;
      disposed = true;
      const activeContext = context;
      context = null;
      if (!activeContext || activeContext.state === "closed") return true;
      try {
        await activeContext.close?.();
        return true;
      } catch {
        return false;
      }
    },
  });
}
