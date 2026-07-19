import test from "node:test";
import assert from "node:assert/strict";

import {
  handleReactionFeedback,
  primeReactionAudio,
} from "../app/static/reaction-feedback.mjs";

function fakeAudioContext({
  state = "running",
  throwOnOscillator = false,
  throwOnStart = false,
  stopFailures = 0,
  closeRejects = false,
  onStopAttempt = () => {},
} = {}) {
  const events = [];
  const oscillators = [];
  const gains = [];
  const context = {
    state,
    currentTime: 4,
    destination: {},
    resumeCalls: 0,
    closeCalls: 0,
    suspendCalls: 0,
    resume() {
      this.resumeCalls += 1;
      return Promise.resolve();
    },
    close() {
      this.closeCalls += 1;
      events.push(["context-close"]);
      return closeRejects
        ? Promise.reject(new Error("close unavailable"))
        : Promise.resolve();
    },
    suspend() {
      this.suspendCalls += 1;
      events.push(["context-suspend"]);
      return Promise.resolve();
    },
    createOscillator() {
      if (throwOnOscillator) throw new Error("audio unavailable");
      const oscillator = {
        type: "sine",
        started: false,
        stopped: false,
        disconnected: false,
        stopAttempts: 0,
        frequency: {
          setValueAtTime(value, at) {
            events.push(["frequency", value, at]);
          },
          exponentialRampToValueAtTime(value, at) {
            events.push(["frequency-ramp", value, at]);
          },
        },
        connect(target) {
          events.push(["oscillator-connect", target]);
          return target;
        },
        start(at) {
          events.push(["start-call", at]);
          if (throwOnStart) throw new Error("start unavailable");
          this.started = true;
          events.push(["start", at]);
        },
        stop(at) {
          events.push(["stop-call", at]);
          if (!this.started) {
            const error = new Error("source has not started");
            error.name = "InvalidStateError";
            throw error;
          }
          this.stopAttempts += 1;
          onStopAttempt(this.stopAttempts);
          if (this.stopAttempts <= stopFailures) throw new Error("stop unavailable");
          this.stopped = true;
          events.push(["stop", at]);
        },
      };
      oscillator.disconnect = function disconnect() {
        this.disconnected = true;
        events.push(["oscillator-disconnect"]);
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gainNode = {
        disconnected: false,
        gain: {
          setValueAtTime(value, at) {
            events.push(["gain", value, at]);
          },
          exponentialRampToValueAtTime(value, at) {
            events.push(["gain-ramp", value, at]);
          },
          cancelScheduledValues(at) {
            events.push(["gain-cancel", at]);
          },
        },
        connect(target) {
          events.push(["gain-connect", target]);
          return target;
        },
        disconnect() {
          this.disconnected = true;
          events.push(["gain-disconnect"]);
        },
      };
      gains.push(gainNode);
      return gainNode;
    },
  };
  return { context, events, oscillators, gains };
}

test("unsupported audio priming is a silent no-op", () => {
  assert.doesNotThrow(() => primeReactionAudio({ AudioContextClass: null }));
  assert.equal(primeReactionAudio({ AudioContextClass: null }), null);
});

test("priming deduplicates an in-flight resume and allows a later retry", async () => {
  const { context } = fakeAudioContext({ state: "suspended" });
  let constructions = 0;
  class FakeAudioContext {
    constructor() {
      constructions += 1;
      return context;
    }
  }

  assert.equal(primeReactionAudio({ AudioContextClass: FakeAudioContext }), context);
  assert.equal(primeReactionAudio({ AudioContextClass: FakeAudioContext }), context);
  assert.equal(constructions, 1);
  assert.equal(context.resumeCalls, 1);

  await new Promise((resolve) => setTimeout(resolve, 0));
  primeReactionAudio({ AudioContextClass: FakeAudioContext });
  assert.equal(context.resumeCalls, 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("interrupted audio is resumed once without replacing its context", async () => {
  const { context } = fakeAudioContext({ state: "interrupted" });
  let constructions = 0;
  class InterruptedAudioContext {
    constructor() {
      constructions += 1;
      return context;
    }
  }

  assert.equal(primeReactionAudio({
    AudioContextClass: InterruptedAudioContext,
    forceNew: true,
  }), context);
  assert.equal(primeReactionAudio({ AudioContextClass: InterruptedAudioContext }), context);
  await Promise.resolve();

  assert.equal(constructions, 1);
  assert.equal(context.resumeCalls, 1);
});

test("a closed shared context is safely replaced on the next gesture", () => {
  const closed = fakeAudioContext({ state: "closed" }).context;
  const running = fakeAudioContext({ state: "running" }).context;
  const contexts = [closed, running];
  class RecreatedAudioContext {
    constructor() {
      return contexts.shift();
    }
  }

  assert.equal(primeReactionAudio({
    AudioContextClass: RecreatedAudioContext,
    forceNew: true,
  }), closed);
  assert.equal(primeReactionAudio({ AudioContextClass: RecreatedAudioContext }), running);
});

test("bite feedback is short, finite, and lightly vibrates", () => {
  const { context, events } = fakeAudioContext();
  const vibrations = [];

  assert.doesNotThrow(() => handleReactionFeedback("bite", { primary: "chili" }, {
    audioContext: context,
    vibrate: (pattern) => vibrations.push(pattern),
  }));

  assert.deepEqual(vibrations, [22]);
  assert.equal(events.filter(([name]) => name === "start").length, 1);
  const stop = events.find(([name]) => name === "stop");
  assert.ok(stop, "bite oscillator must schedule a stop");
  assert.ok(stop[1] - context.currentTime <= 0.12);
  assert.ok(
    events.findIndex(([name]) => name === "start-call")
      < events.findIndex(([name]) => name === "stop-call"),
    "Web Audio sources must start before stop is scheduled",
  );
});

test("native haptics wait for a real user gesture", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const vibrations = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userActivation: { hasBeenActive: false },
      vibrate: (pattern) => vibrations.push(pattern),
    },
  });

  try {
    handleReactionFeedback("bite", null, { audioContext: null });
    assert.deepEqual(vibrations, []);
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      delete globalThis.navigator;
    }
  }
});

