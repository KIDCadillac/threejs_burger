import { BURGER_LAYER_IDS } from "./cooking-state.mjs";
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
  placeSoloLayer,
  removeSoloLayer,
  rotateSoloLayer,
  addSoloSauceStroke,
  finishSoloCooking,
  continueSoloCooking,
  undoSoloCooking,
  resetSoloCookingState,
  serializeSoloComposition,
} from "./cooking-solo-state.mjs";
import {
  createCookingTutorial,
  advanceCookingTutorial,
  skipCookingTutorial,
  replayCookingTutorial,
  reconcileCookingTutorial,
} from "./cooking-tutorial-state.mjs";

const LAYER_PRESENTATION_SCALE = 0.72;
const STACK_OVERLAP = 0.025;
const EXPLODED_GAP = 0.42;
const SNAP_DURATION = 190;

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
  documentTarget = globalThis.document,
  hostFactory = createThreeSceneHost,
  workbenchFactory = createCookingWorkbench3D,
  burgerFactory = createBurgerModel3D,
  toolsFactory = createCondimentTools3D,
  celebrationFactory = createCelebration,
  controllerFactory = createCookingInteractionController,
  onChange = () => {},
  onError = () => {},
  reducedMotion = false,
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
  const workbench = workbenchFactory(THREE);
  cleanupTasks.push(() => disposeObserved(workbench, "workbench"));
  const burger = burgerFactory(THREE);
  cleanupTasks.push(() => disposeObserved(burger, "burger"));
  host.scene.add(workbench.root);
  workbench.root.add(burger.root);
  const tools = toolsFactory(THREE, { toolDocks: workbench.toolDocks });
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
  host.camera.far = cameraView.far;
  // The generic workbench camera includes editor margins. The phone composition
  // intentionally crops only decorative counter edges while retaining every control.
  host.camera.position.set(
    cameraView.position.x * 0.52,
    cameraView.position.y * 0.52,
    cameraView.position.z * 0.52,
  );
  host.camera.lookAt(cameraView.target.x, cameraView.target.y, cameraView.target.z);
  host.camera.updateProjectionMatrix?.();
  host.camera.updateMatrixWorld?.(true);

  let state = createSoloCookingState();
  let tutorial = createCookingTutorial({ storage });
  let selectedLayerId = null;
  let dropIntent = null;
  let expanded = false;
  let disposed = false;
  let lastFrameTime = 0;
  const transitions = new Map();
  let activeMotion = null;
  let pickMotion = null;
  let highlightedLayerId = null;
  const cancelLayerTransition = (layerId) => transitions.delete(layerId);

  const emit = (reason, extra = {}) => {
    onChange(Object.freeze({
      reason,
      state,
      tutorial,
      selectedLayerId,
      dropIntent,
      expanded,
      progress: `${state.assembledOrder.length}/${BURGER_LAYER_IDS.length}`,
      composition: serializeSoloComposition(state),
      ...extra,
    }));
  };

  const advanceTutorial = (action) => {
    const previous = tutorial;
    tutorial = advanceCookingTutorial(tutorial, action, { storage });
    if (tutorial !== previous) emit("tutorial");
  };

  const targetTransforms = (assembledOrder = state.assembledOrder) => {
    workbench.root.updateMatrixWorld?.(true);
    burger.root.updateMatrixWorld?.(true);
    const result = new Map();
    let cursorY = workbench.prep.dropAnchor.position.y;
    assembledOrder.forEach((layerId, index) => {
      const layer = burger.getLayer(layerId);
      const scaledHalfHeight = layer.userData.halfHeight * LAYER_PRESENTATION_SCALE;
      const y = cursorY + scaledHalfHeight + (expanded ? index * EXPLODED_GAP : 0);
      result.set(layerId, {
        position: new THREE.Vector3(0, y, 0),
        scale: new THREE.Vector3(
          LAYER_PRESENTATION_SCALE,
          LAYER_PRESENTATION_SCALE,
          LAYER_PRESENTATION_SCALE,
        ),
        yaw: state.rotations[layerId],
      });
      cursorY += scaledHalfHeight * 2 - STACK_OVERLAP;
    });
    for (const layerId of BURGER_LAYER_IDS) {
      if (result.has(layerId)) continue;
      const station = workbench.getStation("ingredient", layerId);
      const world = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
      const local = burger.root.worldToLocal(world.clone());
      result.set(layerId, {
        position: local,
        scale: new THREE.Vector3(
          LAYER_PRESENTATION_SCALE,
          LAYER_PRESENTATION_SCALE,
          LAYER_PRESENTATION_SCALE,
        ),
        yaw: state.rotations[layerId],
      });
    }
    return result;
  };

  const captureLayerTransforms = () => new Map(BURGER_LAYER_IDS.map((layerId) => {
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
    workbench.clearDropCue();
    workbench.clearHighlights();
  };

  const clearTransientVisuals = ({ resync = true } = {}) => {
    activeMotion = null;
    pickMotion = null;
    transitions.clear();
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
      ...BURGER_LAYER_IDS.filter((id) => !state.assembledOrder.includes(id)),
    ];
    fullOrder.forEach((layerId, index) => burger.reorderLayer(layerId, index));
  };

  const applyVisualState = ({ animate = false, sauces = false } = {}) => {
    reorderLayers();
    if (sauces) rebuildSauces();
    syncTransforms({ animate });
    celebration.visible = state.finished;
  };

  const applyDropPreview = (intent) => {
    if (!intent?.id || intent.kind !== "prep") {
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
    const thickness = selected.userData.halfHeight * LAYER_PRESENTATION_SCALE * 2;
    const shiftY = intent.intent === "bottom" ? thickness + 0.08 : -0.045;

    for (const layerId of previewOrder) {
      const layer = burger.getLayer(layerId);
      const target = targets.get(layerId);
      layer.position.copy(target.position);
      layer.position.y += shiftY;
      layer.rotation.set(0, target.yaw, 0);
      layer.scale.copy(target.scale);
    }
    selected.position.copy(draggedPose.position);
    selected.rotation.set(0, draggedPose.yaw, 0);
    selected.scale.copy(draggedPose.scale);

    const baseY = workbench.prep.dropAnchor.position.y;
    const topY = previewOrder.reduce((highest, layerId) => {
      const layer = burger.getLayer(layerId);
      return Math.max(
        highest,
        layer.position.y + layer.userData.halfHeight * LAYER_PRESENTATION_SCALE - baseY,
      );
    }, 0);
    workbench.setDropCue(intent.intent, {
      y: intent.intent === "bottom" ? 0.015 : topY + 0.015,
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
    for (const id of previewOrder) {
      const layer = burger.getLayer(id);
      const target = targets.get(id);
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
    const station = layout.ingredients.find((entry) => entry.id === id);
    if (!station) return Object.freeze({
      kind: "invalid", intent: "invalid", id, targetIndex: null,
    });
    const resolution = resolveSoloLayerDrop({
      point,
      prepBounds: layout.prep.bounds,
      homeBounds: station.bounds,
      assembledCount: state.assembledOrder.length,
      magnetPadding: 0.36,
    });
    return Object.freeze({ id, ...resolution });
  };

  const resolveDrop = ({ id, point }) => {
    const intent = resolveDropIntent(id, point);
    if (intent.kind === "prep") {
      return {
        valid: true,
        anchor: workbench.prep.dropAnchor,
        targetIndex: intent.targetIndex,
      };
    }
    if (intent.kind === "bin") {
      return {
        valid: true,
        anchor: workbench.getStation("ingredient", id).dropAnchor,
      };
    }
    return { valid: false, reason: "请放到中央餐盘或原料盒" };
  };

  const startLayerMotion = ({ layerId, kind, previousOrder, from }) => {
    const layer = burger.getLayer(layerId);
    activeMotion = {
      motion: createCookingMotion({
        kind,
        startedAt: lastFrameTime,
        thickness: layer.userData.halfHeight * LAYER_PRESENTATION_SCALE * 2,
        reducedMotion,
      }),
      selectedId: layerId,
      previousOrder,
      from,
      targets: targetTransforms(),
      impacted: false,
    };
    if (reducedMotion) applyActiveMotion(lastFrameTime);
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
      state = placeSoloLayer(state, layerId, targetIndex);
      reorderLayers();
      startLayerMotion({
        layerId,
        kind: targetIndex === 0 && previousOrder.length ? "bottom" : "top",
        previousOrder,
        from,
      });
      advanceTutorial("dropped-on-prep");
      if (state.complete) advanceTutorial("assembled-all");
      emit("drop-layer");
      return true;
    }
    if (destination.kind === "bin") {
      state = removeSoloLayer(state, layerId);
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

  const selectLayer = (layerId) => {
    if (disposed) return false;
    if (!BURGER_LAYER_IDS.includes(layerId)) throw new TypeError(`Unknown burger layer: ${layerId}`);
    const layer = burger.getLayer(layerId);
    const draggedPose = {
      position: layer.position.clone(),
      scale: layer.scale.clone(),
      yaw: layer.rotation.y,
    };
    clearTransientVisuals();
    layer.position.copy(draggedPose.position);
    layer.rotation.set(0, draggedPose.yaw, 0);
    layer.scale.copy(draggedPose.scale);
    selectedLayerId = layerId;
    highlightedLayerId = layerId;
    burger.setLayerHighlighted(layerId, true);
    pickMotion = {
      selectedId: layerId,
      baseScale: draggedPose.scale,
      motion: createCookingMotion({
        kind: "pick",
        startedAt: lastFrameTime,
        thickness: layer.userData.halfHeight * LAYER_PRESENTATION_SCALE * 2,
        reducedMotion,
      }),
    };
    advanceTutorial("picked-layer");
    emit("selection");
    return true;
  };

  const controller = controllerFactory({
    THREE,
    canvas,
    camera: host.camera,
    documentTarget,
    selectableSurfaces: workbench.selectableSurfaces,
    draggables: BURGER_LAYER_IDS.map((id) => ({
      id,
      object: burger.getLayer(id),
      surfaces: [burger.getLayer(id).userData.selectableSurface],
    })),
    condimentTools: tools,
    foodSurfaces: burger.selectableSurfaces,
    prepBounds: workbench.getLayout().bounds,
    prepPlaneY: 0.42,
    cameraTarget: cameraView.target,
    orbitLimits: {
      minYaw: -Math.PI,
      maxYaw: Math.PI,
      minPitch: 0.12,
      maxPitch: 1.45,
      minDistance: 5,
      maxDistance: 45,
      wrapYaw: true,
    },
    resolveDrop,
    onPick: ({ id }) => {
      dropIntent = null;
      return selectLayer(id);
    },
    onSelection: ({ id, selected }) => {
      if (selected) selectedLayerId = id;
      else if (selectedLayerId === id) selectedLayerId = null;
      emit("selection");
    },
    onMove: ({ id, reason, pose, point }) => {
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
          && dropIntent?.targetIndex === nextIntent.targetIndex;
        if (!unchanged) {
          dropIntent = nextIntent;
          workbench.clearHighlights();
          if (nextIntent.kind === "prep") {
            applyDropPreview(nextIntent);
          } else {
            restoreDraggedLayout(id);
            workbench.clearDropCue();
            if (nextIntent.kind === "bin") {
              workbench.setHighlighted("ingredient", id, true);
            }
          }
          emit("drop-intent");
        }
      }
    },
    onDrop: ({ id, anchor, targetIndex }) => {
      dropIntent = null;
      if (anchor === workbench.prep.dropAnchor) dropLayer(id, { kind: "prep", targetIndex });
      else dropLayer(id, { kind: "bin" });
    },
    onInvalid: ({ reason } = {}) => {
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
  });
  cleanupTasks.push(() => controller?.dispose?.());

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
      "stackOffsetY",
      "stackCompression",
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
    for (const layerId of record.previousOrder.filter((id) => id !== record.selectedId)) {
      const layer = burger.getLayer(layerId);
      applyPose(layer, record.from.get(layerId), record.targets.get(layerId), frame.arrival);
      if (record.motion.kind === "top") {
        layer.position.y -= frame.stackCompression * 0.045;
      } else if (record.motion.kind === "bottom") {
        layer.position.y += frame.stackOffsetY;
      }
    }

    applyPose(selected, selectedFrom, selectedTarget, frame.arrival);
    if (record.motion.kind === "bottom") {
      const belowY = selectedTarget.position.y - record.motion.thickness * 0.45;
      if (frame.phase === "open" || frame.phase === "insert") {
        const entry = Math.min(1, frame.arrival / 0.83);
        selected.position.y = selectedFrom.position.y
          + (belowY - selectedFrom.position.y) * entry;
      } else {
        const exit = Math.min(1, Math.max(0, (frame.arrival - 0.83) / 0.17));
        selected.position.y = belowY
          + (selectedTarget.position.y - belowY) * exit
          + frame.selectedOffsetY;
      }
    } else {
      selected.position.y += frame.selectedOffsetY;
    }
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
  syncTransforms();
  host.start();
  emit("ready");

  const api = {
    host,
    workbench,
    burger,
    tools,
    controller,
    celebration,
    layerPresentationScale: LAYER_PRESENTATION_SCALE,
    binLayerScale: LAYER_PRESENTATION_SCALE,
    prepLayerScale: LAYER_PRESENTATION_SCALE,
    getState: () => state,
    getTutorial: () => tutorial,
    getSelectedLayerId: () => selectedLayerId,
    getComposition: () => serializeSoloComposition(state),
    tick,
    selectLayer,
    dropLayer,
    applySauceStroke,
    rotateSelected(deltaYaw) {
      if (disposed || !selectedLayerId) return false;
      clearTransientVisuals();
      state = rotateSoloLayer(state, selectedLayerId, state.rotations[selectedLayerId] + deltaYaw);
      burger.getLayer(selectedLayerId).rotation.y = state.rotations[selectedLayerId];
      advanceTutorial("rotated-layer");
      emit("rotate-layer");
      return true;
    },
    toggleExpanded() {
      if (disposed || state.finished) return expanded;
      clearTransientVisuals();
      expanded = !expanded;
      syncTransforms({ animate: true });
      emit("inspect");
      return expanded;
    },
    resetCamera() { return controller.resetCamera(); },
    undo() {
      if (disposed || !state.history.length) return false;
      clearTransientVisuals();
      dropIntent = null;
      state = undoSoloCooking(state);
      tutorial = reconcileCookingTutorial(tutorial, state, { selectedLayerId });
      if (state.finished) controller.pause();
      else controller.resume();
      applyVisualState({ animate: true, sauces: true });
      emit("undo");
      return true;
    },
    reset() {
      if (disposed) return false;
      clearTransientVisuals();
      dropIntent = null;
      state = resetSoloCookingState();
      selectedLayerId = null;
      expanded = false;
      tutorial = reconcileCookingTutorial(tutorial, state, { reset: true });
      controller.resume();
      controller.resetCamera();
      applyVisualState({ sauces: true });
      emit("reset");
      return true;
    },
    finish() {
      if (disposed || !state.complete || state.finished) return false;
      clearTransientVisuals();
      state = finishSoloCooking(state);
      expanded = false;
      controller.pause();
      applyVisualState({ animate: true });
      advanceTutorial("finished");
      emit("finish");
      return true;
    },
    continueEditing() {
      if (disposed || !state.finished) return false;
      clearTransientVisuals();
      state = continueSoloCooking(state);
      controller.resume();
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
      clearTransientVisuals();
      disposed = true;
      cleanup();
    },
  };
  return api;
  } catch (error) {
    cleanup(error);
  }
}
