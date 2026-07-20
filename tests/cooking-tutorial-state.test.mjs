import test from "node:test";
import assert from "node:assert/strict";

import {
  createCookingTutorial,
  advanceCookingTutorial,
  skipCookingTutorial,
  replayCookingTutorial,
  reconcileCookingTutorial,
  TUTORIAL_STEPS,
} from "../app/static/cooking-tutorial-state.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("first-run tutorial advances only for the matching cooking action", () => {
  const storage = memoryStorage();
  let tutorial = createCookingTutorial({ storage });
  assert.equal(tutorial.step, "pick");

  tutorial = advanceCookingTutorial(tutorial, "rotated", { storage });
  assert.equal(tutorial.step, "pick");
  for (const [action, step] of [
    ["picked-layer", "drop"],
    ["dropped-on-prep", "rotate"],
    ["rotated-layer", "sauce"],
    ["created-sauce-stroke", "assemble"],
    ["assembled-all", "finish"],
    ["finished", "done"],
  ]) {
    tutorial = advanceCookingTutorial(tutorial, action, { storage });
    assert.equal(tutorial.step, step);
  }
  assert.equal(storage.values.get("solo-cooking-tutorial"), "complete");
});

test("completed tutorials stay quiet, while replay starts over without deleting completion", () => {
  const storage = memoryStorage({ "solo-cooking-tutorial": "complete" });
  const completed = createCookingTutorial({ storage });
  assert.equal(completed.step, "done");

  const replayed = replayCookingTutorial(completed);
  assert.equal(replayed.step, "pick");
  assert.equal(replayed.replay, true);
  assert.equal(storage.values.get("solo-cooking-tutorial"), "complete");

  const skipped = skipCookingTutorial(replayed, { storage });
  assert.equal(skipped.step, "done");
  assert.equal(skipped.skipped, true);
});

test("storage read and write failures never block cooking", () => {
  const storage = {
    getItem() { throw new Error("private mode"); },
    setItem() { throw new Error("quota"); },
  };
  let tutorial;
  assert.doesNotThrow(() => { tutorial = createCookingTutorial({ storage }); });
  assert.equal(tutorial.step, "pick");
  assert.doesNotThrow(() => { tutorial = skipCookingTutorial(tutorial, { storage }); });
  assert.equal(tutorial.step, "done");
});

test("a throwing global localStorage getter is treated like unavailable storage", () => {
  const globalTarget = {};
  let reads = 0;
  Object.defineProperty(globalTarget, "localStorage", {
    get() { reads += 1; throw new DOMException("denied", "SecurityError"); },
  });
  let tutorial;
  assert.doesNotThrow(() => {
    tutorial = createCookingTutorial({ globalTarget });
  });
  assert.equal(tutorial.step, "pick");
  assert.equal(reads, 1);
});

test("tutorial state is frozen and exposes the fixed six-step journey", () => {
  const tutorial = createCookingTutorial({ storage: null });
  assert.deepEqual(TUTORIAL_STEPS, ["pick", "drop", "rotate", "sauce", "assemble", "finish"]);
  assert.ok(Object.isFrozen(TUTORIAL_STEPS));
  assert.ok(Object.isFrozen(tutorial));
});

test("reconciliation derives honest guidance from immutable cooking progress", () => {
  const active = replayCookingTutorial(createCookingTutorial({
    storage: memoryStorage({ "solo-cooking-tutorial": "complete" }),
  }));
  const cooking = (changes = {}) => ({
    assembledOrder: [],
    rotations: {
      "bottom-bun": 0, patty: 0, cheese: 0, tomato: 0,
      lettuce: 0, pickle: 0, "top-bun": 0,
    },
    strokes: [],
    complete: false,
    finished: false,
    ...changes,
  });

  assert.equal(reconcileCookingTutorial(active, cooking(), { selectedLayerId: null }).step, "pick");
  assert.equal(reconcileCookingTutorial(active, cooking(), { selectedLayerId: "patty" }).step, "drop");
  assert.equal(reconcileCookingTutorial(active, cooking({ assembledOrder: ["patty"] })).step, "rotate");
  assert.equal(reconcileCookingTutorial(active, cooking({
    assembledOrder: ["patty"], rotations: { ...cooking().rotations, patty: 0.4 },
  })).step, "sauce");
  assert.equal(reconcileCookingTutorial(active, cooking({
    assembledOrder: ["patty"],
    rotations: { ...cooking().rotations, patty: 0.4 },
    strokes: [{ sauce: "chili" }],
  })).step, "assemble");
  assert.equal(reconcileCookingTutorial(active, cooking({
    assembledOrder: ["bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun"],
    rotations: { ...cooking().rotations, patty: 0.4 },
    strokes: [{ sauce: "chili" }],
    complete: true,
  })).step, "finish");
});

test("reconciliation keeps a persisted completed tutorial quiet but resets active replay", () => {
  const completed = createCookingTutorial({
    storage: memoryStorage({ "solo-cooking-tutorial": "complete" }),
  });
  const cooking = {
    assembledOrder: [], rotations: {}, strokes: [], complete: false, finished: false,
  };
  assert.strictEqual(reconcileCookingTutorial(completed, cooking, { reset: true }), completed);

  const replayed = replayCookingTutorial(completed);
  const reset = reconcileCookingTutorial(replayed, cooking, { reset: true });
  assert.equal(reset.step, "pick");
  assert.equal(reset.replay, true);
});
