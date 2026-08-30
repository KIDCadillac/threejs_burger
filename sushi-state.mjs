export const SUSHI_STATIONS = Object.freeze(["prep", "assembly"]);

export const SUSHI_FISH_PREP = Object.freeze({
  scaleStrokesRequired: 3,
  pinBonesRequired: 3,
  sliceCutsRequired: 2,
});

export const SUSHI_TASKS = Object.freeze([
  "scale-fish",
  "reserve-head-collar",
  "fillet-fish",
  "remove-pinbones",
  "skin-fillet",
  "slice-fillet",
  "portion-rice",
  "shape-rice",
  "place-fish",
  "grip-sushi",
  "plate-sushi",
  "serve",
]);

export const SUSHI_RECIPE = Object.freeze({
  id: "salmon-nigiri",
  label: "三文鱼握寿司",
  tasks: SUSHI_TASKS,
});

function fishReady(state) {
  return state.scaleStrokes >= SUSHI_FISH_PREP.scaleStrokesRequired
    && state.headCollarReserved
    && state.filleted
    && state.pinBonesRemoved >= SUSHI_FISH_PREP.pinBonesRequired
    && state.skinReserved
    && state.sliceCuts >= SUSHI_FISH_PREP.sliceCutsRequired;
}

function derivePhase(state) {
  if (state.phase === "serving") return "serving";
  if (state.plated) return "ready";
  if (!fishReady(state) || !state.riceShaped) return "prepping";
  return "assembling";
}

function immutableState({
  station = "prep",
  scaleStrokes = 0,
  headCollarReserved = false,
  filleted = false,
  fishFrameReserved = false,
  pinBonesRemoved = 0,
  skinReserved = false,
  sliceCuts = 0,
  ricePortioned = false,
  riceShaped = false,
  fishPlaced = false,
  gripped = false,
  plated = false,
  servedCount = 0,
  phase = null,
} = {}) {
  const normalized = {
    recipeId: SUSHI_RECIPE.id,
    station: SUSHI_STATIONS.includes(station) ? station : "prep",
    scaleStrokes: Math.max(0, Math.min(
      SUSHI_FISH_PREP.scaleStrokesRequired,
      Math.trunc(Number(scaleStrokes) || 0),
    )),
    headCollarReserved: Boolean(headCollarReserved),
    filleted: Boolean(filleted),
    fishFrameReserved: Boolean(fishFrameReserved),
    pinBonesRemoved: Math.max(0, Math.min(
      SUSHI_FISH_PREP.pinBonesRequired,
      Math.trunc(Number(pinBonesRemoved) || 0),
    )),
    skinReserved: Boolean(skinReserved),
    sliceCuts: Math.max(0, Math.min(
      SUSHI_FISH_PREP.sliceCutsRequired,
      Math.trunc(Number(sliceCuts) || 0),
    )),
    ricePortioned: Boolean(ricePortioned),
    riceShaped: Boolean(riceShaped),
    fishPlaced: Boolean(fishPlaced),
    gripped: Boolean(gripped),
    plated: Boolean(plated),
    servedCount: Math.max(0, Math.trunc(Number(servedCount) || 0)),
    phase: phase === "serving" ? "serving" : null,
  };
  normalized.phase = derivePhase(normalized);
  return Object.freeze(normalized);
}

function rejected(state, expected, reason = "wrong-step") {
  return Object.freeze({ accepted: false, expected, reason, state });
}

function accepted(state, options = {}) {
  return Object.freeze({ accepted: true, state, ...options });
}

export function createSushiState(options = {}) {
  return immutableState(options);
}

export function sushiFishStage(state) {
  if (!state || state.scaleStrokes < SUSHI_FISH_PREP.scaleStrokesRequired) return "whole";
  if (!state.headCollarReserved) return "scaled";
  if (!state.filleted) return "headed";
  if (state.pinBonesRemoved < SUSHI_FISH_PREP.pinBonesRequired) return "filleted";
  if (!state.skinReserved) return "deboned";
  if (state.sliceCuts < SUSHI_FISH_PREP.sliceCutsRequired) return "skinned";
  return "sliced";
}

