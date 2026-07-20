function requireEventTarget(value, label) {
  if (!value?.addEventListener || !value?.removeEventListener) {
    throw new TypeError(`${label} must be an event target`);
  }
  return value;
}

function requireObject3D(value, label) {
  if (!value?.isObject3D) throw new TypeError(`${label} must be a Three Object3D`);
  return value;
}

function pointerCoordinates(event) {
  const x = event?.clientX ?? event?.x;
  const y = event?.clientY ?? event?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError("Pointer coordinates must be finite numbers");
  }
  return { x, y };
}

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

function finiteNumber(value, fallback, label) {
  const normalized = value ?? fallback;
  if (!Number.isFinite(normalized)) throw new TypeError(`${label} must be a finite number`);
  return normalized;
}

function copyBounds(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("prepBounds must be an object");
  }
  const bounds = {};
  for (const key of ["minX", "maxX", "minZ", "maxZ"]) {
    if (!Number.isFinite(value[key])) throw new TypeError(`prepBounds.${key} must be finite`);
    bounds[key] = value[key];
  }
  if (bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) {
    throw new TypeError("prepBounds minimums must not exceed maximums");
  }
  return Object.freeze(bounds);
}

function copyOrbitLimits(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("orbitLimits must be an object");
  }
  const limits = {
    minYaw: finiteNumber(value.minYaw, -1.15, "orbitLimits.minYaw"),
    maxYaw: finiteNumber(value.maxYaw, 1.15, "orbitLimits.maxYaw"),
    minPitch: finiteNumber(value.minPitch, 0.25, "orbitLimits.minPitch"),
    maxPitch: finiteNumber(value.maxPitch, 1.25, "orbitLimits.maxPitch"),
    minDistance: finiteNumber(value.minDistance, 5, "orbitLimits.minDistance"),
    maxDistance: finiteNumber(value.maxDistance, 45, "orbitLimits.maxDistance"),
  };
  if (limits.minYaw > limits.maxYaw || limits.minPitch > limits.maxPitch
    || limits.minDistance <= 0 || limits.minDistance > limits.maxDistance) {
    throw new TypeError("orbitLimits contain an invalid range");
  }
  return Object.freeze(limits);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointerDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerAngle(first, second) {
  return Math.atan2(second.y - first.y, second.x - first.x);
}

function normalizedAngle(value) {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function snapshotTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
    rotationOrder: object.rotation.order,
  };
}

function restoreTransform(object, snapshot) {
  object.position.copy(snapshot.position);
  object.rotation.order = snapshot.rotationOrder;
  object.quaternion.copy(snapshot.quaternion);
  object.scale.copy(snapshot.scale);
}

function detachedPose(object) {
  return Object.freeze({
    position: Object.freeze({ x: object.position.x, y: object.position.y, z: object.position.z }),
    rotation: Object.freeze({
      x: object.rotation.x, y: object.rotation.y, z: object.rotation.z, order: object.rotation.order,
    }),
    scale: Object.freeze({ x: object.scale.x, y: object.scale.y, z: object.scale.z }),
  });
}

