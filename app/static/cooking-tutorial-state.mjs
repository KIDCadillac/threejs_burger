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

function resolveStorage(storage, globalTarget) {
  if (storage !== undefined) return storage;
  try {
    return globalTarget?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createCookingTutorial({ storage, globalTarget = globalThis } = {}) {
  const resolvedStorage = resolveStorage(storage, globalTarget);
  try {
    if (resolvedStorage?.getItem?.(STORAGE_KEY) === "complete") return frozen("done");
  } catch {
    // Treat unreadable storage like a first visit.
  }
  return frozen("pick");
}

export function advanceCookingTutorial(
  state,
  action,
  { storage, globalTarget = globalThis } = {},
) {
  if (state.step === "done" || ACTION_FOR_STEP[state.step] !== action) return state;
  const index = TUTORIAL_STEPS.indexOf(state.step);
  const step = TUTORIAL_STEPS[index + 1] ?? "done";
  if (step === "done") saveCompletion(resolveStorage(storage, globalTarget));
  return frozen(step, { replay: state.replay });
}

export function skipCookingTutorial(state, { storage, globalTarget = globalThis } = {}) {
  saveCompletion(resolveStorage(storage, globalTarget));
  return frozen("done", { replay: state.replay, skipped: true });
}

export function replayCookingTutorial() {
  return frozen("pick", { replay: true });
}

export function reconcileCookingTutorial(
  tutorial,
  cooking,
  { selectedLayerId = null, reset = false } = {},
) {
  if (tutorial.step === "done") return tutorial;
  const options = { replay: tutorial.replay, skipped: tutorial.skipped };
  if (reset) return frozen("pick", options);
  if (!cooking?.assembledOrder?.length) {
    return frozen(selectedLayerId ? "drop" : "pick", options);
  }
  const hasRotation = Object.values(cooking.rotations ?? {}).some((yaw) => (
    typeof yaw === "number" && Number.isFinite(yaw) && Math.abs(yaw) > 1e-9
  ));
  if (!hasRotation) return frozen("rotate", options);
  if (!cooking?.strokes?.length) return frozen("sauce", options);
  if (!cooking.complete) return frozen("assemble", options);
  return frozen("finish", options);
}
