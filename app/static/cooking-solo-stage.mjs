import {
  SOLO_BURGER_INGREDIENT_IDS,
  SOLO_COOKING_SAUCE_IDS,
} from "./burger-recipes.mjs";
import { createThreeSceneHost } from "./three-scene-host.mjs";
import { createCookingWorkbench3D } from "./cooking-workbench-3d.mjs";
import { createBurgerModel3D } from "./burger-model-3d.mjs";
import { createCondimentTools3D } from "./condiment-tools-3d.mjs";
import { createCookingInteractionController } from "./cooking-interaction-controller.mjs";
import { resolveSoloLayerDrop } from "./cooking-drop-intent.mjs";
import {
  createCookingMotion,
  sampleCookingMotion,
} from "./cooking-insertion-animation.mjs";
import {
  createSoloCookingState,
  setSoloStationContent,
  placeSoloLayer,
  removeSoloLayer,
  rotateSoloLayer,
  addSoloSauceStroke,
  addSoloSauceStrokes,
  finishSoloCooking,
  continueSoloCooking,
  undoSoloCooking,
  resetSoloCookingState,
  selectSoloReferenceRecipe,
  serializeSoloComposition,
  MAX_SOLO_STACK_LAYERS,
} from "./cooking-solo-state.mjs";
import {
  WORKBENCH_SLOTS,
  WORKBENCH_REGION_OPTIONS,
  getWorkbenchSlot,
  normalizeWorkbenchLoadout,
} from "./workbench-loadout.mjs";
import { hydrateSoloCookingState } from "./cooking-solo-save.mjs";
import {
  createCookingTutorial,
  advanceCookingTutorial,
  skipCookingTutorial,
  replayCookingTutorial,
  reconcileCookingTutorial,
} from "./cooking-tutorial-state.mjs";
import {
  DEFAULT_BURGER_TUNING,
  normalizeBurgerTuning,
} from "./burger-tuning.mjs";

const STACK_OVERLAP = 0.025;
const EXPLODED_GAP = 0.42;
const SNAP_DURATION = 190;
const MAX_STACK_CAMERA_DISTANCE = 320;
const STACK_CAMERA_DEPTH_PADDING = 25;
const STACK_CAMERA_SAFE_NDC_MARGIN = 0.86;
const STACK_CAMERA_NEAR_PADDING = 0.25;
const MAX_BOTTOM_LAYER_SINK = 0.03;
const SWITCHABLE_WORKBENCH_CAMERA_SCALE = 0.59;
const SWITCHABLE_SIDE_SELECTOR_OFFSET = 0.55;

const layerStackMinY = (layer) => (
  Number.isFinite(layer?.userData?.stackMinY)
    ? layer.userData.stackMinY
    : layer.userData.boundsMinY
);

const layerStackMaxY = (layer) => (
  Number.isFinite(layer?.userData?.stackMaxY)
    ? layer.userData.stackMaxY
    : layer.userData.boundsMaxY
);

const layerStackThickness = (layer) => layerStackMaxY(layer) - layerStackMinY(layer);

