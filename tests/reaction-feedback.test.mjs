import test from "node:test";
import assert from "node:assert/strict";

import {
  handleReactionFeedback,
  primeReactionAudio,
} from "../app/static/reaction-feedback.mjs";

function fakeAudioContext({
  state = "running",
  throwOnOscillator = false,
  throwOnStop = false,
} = {}) {
  const events = [];
  const oscillators = [];
  const context = {
    state,
    currentTime: 4,
    destination: {},
    resumeCalls: 0,
    resume() {
      this.resumeCalls += 1;
      return Promise.resolve();
    },
    createOscillator() {
      if (throwOnOscillator) throw new Error("audio unavailable");
      const oscillator = {
        type: "sine",
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
          events.push(["start", at]);
        },
        stop(at) {
          if (throwOnStop) throw new Error("stop unavailable");
          events.push(["stop", at]);
        },
      };
      oscillator.disconnect = () => events.push(["oscillator-disconnect"]);
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gainNode = {
        gain: {
          setValueAtTime(value, at) {
            events.push(["gain", value, at]);
          },
          exponentialRampToValueAtTime(value, at) {
            events.push(["gain-ramp", value, at]);
          },
        },
        connect(target) {
          events.push(["gain-connect", target]);
          return target;
        },
        disconnect() {
          events.push(["gain-disconnect"]);
        },
      };
      return gainNode;
    },
  };
  return { context, events, oscillators };
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
});

test("finite sound nodes disconnect after playback ends", () => {
  const { context, events, oscillators } = fakeAudioContext();

  handleReactionFeedback("bite", null, { audioContext: context });
  assert.equal(typeof oscillators[0].onended, "function");
  oscillators[0].onended();

  assert.ok(events.some(([name]) => name === "oscillator-disconnect"));
  assert.ok(events.some(([name]) => name === "gain-disconnect"));
});

test("a tone never starts when a finite stop cannot be scheduled", () => {
  const { context, events } = fakeAudioContext({ throwOnStop: true });

  assert.doesNotThrow(() => {
    handleReactionFeedback("bite", null, { audioContext: context });
  });
  assert.equal(events.some(([name]) => name === "start"), false);
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

test("non-chili burst does not impersonate the fire reaction", () => {
  const { context, events } = fakeAudioContext();
  const vibrations = [];

  handleReactionFeedback("burst", { primary: "mustard" }, {
    audioContext: context,
    vibrate: (pattern) => vibrations.push(pattern),
  });

  assert.deepEqual(vibrations, []);
  assert.deepEqual(events, []);
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
