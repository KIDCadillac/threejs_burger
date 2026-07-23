import { createReplicaCompetitionSnapshot } from "./replica-duel-rules.mjs";
import { hydrateSoloCookingState } from "./cooking-solo-save.mjs";
import {
  addSoloSauceStroke,
  createSoloCookingState,
  moveSoloLayer,
  placeSoloLayer,
  rotateSoloLayer,
  setSoloStationContent,
} from "./cooking-solo-state.mjs";
import {
  WORKBENCH_REGION_OPTIONS,
  WORKBENCH_SLOTS,
  createDefaultWorkbenchLoadout,
} from "./workbench-loadout.mjs";

const DRAFT_REASONS = new Set([
  "drop-layer",
  "remove-layer",
  "rotate-layer",
  "sauce-stroke",
  "sauce-gesture",
  "undo",
  "reset",
  "focus-layer-moved",
  "focus-layer-reordered",
  "focus-layer-rotated",
  "delete-focused-layer",
]);

function requireSnapshot(snapshot) {
  if (!snapshot || snapshot.food !== "burger" || !Array.isArray(snapshot.layers)
    || !Array.isArray(snapshot.strokes)) {
    throw new TypeError("competition snapshot must describe a burger");
  }
  return snapshot;
}

function slotForIngredient(state, ingredientId) {
  const candidates = WORKBENCH_SLOTS.filter(({ region }) => (
    region !== "sauce" && WORKBENCH_REGION_OPTIONS[region].includes(ingredientId)
  ));
  return candidates.find(({ slotId }) => state.stationContents[slotId] === ingredientId)
    ?? candidates[0]
    ?? null;
}

export function competitionSnapshotToSoloState(snapshot, {
  loadout = createDefaultWorkbenchLoadout(),
} = {}) {
  requireSnapshot(snapshot);
  let state = createSoloCookingState({ loadout });
  const instanceByLayerId = new Map();

  snapshot.layers.forEach((layer, index) => {
    const slot = slotForIngredient(state, layer.ingredientId);
    if (!slot) throw new TypeError(`No workbench slot supports ${String(layer.ingredientId)}`);
    if (state.stationContents[slot.slotId] !== layer.ingredientId) {
      state = setSoloStationContent(state, slot.slotId, layer.ingredientId);
    }
    const instanceId = state.stationSources[slot.slotId];
    state = placeSoloLayer(state, instanceId, index, { replenish: true });
    state = moveSoloLayer(state, instanceId, { x: layer.x, z: layer.z });
    state = rotateSoloLayer(state, instanceId, layer.yaw);
    instanceByLayerId.set(layer.layerId, instanceId);
  });

  snapshot.strokes.forEach((stroke) => {
    const targetLayer = snapshot.layers[stroke.targetLayerIndex];
    const instanceId = targetLayer ? instanceByLayerId.get(targetLayer.layerId) : null;
    if (!instanceId) throw new TypeError("competition sauce targets a missing layer");
    state = addSoloSauceStroke(state, {
      sauce: stroke.sauceId,
      layerId: instanceId,
      amount: stroke.amount,
      points: stroke.points,
    });
  });

  const detached = hydrateSoloCookingState(state);
  if (!detached) throw new TypeError("competition snapshot could not be rebuilt");
  return detached;
}

export function createReplicaDuelStageAdapter({
  stage,
  onDraft = () => {},
  onFinish = () => {},
} = {}) {
  if (!stage?.setCompetitionReadOnly || !stage?.replaceCompetitionState
    || !stage?.clearCompetitionScene || !stage?.getState) {
    throw new TypeError("stage must expose the competition adapter boundary");
  }
  if (typeof onDraft !== "function" || typeof onFinish !== "function") {
    throw new TypeError("onDraft and onFinish must be functions");
  }

  let disposed = false;
  let applyingView = false;
  let controlsEnabled = false;
  let visibleKey = null;
  let lastDraftKey = null;

  const applyView = (view) => {
    if (disposed) return false;
    applyingView = true;
    try {
      controlsEnabled = Boolean(view?.controlsEnabled);
      stage.setCompetitionReadOnly(!controlsEnabled);
      const nextKey = view?.visibleSnapshot ? JSON.stringify(view.visibleSnapshot) : null;
      if (nextKey === visibleKey) return true;
      visibleKey = nextKey;
      lastDraftKey = controlsEnabled ? nextKey : null;
      if (!view?.visibleSnapshot) return stage.clearCompetitionScene();
      const state = competitionSnapshotToSoloState(view.visibleSnapshot, {
        loadout: stage.getState()?.stationContents ?? createDefaultWorkbenchLoadout(),
      });
      return stage.replaceCompetitionState(state);
    } finally {
      applyingView = false;
    }
  };

  const handleStageChange = (detail) => {
    if (disposed || applyingView || !controlsEnabled || !DRAFT_REASONS.has(detail?.reason)) {
      return false;
    }
    const draft = createReplicaCompetitionSnapshot(detail.state ?? stage.getState());
    const key = JSON.stringify(draft);
    if (key === lastDraftKey) return false;
    lastDraftKey = key;
    visibleKey = key;
    onDraft(draft);
    return true;
  };

  const requestFinish = () => {
    if (disposed || !controlsEnabled) return false;
    const draft = createReplicaCompetitionSnapshot(stage.getState());
    onFinish(draft);
    return true;
  };

  return Object.freeze({
    applyView,
    handleStageChange,
    requestFinish,
    dispose() {
      if (disposed) return;
      disposed = true;
      controlsEnabled = false;
      stage.setCompetitionReadOnly(true);
    },
  });
}