function createCelebration(THREE) {
  const root = new THREE.Group();
  root.name = "solo-cooking-celebration";
  root.visible = false;
  root.position.set(0, 3.1, 0);
  const geometry = new THREE.OctahedronGeometry(0.12, 0);
  const materials = [0xffc649, 0xff6b52, 0x69c885, 0x68a8df].map((color) => (
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, flatShading: true })
  ));
  const pieces = [];
  for (let index = 0; index < 18; index += 1) {
    const mesh = new THREE.Mesh(geometry, materials[index % materials.length]);
    const angle = (index / 18) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * 2.35, (index % 3) * 0.32, Math.sin(angle) * 1.55);
    mesh.rotation.set(angle, angle * 0.7, angle * 0.4);
    mesh.userData.celebrationOffset = angle;
    root.add(mesh);
    pieces.push(mesh);
  }
  let disposed = false;
  return {
    root,
    pieces,
    get visible() { return root.visible; },
    set visible(value) { root.visible = Boolean(value); },
    tick(time) {
      if (!root.visible) return;
      root.rotation.y = time * 0.00035;
      for (const piece of pieces) {
        piece.rotation.x += 0.018;
        piece.rotation.z += 0.012;
        piece.position.y = 0.25 + Math.sin(time * 0.004 + piece.userData.celebrationOffset) * 0.35;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}

function validateFactory(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

export function createSoloCookingStage({
  THREE,
  canvas,
  storage,
  loadout,
  initialState,
  documentTarget = globalThis.document,
  hostFactory = createThreeSceneHost,
  workbenchFactory = createCookingWorkbench3D,
  burgerFactory = createBurgerModel3D,
  toolsFactory = createCondimentTools3D,
  celebrationFactory = createCelebration,
  controllerFactory = createCookingInteractionController,
  onChange = () => {},
  onError = () => {},
  onStationSelector = () => {},
  reducedMotion = false,
  tuning = DEFAULT_BURGER_TUNING,
  vibrate,
  resourceDisposeObserver = () => {},
} = {}) {
  if (!THREE?.Scene || !THREE?.Group || !THREE?.Vector3) {
    throw new TypeError("A compatible Three.js namespace is required");
  }
  if (!canvas?.addEventListener || !canvas?.removeEventListener) {
    throw new TypeError("A canvas event target is required");
  }
  validateFactory(hostFactory, "hostFactory");
  validateFactory(workbenchFactory, "workbenchFactory");
  validateFactory(burgerFactory, "burgerFactory");
  validateFactory(toolsFactory, "toolsFactory");
  validateFactory(celebrationFactory, "celebrationFactory");
  validateFactory(controllerFactory, "controllerFactory");
  validateFactory(onChange, "onChange");
  validateFactory(onError, "onError");
  validateFactory(onStationSelector, "onStationSelector");
  validateFactory(resourceDisposeObserver, "resourceDisposeObserver");

  const cleanupTasks = [];
  const cleanup = (primaryError = null) => {
    let firstError = primaryError;
    while (cleanupTasks.length) {
      const task = cleanupTasks.pop();
      try {
        task();
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
    if (firstError) throw firstError;
  };
  const disposeObserved = (resource, name) => {
    let firstError = null;
    try {
      resource?.dispose?.();
    } catch (error) {
      firstError = error;
    }
    try {
      resourceDisposeObserver(name);
    } catch (error) {
      if (!firstError) firstError = error;
    }
    if (firstError) throw firstError;
  };

  try {
  const host = hostFactory({ canvas });
  cleanupTasks.push(() => host?.dispose?.());
  if (!host?.scene?.isScene || !host?.camera?.isCamera) {
    throw new TypeError("hostFactory must return a Three scene and camera");
  }
  const verifiedInitialState = Object.isFrozen(initialState)
    && hydrateSoloCookingState(initialState)
    ? initialState
    : null;
  const activeLoadout = normalizeWorkbenchLoadout(
    verifiedInitialState?.stationContents ?? loadout,
  );
  const regionIndices = { bread: 0, filling: 0, sauce: 0 };
  const slotDescriptors = Object.freeze(WORKBENCH_SLOTS.map(({ slotId, region }) => (
    Object.freeze({
      slotId,
      region,
      kind: region === "sauce" ? "tool" : "ingredient",
      index: regionIndices[region]++,
      contentId: activeLoadout[slotId],
    })
  )));
  let state = verifiedInitialState ?? createSoloCookingState({ loadout: activeLoadout });
  const workbench = workbenchFactory(THREE, verifiedInitialState && !verifiedInitialState.stationContents
    ? {
      ingredientIds: SOLO_BURGER_INGREDIENT_IDS,
      toolIds: SOLO_COOKING_SAUCE_IDS,
    }
    : { slotDescriptors });
  cleanupTasks.push(() => disposeObserved(workbench, "workbench"));
  for (const station of [...workbench.ingredientSlots, ...workbench.toolDocks]) {
    if (!station.controlAnchor?.isObject3D) continue;
    if (station.region === "bread") {
      station.controlAnchor.position.x = -SWITCHABLE_SIDE_SELECTOR_OFFSET;
    }
    if (station.region === "sauce") {
      station.controlAnchor.position.x = SWITCHABLE_SIDE_SELECTOR_OFFSET;
    }
  }
  const burger = burgerFactory(THREE, {
    ingredientIds: SOLO_BURGER_INGREDIENT_IDS,
    sauceIds: SOLO_COOKING_SAUCE_IDS,
  });
  cleanupTasks.push(() => disposeObserved(burger, "burger"));
  host.scene.add(workbench.root);
  workbench.root.add(burger.root);
  const tools = toolsFactory(THREE, {
    toolDocks: workbench.toolDocks,
    sauceIds: SOLO_COOKING_SAUCE_IDS,
  });
  cleanupTasks.push(() => disposeObserved(tools, "tools"));
  const celebration = celebrationFactory(THREE);
  cleanupTasks.push(() => celebration?.dispose?.());
  workbench.root.add(celebration.root);
  host.scene.background = new THREE.Color(0x3a211b);
  if (host.renderer?.shadowMap) {
    host.renderer.shadowMap.enabled = true;
    if (THREE.PCFSoftShadowMap !== undefined) host.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const cameraView = workbench.getLayout().camera;
  host.camera.fov = cameraView.fov;
  host.camera.near = cameraView.near;
  host.camera.far = Math.max(
    cameraView.far,
    MAX_STACK_CAMERA_DISTANCE + STACK_CAMERA_DEPTH_PADDING,
  );
  // The generic workbench camera includes editor margins. The phone composition
  // intentionally crops only decorative counter edges while retaining every control.
  host.camera.position.set(
    cameraView.position.x * SWITCHABLE_WORKBENCH_CAMERA_SCALE,
    cameraView.position.y * SWITCHABLE_WORKBENCH_CAMERA_SCALE,
    cameraView.position.z * SWITCHABLE_WORKBENCH_CAMERA_SCALE,
  );
  host.camera.lookAt(cameraView.target.x, cameraView.target.y, cameraView.target.z);
  host.camera.updateProjectionMatrix?.();
  host.camera.updateMatrixWorld?.(true);

  let activeTuning = normalizeBurgerTuning(tuning);
  let tutorial = createCookingTutorial({ storage });
  let selectedLayerId = null;
  let dropIntent = null;
  let expanded = false;
  let focused = false;
  let focusCameraView = null;
  let focusWorkbenchVisible = true;
  let disposed = false;
  let externallyPaused = false;
  let suppressInvalidFeedback = false;
  let lastFrameTime = 0;
  const transitions = new Map();
  let activeMotion = null;
  let pickMotion = null;
  let highlightedLayerId = null;
  let activeSlotPreview = null;
  const cancelLayerTransition = (layerId) => transitions.delete(layerId);

  const emit = (reason, extra = {}) => {
    onChange(Object.freeze({
      reason,
      state,
      tutorial,
      selectedLayerId,
      dropIntent,
      expanded,
      focused,
      progress: `${state.assembledOrder.length}/${MAX_SOLO_STACK_LAYERS}`,
      composition: serializeSoloComposition(state),
      ...extra,
    }));
  };

  const advanceTutorial = (action) => {
    const previous = tutorial;
    tutorial = advanceCookingTutorial(tutorial, action, { storage });
    if (tutorial !== previous) emit("tutorial");
  };

  const ingredientForInstance = (instanceId) => state.instances[instanceId];
  const homeSlotIdForInstance = (instanceId) => {
    const location = state.locations[instanceId];
    if (location?.kind === "bin" && typeof location.slotId === "string") {
      return location.slotId;
    }
    return typeof state.instanceHomes?.[instanceId] === "string"
      ? state.instanceHomes[instanceId]
      : null;
  };
  const stationForInstance = (instanceId) => {
    const slotId = homeSlotIdForInstance(instanceId);
    const station = slotId ? workbench.getStationBySlot?.(slotId) : null;
    return station ?? workbench.getStation("ingredient", ingredientForInstance(instanceId));
  };
  const tuningFor = (instanceId) => activeTuning.ingredients[ingredientForInstance(instanceId)];
  const targetScale = (instanceId) => {
    const config = tuningFor(instanceId);
    const presentationScale = activeTuning.global.presentationScale;
    return new THREE.Vector3(
      presentationScale * config.scaleX,
      presentationScale * config.scaleY,
      presentationScale * config.scaleZ,
    );
  };

  const targetTransforms = (assembledOrder = state.assembledOrder) => {
    workbench.root.updateMatrixWorld?.(true);
    burger.root.updateMatrixWorld?.(true);
    const result = new Map();
    let cursorY = workbench.prep.supportY;
    assembledOrder.forEach((layerId, index) => {
      const layer = burger.getLayer(layerId);
      const config = tuningFor(layerId);
      const scale = targetScale(layerId);
      const sinkY = index === 0
        ? Math.min(config.sinkY, MAX_BOTTOM_LAYER_SINK)
        : config.sinkY;
      const y = cursorY - layerStackMinY(layer) * scale.y - sinkY;
      result.set(layerId, {
        position: new THREE.Vector3(0, y + (expanded ? index * EXPLODED_GAP : 0), 0),
        scale,
        yaw: state.rotations[layerId],
      });
      cursorY = y + layerStackMaxY(layer) * scale.y - STACK_OVERLAP;
    });
    for (const layerId of Object.keys(state.instances)) {
      if (result.has(layerId)) continue;
      const station = stationForInstance(layerId);
      const world = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
      const local = burger.root.worldToLocal(world.clone());
      result.set(layerId, {
        position: local,
        scale: targetScale(layerId),
        yaw: state.rotations[layerId],
      });
    }
    return result;
  };

  const captureLayerTransforms = () => new Map(Object.keys(state.instances).map((layerId) => {
    const layer = burger.getLayer(layerId);
    return [layerId, {
      position: layer.position.clone(),
      scale: layer.scale.clone(),
      yaw: layer.rotation.y,
    }];
  }));

  const restoreAuthoritativeTransforms = () => {
    const targets = targetTransforms();
    for (const [layerId, target] of targets) {
      const layer = burger.getLayer(layerId);
      layer.position.copy(target.position);
      layer.rotation.set(0, target.yaw, 0);
      layer.scale.copy(target.scale);
    }
    workbench.root.updateMatrixWorld?.(true);
    return targets;
  };

  const clearGrabVisuals = () => {
    if (highlightedLayerId) burger.setLayerHighlighted(highlightedLayerId, false);
    highlightedLayerId = null;
    burger.clearLayerDropPreview();
    workbench.clearDropCue();
    workbench.clearHighlights();
  };

  const clearSlotContentPreview = () => {
    let cleared = tools.clearSlotContentPreview?.() ?? false;
    if (activeSlotPreview) {
      activeSlotPreview.root.removeFromParent();
      for (const material of activeSlotPreview.materials) material.dispose?.();
      activeSlotPreview = null;
      cleared = true;
    }
    return cleared;
  };

  const clearTransientVisuals = ({ resync = true } = {}) => {
    activeMotion = null;
    pickMotion = null;
    transitions.clear();
    clearSlotContentPreview();
    clearGrabVisuals();
    if (resync) restoreAuthoritativeTransforms();
  };

  const syncTransforms = ({ animate = false } = {}) => {
    const targets = targetTransforms();
    for (const [layerId, target] of targets) {
      const layer = burger.getLayer(layerId);
      if (!animate || reducedMotion) {
        transitions.delete(layerId);
        layer.position.copy(target.position);
        layer.scale.copy(target.scale);
        layer.rotation.set(0, target.yaw, 0);
        continue;
      }
      transitions.set(layerId, {
        start: lastFrameTime,
        fromPosition: layer.position.clone(),
        fromYaw: layer.rotation.y,
        target,
      });
      layer.scale.copy(target.scale);
    }
    workbench.root.updateMatrixWorld?.(true);
  };

  const rebuildSauces = () => {
    burger.clearSauces();
    state.strokes.forEach((stroke) => burger.addSauceStroke(stroke));
  };

  const reorderLayers = () => {
    const fullOrder = [
      ...state.assembledOrder,
      ...Object.keys(state.instances).filter((id) => !state.assembledOrder.includes(id)),
    ];
    fullOrder.forEach((layerId, index) => burger.reorderLayer(layerId, index));
  };

  const applyVisualState = ({ animate = false, sauces = false } = {}) => {
    reorderLayers();
    if (sauces) rebuildSauces();
    syncTransforms({ animate });
    celebration.visible = state.finished;
  };

  const syncPhysicalSlot = (slotId) => {
    if (!state.stationContents || typeof slotId !== "string") return false;
    const slot = getWorkbenchSlot(slotId);
    const contentId = state.stationContents[slotId];
    if (slot.region === "sauce") tools.setSlotContent(slotId, contentId);
    workbench.setStationContent(slotId, contentId);
    return true;
  };

  const syncPhysicalStations = () => {
    if (!state.stationContents) return false;
    WORKBENCH_SLOTS.forEach(({ slotId }) => syncPhysicalSlot(slotId));
    return true;
  };

  const applyDropPreview = (intent) => {
    if (!intent?.id || intent.kind !== "prep") {
      burger.clearLayerDropPreview();
      workbench.clearDropCue();
      return false;
    }
    const selected = burger.getLayer(intent.id);
    const draggedPose = {
      position: selected.position.clone(),
      scale: selected.scale.clone(),
      yaw: selected.rotation.y,
    };
    const previewOrder = state.assembledOrder.filter((id) => id !== intent.id);
    const targets = targetTransforms(previewOrder);
    const targetIndex = Math.max(0, Math.min(intent.targetIndex, previewOrder.length));
    const upperIds = new Set(previewOrder.slice(targetIndex));
    const finalOrder = [...previewOrder];
    finalOrder.splice(targetIndex, 0, intent.id);
    const selectedTarget = targetTransforms(finalOrder).get(intent.id);
    const thickness = layerStackThickness(selected) * selectedTarget.scale.y;

    for (const [layerId, target] of targets) {
      if (layerId === intent.id) continue;
      const layer = burger.getLayer(layerId);
      layer.position.copy(target.position);
      if (upperIds.has(layerId)) layer.position.y += thickness + 0.08;
      layer.rotation.set(0, target.yaw, 0);
      layer.scale.copy(target.scale);
    }
    selected.position.copy(draggedPose.position);
    selected.rotation.set(0, draggedPose.yaw, 0);
    selected.scale.copy(draggedPose.scale);

    const lowerId = previewOrder[targetIndex - 1];
    const cueTargetY = lowerId
      ? targets.get(lowerId).position.y
        + layerStackMaxY(burger.getLayer(lowerId)) * targets.get(lowerId).scale.y
        + (expanded ? EXPLODED_GAP : 0)
        + 0.015
      : workbench.prep.supportY + 0.015;
    const cueWorld = burger.root.localToWorld(new THREE.Vector3(0, cueTargetY, 0));
    const cueLocal = workbench.prep.dropAnchor.worldToLocal(cueWorld);
    workbench.setDropCue({
      targetIndex,
      y: cueLocal.y,
      radius: selected.userData.surfaceRadius
        * Math.max(selectedTarget.scale.x, selectedTarget.scale.z),
    });
    burger.setLayerDropPreview(intent.id, {
      position: selectedTarget.position,
      scale: selectedTarget.scale,
      yaw: selectedTarget.yaw,
      targetIndex,
    });
    return true;
  };

  const restoreDraggedLayout = (layerId) => {
    const selected = burger.getLayer(layerId);
    const draggedPose = {
      position: selected.position.clone(),
      scale: selected.scale.clone(),
      yaw: selected.rotation.y,
    };
    const previewOrder = state.assembledOrder.filter((id) => id !== layerId);
    const targets = targetTransforms(previewOrder);
    for (const [id, target] of targets) {
      if (id === layerId) continue;
      const layer = burger.getLayer(id);
      layer.position.copy(target.position);
      layer.rotation.set(0, target.yaw, 0);
      layer.scale.copy(target.scale);
    }
    selected.position.copy(draggedPose.position);
    selected.rotation.set(0, draggedPose.yaw, 0);
    selected.scale.copy(draggedPose.scale);
  };

  const resolveDropIntent = (id, point) => {
    const layout = workbench.getLayout();
    const ingredientId = state.instances[id];
    const homeSlotId = homeSlotIdForInstance(id);
    const station = (homeSlotId
      ? layout.ingredients.find((entry) => entry.slotId === homeSlotId)
      : null)
      ?? layout.ingredients.find((entry) => entry.id === ingredientId);
    if (!station) return Object.freeze({
      kind: "invalid", intent: "invalid", id, targetIndex: null,
    });
    const input = {
      point,
      prepBounds: layout.prep.bounds,
      homeBounds: station.bounds,
      assembledCount: state.assembledOrder.filter((layerId) => layerId !== id).length,
      magnetPadding: 0.36,
    };
    const resolution = resolveSoloLayerDrop(input);
    if (resolution.kind === "prep" || resolution.kind === "bin" || !homeSlotId) {
      return Object.freeze({
        id,
        ...resolution,
        ...(resolution.kind === "bin" && homeSlotId ? { slotId: homeSlotId } : {}),
      });
    }
    const homeRegion = getWorkbenchSlot(homeSlotId).region;
    const returnTarget = layout.ingredients
      .filter(({ region }) => region === homeRegion)
      .map((candidate) => ({
        candidate,
        resolution: resolveSoloLayerDrop({ ...input, homeBounds: candidate.bounds }),
        distance: Math.hypot(point.x - candidate.position.x, point.z - candidate.position.z),
      }))
      .filter(({ resolution: candidateResolution }) => candidateResolution.kind === "bin")
      .sort((left, right) => left.distance - right.distance)[0];
    if (!returnTarget) return Object.freeze({ id, ...resolution });
    return Object.freeze({
      id,
      ...returnTarget.resolution,
      slotId: returnTarget.candidate.slotId,
    });
  };

  const resolveDrop = ({ id, point }) => {
    const intent = resolveDropIntent(id, point);
    if (intent.kind === "prep") {
      if (!state.assembledOrder.includes(id)
        && state.assembledOrder.length >= MAX_SOLO_STACK_LAYERS) {
        return {
          valid: false,
          reason: `汉堡最多只能叠 ${MAX_SOLO_STACK_LAYERS} 层`,
        };
      }
      return {
        valid: true,
        anchor: workbench.prep.dropAnchor,
        targetIndex: intent.targetIndex,
      };
    }
    if (intent.kind === "bin") {
      return {
        valid: true,
        anchor: intent.slotId
          ? workbench.getStationBySlot(intent.slotId).dropAnchor
          : stationForInstance(id).dropAnchor,
      };
    }
    return { valid: false, reason: "请放到中央餐盘或原料盒" };
  };

  const startLayerMotion = ({ layerId, kind, previousOrder, from, targetIndex = null }) => {
    const layer = burger.getLayer(layerId);
    const remainingOrder = previousOrder.filter((id) => id !== layerId);
    const normalizedTargetIndex = kind === "insert"
      ? Math.max(0, Math.min(targetIndex, remainingOrder.length))
      : null;
    activeMotion = {
      motion: createCookingMotion({
        kind,
        startedAt: lastFrameTime,
        thickness: layerStackThickness(layer) * targetScale(layerId).y,
        reducedMotion,
      }),
      selectedId: layerId,
      previousOrder: remainingOrder,
      targetIndex: normalizedTargetIndex,
      upperIds: kind === "insert"
        ? remainingOrder.slice(normalizedTargetIndex)
        : [],
      from,
      targets: targetTransforms(),
      impacted: false,
    };
    applyActiveMotion(lastFrameTime);
  };

  const authoritativeStackBounds = () => {
    if (!state.assembledOrder.length) return null;
    const targets = targetTransforms();
    const snapshots = state.assembledOrder.map((layerId) => {
      const layer = burger.getLayer(layerId);
      return {
        layerId,
        layer,
        position: layer.position.clone(),
        rotation: layer.rotation.clone(),
        scale: layer.scale.clone(),
      };
    });
    const bounds = new THREE.Box3();
    try {
      for (const { layerId, layer } of snapshots) {
        const target = targets.get(layerId);
        layer.position.copy(target.position);
        layer.rotation.set(0, target.yaw, 0);
        layer.scale.copy(target.scale);
      }
      host.scene.updateMatrixWorld?.(true);
      for (const { layer } of snapshots) bounds.expandByObject(layer);
    } finally {
      for (const { layer, position, rotation, scale } of snapshots) {
        layer.position.copy(position);
        layer.rotation.copy(rotation);
        layer.scale.copy(scale);
      }
      host.scene.updateMatrixWorld?.(true);
    }
    return bounds.isEmpty() ? null : bounds;
  };

  const boundsCorners = (bounds) => {
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    return corners;
  };

  const authoritativeFramingGeometry = () => {
    const bounds = new THREE.Box3();
    const points = [];
    const stackBounds = authoritativeStackBounds();
    if (stackBounds) {
      bounds.union(stackBounds);
      points.push(...boundsCorners(stackBounds).map((point) => ({
        point,
        margin: STACK_CAMERA_SAFE_NDC_MARGIN,
      })));
    }
    return bounds.isEmpty() || !points.length ? null : { bounds, points };
  };

  const fittedStackCameraView = ({ bounds, points }, view) => {
    const target = bounds.getCenter(new THREE.Vector3());
    const cosPitch = Math.cos(view.pitch);
    const forward = new THREE.Vector3(
      -Math.sin(view.yaw) * cosPitch,
      -Math.sin(view.pitch),
      -Math.cos(view.yaw) * cosPitch,
    ).normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    ).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const effectiveFov = typeof host.camera.getEffectiveFOV === "function"
      ? host.camera.getEffectiveFOV()
      : host.camera.fov;
    const verticalSlope = Math.tan(effectiveFov * Math.PI / 360);
    const horizontalSlope = verticalSlope * Math.max(host.camera.aspect, 1e-6);
    let distance = 0;
    for (const { point, margin } of points) {
      const relative = point.clone().sub(target);
      const forwardOffset = relative.dot(forward);
      const requiredDepth = Math.max(
        Math.abs(relative.dot(right)) / (horizontalSlope * margin),
        Math.abs(relative.dot(up)) / (verticalSlope * margin),
        host.camera.near + STACK_CAMERA_NEAR_PADDING,
      );
      distance = Math.max(distance, requiredDepth - forwardOffset);
    }
    distance += Math.max(0.05, bounds.getSize(new THREE.Vector3()).length() * 0.005);

    let farthestForwardOffset = -Infinity;
    for (const { point } of points) {
      farthestForwardOffset = Math.max(
        farthestForwardOffset,
        point.clone().sub(target).dot(forward),
      );
    }
    return {
      target,
      distance,
      farthestForwardOffset,
    };
  };

  const adaptCameraToStack = ({ preserveDistance = true, reason = "stack-growth" } = {}) => {
    const view = controller?.getCameraView?.();
    if (!view) return false;
    const framing = authoritativeFramingGeometry();
    if (!framing) return false;
    const fit = fittedStackCameraView(framing, view);
    const distance = preserveDistance ? Math.max(view.distance, fit.distance) : fit.distance;
    const requiredFar = distance + fit.farthestForwardOffset + STACK_CAMERA_DEPTH_PADDING;
    if (host.camera.far < requiredFar) {
      host.camera.far = requiredFar;
      host.camera.updateProjectionMatrix?.();
    }
    controller.setCameraView?.({
      target: { x: fit.target.x, y: fit.target.y, z: fit.target.z },
      yaw: view.yaw,
      pitch: view.pitch,
      distance,
    }, reason);
    return true;
  };

  const dropLayer = (layerId, destination = {}) => {
    if (disposed) return false;
    if (activeMotion) {
      activeMotion = null;
      restoreAuthoritativeTransforms();
    }
    pickMotion = null;
    transitions.clear();
    const previousOrder = [...state.assembledOrder];
    const from = captureLayerTransforms();
    clearGrabVisuals();

    if (destination.kind === "prep") {
      const targetIndex = destination.targetIndex ?? previousOrder.length;
      if (!state.assembledOrder.includes(layerId)
        && state.assembledOrder.length >= MAX_SOLO_STACK_LAYERS) return false;
      state = placeSoloLayer(state, layerId, targetIndex, { replenish: true });
      reconcileModelInstances();
      reorderLayers();
      startLayerMotion({
        layerId,
        kind: "insert",
        previousOrder,
        from,
        targetIndex,
      });
      advanceTutorial("dropped-on-prep");
      if (state.complete) advanceTutorial("assembled-all");
      adaptCameraToStack();
      emit("drop-layer");
      return true;
    }
    if (destination.kind === "bin") {
      state = removeSoloLayer(state, layerId, {
        consolidate: true,
        ...(destination.slotId ? { targetSlotId: destination.slotId } : {}),
      });
      syncPhysicalSlot(state.locations[layerId]?.slotId);
      reconcileModelInstances();
      reorderLayers();
      startLayerMotion({
        layerId,
        kind: "home",
        previousOrder,
        from,
      });
      emit("remove-layer");
      return true;
    }
    throw new TypeError("destination.kind must be prep or bin");
  };

  const applySauceStroke = (stroke) => {
    if (disposed) return false;
    state = addSoloSauceStroke(state, stroke);
    burger.addSauceStroke(stroke);
    advanceTutorial("created-sauce-stroke");
    if (state.complete) advanceTutorial("assembled-all");
    emit("sauce-stroke");
    return true;
  };

  const previewSauceGesture = ({ gestureId, segmentIndex, stroke }) => {
    if (disposed) return false;
    burger.previewSauceStroke(`${gestureId}:${segmentIndex}`, stroke);
    return true;
  };

  const commitSauceGesture = ({ gestureId, strokes }) => {
    if (disposed) return false;
    try {
      const nextState = addSoloSauceStrokes(state, strokes);
      burger.commitSaucePreviews(gestureId);
      state = nextState;
    } catch (error) {
      burger.cancelSaucePreviews(gestureId);
      throw error;
    }
    advanceTutorial("created-sauce-stroke");
    if (state.complete) advanceTutorial("assembled-all");
    emit("sauce-gesture");
    return true;
  };

  const cancelSauceGesture = ({ gestureId }) => {
    if (disposed) return false;
    burger.cancelSaucePreviews(gestureId);
    return true;
  };

  const selectLayer = (layerId, draggedPose = null) => {
    if (disposed) return false;
    if (!state.instances[layerId]) throw new TypeError(`Unknown burger layer: ${layerId}`);
    clearTransientVisuals();
    const layer = burger.getLayer(layerId);
    if (draggedPose) {
      layer.position.copy(draggedPose.position);
      layer.rotation.set(0, draggedPose.yaw, 0);
    }
    const authoritativeScale = layer.scale.clone();
    selectedLayerId = layerId;
    highlightedLayerId = layerId;
    burger.setLayerHighlighted(layerId, true);
    pickMotion = {
      selectedId: layerId,
      baseScale: authoritativeScale,
      motion: createCookingMotion({
        kind: "pick",
        startedAt: lastFrameTime,
        thickness: layerStackThickness(layer) * targetScale(layerId).y,
        reducedMotion,
      }),
    };
    advanceTutorial("picked-layer");
    emit("selection");
    return true;
  };

  const selectFocusedLayer = (layerId) => {
    if (disposed || !focused || !state.assembledOrder.includes(layerId)) return false;
    clearTransientVisuals();
    selectedLayerId = layerId;
    highlightedLayerId = layerId;
    burger.setLayerHighlighted(layerId, true);
    emit("focus-selection");
    return true;
  };

  let controller = null;
  const registeredLayerIds = new Set();
  const activeModelLayerIds = () => {
    const activeIds = new Set(state.assembledOrder);
    const sources = state.stationSources ?? state.binSources;
    Object.values(sources).forEach((layerId) => {
      if (typeof layerId === "string" && state.instances[layerId]) activeIds.add(layerId);
    });
    return activeIds;
  };
  const reconcileModelInstances = () => {
    const desiredIds = new Set(Object.keys(state.instances));
    const activeIds = activeModelLayerIds();
    for (const layerId of [...burger.layers.keys()]) {
      if (desiredIds.has(layerId)) {
        burger.getLayer(layerId).visible = activeIds.has(layerId);
        if (!activeIds.has(layerId) && registeredLayerIds.has(layerId)) {
          controller?.unregisterDraggable?.(layerId);
          registeredLayerIds.delete(layerId);
        }
        continue;
      }
      controller?.unregisterDraggable?.(layerId);
      registeredLayerIds.delete(layerId);
      if (SOLO_BURGER_INGREDIENT_IDS.includes(layerId)) {
        burger.getLayer(layerId).visible = false;
        continue;
      }
      burger.removeLayerInstance(layerId);
    }
    for (const layerId of desiredIds) {
      const layer = burger.layers.has(layerId)
        ? burger.getLayer(layerId)
        : burger.createLayerInstance(state.instances[layerId], layerId);
      layer.visible = activeIds.has(layerId);
      if (activeIds.has(layerId) && !registeredLayerIds.has(layerId) && controller) {
        controller?.registerDraggable?.({
          id: layerId,
          object: layer,
          surfaces: [layer.userData.selectableSurface],
        });
        registeredLayerIds.add(layerId);
      }
    }
    controller?.setFoodSurfaces?.([...activeIds].map(
      (layerId) => burger.getLayer(layerId).userData.selectableSurface,
    ));
  };

  reconcileModelInstances();
  const initialLayerIds = [...activeModelLayerIds()];

  controller = controllerFactory({
    THREE,
    canvas,
    camera: host.camera,
    documentTarget,
    selectableSurfaces: workbench.selectableSurfaces,
    draggables: initialLayerIds.map((id) => ({
      id,
      object: burger.getLayer(id),
      surfaces: [burger.getLayer(id).userData.selectableSurface],
    })),
    condimentTools: tools,
    sauceIds: SOLO_COOKING_SAUCE_IDS,
    foodSurfaces: initialLayerIds.map(
      (id) => burger.getLayer(id).userData.selectableSurface,
    ),
    prepBounds: workbench.getLayout().bounds,
    prepPlaneY: 0.42,
    cameraTarget: cameraView.target,
    orbitLimits: {
      minYaw: -Math.PI,
      maxYaw: Math.PI,
      minPitch: -1.18,
      maxPitch: 1.56,
      minDistance: 5,
      maxDistance: MAX_STACK_CAMERA_DISTANCE,
      wrapYaw: true,
    },
    resolveDrop,
    onPick: ({ id, object }) => {
      dropIntent = null;
      // The controller applies its drag lift before onPick. Carry that pose
      // across the authoritative resync, but keep the restored target scale.
      const draggedPose = object
        ? { position: object.position.clone(), yaw: object.rotation.y }
        : null;
      return selectLayer(id, draggedPose);
    },
    onSelection: ({ id, selected }) => {
      if (selected) selectedLayerId = id;
      else if (selectedLayerId === id) selectedLayerId = null;
      emit("selection");
    },
    onInspectionSelection: ({ id }) => selectFocusedLayer(id),
    onMove: ({ id, reason, pose, point }) => {
      if (activeMotion) {
        const movedLayer = burger.getLayer(id);
        const movedPose = {
          position: movedLayer.position.clone(),
          rotation: movedLayer.rotation.clone(),
          scale: movedLayer.scale.clone(),
        };
        activeMotion = null;
        restoreAuthoritativeTransforms();
        movedLayer.position.copy(movedPose.position);
        movedLayer.rotation.copy(movedPose.rotation);
        movedLayer.scale.copy(movedPose.scale);
      }
      cancelLayerTransition(id);
      if ((reason === "rotate" || reason === "twist") && !state.finished) {
        workbench.clearDropCue();
        state = rotateSoloLayer(state, id, pose.rotation.y);
        advanceTutorial("rotated-layer");
        emit("rotate-layer");
        return;
      }
      if (point && !state.finished) {
        const nextIntent = resolveDropIntent(id, point);
        const unchanged = dropIntent?.kind === nextIntent.kind
          && dropIntent?.intent === nextIntent.intent
          && dropIntent?.id === nextIntent.id
          && dropIntent?.targetIndex === nextIntent.targetIndex
          && dropIntent?.slotId === nextIntent.slotId;
        if (!unchanged) {
          dropIntent = nextIntent;
          workbench.clearHighlights();
          if (nextIntent.kind === "prep") {
            applyDropPreview(nextIntent);
          } else {
            restoreDraggedLayout(id);
            burger.clearLayerDropPreview();
            workbench.clearDropCue();
            if (nextIntent.kind === "bin") {
              const slotId = nextIntent.slotId ?? homeSlotIdForInstance(id);
              if (slotId) workbench.setSlotHighlighted?.(slotId, true);
              else workbench.setHighlighted("ingredient", state.instances[id], true);
            }
          }
          emit("drop-intent");
        }
      }
    },
    onDrop: ({ id, anchor, targetIndex }) => {
      dropIntent = null;
      if (anchor === workbench.prep.dropAnchor) dropLayer(id, { kind: "prep", targetIndex });
      else {
        const targetSlot = workbench.ingredientSlots.find(
          ({ dropAnchor }) => dropAnchor === anchor,
        );
        dropLayer(id, {
          kind: "bin",
          ...(targetSlot?.slotId ? { slotId: targetSlot.slotId } : {}),
        });
      }
    },
    onInvalid: ({ reason } = {}) => {
      if (disposed || suppressInvalidFeedback) return;
      dropIntent = null;
      clearTransientVisuals({ resync: false });
      syncTransforms({ animate: true });
      const message = typeof reason === "string" && /[\u3400-\u9fff]/u.test(reason)
        ? reason
        : "没放稳，请放到中央餐盘或原来的食材料盒";
      try {
        let haptic = vibrate;
        if (haptic === undefined) {
          const navigatorTarget = globalThis.navigator;
          haptic = typeof navigatorTarget?.vibrate === "function"
            ? navigatorTarget.vibrate.bind(navigatorTarget)
            : null;
        }
        haptic?.(28);
      } catch {
        // Haptics are optional and platform rejection must not interrupt a drag rollback.
      }
      emit("invalid-drop", { message });
    },
    onSauceStroke: applySauceStroke,
    onSaucePreview: previewSauceGesture,
    onSauceCommit: commitSauceGesture,
    onSauceCancel: cancelSauceGesture,
    onStationSelector: ({ slotId, region }) => {
      onStationSelector(Object.freeze({ slotId, region }));
    },
  });
  controller.setOrbitEnabled?.(false);
  initialLayerIds.forEach((id) => registeredLayerIds.add(id));
  cleanupTasks.push(() => controller?.dispose?.());

  const setFocusMode = (value, { notify = true } = {}) => {
    if (disposed) return focused;
    const next = Boolean(value);
    if (focused === next) return focused;
    if (next && !state.assembledOrder.length) return false;

    clearTransientVisuals();
    dropIntent = null;
    if (next) {
      focusCameraView = controller.getCameraView?.() ?? null;
      focusWorkbenchVisible = workbench.root.visible;
      selectedLayerId = null;
      controller.setOrbitEnabled?.(true);
      controller.setInspectionOnly?.(true);
      workbench.root.updateMatrixWorld?.(true);
      host.scene.attach(burger.root);
      for (const layerId of Object.keys(state.instances)) {
        burger.getLayer(layerId).visible = state.assembledOrder.includes(layerId);
      }
      workbench.root.visible = false;
      adaptCameraToStack({ preserveDistance: false, reason: "burger-focus" });
      focused = true;
    } else {
      workbench.root.visible = focusWorkbenchVisible;
      workbench.root.attach(burger.root);
      const activeIds = activeModelLayerIds();
      for (const layerId of Object.keys(state.instances)) {
        burger.getLayer(layerId).visible = activeIds.has(layerId);
      }
      controller.setInspectionOnly?.(false);
      controller.setOrbitEnabled?.(false);
      selectedLayerId = null;
      if (focusCameraView) controller.setCameraView?.(focusCameraView, "burger-focus-return");
      focusCameraView = null;
      focused = false;
      adaptCameraToStack({ preserveDistance: true, reason: "burger-focus-return-fit" });
    }
    if (notify) emit("focus");
    return focused;
  };

  const applyPose = (layer, from, target, amount) => {
    layer.position.lerpVectors(from.position, target.position, amount);
    layer.rotation.y = from.yaw + (target.yaw - from.yaw) * amount;
    layer.scale.lerpVectors(from.scale, target.scale, amount);
  };

  const fireImpactHaptic = (record, frame) => {
    if (!frame.impact || record.impacted) return;
    record.impacted = true;
    try {
      let haptic = vibrate;
      if (haptic === undefined) {
        const navigatorTarget = globalThis.navigator;
        haptic = typeof navigatorTarget?.vibrate === "function"
          ? navigatorTarget.vibrate.bind(navigatorTarget)
          : null;
      }
      haptic?.(12);
    } catch {
      // Haptics are optional and never own the animation result.
    }
  };

  const applyActiveMotion = (now) => {
    if (!activeMotion) return;
    const record = activeMotion;
    const frame = sampleCookingMotion(record.motion, now);
    const numericKeys = [
      "progress",
      "arrival",
      "selectedOffsetY",
      "upperOffsetY",
      "selectedScaleXz",
      "selectedScaleY",
    ];
    if (numericKeys.some((key) => !Number.isFinite(frame[key]))) {
      activeMotion = null;
      restoreAuthoritativeTransforms();
      return;
    }

    const selected = burger.getLayer(record.selectedId);
    const selectedFrom = record.from.get(record.selectedId);
    const selectedTarget = record.targets.get(record.selectedId);
    const upperIds = new Set(record.upperIds);
    for (const layerId of Object.keys(state.instances)) {
      if (layerId === record.selectedId) continue;
      const layer = burger.getLayer(layerId);
      const target = record.targets.get(layerId);
      if (upperIds.has(layerId)) {
        applyPose(layer, record.from.get(layerId), target, frame.arrival);
        layer.position.y += frame.upperOffsetY;
      } else {
        layer.position.copy(target.position);
        layer.rotation.set(0, target.yaw, 0);
        layer.scale.copy(target.scale);
      }
    }

    if (record.motion.kind === "insert") {
      selected.position.copy(selectedTarget.position);
      selected.rotation.set(0, selectedTarget.yaw, 0);
      selected.scale.copy(selectedTarget.scale);
    } else {
      applyPose(selected, selectedFrom, selectedTarget, frame.arrival);
    }
    // The insert pop grows out of the food-contact plane, rather than scaling
    // around the centre and briefly lifting a bun into the air.
    if (record.motion.kind === "insert") {
      selected.position.y += selected.userData.boundsMinY
        * selectedTarget.scale.y
        * (1 - frame.selectedScaleY);
    }
    // Insertions use a scale-only pop. Keeping the contact plane planted avoids
    // a one-frame air gap, especially on the much taller bun meshes.
    if (record.motion.kind !== "insert") selected.position.y += frame.selectedOffsetY;
    selected.scale.x *= frame.selectedScaleXz;
    selected.scale.z *= frame.selectedScaleXz;
    selected.scale.y *= frame.selectedScaleY;
    fireImpactHaptic(record, frame);
    if (frame.done) {
      activeMotion = null;
      restoreAuthoritativeTransforms();
    }
  };

  const tick = (time = 0) => {
    if (disposed) return;
    lastFrameTime = Number.isFinite(time) ? time : lastFrameTime;
    if (pickMotion) {
      const frame = sampleCookingMotion(pickMotion.motion, lastFrameTime);
      const layer = burger.getLayer(pickMotion.selectedId);
      layer.scale.set(
        pickMotion.baseScale.x * frame.selectedScaleXz,
        pickMotion.baseScale.y * frame.selectedScaleY,
        pickMotion.baseScale.z * frame.selectedScaleXz,
      );
      if (frame.done) {
        layer.scale.copy(pickMotion.baseScale);
        pickMotion = null;
      }
    }
    applyActiveMotion(lastFrameTime);
    for (const [layerId, transition] of transitions) {
      const progress = Math.min(1, Math.max(0, (lastFrameTime - transition.start) / SNAP_DURATION));
      const eased = 1 - (1 - progress) ** 3;
      const layer = burger.getLayer(layerId);
      layer.position.lerpVectors(transition.fromPosition, transition.target.position, eased);
      layer.rotation.y = transition.fromYaw
        + (transition.target.yaw - transition.fromYaw) * eased;
      if (progress >= 1) transitions.delete(layerId);
    }
    if (!reducedMotion) celebration.tick(lastFrameTime);
  };
  const removeFrame = host.onFrame?.(tick) ?? (() => {});
  cleanupTasks.push(removeFrame);
  const handleContextError = (error) => {
    clearTransientVisuals();
    onError(error);
  };
  const removeContextError = host.onContextError?.(handleContextError) ?? (() => {});
  cleanupTasks.push(removeContextError);
  if (documentTarget?.addEventListener && documentTarget?.removeEventListener) {
    const handleVisibilityChange = () => {
      if (documentTarget.visibilityState === "hidden") clearTransientVisuals();
    };
    documentTarget.addEventListener("visibilitychange", handleVisibilityChange);
    cleanupTasks.push(() => (
      documentTarget.removeEventListener("visibilitychange", handleVisibilityChange)
    ));
  }
  applyVisualState({ sauces: true });
  adaptCameraToStack({ preserveDistance: false, reason: "initial-state-fit" });
  if (state.finished) controller.pause();
  host.start();
  emit("ready");

  const pauseInteractionsSilently = () => {
    suppressInvalidFeedback = true;
    try {
      controller.pause();
    } finally {
      suppressInvalidFeedback = false;
      dropIntent = null;
      clearTransientVisuals();
    }
  };

  const setTuning = (value) => {
    if (disposed) return activeTuning;
    let hasPrimaryError = false;
    try {
      pauseInteractionsSilently();
      activeTuning = normalizeBurgerTuning(value);
      clearTransientVisuals();
      adaptCameraToStack();
      emit("tuning");
      return activeTuning;
    } catch (error) {
      hasPrimaryError = true;
      throw error;
    } finally {
      if (!disposed && !state.finished && !externallyPaused) {
        try {
          controller.resume();
        } catch (error) {
          if (!hasPrimaryError) throw error;
        }
      }
    }
  };

  const setInteractionPaused = (value) => {
    if (disposed) return externallyPaused;
    externallyPaused = Boolean(value);
    if (externallyPaused) pauseInteractionsSilently();
    else if (!state.finished) controller.resume();
    return externallyPaused;
  };

  const deleteFocusedLayer = () => {
    if (disposed || !focused || !selectedLayerId
      || !state.assembledOrder.includes(selectedLayerId)) return false;
    const layerId = selectedLayerId;
    clearTransientVisuals();
    state = removeSoloLayer(state, layerId, { consolidate: true });
    syncPhysicalSlot(state.locations[layerId]?.slotId);
    reconcileModelInstances();
    selectedLayerId = null;
    reorderLayers();
    rebuildSauces();
    syncTransforms({ animate: true });
    for (const id of Object.keys(state.instances)) {
      burger.getLayer(id).visible = state.assembledOrder.includes(id);
    }
    adaptCameraToStack({ preserveDistance: false, reason: "focus-layer-deleted" });
    emit("delete-focused-layer");
    return true;
  };

  const setSlotContent = (slotId, contentId) => {
    if (disposed) return false;
    const slot = getWorkbenchSlot(slotId);
    const nextState = setSoloStationContent(state, slotId, contentId);
    if (nextState === state) return false;

    clearTransientVisuals();
    if (slot.region === "sauce") tools.setSlotContent(slotId, contentId);
    workbench.setStationContent(slotId, contentId);
    state = nextState;
    if (selectedLayerId && !state.instances[selectedLayerId]) selectedLayerId = null;
    reconcileModelInstances();
    applyVisualState();
    emit("slot-content", {
      slot: Object.freeze({ slotId, region: slot.region, contentId }),
    });
    return true;
  };

  const previewSlotContent = (slotId, contentId) => {
    if (disposed) return false;
    const slot = getWorkbenchSlot(slotId);
    if (!WORKBENCH_REGION_OPTIONS[slot.region].includes(contentId)) {
      throw new TypeError(`Content ${String(contentId)} is not valid for ${slot.region} slot ${slotId}`);
    }
    clearSlotContentPreview();
    if (slot.region === "sauce") return tools.previewSlotContent(slotId, contentId);

    const source = burger.getLayer(contentId);
    const station = workbench.getStationBySlot(slotId);
    if (!source?.isObject3D || !station?.pickupAnchor?.isObject3D) return false;
    const preview = source.clone(true);
    const sauceChildren = [];
    const materials = new Set();
    preview.traverse((object) => {
      object.raycast = workbench.noRaycast;
      if (object.userData?.sauceStroke) sauceChildren.push(object);
      if (!object.material) return;
      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const previewMaterials = sourceMaterials.map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = 0.32;
        clone.depthWrite = false;
        materials.add(clone);
        return clone;
      });
      object.material = Array.isArray(object.material) ? previewMaterials : previewMaterials[0];
    });
    sauceChildren.forEach((object) => object.removeFromParent());
    workbench.previewRoot.updateWorldMatrix?.(true, false);
    const world = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
    preview.position.copy(workbench.previewRoot.worldToLocal(world.clone()));
    const config = activeTuning.ingredients[contentId];
    const presentationScale = activeTuning.global.presentationScale;
    preview.scale.set(
      presentationScale * config.scaleX,
      presentationScale * config.scaleY,
      presentationScale * config.scaleZ,
    );
    preview.rotation.set(0, 0, 0);
    preview.visible = true;
    preview.userData.slotId = slotId;
    preview.userData.contentId = contentId;
    workbench.previewRoot.add(preview);
    activeSlotPreview = { root: preview, materials };
    return true;
  };

  const api = {
    host,
    workbench,
    burger,
    tools,
    controller,
    celebration,
    get layerPresentationScale() { return activeTuning.global.presentationScale; },
    get binLayerScale() { return activeTuning.global.presentationScale; },
    get prepLayerScale() { return activeTuning.global.presentationScale; },
    getTuning: () => activeTuning,
    setTuning,
    setSlotContent,
    previewSlotContent,
    clearSlotContentPreview,
    setInteractionPaused,
    getSlotControlAnchors: () => workbench.getSlotControlAnchors(),
    getState: () => state,
    getTutorial: () => tutorial,
    getSelectedLayerId: () => selectedLayerId,
    isBurgerFocused: () => focused,
    isExpanded: () => expanded,
    getComposition: () => serializeSoloComposition(state),
    selectReferenceRecipe(referenceRecipeId) {
      if (disposed) return false;
      const nextState = selectSoloReferenceRecipe(state, referenceRecipeId);
      if (nextState === state) return false;
      state = nextState;
      emit("reference-recipe");
      return true;
    },
    resize() {
      if (disposed) return false;
      host.resize?.();
      return adaptCameraToStack({ preserveDistance: false, reason: "viewport-resize-fit" });
    },
    tick,
    selectLayer,
    dropLayer,
    applySauceStroke,
    rotateSelected(deltaYaw) {
      if (disposed || focused || !selectedLayerId) return false;
      clearTransientVisuals();
      state = rotateSoloLayer(state, selectedLayerId, state.rotations[selectedLayerId] + deltaYaw);
      burger.getLayer(selectedLayerId).rotation.y = state.rotations[selectedLayerId];
      advanceTutorial("rotated-layer");
      emit("rotate-layer");
      return true;
    },
    toggleExpanded() {
      if (disposed || focused || state.finished) return expanded;
      clearTransientVisuals();
      expanded = !expanded;
      syncTransforms({ animate: true });
      adaptCameraToStack({ preserveDistance: false, reason: "stack-expansion" });
      emit("inspect");
      return expanded;
    },
    setBurgerFocus(value) { return setFocusMode(value); },
    toggleBurgerFocus() { return setFocusMode(!focused); },
    selectFocusedLayer,
    deleteFocusedLayer,
    resetCamera() {
      const reset = controller.resetCamera();
      if (reset) adaptCameraToStack({ preserveDistance: false, reason: "camera-reset-fit" });
      return reset;
    },
    undo() {
      if (disposed || !state.history.length) return false;
      if (focused) setFocusMode(false, { notify: false });
      clearTransientVisuals();
      dropIntent = null;
      state = undoSoloCooking(state);
      syncPhysicalStations();
      reconcileModelInstances();
      tutorial = reconcileCookingTutorial(tutorial, state, { selectedLayerId });
      if (state.finished) pauseInteractionsSilently();
      else if (!externallyPaused) controller.resume();
      applyVisualState({ animate: true, sauces: true });
      emit("undo");
      return true;
    },
    reset() {
      if (disposed) return false;
      if (focused) setFocusMode(false, { notify: false });
      clearTransientVisuals();
      dropIntent = null;
      state = resetSoloCookingState(state);
      reconcileModelInstances();
      selectedLayerId = null;
      expanded = false;
      tutorial = reconcileCookingTutorial(tutorial, state, { reset: true });
      if (!externallyPaused) controller.resume();
      controller.resetCamera();
      applyVisualState({ sauces: true });
      emit("reset");
      return true;
    },
    finish() {
      if (disposed || !state.complete || state.finished) return false;
      if (focused) setFocusMode(false, { notify: false });
      clearTransientVisuals();
      state = finishSoloCooking(state);
      expanded = false;
      pauseInteractionsSilently();
      applyVisualState({ animate: true });
      advanceTutorial("finished");
      emit("finish");
      return true;
    },
    continueEditing() {
      if (disposed || !state.finished) return false;
      clearTransientVisuals();
      state = continueSoloCooking(state);
      if (!externallyPaused) controller.resume();
      celebration.visible = false;
      emit("continue");
      return true;
    },
    skipTutorial() {
      tutorial = skipCookingTutorial(tutorial, { storage });
      emit("tutorial-skip");
      return tutorial;
    },
    replayTutorial() {
      tutorial = replayCookingTutorial(tutorial);
      emit("tutorial-replay");
      return tutorial;
    },
    dispose() {
      if (disposed) return;
      if (focused) setFocusMode(false, { notify: false });
      let cancellationError = null;
      try {
        pauseInteractionsSilently();
      } catch (error) {
        cancellationError = error;
      }
      disposed = true;
      cleanup(cancellationError);
    },
  };
  return api;
  } catch (error) {
    cleanup(error);
  }
}
