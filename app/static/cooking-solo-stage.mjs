import { BURGER_LAYER_IDS } from "./cooking-state.mjs";
import { createThreeSceneHost } from "./three-scene-host.mjs";
import { createCookingWorkbench3D } from "./cooking-workbench-3d.mjs";
import { createBurgerModel3D } from "./burger-model-3d.mjs";
import { createCondimentTools3D } from "./condiment-tools-3d.mjs";
import { createCookingInteractionController } from "./cooking-interaction-controller.mjs";
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

const BIN_LAYER_SCALE = 0.54;
const PREP_LAYER_SCALE = 1;
const STACK_GAP = 0.065;
const EXPLODED_GAP = 0.42;
const SNAP_DURATION = 190;

function contains(bounds, point) {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

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
  // The generic workbench camera includes generous editor margins. Pull it closer
  // for the playable phone view so every food piece remains a practical touch target.
  host.camera.position.set(
    cameraView.position.x * 0.7,
    cameraView.position.y * 0.7,
    cameraView.position.z * 0.7,
  );
  host.camera.lookAt(cameraView.target.x, cameraView.target.y, cameraView.target.z);
  host.camera.updateProjectionMatrix?.();
  host.camera.updateMatrixWorld?.(true);

  let state = createSoloCookingState();
  let tutorial = createCookingTutorial({ storage });
  let selectedLayerId = null;
  let expanded = false;
  let disposed = false;
  let lastFrameTime = 0;
  const transitions = new Map();
  const cancelLayerTransition = (layerId) => transitions.delete(layerId);

  const emit = (reason, extra = {}) => {
    onChange(Object.freeze({
      reason,
      state,
      tutorial,
      selectedLayerId,
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

  const targetTransforms = () => {
    workbench.root.updateMatrixWorld?.(true);
    burger.root.updateMatrixWorld?.(true);
    const result = new Map();
    let cursorY = workbench.prep.dropAnchor.position.y;
    state.assembledOrder.forEach((layerId, index) => {
      const layer = burger.getLayer(layerId);
      const halfHeight = layer.userData.halfHeight;
      const y = cursorY + halfHeight + (expanded ? index * EXPLODED_GAP : 0);
      result.set(layerId, {
        position: new THREE.Vector3(0, y, 0),
        scale: new THREE.Vector3(PREP_LAYER_SCALE, PREP_LAYER_SCALE, PREP_LAYER_SCALE),
        yaw: state.rotations[layerId],
      });
      cursorY += halfHeight * 2 + STACK_GAP;
    });
    for (const layerId of BURGER_LAYER_IDS) {
      if (result.has(layerId)) continue;
      const station = workbench.getStation("ingredient", layerId);
      const world = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
      const local = burger.root.worldToLocal(world.clone());
      result.set(layerId, {
        position: local,
        scale: new THREE.Vector3(BIN_LAYER_SCALE, BIN_LAYER_SCALE, BIN_LAYER_SCALE),
        yaw: state.rotations[layerId],
      });
    }
    return result;
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
        fromScale: layer.scale.clone(),
        fromYaw: layer.rotation.y,
        target,
      });
    }
    workbench.root.updateMatrixWorld?.(true);
  };

  const rebuildSauces = () => {
    burger.clearSauces();
    state.strokes.forEach((stroke) => burger.addSauceStroke(stroke));
  };

  const applyVisualState = ({ animate = false, sauces = false } = {}) => {
    const fullOrder = [
      ...state.assembledOrder,
      ...BURGER_LAYER_IDS.filter((id) => !state.assembledOrder.includes(id)),
    ];
    fullOrder.forEach((layerId, index) => burger.reorderLayer(layerId, index));
    if (sauces) rebuildSauces();
    syncTransforms({ animate });
    celebration.visible = state.finished;
  };

  const resolveDrop = ({ id, point }) => {
    const layout = workbench.getLayout();
    if (contains(layout.prep.bounds, point)) {
      const count = state.assembledOrder.length;
      const normalized = (point.x - layout.prep.bounds.minX)
        / (layout.prep.bounds.maxX - layout.prep.bounds.minX);
      return {
        valid: true,
        anchor: workbench.prep.dropAnchor,
        targetIndex: Math.min(count, Math.max(0, Math.round(normalized * count))),
      };
    }
    const station = layout.ingredients.find((entry) => entry.id === id);
    if (station && contains(station.bounds, point)) {
      return {
        valid: true,
        anchor: workbench.getStation("ingredient", id).dropAnchor,
      };
    }
    return { valid: false, reason: "请放到中央餐盘或原料盒" };
  };

  const dropLayer = (layerId, destination = {}) => {
    if (disposed) return false;
    if (destination.kind === "prep") {
      const targetIndex = destination.targetIndex ?? state.assembledOrder.length;
      state = placeSoloLayer(state, layerId, targetIndex);
      applyVisualState({ animate: true });
      advanceTutorial("dropped-on-prep");
      if (state.complete) advanceTutorial("assembled-all");
      emit("drop-layer");
      return true;
    }
    if (destination.kind === "bin") {
      state = removeSoloLayer(state, layerId);
      applyVisualState({ animate: true });
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
    cancelLayerTransition(layerId);
    selectedLayerId = layerId;
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
    resolveDrop,
    onPick: ({ id }) => selectLayer(id),
    onSelection: ({ id, selected }) => {
      if (selected) selectedLayerId = id;
      else if (selectedLayerId === id) selectedLayerId = null;
      emit("selection");
    },
    onMove: ({ id, reason, pose }) => {
      cancelLayerTransition(id);
      if ((reason === "rotate" || reason === "twist") && !state.finished) {
        state = rotateSoloLayer(state, id, pose.rotation.y);
        advanceTutorial("rotated-layer");
        emit("rotate-layer");
      }
    },
    onDrop: ({ id, anchor, targetIndex }) => {
      if (anchor === workbench.prep.dropAnchor) dropLayer(id, { kind: "prep", targetIndex });
      else dropLayer(id, { kind: "bin" });
    },
    onInvalid: ({ reason } = {}) => {
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

  const tick = (time = 0) => {
    if (disposed) return;
    lastFrameTime = Number.isFinite(time) ? time : lastFrameTime;
    for (const [layerId, transition] of transitions) {
      const progress = Math.min(1, Math.max(0, (lastFrameTime - transition.start) / SNAP_DURATION));
      const eased = 1 - (1 - progress) ** 3;
      const layer = burger.getLayer(layerId);
      layer.position.lerpVectors(transition.fromPosition, transition.target.position, eased);
      layer.scale.lerpVectors(transition.fromScale, transition.target.scale, eased);
      layer.rotation.y = transition.fromYaw
        + (transition.target.yaw - transition.fromYaw) * eased;
      if (progress >= 1) transitions.delete(layerId);
    }
    if (!reducedMotion) celebration.tick(lastFrameTime);
  };
  const removeFrame = host.onFrame?.(tick) ?? (() => {});
  cleanupTasks.push(removeFrame);
  const removeContextError = host.onContextError?.(onError) ?? (() => {});
  cleanupTasks.push(removeContextError);
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
    binLayerScale: BIN_LAYER_SCALE,
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
      cancelLayerTransition(selectedLayerId);
      state = rotateSoloLayer(state, selectedLayerId, state.rotations[selectedLayerId] + deltaYaw);
      burger.getLayer(selectedLayerId).rotation.y = state.rotations[selectedLayerId];
      advanceTutorial("rotated-layer");
      emit("rotate-layer");
      return true;
    },
    toggleExpanded() {
      if (disposed || state.finished) return expanded;
      expanded = !expanded;
      syncTransforms({ animate: true });
      emit("inspect");
      return expanded;
    },
    resetCamera() { return controller.resetCamera(); },
    undo() {
      if (disposed || !state.history.length) return false;
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
      disposed = true;
      transitions.clear();
      cleanup();
    },
  };
  return api;
  } catch (error) {
    cleanup(error);
  }
}