test("finite sound nodes disconnect after playback ends", () => {
  const { context, events, oscillators } = fakeAudioContext();

  handleReactionFeedback("bite", null, { audioContext: context });
  assert.equal(typeof oscillators[0].onended, "function");
  oscillators[0].onended();

  assert.ok(events.some(([name]) => name === "oscillator-disconnect"));
  assert.ok(events.some(([name]) => name === "gain-disconnect"));
});

test("a failed source start disconnects nodes without calling stop", () => {
  const { context, events, oscillators, gains } = fakeAudioContext({
    throwOnStart: true,
  });

  assert.doesNotThrow(() => {
    handleReactionFeedback("bite", null, { audioContext: context });
  });
  assert.equal(events.some(([name]) => name === "start"), false);
  assert.equal(events.some(([name]) => name === "stop-call"), false);
  assert.equal(oscillators[0].disconnected, true);
  assert.equal(gains[0].disconnected, true);
});

test("a failed scheduled stop retries an immediate finite stop", () => {
  const { context, events, oscillators } = fakeAudioContext({ stopFailures: 1 });

  handleReactionFeedback("bite", null, { audioContext: context });

  assert.equal(oscillators[0].started, true);
  assert.equal(oscillators[0].stopped, true);
  assert.equal(oscillators[0].stopAttempts, 2);
  assert.deepEqual(
    events.filter(([name]) => name === "stop-call").map(([, at]) => at),
    [context.currentTime + 0.08, context.currentTime],
  );
});

test("a permanently failing stop poisons the current context and rebuilds later", async () => {
  const oldAudio = fakeAudioContext({
    stopFailures: Number.POSITIVE_INFINITY,
  });
  const replacement = fakeAudioContext();
  const contexts = [oldAudio.context, replacement.context];
  let constructions = 0;
  class RebuiltAudioContext {
    constructor() {
      constructions += 1;
      return contexts.shift();
    }
  }

  primeReactionAudio({ AudioContextClass: RebuiltAudioContext, forceNew: true });
  handleReactionFeedback("bite", null);
  await Promise.resolve();

  assert.equal(oldAudio.context.closeCalls, 1);
  assert.equal(oldAudio.oscillators[0].disconnected, true);
  assert.equal(oldAudio.gains[0].disconnected, true);
  assert.ok(oldAudio.events.some(([name]) => name === "gain-cancel"));
  assert.ok(oldAudio.events.some(
    ([name, value]) => name === "gain" && value === 0.0001,
  ));
  assert.equal(
    primeReactionAudio({ AudioContextClass: RebuiltAudioContext }),
    replacement.context,
  );
  assert.equal(constructions, 2);
});

test("a rejected poisoned-context close falls back to suspend", async () => {
  const oldAudio = fakeAudioContext({
    stopFailures: Number.POSITIVE_INFINITY,
    closeRejects: true,
  });
  const replacement = fakeAudioContext();
  const contexts = [oldAudio.context, replacement.context];
  class RebuiltAudioContext {
    constructor() {
      return contexts.shift();
    }
  }

  primeReactionAudio({ AudioContextClass: RebuiltAudioContext, forceNew: true });
  handleReactionFeedback("bite", null);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(oldAudio.context.closeCalls, 1);
  assert.equal(oldAudio.context.suspendCalls, 1);
  assert.equal(
    primeReactionAudio({ AudioContextClass: RebuiltAudioContext }),
    replacement.context,
  );
});

