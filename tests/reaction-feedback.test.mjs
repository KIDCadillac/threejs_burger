import test from "node:test";
import assert from "node:assert/strict";

import {
  handleReactionFeedback,
  primeReactionAudio,
} from "../app/static/reaction-feedback.mjs";

function fakeAudioContext({ state = "running", throwOnOscillator = false } = {}) {
  const events = [];
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
          events.push(["stop", at]);
        },
      };
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
      };
      return gainNode;
    },
  };
  return { context, events };
}

test("unsupported audio priming is a silent no-op", () => {
  assert.doesNotThrow(() => primeReactionAudio({ AudioContextClass: null }));
  assert.equal(primeReactionAudio({ AudioContextClass: null }), null);
});

test("priming creates one context and resumes a suspended context", async () => {
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
  await Promise.resolve();

  assert.equal(constructions, 1);
  assert.equal(context.resumeCalls, 2);
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

test("a rejected resume is swallowed instead of becoming an unhandled failure", async () => {
  const { context } = fakeAudioContext({ state: "suspended" });
  context.resume = () => Promise.reject(new Error("autoplay blocked"));
  class RejectingAudioContext {
    constructor() {
      return context;
    }
  }

  assert.doesNotThrow(() => primeReactionAudio({
    AudioContextClass: RejectingAudioContext,
    forceNew: true,
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});
