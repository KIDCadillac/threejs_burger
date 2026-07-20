export const TUTORIAL_STEPS = Object.freeze([
  "pick", "drop", "rotate", "sauce", "assemble", "finish",
]);

const STORAGE_KEY = "solo-cooking-tutorial";
const ACTION_FOR_STEP = Object.freeze({
  pick: "picked-layer",
  drop: "dropped-on-prep",
  rotate: "rotated-layer",
  sauce: "created-sauce-stroke",
  assemble: "assembled-all",
  finish: "finished",
});

function frozen(step, { replay = false, skipped = false } = {}) {
  return Object.freeze({ step, replay: Boolean(replay), skipped: Boolean(skipped) });
}

function saveCompletion(storage) {
  try {
    storage?.setItem?.(STORAGE_KEY, "complete");
  } catch {
    // Private browsing and storage quotas must never block the game.
  }
}

export function createCookingTutorial({ storage = globalThis.localStorage } = {}) {
  try {
    if (storage?.getItem?.(STORAGE_KEY) === "complete") return frozen("done");
  } catch {
    // Treat unreadable storage like a first visit.
  }
  return frozen("pick");
}

export function advanceCookingTutorial(state, action, { storage = globalThis.localStorage } = {}) {
  if (state.step === "done" || ACTION_FOR_STEP[state.step] !== action) return state;
  const index = TUTORIAL_STEPS.indexOf(state.step);
  const step = TUTORIAL_STEPS[index + 1] ?? "done";
  if (step === "done") saveCompletion(storage);
  return frozen(step, { replay: state.replay });
}

export function skipCookingTutorial(state, { storage = globalThis.localStorage } = {}) {
  saveCompletion(storage);
  return frozen("done", { replay: state.replay, skipped: true });
}

export function replayCookingTutorial() {
  return frozen("pick", { replay: true });
}