export function sushiNextTask(state) {
  if (!state || state.phase === "serving") return null;
  if (state.scaleStrokes < SUSHI_FISH_PREP.scaleStrokesRequired) return "scale-fish";
  if (!state.headCollarReserved) return "reserve-head-collar";
  if (!state.filleted) return "fillet-fish";
  if (state.pinBonesRemoved < SUSHI_FISH_PREP.pinBonesRequired) return "remove-pinbones";
  if (!state.skinReserved) return "skin-fillet";
  if (state.sliceCuts < SUSHI_FISH_PREP.sliceCutsRequired) return "slice-fillet";
  if (!state.ricePortioned) return "portion-rice";
  if (!state.riceShaped) return "shape-rice";
  if (!state.fishPlaced) return "place-fish";
  if (!state.gripped) return "grip-sushi";
  if (!state.plated) return "plate-sushi";
  return "serve";
}

export function changeSushiStation(state, station) {
  if (!state || state.phase === "serving" || !SUSHI_STATIONS.includes(station)) return state;
  if (state.station === station) return state;
  return immutableState({ ...state, station });
}

export function performSushiFishPrep(state, actionId) {
  const expected = sushiNextTask(state);
  if (!actionId || actionId !== expected || !SUSHI_TASKS.slice(0, 6).includes(actionId)) {
    return rejected(state, expected);
  }
  if (actionId === "scale-fish") {
    const scaleStrokes = state.scaleStrokes + 1;
    return accepted(immutableState({ ...state, scaleStrokes }), {
      actionId,
      actionCount: scaleStrokes,
      actionComplete: scaleStrokes === SUSHI_FISH_PREP.scaleStrokesRequired,
    });
  }
  if (actionId === "reserve-head-collar") {
    return accepted(immutableState({ ...state, headCollarReserved: true }), {
      actionId,
      actionCount: 1,
      actionComplete: true,
      byproduct: "head-collar",
    });
  }
  if (actionId === "fillet-fish") {
    return accepted(immutableState({ ...state, filleted: true, fishFrameReserved: true }), {
      actionId,
      actionCount: 1,
      actionComplete: true,
      byproduct: "fish-frame",
    });
  }
  if (actionId === "remove-pinbones") {
    const pinBonesRemoved = state.pinBonesRemoved + 1;
    return accepted(immutableState({ ...state, pinBonesRemoved }), {
      actionId,
      actionCount: pinBonesRemoved,
      actionComplete: pinBonesRemoved === SUSHI_FISH_PREP.pinBonesRequired,
      byproduct: "pin-bone",
    });
  }
  if (actionId === "skin-fillet") {
    return accepted(immutableState({ ...state, skinReserved: true }), {
      actionId,
      actionCount: 1,
      actionComplete: true,
      byproduct: "salmon-skin",
    });
  }
  const sliceCuts = state.sliceCuts + 1;
  return accepted(immutableState({ ...state, sliceCuts }), {
    actionId,
    actionCount: sliceCuts,
    actionComplete: sliceCuts === SUSHI_FISH_PREP.sliceCutsRequired,
    prepComplete: sliceCuts === SUSHI_FISH_PREP.sliceCutsRequired,
  });
}

export function portionSushiRice(state) {
  const expected = sushiNextTask(state);
  if (expected !== "portion-rice") return rejected(state, expected);
  return accepted(immutableState({ ...state, ricePortioned: true }));
}

export function shapeSushiRice(state) {
  const expected = sushiNextTask(state);
  if (expected !== "shape-rice") return rejected(state, expected);
  return accepted(immutableState({ ...state, riceShaped: true }), { prepComplete: true });
}

export function placeSushiFish(state) {
  const expected = sushiNextTask(state);
  if (state?.station !== "assembly") return rejected(state, expected, "wrong-station");
  if (expected !== "place-fish") return rejected(state, expected);
  return accepted(immutableState({ ...state, fishPlaced: true }));
}

export function gripSushi(state) {
  const expected = sushiNextTask(state);
  if (state?.station !== "assembly") return rejected(state, expected, "wrong-station");
  if (expected !== "grip-sushi") return rejected(state, expected);
  return accepted(immutableState({ ...state, gripped: true }));
}

export function plateSushi(state) {
  const expected = sushiNextTask(state);
  if (state?.station !== "assembly") return rejected(state, expected, "wrong-station");
  if (expected !== "plate-sushi") return rejected(state, expected);
  return accepted(immutableState({ ...state, plated: true }), { complete: true });
}

export function startSushiService(state) {
  if (!state || state.phase !== "ready" || sushiNextTask(state) !== "serve") return state;
  return immutableState({ ...state, phase: "serving" });
}

export function completeSushiService(state) {
  if (!state || state.phase !== "serving") return state;
  return immutableState({ servedCount: state.servedCount + 1 });
}

export function resetSushiState(state = createSushiState()) {
  return immutableState({ servedCount: state.servedCount });
}
