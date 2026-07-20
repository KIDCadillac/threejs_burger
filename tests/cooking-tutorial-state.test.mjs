import test from "node:test";
import assert from "node:assert/strict";

import {
  createCookingTutorial,
  advanceCookingTutorial,
  skipCookingTutorial,
  replayCookingTutorial,
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

test("tutorial state is frozen and exposes the fixed six-step journey", () => {
  const tutorial = createCookingTutorial({ storage: null });
  assert.deepEqual(TUTORIAL_STEPS, ["pick", "drop", "rotate", "sauce", "assemble", "finish"]);
  assert.ok(Object.isFrozen(TUTORIAL_STEPS));
  assert.ok(Object.isFrozen(tutorial));
});
