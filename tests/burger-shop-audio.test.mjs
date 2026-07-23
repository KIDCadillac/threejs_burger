import test from "node:test";
import assert from "node:assert/strict";
import { createBurgerShopAudio } from "../app/static/burger-shop-audio.mjs";

function createAudioHarness() {
  const calls = [];
  const context = {
    state: "running",
    currentTime: 10,
    destination: {},
    createOscillator() {
      return {
        frequency: { setValueAtTime: (value) => calls.push(["frequency", value]) },
        type: "sine",
        connect: () => {},
        start: () => calls.push(["start"]),
        stop: () => calls.push(["stop"]),
      };
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      };
    },
    suspend: async () => { calls.push(["suspend"]); context.state = "suspended"; },
    resume: async () => { calls.push(["resume"]); context.state = "running"; },
    close: async () => { calls.push(["close"]); context.state = "closed"; },
  };
  class AudioContextClass {
    constructor() {
      calls.push(["construct"]);
      return context;
    }
  }
  return { calls, context, AudioContextClass };
}

test("missing or blocked audio never throws and reports that nothing played", () => {
  const audio = createBurgerShopAudio({
    AudioContextClass: null,
    navigatorTarget: null,
  });

  assert.doesNotThrow(() => audio.play("bell"));
  assert.equal(audio.play("bell"), false);
  assert.doesNotThrow(() => audio.pause());
  assert.doesNotThrow(() => audio.resume());
  assert.doesNotThrow(() => audio.dispose());
});

test("shop cues are lazy, finite, and optionally vibrate", () => {
  const { calls, AudioContextClass } = createAudioHarness();
  const vibrations = [];
  const audio = createBurgerShopAudio({
    AudioContextClass,
    navigatorTarget: { vibrate: (pattern) => vibrations.push(pattern) },
  });

  assert.equal(audio.play("pick"), true);
  assert.equal(audio.play("bell"), true);
  assert.equal(calls.filter(([name]) => name === "construct").length, 1);
  assert.equal(calls.filter(([name]) => name === "start").length, 2);
  assert.equal(calls.filter(([name]) => name === "stop").length, 2);
  assert.deepEqual(vibrations, [8, [16, 24, 18]]);

  audio.setMuted(true);
  audio.setHaptics(false);
  assert.equal(audio.play("result"), false);
  assert.equal(calls.filter(([name]) => name === "start").length, 2);
  assert.deepEqual(vibrations, [8, [16, 24, 18]]);
});

test("background pause, foreground resume, and disposal are silent-safe", async () => {
  const { calls, AudioContextClass } = createAudioHarness();
  const audio = createBurgerShopAudio({ AudioContextClass, navigatorTarget: null });

  audio.play("tick");
  assert.equal(await audio.pause(), true);
  assert.equal(await audio.resume(), true);
  assert.equal(await audio.dispose(), true);
  assert.deepEqual(
    calls.filter(([name]) => ["suspend", "resume", "close"].includes(name)),
    [["suspend"], ["resume"], ["close"]],
  );
  assert.equal(audio.play("drop"), false);
});
