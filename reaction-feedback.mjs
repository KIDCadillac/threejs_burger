let audioContext = null;
let resumeContext = null;
let resumeOperation = null;

const BURST_FEEDBACK = Object.freeze({
  chili: Object.freeze({
    tone: Object.freeze({
      frequency: 105,
      endFrequency: 58,
      duration: 0.52,
      type: "sawtooth",
      gain: 0.035,
    }),
    vibration: Object.freeze([35, 30, 45]),
  }),
  mustard: Object.freeze({
    tone: Object.freeze({
      frequency: 620,
      endFrequency: 910,
      duration: 0.18,
      type: "triangle",
      gain: 0.022,
    }),
    vibration: Object.freeze([18, 28, 18]),
  }),
  sour: Object.freeze({
    tone: Object.freeze({
      frequency: 330,
      endFrequency: 220,
      duration: 0.26,
      type: "sine",
      gain: 0.021,
    }),
    vibration: Object.freeze([12, 18, 12]),
  }),
  sticky: Object.freeze({
    tone: Object.freeze({
      frequency: 150,
      endFrequency: 95,
      duration: 0.34,
      type: "triangle",
      gain: 0.024,
    }),
    vibration: Object.freeze([28, 45, 12]),
  }),
});

function forgetResumeOperation() {
  resumeContext = null;
  resumeOperation = null;
}

function resumeSafely(context) {
  if (
    !context
    || context.state === "running"
    || context.state === "closed"
    || typeof context.resume !== "function"
  ) {
    return null;
  }
  if (resumeContext === context && resumeOperation) return resumeOperation;

  try {
    const result = context.resume();
    if (!result || typeof result.then !== "function") return null;

    let trackedOperation;
    trackedOperation = Promise.resolve(result)
      .catch(() => {})
      .finally(() => {
        if (resumeOperation === trackedOperation) forgetResumeOperation();
      });
    resumeContext = context;
    resumeOperation = trackedOperation;
    return trackedOperation;
  } catch {
    // Audio feedback is optional; browsers may reject resume outside a gesture.
    return null;
  }
}

function suspendSafely(context) {
  try {
    if (typeof context?.suspend !== "function") return;
    const result = context.suspend();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // The poisoned context reference is discarded regardless of suspension.
  }
}

function discardPoisonedAudioContext(context) {
  if (!context) return;
  if (audioContext === context) audioContext = null;
  if (resumeContext === context) forgetResumeOperation();

  try {
    if (typeof context.close !== "function") {
      suspendSafely(context);
      return;
    }
    const result = context.close();
    if (result && typeof result.catch === "function") {
      result.catch(() => suspendSafely(context));
    }
  } catch {
    suspendSafely(context);
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
      forgetResumeOperation();
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
  if (!context || context.state !== "running") {
    resumeSafely(context);
    return;
  }

  let oscillator = null;
  let volume = null;
  const disconnectNodes = () => {
    try {
      oscillator.onended = null;
      oscillator.disconnect();
    } catch {
      // A partial Web Audio implementation may omit disconnect().
    }
    try {
      volume.disconnect();
    } catch {
      // Finite nodes are still eligible for collection after playback.
    }
  };

  try {
    const now = Number.isFinite(context.currentTime) ? context.currentTime : 0;
    oscillator = context.createOscillator();
    volume = context.createGain();

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
    oscillator.onended = disconnectNodes;

    try {
      oscillator.start(now);
    } catch {
      disconnectNodes();
      return;
    }

    try {
      oscillator.stop(now + duration);
    } catch {
      try {
        oscillator.stop(now);
      } catch {
        try {
          volume.gain.cancelScheduledValues(now);
          volume.gain.setValueAtTime(0.0001, now);
        } catch {
          // Disconnecting below still makes a broken source inaudible.
        }
        disconnectNodes();
        discardPoisonedAudioContext(context);
      }
    }
  } catch {
    disconnectNodes();
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
    if (navigatorObject?.userActivation?.hasBeenActive === false) return;
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

  if (phase !== "burst") return;

  const burstFeedback = BURST_FEEDBACK[plan?.primary];

  if (!burstFeedback) return;
  playTone(context, burstFeedback.tone);
  vibrateSafely(burstFeedback.vibration, options.vibrate);
}
