let audioContext = null;

function swallowAsyncFailure(value) {
  if (value && typeof value.catch === "function") value.catch(() => {});
}

function resumeSafely(context) {
  if (!context || context.state !== "suspended" || typeof context.resume !== "function") {
    return;
  }
  try {
    swallowAsyncFailure(context.resume());
  } catch {
    // Audio feedback is optional; browsers may reject resume outside a gesture.
  }
}

export function primeReactionAudio(options = {}) {
  const hasExplicitClass = Object.hasOwn(options, "AudioContextClass");
  const AudioContextClass = hasExplicitClass
    ? options.AudioContextClass
    : (globalThis.AudioContext ?? globalThis.webkitAudioContext);
  if (typeof AudioContextClass !== "function") return null;

  try {
    if (options.forceNew || !audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
    }
    resumeSafely(audioContext);
    return audioContext;
  } catch {
    return null;
  }
}

function playTone(context, {
  frequency,
  endFrequency,
  duration,
  type,
  gain,
}) {
  if (!context || context.state === "closed") return;

  try {
    resumeSafely(context);
    const now = Number.isFinite(context.currentTime) ? context.currentTime : 0;
    const oscillator = context.createOscillator();
    const volume = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + duration,
      );
    }
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    // Some embedded browsers expose partial Web Audio implementations.
  }
}

function vibrateSafely(pattern, override) {
  try {
    if (typeof override === "function") {
      override(pattern);
      return;
    }
    const navigatorObject = globalThis.navigator;
    if (typeof navigatorObject?.vibrate === "function") {
      navigatorObject.vibrate(pattern);
    }
  } catch {
    // Haptics are optional and may be denied by OS or browser policy.
  }
}

export function handleReactionFeedback(phase, plan, options = {}) {
  const context = options.audioContext ?? audioContext;

  if (phase === "bite") {
    playTone(context, {
      frequency: 210,
      endFrequency: 115,
      duration: 0.08,
      type: "square",
      gain: 0.025,
    });
    vibrateSafely(22, options.vibrate);
    return;
  }

  if (phase === "burst" && plan?.primary === "chili") {
    playTone(context, {
      frequency: 105,
      endFrequency: 58,
      duration: 0.52,
      type: "sawtooth",
      gain: 0.035,
    });
    vibrateSafely([35, 30, 45], options.vibrate);
  }
}