test("poisoning an old context never clears a concurrently installed replacement", () => {
  let replaceDuringStop = () => {};
  const oldAudio = fakeAudioContext({
    stopFailures: Number.POSITIVE_INFINITY,
    onStopAttempt: () => replaceDuringStop(),
  });
  const replacement = fakeAudioContext();
  const contexts = [oldAudio.context, replacement.context];
  let constructions = 0;
  class RacingAudioContext {
    constructor() {
      constructions += 1;
      return contexts.shift();
    }
  }
  let replaced = false;
  replaceDuringStop = () => {
    if (replaced) return;
    replaced = true;
    primeReactionAudio({ AudioContextClass: RacingAudioContext, forceNew: true });
  };

  primeReactionAudio({ AudioContextClass: RacingAudioContext, forceNew: true });
  handleReactionFeedback("bite", null);

  assert.equal(
    primeReactionAudio({ AudioContextClass: RacingAudioContext }),
    replacement.context,
  );
  assert.equal(constructions, 2);
});

test("chili burst has a stronger finite sound and segmented vibration", () => {
  const { context, events } = fakeAudioContext();
  const vibrations = [];

  handleReactionFeedback("burst", { primary: "chili", primaryIntensity: 3 }, {
    audioContext: context,
    vibrate: (pattern) => vibrations.push(pattern),
  });

  assert.deepEqual(vibrations, [[35, 30, 45]]);
  assert.ok(events.some(([name]) => name === "frequency-ramp"));
  const stops = events.filter(([name]) => name === "stop");
  assert.ok(stops.length >= 1);
  assert.ok(stops.every(([, at]) => at - context.currentTime <= 0.65));
});

test("four burst reactions have distinct finite low-intensity feedback", () => {
  const signatures = new Set();
  for (const primary of ["chili", "mustard", "sour", "sticky"]) {
    const { context, events } = fakeAudioContext();
    const vibrations = [];
    handleReactionFeedback("burst", { primary, primaryIntensity: 1 }, {
      audioContext: context,
      vibrate: (pattern) => vibrations.push(pattern),
    });
    const frequency = events.find(([name]) => name === "frequency")?.[1];
    const stop = events.find(([name]) => name === "stop")?.[1];
    assert.ok(frequency, `${primary} should have a tone`);
    assert.ok(stop - context.currentTime <= 0.65, `${primary} must stay finite`);
    assert.equal(vibrations.length, 1, `${primary} should have one short haptic`);
    signatures.add(`${frequency}:${JSON.stringify(vibrations[0])}`);
  }
  assert.equal(signatures.size, 4);
});

test("a rejected resume never schedules stale bite audio", async () => {
  const { context, events } = fakeAudioContext({ state: "suspended" });
  const vibrations = [];
  context.resume = function resume() {
    this.resumeCalls += 1;
    return Promise.reject(new Error("autoplay blocked"));
  };

  handleReactionFeedback("bite", { primary: "chili" }, {
    audioContext: context,
    vibrate: (pattern) => vibrations.push(pattern),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(context.resumeCalls, 1);
  assert.deepEqual(events, []);
  assert.deepEqual(vibrations, [22]);
});

test("an interrupted chili burst resumes silently while haptics stay independent", async () => {
  const { context, events } = fakeAudioContext({ state: "interrupted" });
  const vibrations = [];

  handleReactionFeedback("burst", { primary: "chili" }, {
    audioContext: context,
    vibrate: (pattern) => vibrations.push(pattern),
  });
  await Promise.resolve();

  assert.equal(context.resumeCalls, 1);
  assert.deepEqual(events, []);
  assert.deepEqual(vibrations, [[35, 30, 45]]);
});

test("repeated feedback and rejected platform APIs never escape errors", () => {
  const { context } = fakeAudioContext({ throwOnOscillator: true });
  const rejectingVibrate = () => {
    throw new Error("haptics denied");
  };

  assert.doesNotThrow(() => {
    handleReactionFeedback("bite", null, {
      audioContext: context,
      vibrate: rejectingVibrate,
    });
    handleReactionFeedback("bite", null, {
      audioContext: context,
      vibrate: rejectingVibrate,
    });
    handleReactionFeedback("burst", { primary: "chili" }, {
      audioContext: { ...context, state: "closed" },
      vibrate: rejectingVibrate,
    });
  });
});

test("a rejected in-flight resume is swallowed, deduplicated, and retryable", async () => {
  const { context } = fakeAudioContext({ state: "suspended" });
  context.resume = function resume() {
    this.resumeCalls += 1;
    return Promise.reject(new Error("autoplay blocked"));
  };
  class RejectingAudioContext {
    constructor() {
      return context;
    }
  }

  assert.doesNotThrow(() => primeReactionAudio({
    AudioContextClass: RejectingAudioContext,
    forceNew: true,
  }));
  primeReactionAudio({ AudioContextClass: RejectingAudioContext });
  assert.equal(context.resumeCalls, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  primeReactionAudio({ AudioContextClass: RejectingAudioContext });
  assert.equal(context.resumeCalls, 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
});