export function createCookingInteractionController({
  THREE,
  canvas,
  camera,
  documentTarget = globalThis.document,
  selectableSurfaces = [],
  draggables = [],
  raycast: injectedRaycast,
  projectToPrep,
  prepPlaneY = 0,
  dragLift = 0.35,
  prepBounds = null,
  cameraTarget = { x: 0, y: 0, z: 0 },
  orbitLimits = {},
  orbitSensitivity = 0.006,
  resolveDrop,
  onPick = () => {},
  onMove = () => {},
  onDrop = () => {},
  onInvalid = () => {},
  onSelection = () => {},
  onCameraChange = () => {},
} = {}) {
  if (!THREE?.Raycaster || !THREE?.Vector2) {
    throw new TypeError("A compatible Three.js namespace is required");
  }
  requireEventTarget(canvas, "canvas");
  requireObject3D(camera, "camera");
  if (camera.parent) {
    throw new TypeError("camera must not be parented; cooking orbit math uses world coordinates");
  }
  if (documentTarget !== undefined && documentTarget !== null) {
    requireEventTarget(documentTarget, "documentTarget");
  }
  if (!Array.isArray(selectableSurfaces)) {
    throw new TypeError("selectableSurfaces must be an array");
  }
  if (!Array.isArray(draggables)) throw new TypeError("draggables must be an array");
  requireFunction(onPick, "onPick");
  requireFunction(onMove, "onMove");
  requireFunction(onDrop, "onDrop");
  requireFunction(onInvalid, "onInvalid");
  requireFunction(onSelection, "onSelection");
  requireFunction(onCameraChange, "onCameraChange");
  if (injectedRaycast !== undefined) requireFunction(injectedRaycast, "raycast");
  if (projectToPrep !== undefined) requireFunction(projectToPrep, "projectToPrep");
  if (resolveDrop !== undefined) requireFunction(resolveDrop, "resolveDrop");
  const normalizedDragLift = finiteNumber(dragLift, 0.35, "dragLift");
  const normalizedPrepPlaneY = finiteNumber(prepPlaneY, 0, "prepPlaneY");
  if (normalizedDragLift < 0) throw new TypeError("dragLift must not be negative");
  const normalizedPrepBounds = copyBounds(prepBounds);
  if (!cameraTarget || typeof cameraTarget !== "object" || Array.isArray(cameraTarget)
    || ![cameraTarget.x, cameraTarget.y, cameraTarget.z].every(Number.isFinite)) {
    throw new TypeError("cameraTarget must contain finite x, y, and z coordinates");
  }
  const target = new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z);
  const initialCameraTransform = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
  };
  const normalizedOrbitLimits = copyOrbitLimits(orbitLimits);
  const normalizedOrbitSensitivity = finiteNumber(
    orbitSensitivity, 0.006, "orbitSensitivity",
  );
  if (normalizedOrbitSensitivity <= 0) {
    throw new TypeError("orbitSensitivity must be positive");
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const prepPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -normalizedPrepPlaneY);
  const projectedScratch = new THREE.Vector3();
  const worldScratch = new THREE.Vector3();
  const localScratch = new THREE.Vector3();
  const desiredScratch = new THREE.Vector3();
  let surfaces = [];
  const baseSurfaces = new Set();
  const draggableBySurface = new Map();
  const draggableById = new Map();
  let state = "idle";
  let disposed = false;
  let dragSession = null;
  let selected = null;
  let orbitSession = null;
  let pinchSession = null;
  const activePointers = new Map();
  let documentHidden = Boolean(documentTarget?.hidden);
  let contextLost = false;
  let explicitlyPaused = false;
  let mutationEpoch = 0;

  const validateSurface = (surface) => {
    requireObject3D(surface, "selectable surface");
    return surface;
  };

  const rebuildSurfaces = () => {
    surfaces = [...new Set([...baseSurfaces, ...draggableBySurface.keys()])];
  };

  const setBaseSurfaces = (nextSurfaces) => {
    if (!Array.isArray(nextSurfaces)) throw new TypeError("selectableSurfaces must be an array");
    const validated = nextSurfaces.map(validateSurface);
    baseSurfaces.clear();
    validated.forEach((surface) => baseSurfaces.add(surface));
    rebuildSurfaces();
    mutationEpoch += 1;
  };

  const registerRecord = (record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("draggable must be an object");
    }
    if (typeof record.id !== "string" || !record.id) {
      throw new TypeError("draggable.id must be a non-empty string");
    }
    requireObject3D(record.object, "draggable.object");
    if (draggableById.has(record.id)) throw new TypeError(`Duplicate draggable: ${record.id}`);
    for (const existing of draggableById.values()) {
      if (existing.object === record.object) throw new TypeError("Duplicate draggable object");
    }
    const recordSurfaces = record.surfaces ?? [record.object];
    if (!Array.isArray(recordSurfaces) || !recordSurfaces.length) {
      throw new TypeError("draggable.surfaces must be a non-empty array");
    }
    const validatedSurfaces = recordSurfaces.map(validateSurface);
    if (new Set(validatedSurfaces).size !== validatedSurfaces.length) {
      throw new TypeError("Duplicate surface in draggable");
    }
    for (const surface of validatedSurfaces) {
      if (draggableBySurface.has(surface)) throw new TypeError("Duplicate draggable surface");
    }
    const stored = Object.freeze({
      id: record.id, object: record.object, surfaces: Object.freeze([...validatedSurfaces]),
    });
    draggableById.set(record.id, stored);
    for (const surface of validatedSurfaces) draggableBySurface.set(surface, stored);
    rebuildSurfaces();
    mutationEpoch += 1;
    return stored;
  };

  setBaseSurfaces(selectableSurfaces);
  for (const record of draggables) registerRecord(record);

  const setPointerRay = (event) => {
    const { x, y } = pointerCoordinates(event);
    const bounds = canvas.getBoundingClientRect?.();
    const width = bounds?.width;
    const height = bounds?.height;
    if (!(width > 0) || !(height > 0)) return false;
    pointerNdc.set(
      ((x - bounds.left) / width) * 2 - 1,
      -((y - bounds.top) / height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    return true;
  };

  const defaultHitTest = (event) => {
    if (!setPointerRay(event)) return null;
    return raycaster.intersectObjects(surfaces, false)[0] ?? null;
  };

  const hitTest = (event) => (
    injectedRaycast
      ? injectedRaycast(Object.freeze({ event, camera, surfaces: Object.freeze([...surfaces]), raycaster }))
      : defaultHitTest(event)
  );

  const projectedPoint = (event, output = new THREE.Vector3()) => {
    const point = projectToPrep
      ? projectToPrep(event)
      : setPointerRay(event) && raycaster.ray.intersectPlane(prepPlane, output);
    if (!point || ![point.x, point.y ?? 0, point.z].every(Number.isFinite)) return null;
    return output.set(point.x, point.y ?? 0, point.z);
  };

  const worldPosition = (object, output = new THREE.Vector3()) => {
    object.updateWorldMatrix?.(true, false);
    return object.getWorldPosition(output);
  };

  const setWorldPosition = (object, position) => {
    localScratch.copy(position);
    object.parent?.worldToLocal(localScratch);
    object.position.copy(localScratch);
  };

  const insidePrep = (point) => !normalizedPrepBounds || (
    point.x >= normalizedPrepBounds.minX && point.x <= normalizedPrepBounds.maxX
      && point.z >= normalizedPrepBounds.minZ && point.z <= normalizedPrepBounds.maxZ
  );

  const implicitDraggable = (surface) => {
    const metadata = surface?.userData?.cookingSelectable;
    const id = metadata?.layerId ?? (metadata?.kind === "layer" ? metadata.id : null);
    if (!id || (metadata.kind !== "food-layer" && metadata.kind !== "layer")) return null;
    let object = surface;
    while (object?.parent) {
      if (object.userData?.foodLayer?.layerId === id
        || object.userData?.cookingDraggable?.id === id) break;
      object = object.parent;
    }
    return { id, object, surfaces: [surface], implicit: true };
  };

  const select = (draggable) => {
    if (selected?.id === draggable.id && selected.object === draggable.object) return;
    if (selected) {
      selected.object.userData.cookingInteractionSelected = false;
      onSelection(Object.freeze({ id: selected.id, object: selected.object, selected: false }));
    }
    selected = draggable;
    selected.object.userData.cookingInteractionSelected = true;
    onSelection(Object.freeze({ id: selected.id, object: selected.object, selected: true }));
  };

  const readCameraState = () => {
    const offset = camera.position.clone().sub(target);
    const distance = Math.max(offset.length(), 1e-9);
    return {
      yaw: Math.atan2(offset.x, offset.z),
      pitch: Math.asin(clamp(offset.y / distance, -1, 1)),
      distance,
    };
  };

  const applyCameraState = ({ yaw, pitch, distance }, reason) => {
    const nextYaw = clamp(yaw, normalizedOrbitLimits.minYaw, normalizedOrbitLimits.maxYaw);
    const nextPitch = clamp(
      pitch, normalizedOrbitLimits.minPitch, normalizedOrbitLimits.maxPitch,
    );
    const nextDistance = clamp(
      distance, normalizedOrbitLimits.minDistance, normalizedOrbitLimits.maxDistance,
    );
    const horizontal = Math.cos(nextPitch) * nextDistance;
    camera.position.set(
      target.x + Math.sin(nextYaw) * horizontal,
      target.y + Math.sin(nextPitch) * nextDistance,
      target.z + Math.cos(nextYaw) * horizontal,
    );
    camera.lookAt(target);
    camera.updateMatrixWorld?.(true);
    onCameraChange(Object.freeze({
      reason,
      yaw: nextYaw,
      pitch: nextPitch,
      distance: nextDistance,
      position: Object.freeze({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
      target: Object.freeze({ x: target.x, y: target.y, z: target.z }),
    }));
  };

  const beginPinch = () => {
    const [first, second] = [...activePointers.values()];
    const distance = pointerDistance(first, second);
    pinchSession = {
      pointerDistance: Math.max(distance, 1e-6),
      pointerAngle: pointerAngle(first, second),
      camera: readCameraState(),
      selectedYaw: dragSession ? dragSession.draggable.object.rotation.y : null,
    };
    orbitSession = null;
    state = "pinching";
  };

  const selectionFlagSnapshot = (record) => record && ({
    record,
    hadFlag: Object.hasOwn(record.object.userData, "cookingInteractionSelected"),
    value: record.object.userData.cookingInteractionSelected,
  });

  const restoreSelectionFlag = (snapshot) => {
    if (!snapshot) return;
    if (snapshot.hadFlag) {
      snapshot.record.object.userData.cookingInteractionSelected = snapshot.value;
    } else {
      delete snapshot.record.object.userData.cookingInteractionSelected;
    }
  };

  const rollbackSelection = (previousSnapshot, candidateSnapshot) => {
    if (candidateSnapshot?.record.object !== previousSnapshot?.record.object) {
      restoreSelectionFlag(candidateSnapshot);
    }
    selected = previousSnapshot?.record ?? null;
    restoreSelectionFlag(previousSnapshot);
  };

  const releaseCapture = (pointerId) => {
    if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture?.(pointerId);
  };

  const cancelGesture = (reason, error = null) => {
    const pointerIds = [...activePointers.keys()];
    const cancelledDrag = dragSession;
    activePointers.clear();
    dragSession = null;
    orbitSession = null;
    pinchSession = null;
    state = "idle";
    mutationEpoch += 1;
    let invalidDetail = null;
    if (cancelledDrag) {
      const { draggable, snapshot } = cancelledDrag;
      restoreTransform(draggable.object, snapshot);
      invalidDetail = Object.freeze({
        id: draggable.id,
        object: draggable.object,
        reason,
        ...(error ? { error } : {}),
        restoredPose: detachedPose(draggable.object),
      });
    }
    for (const pointerId of pointerIds) releaseCapture(pointerId);
    if (invalidDetail) onInvalid(invalidDetail);
  };

  const handlePointerDown = (event) => {
    if (disposed || documentHidden || contextLost || explicitlyPaused) return;
    if (camera.parent) {
      throw new TypeError("camera must not be parented; cooking orbit math uses world coordinates");
    }
    const previousSelection = selectionFlagSnapshot(selected);
    let candidateSelection = null;
    let transactionSession = null;
    try {
      const point = pointerCoordinates(event);
      if (activePointers.has(event.pointerId) || activePointers.size >= 2) return;
      activePointers.set(event.pointerId, point);
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
      if (activePointers.size === 2) {
        beginPinch();
        return;
      }
      const hit = hitTest(event);
      const draggable = hit
        ? (draggableBySurface.get(hit.object) ?? implicitDraggable(hit.object))
        : null;
      if (draggable) {
        const startProjectionValue = projectedPoint(event, projectedScratch);
        const startProjection = startProjectionValue?.clone() ?? null;
        const startWorld = worldPosition(draggable.object, worldScratch).clone();
        transactionSession = {
          pointerId: event.pointerId,
          draggable,
          snapshot: snapshotTransform(draggable.object),
          startProjection,
          startWorld,
          settleWorldY: startWorld.y,
          lastProjection: startProjection?.clone() ?? null,
          epoch: mutationEpoch,
        };
        dragSession = transactionSession;
        state = "dragging-layer";
        candidateSelection = selectionFlagSnapshot(draggable);
        select(draggable);
        if (disposed || dragSession !== transactionSession || state !== "dragging-layer"
          || !activePointers.has(event.pointerId)
          || transactionSession.epoch !== mutationEpoch) {
          if (dragSession === transactionSession) cancelGesture("interaction-mutated");
          return;
        }
        desiredScratch.copy(startWorld);
        desiredScratch.y += normalizedDragLift;
        setWorldPosition(draggable.object, desiredScratch);
        onPick(Object.freeze({
          id: draggable.id,
          object: draggable.object,
          surface: hit.object,
          point: hit.point.clone(),
          metadata: hit.object.userData?.cookingSelectable ?? null,
        }));
        if (disposed || dragSession !== transactionSession || state !== "dragging-layer"
          || !activePointers.has(event.pointerId)
          || transactionSession.epoch !== mutationEpoch) {
          if (dragSession === transactionSession) cancelGesture("interaction-mutated");
        }
      } else {
        state = "orbiting";
        orbitSession = { pointerId: event.pointerId, last: point };
      }
    } catch (error) {
      try {
        if (transactionSession && dragSession === transactionSession) {
          cancelGesture("pointer-down-error", error);
        } else {
          activePointers.delete(event.pointerId);
          orbitSession = null;
          pinchSession = null;
          if (!activePointers.size) state = "idle";
          releaseCapture(event.pointerId);
        }
      } catch {
        // The initiating error remains primary; cancellation already cleared internal state.
      } finally {
        rollbackSelection(previousSelection, candidateSelection);
      }
      throw error;
    }
  };

  const handlePointerMove = (event) => {
    if (disposed || !activePointers.has(event.pointerId)) return;
    const coordinates = pointerCoordinates(event);
    activePointers.set(event.pointerId, coordinates);
    event.preventDefault?.();
    if (state === "pinching" && activePointers.size >= 2) {
      const [first, second] = [...activePointers.values()];
      const distance = Math.max(pointerDistance(first, second), 1e-6);
      const angleDelta = normalizedAngle(pointerAngle(first, second) - pinchSession.pointerAngle);
      applyCameraState({
        yaw: pinchSession.camera.yaw,
        pitch: pinchSession.camera.pitch,
        distance: pinchSession.camera.distance * (pinchSession.pointerDistance / distance),
      }, "pinch");
      if (dragSession && pinchSession.selectedYaw !== null) {
        dragSession.draggable.object.rotation.y = normalizedAngle(
          pinchSession.selectedYaw + angleDelta,
        );
        onMove(Object.freeze({
          id: dragSession.draggable.id,
          object: dragSession.draggable.object,
          reason: "twist",
          pose: detachedPose(dragSession.draggable.object),
        }));
      }
      return;
    }
    if (state === "orbiting" && orbitSession?.pointerId === event.pointerId) {
      const dx = coordinates.x - orbitSession.last.x;
      const dy = coordinates.y - orbitSession.last.y;
      orbitSession.last = coordinates;
      const current = readCameraState();
      applyCameraState({
        yaw: current.yaw - dx * normalizedOrbitSensitivity,
        pitch: current.pitch - dy * normalizedOrbitSensitivity,
        distance: current.distance,
      }, "orbit");
      return;
    }
    if (state !== "dragging-layer" || dragSession?.pointerId !== event.pointerId) return;
    const point = projectedPoint(event, projectedScratch);
    if (!point || !dragSession.startProjection) return;
    dragSession.lastProjection?.copy(point);
    desiredScratch.copy(dragSession.startWorld);
    desiredScratch.x += point.x - dragSession.startProjection.x;
    desiredScratch.z += point.z - dragSession.startProjection.z;
    desiredScratch.y += normalizedDragLift;
    setWorldPosition(dragSession.draggable.object, desiredScratch);
    onMove(Object.freeze({
      id: dragSession.draggable.id,
      object: dragSession.draggable.object,
      point: Object.freeze({ x: point.x, y: point.y, z: point.z }),
      pose: detachedPose(dragSession.draggable.object),
    }));
  };

  const invalidateDrag = (reason, error = null) => {
    if (!dragSession) return;
    cancelGesture(reason, error);
  };

  const unregisterRecord = (id) => {
    const record = draggableById.get(id);
    if (!record) return false;
    let firstError = null;
    try {
      if (dragSession?.draggable === record) invalidateDrag("unregistered");
    } catch (error) {
      firstError = error;
    } finally {
      draggableById.delete(id);
      for (const surface of record.surfaces) draggableBySurface.delete(surface);
      rebuildSurfaces();
      mutationEpoch += 1;
    }
    if (selected?.object === record.object) {
      const deselected = selected;
      deselected.object.userData.cookingInteractionSelected = false;
      selected = null;
      try {
        onSelection(Object.freeze({ id: deselected.id, object: deselected.object, selected: false }));
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
    return true;
  };

  const resolveAnchorPosition = (anchor) => {
    if (anchor === null) return null;
    let position;
    if (anchor.isObject3D) {
      anchor.updateWorldMatrix?.(true, false);
      position = anchor.getWorldPosition(new THREE.Vector3());
    } else if (anchor.position
      && [anchor.position.x, anchor.position.y, anchor.position.z].every(Number.isFinite)) {
      position = new THREE.Vector3(anchor.position.x, anchor.position.y, anchor.position.z);
    } else {
      throw new TypeError("drop anchor must be an Object3D or contain a finite position");
    }
    if (![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError("drop anchor world position must be finite");
    }
    return position;
  };

  const normalizeDropResolution = (resolution) => {
    if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
      throw new TypeError("resolveDrop must return a drop resolution object");
    }
    if (typeof resolution.valid !== "boolean") {
      throw new TypeError("drop resolution valid must be a boolean");
    }
    const allowedKeys = resolution.valid
      ? new Set(["valid", "anchor", "targetIndex"])
      : new Set(["valid", "reason"]);
    for (const key of Object.keys(resolution)) {
      if (!allowedKeys.has(key)) throw new TypeError(`Unexpected drop resolution property: ${key}`);
    }
    if (!resolution.valid) {
      if (resolution.reason !== undefined
        && (typeof resolution.reason !== "string" || !resolution.reason)) {
        throw new TypeError("invalid drop reason must be a non-empty string");
      }
      return Object.freeze({ valid: false, reason: resolution.reason ?? "invalid-drop" });
    }
    const targetIndex = resolution.targetIndex ?? null;
    if (targetIndex !== null && (!Number.isInteger(targetIndex) || targetIndex < 0)) {
      throw new TypeError("drop targetIndex must be a non-negative integer or null");
    }
    const anchor = resolution.anchor ?? null;
    const anchorPosition = resolveAnchorPosition(anchor);
    return Object.freeze({ valid: true, anchor, anchorPosition, targetIndex });
  };

  const localDropPosition = (object, worldPositionValue) => {
    const local = worldPositionValue.clone();
    object.parent?.worldToLocal(local);
    if (![local.x, local.y, local.z].every(Number.isFinite)) {
      throw new TypeError("drop target position must be finite");
    }
    return local;
  };

  const handlePointerUp = (event) => {
    if (disposed || !activePointers.has(event.pointerId)) return;
    event.preventDefault?.();
    if (state === "pinching") {
      activePointers.delete(event.pointerId);
      releaseCapture(event.pointerId);
      pinchSession = null;
      const remaining = [...activePointers.entries()][0];
      if (!remaining) {
        if (dragSession) invalidateDrag("incomplete-drop");
        else state = "idle";
        return;
      }
      const [pointerId, coordinates] = remaining;
      if (dragSession) {
        state = "dragging-layer";
        dragSession.pointerId = pointerId;
        dragSession.startProjection = projectedPoint({
          pointerId, clientX: coordinates.x, clientY: coordinates.y,
        });
        dragSession.lastProjection = dragSession.startProjection?.clone() ?? null;
        dragSession.startWorld = worldPosition(dragSession.draggable.object);
        dragSession.startWorld.y = dragSession.settleWorldY;
      } else {
        state = "orbiting";
        orbitSession = { pointerId, last: { ...coordinates } };
      }
      return;
    }
    if (state === "orbiting" && orbitSession?.pointerId === event.pointerId) {
      activePointers.delete(event.pointerId);
      orbitSession = null;
      state = "idle";
      releaseCapture(event.pointerId);
      return;
    }
    if (state !== "dragging-layer" || dragSession?.pointerId !== event.pointerId) return;
    const { draggable, snapshot, startWorld } = dragSession;
    let pointerUpProjection;
    try {
      pointerUpProjection = projectedPoint(event, projectedScratch);
    } catch (error) {
      invalidateDrag("outside-prep", error);
      return;
    }
    if (pointerUpProjection) dragSession.lastProjection?.copy(pointerUpProjection);
    else dragSession.lastProjection = null;
    if (!pointerUpProjection || !insidePrep(pointerUpProjection)) {
      invalidateDrag("outside-prep");
      return;
    }
    if (dragSession.startProjection) {
      desiredScratch.copy(startWorld);
      desiredScratch.x += pointerUpProjection.x - dragSession.startProjection.x;
      desiredScratch.z += pointerUpProjection.z - dragSession.startProjection.z;
      desiredScratch.y += normalizedDragLift;
      setWorldPosition(draggable.object, desiredScratch);
    }
    const context = Object.freeze({
      id: draggable.id,
      object: draggable.object,
      point: Object.freeze({
        x: pointerUpProjection.x, y: pointerUpProjection.y, z: pointerUpProjection.z,
      }),
      priorPose: detachedPose({
        position: snapshot.position,
        rotation: new THREE.Euler().setFromQuaternion(snapshot.quaternion, snapshot.rotationOrder),
        scale: snapshot.scale,
      }),
    });
    let resolution;
    try {
      resolution = normalizeDropResolution(resolveDrop ? resolveDrop(context) : { valid: true });
    } catch (error) {
      invalidateDrag("drop-resolution-error", error);
      return;
    }
    if (!resolution.valid) {
      invalidateDrag(resolution.reason);
      return;
    }
    let targetPosition;
    try {
      if (resolution.anchorPosition) {
        targetPosition = localDropPosition(draggable.object, resolution.anchorPosition);
      } else {
        desiredScratch.copy(startWorld);
        desiredScratch.y = dragSession.settleWorldY;
        if (dragSession.startProjection) {
          desiredScratch.x += pointerUpProjection.x - dragSession.startProjection.x;
          desiredScratch.z += pointerUpProjection.z - dragSession.startProjection.z;
        }
        targetPosition = localDropPosition(draggable.object, desiredScratch);
      }
    } catch (error) {
      invalidateDrag("drop-resolution-error", error);
      return;
    }
    draggable.object.position.copy(targetPosition);
    draggable.object.scale.copy(snapshot.scale);
    const dropDetail = Object.freeze({
      id: draggable.id,
      object: draggable.object,
      point: Object.freeze({
        x: pointerUpProjection.x, y: pointerUpProjection.y, z: pointerUpProjection.z,
      }),
      valid: true,
      targetIndex: resolution.targetIndex,
      anchor: resolution.anchor,
      pose: detachedPose(draggable.object),
    });
    dragSession = null;
    orbitSession = null;
    pinchSession = null;
    state = "idle";
    activePointers.delete(event.pointerId);
    releaseCapture(event.pointerId);
    onDrop(dropDetail);
  };

  const handlePointerCancel = (event) => {
    if (disposed || !activePointers.has(event.pointerId)) return;
    cancelGesture("pointer-cancel");
  };

  const handleLostPointerCapture = (event) => {
    if (disposed || !activePointers.has(event.pointerId)) return;
    cancelGesture("lost-pointer-capture");
  };

  const handleVisibilityChange = () => {
    documentHidden = Boolean(documentTarget?.hidden);
    if (documentHidden) cancelGesture("document-hidden");
  };

  const handleContextLost = (event) => {
    event?.preventDefault?.();
    if (disposed || contextLost) return;
    contextLost = true;
    cancelGesture("webgl-context-lost");
  };

  const handleContextRestored = () => {
    if (disposed) return;
    contextLost = false;
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("lostpointercapture", handleLostPointerCapture);
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  documentTarget?.addEventListener?.("visibilitychange", handleVisibilityChange);

  return {
    pointerDown: handlePointerDown,
    pointerMove: handlePointerMove,
    pointerUp: handlePointerUp,
    pointerCancel: handlePointerCancel,
    getState() {
      return state;
    },
    getSelectedId() {
      return selected?.id ?? null;
    },
    getSelectableSurfaces() {
      return Object.freeze([...surfaces]);
    },
    setSelectableSurfaces(nextSurfaces) {
      if (disposed) return false;
      setBaseSurfaces(nextSurfaces);
      return true;
    },
    registerDraggable(record) {
      if (disposed) throw new Error("Cooking interaction controller is disposed");
      registerRecord(record);
      return () => unregisterRecord(record.id);
    },
    unregisterDraggable(id) {
      if (disposed) return false;
      return unregisterRecord(id);
    },
    rotateSelected(deltaYaw) {
      if (disposed || !selected) return false;
      const delta = finiteNumber(deltaYaw, 0, "deltaYaw");
      selected.object.rotation.y = normalizedAngle(selected.object.rotation.y + delta);
      onMove(Object.freeze({
        id: selected.id,
        object: selected.object,
        reason: "rotate",
        pose: detachedPose(selected.object),
      }));
      return true;
    },
    resetCamera() {
      if (disposed) return false;
      camera.position.copy(initialCameraTransform.position);
      camera.quaternion.copy(initialCameraTransform.quaternion);
      camera.updateMatrixWorld?.(true);
      const current = readCameraState();
      onCameraChange(Object.freeze({
        reason: "reset",
        yaw: current.yaw,
        pitch: current.pitch,
        distance: current.distance,
        position: Object.freeze({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
        target: Object.freeze({ x: target.x, y: target.y, z: target.z }),
      }));
      return true;
    },
    pause() {
      if (disposed) return;
      explicitlyPaused = true;
      cancelGesture("paused");
    },
    resume() {
      if (disposed) return;
      explicitlyPaused = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      let firstError = null;
      try {
        cancelGesture("disposed");
      } catch (error) {
        firstError = error;
      } finally {
        state = "idle";
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointercancel", handlePointerCancel);
        canvas.removeEventListener("lostpointercapture", handleLostPointerCapture);
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        documentTarget?.removeEventListener?.("visibilitychange", handleVisibilityChange);
      }
      if (selected) {
        const deselected = selected;
        deselected.object.userData.cookingInteractionSelected = false;
        selected = null;
        try {
          onSelection(Object.freeze({
            id: deselected.id, object: deselected.object, selected: false,
          }));
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError) throw firstError;
    },
  };
}
