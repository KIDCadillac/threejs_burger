import { BURGER_LAYER_IDS, SAUCE_KEYS } from "./cooking-state.mjs";

const PREVIEW_MAX_POINTS = 25;
const PREVIEW_RADIAL_SEGMENTS = 5;
const PREVIEW_TUBE_RADIUS = 0.045;

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
  condimentTools = null,
  foodSurfaces = [],
  raycast: injectedRaycast,
  projectToPrep,
  prepPlaneY = 0,
  dragLift = 0.35,
  bottleLift = 1.45,
  maxBottleTilt = Math.PI / 3,
  saucePointSpacing = 0.04,
  prepBounds = null,
  cameraTarget = { x: 0, y: 0, z: 0 },
  orbitLimits = {},
  orbitSensitivity = 0.0042,
  resolveDrop,
  onPick = () => {},
  onMove = () => {},
  onDrop = () => {},
  onInvalid = () => {},
  onSelection = () => {},
  onCameraChange = () => {},
  onSauceStroke = () => {},
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
  if (!Array.isArray(foodSurfaces)) throw new TypeError("foodSurfaces must be an array");
  requireFunction(onPick, "onPick");
  requireFunction(onMove, "onMove");
  requireFunction(onDrop, "onDrop");
  requireFunction(onInvalid, "onInvalid");
  requireFunction(onSelection, "onSelection");
  requireFunction(onCameraChange, "onCameraChange");
  requireFunction(onSauceStroke, "onSauceStroke");
  if (injectedRaycast !== undefined) requireFunction(injectedRaycast, "raycast");
  if (projectToPrep !== undefined) requireFunction(projectToPrep, "projectToPrep");
  if (resolveDrop !== undefined) requireFunction(resolveDrop, "resolveDrop");
  const normalizedDragLift = finiteNumber(dragLift, 0.35, "dragLift");
  const normalizedBottleLift = finiteNumber(bottleLift, 1.45, "bottleLift");
  const normalizedMaxBottleTilt = finiteNumber(
    maxBottleTilt, Math.PI / 3, "maxBottleTilt",
  );
  const normalizedSaucePointSpacing = finiteNumber(
    saucePointSpacing, 0.04, "saucePointSpacing",
  );
  const normalizedPrepPlaneY = finiteNumber(prepPlaneY, 0, "prepPlaneY");
  if (normalizedDragLift < 0) throw new TypeError("dragLift must not be negative");
  if (normalizedBottleLift <= 0) throw new TypeError("bottleLift must be positive");
  if (normalizedMaxBottleTilt <= 0 || normalizedMaxBottleTilt > Math.PI / 2) {
    throw new TypeError("maxBottleTilt must be between zero and pi / 2");
  }
  if (normalizedSaucePointSpacing < 0.04 || normalizedSaucePointSpacing > 1) {
    throw new TypeError("saucePointSpacing must be between 0.04 and 1");
  }
  if (condimentTools !== null) {
    if (!condimentTools || typeof condimentTools !== "object" || Array.isArray(condimentTools)) {
      throw new TypeError("condimentTools must be a condiment tool set");
    }
    for (const method of ["get", "dock", "setTilt", "setActive"]) {
      requireFunction(condimentTools[method], `condimentTools.${method}`);
    }
    if (!Array.isArray(condimentTools.selectableSurfaces)) {
      throw new TypeError("condimentTools.selectableSurfaces must be an array");
    }
    requireObject3D(condimentTools.previewRoot, "condimentTools.previewRoot");
  }
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
    orbitSensitivity, 0.0042, "orbitSensitivity",
  );
  if (normalizedOrbitSensitivity <= 0) {
    throw new TypeError("orbitSensitivity must be positive");
  }

  const raycaster = new THREE.Raycaster();
  const nozzleRaycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const prepPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -normalizedPrepPlaneY);
  const projectedScratch = new THREE.Vector3();
  const worldScratch = new THREE.Vector3();
  const localScratch = new THREE.Vector3();
  const desiredScratch = new THREE.Vector3();
  const nozzleScratch = new THREE.Vector3();
  const nozzleDirectionScratch = new THREE.Vector3();
  const bottleAimScratch = new THREE.Vector3();
  const bottleOriginScratch = new THREE.Vector3();
  let surfaces = [];
  let edibleSurfaces = [];
  const edibleSurfaceSet = new Set();
  const baseSurfaces = new Set();
  const draggableBySurface = new Map();
  const draggableById = new Map();
  let state = "idle";
  let disposed = false;
  let dragSession = null;
  let bottleSession = null;
  let selected = null;
  let orbitSession = null;
  let pinchSession = null;
  const activePointers = new Map();
  let documentHidden = Boolean(documentTarget?.hidden);
  let contextLost = false;
  let explicitlyPaused = false;
  let mutationEpoch = 0;

  const condimentSurfaceMap = new Map();
  if (condimentTools) {
    for (const surface of condimentTools.selectableSurfaces) {
      requireObject3D(surface, "condiment selectable surface");
      const metadata = surface.userData?.cookingSelectable;
      const sauce = metadata?.sauce;
      if (metadata?.kind !== "condiment-bottle" || !SAUCE_KEYS.includes(sauce)) {
        throw new TypeError("Condiment surfaces need exact condiment-bottle metadata");
      }
      const bottle = condimentTools.get(sauce);
      if (!bottle?.root?.isObject3D || !bottle?.nozzleAnchor?.isObject3D) {
        throw new TypeError(`Condiment ${sauce} is missing a bottle root or nozzle anchor`);
      }
      if (!bottle.selectableSurfaces?.includes(surface)) {
        throw new TypeError(`Condiment ${sauce} does not own its selectable surface`);
      }
      condimentSurfaceMap.set(surface, bottle);
    }
  }

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

  const setEdibleSurfaces = (nextSurfaces) => {
    if (!Array.isArray(nextSurfaces)) throw new TypeError("foodSurfaces must be an array");
    const validated = nextSurfaces.map(validateSurface);
    if (new Set(validated).size !== validated.length) {
      throw new TypeError("foodSurfaces must not contain duplicates");
    }
    for (const surface of validated) {
      const metadata = surface.userData?.cookingSelectable;
      if (metadata?.kind !== "food-layer" || !BURGER_LAYER_IDS.includes(metadata.layerId)) {
        throw new TypeError("foodSurfaces must be explicit burger food-layer surfaces");
      }
    }
    edibleSurfaces = [...validated];
    edibleSurfaceSet.clear();
    validated.forEach((surface) => edibleSurfaceSet.add(surface));
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
  setEdibleSurfaces(foodSurfaces);
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

  const defaultHitTest = (event, candidateSurfaces = surfaces) => {
    if (!setPointerRay(event)) return null;
    return raycaster.intersectObjects(candidateSurfaces, false)[0] ?? null;
  };

  const hitTest = (event, candidateSurfaces = surfaces, kind = undefined) => (
    injectedRaycast
      ? injectedRaycast(Object.freeze({
        event,
        camera,
        surfaces: Object.freeze([...candidateSurfaces]),
        raycaster,
        ...(kind ? { kind } : {}),
      }))
      : defaultHitTest(event, candidateSurfaces)
  );

  const condimentHitTest = (event) => {
    if (!condimentTools) return null;
    const hit = hitTest(event, condimentTools.selectableSurfaces, "condiment");
    return hit && condimentSurfaceMap.has(hit.object) ? hit : null;
  };

  const nozzleHitTest = (event, bottle) => {
    if (!edibleSurfaces.length) return null;
    bottle.nozzleAnchor.updateWorldMatrix?.(true, false);
    bottle.nozzleAnchor.getWorldPosition(nozzleScratch);
    // The bottle visibly tilts, while its squeeze stream remains gravity-led from the
    // real nozzle position. This keeps a large dock-to-board swipe controllable.
    nozzleDirectionScratch.set(0, -1, 0);
    nozzleRaycaster.set(nozzleScratch, nozzleDirectionScratch);
    nozzleRaycaster.near = 0;
    nozzleRaycaster.far = 8;
    const hit = injectedRaycast
      ? injectedRaycast(Object.freeze({
        event,
        camera,
        surfaces: Object.freeze([...edibleSurfaces]),
        raycaster: nozzleRaycaster,
        kind: "nozzle",
        origin: Object.freeze({ x: nozzleScratch.x, y: nozzleScratch.y, z: nozzleScratch.z }),
        direction: Object.freeze({
          x: nozzleDirectionScratch.x,
          y: nozzleDirectionScratch.y,
          z: nozzleDirectionScratch.z,
        }),
      }))
      : nozzleRaycaster.intersectObjects(edibleSurfaces, false)[0] ?? null;
    return hit && edibleSurfaceSet.has(hit.object) ? hit : null;
  };

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

  const previewColors = Object.freeze({
    chili: 0xd83c2c,
    mustard: 0xe8b62d,
    sour: 0x82b848,
    sticky: 0x734231,
  });

  const pointerPressure = (event) => {
    const pressure = event?.pressure;
    return typeof pressure === "number" && Number.isFinite(pressure) && pressure > 0
      ? clamp(pressure, 0.01, 1)
      : 0.45;
  };

  const detachedFrozenStroke = (sauce, layerId, amount, points) => Object.freeze({
    sauce,
    layerId,
    amount: clamp(amount, 0.01, 1),
    points: Object.freeze(points.map(([x, z]) => Object.freeze([x, z]))),
  });

  const destroyBottlePreview = (session) => {
    const preview = session?.preview;
    if (!preview) return;
    preview.mesh.removeFromParent();
    preview.geometry.dispose();
    preview.material.dispose();
    session.preview = null;
  };

  const ensureBottlePreview = (session) => {
    if (session.preview) return session.preview;
    const positions = new Float32Array(
      PREVIEW_MAX_POINTS * PREVIEW_RADIAL_SEGMENTS * 3,
    );
    const normals = new Float32Array(positions.length);
    const indices = new Uint16Array(
      (PREVIEW_MAX_POINTS - 1) * PREVIEW_RADIAL_SEGMENTS * 6,
    );
    let indexOffset = 0;
    for (let ring = 0; ring < PREVIEW_MAX_POINTS - 1; ring += 1) {
      for (let side = 0; side < PREVIEW_RADIAL_SEGMENTS; side += 1) {
        const nextSide = (side + 1) % PREVIEW_RADIAL_SEGMENTS;
        const current = ring * PREVIEW_RADIAL_SEGMENTS + side;
        const currentNext = ring * PREVIEW_RADIAL_SEGMENTS + nextSide;
        const following = (ring + 1) * PREVIEW_RADIAL_SEGMENTS + side;
        const followingNext = (ring + 1) * PREVIEW_RADIAL_SEGMENTS + nextSide;
        indices[indexOffset] = current;
        indices[indexOffset + 1] = following;
        indices[indexOffset + 2] = followingNext;
        indices[indexOffset + 3] = current;
        indices[indexOffset + 4] = followingNext;
        indices[indexOffset + 5] = currentNext;
        indexOffset += 6;
      }
    }
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const normalAttribute = new THREE.BufferAttribute(normals, 3);
    positionAttribute.setUsage?.(THREE.DynamicDrawUsage);
    normalAttribute.setUsage?.(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("normal", normalAttribute);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    geometry.userData.tubeRadius = PREVIEW_TUBE_RADIUS;
    geometry.userData.tubeRadialSegments = PREVIEW_RADIAL_SEGMENTS;
    geometry.userData.tubePointCount = 0;
    const material = new THREE.MeshStandardMaterial({
      color: previewColors[session.bottle.sauce],
      roughness: 0.6,
      metalness: 0,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `condiment-preview:${session.bottle.sauce}`;
    mesh.raycast = condimentTools.noRaycast ?? (() => {});
    mesh.frustumCulled = false;
    condimentTools.previewRoot.add(mesh);
    session.preview = {
      mesh,
      geometry,
      material,
      positions,
      normals,
      localPoints: Array.from(
        { length: PREVIEW_MAX_POINTS }, () => new THREE.Vector3(),
      ),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      binormal: new THREE.Vector3(),
      radial: new THREE.Vector3(),
      worldPoint: new THREE.Vector3(),
    };
    return session.preview;
  };

  const updateBottlePreview = (session) => {
    const segment = session.currentSegment;
    if (!segment?.worldPoints.length) {
      destroyBottlePreview(session);
      return;
    }
    const preview = ensureBottlePreview(session);
    condimentTools.previewRoot.updateWorldMatrix?.(true, false);
    session.bottle.nozzleAnchor.updateWorldMatrix?.(true, false);
    const pointCount = Math.min(segment.worldPoints.length + 1, PREVIEW_MAX_POINTS);
    session.bottle.nozzleAnchor.getWorldPosition(preview.worldPoint);
    preview.localPoints[0].copy(preview.worldPoint);
    condimentTools.previewRoot.worldToLocal(preview.localPoints[0]);
    for (let pointIndex = 1; pointIndex < pointCount; pointIndex += 1) {
      preview.localPoints[pointIndex].copy(segment.worldPoints[pointIndex - 1]);
      condimentTools.previewRoot.worldToLocal(preview.localPoints[pointIndex]);
    }
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const before = preview.localPoints[Math.max(0, pointIndex - 1)];
      const after = preview.localPoints[Math.min(pointCount - 1, pointIndex + 1)];
      preview.tangent.subVectors(after, before);
      if (preview.tangent.lengthSq() < 1e-12) preview.tangent.set(0, -1, 0);
      else preview.tangent.normalize();
      if (Math.abs(preview.tangent.y) < 0.9) preview.normal.set(0, 1, 0);
      else preview.normal.set(1, 0, 0);
      preview.normal.crossVectors(preview.tangent, preview.normal).normalize();
      preview.binormal.crossVectors(preview.tangent, preview.normal).normalize();
      for (let side = 0; side < PREVIEW_RADIAL_SEGMENTS; side += 1) {
        const angle = (side / PREVIEW_RADIAL_SEGMENTS) * Math.PI * 2;
        preview.radial.copy(preview.normal).multiplyScalar(Math.cos(angle));
        preview.radial.addScaledVector(preview.binormal, Math.sin(angle));
        const vertexIndex = pointIndex * PREVIEW_RADIAL_SEGMENTS + side;
        const positionOffset = vertexIndex * 3;
        preview.positions[positionOffset] = preview.localPoints[pointIndex].x
          + preview.radial.x * PREVIEW_TUBE_RADIUS;
        preview.positions[positionOffset + 1] = preview.localPoints[pointIndex].y
          + preview.radial.y * PREVIEW_TUBE_RADIUS;
        preview.positions[positionOffset + 2] = preview.localPoints[pointIndex].z
          + preview.radial.z * PREVIEW_TUBE_RADIUS;
        preview.normals[positionOffset] = preview.radial.x;
        preview.normals[positionOffset + 1] = preview.radial.y;
        preview.normals[positionOffset + 2] = preview.radial.z;
      }
    }
    preview.geometry.userData.tubePointCount = pointCount;
    preview.geometry.setDrawRange(
      0,
      Math.max(0, pointCount - 1) * PREVIEW_RADIAL_SEGMENTS * 6,
    );
    preview.geometry.attributes.position.needsUpdate = true;
    preview.geometry.attributes.normal.needsUpdate = true;
    preview.geometry.computeBoundingSphere();
  };

  const normalizedFoodHit = (hit) => {
    if (!hit || !edibleSurfaceSet.has(hit.object) || !hit.point) return null;
    const surface = hit.object;
    const metadata = surface.userData?.cookingSelectable;
    if (metadata?.kind !== "food-layer" || !BURGER_LAYER_IDS.includes(metadata.layerId)) return null;
    if (![hit.point.x, hit.point.y, hit.point.z].every(Number.isFinite)) return null;
    surface.geometry?.computeBoundingBox?.();
    const bounds = surface.geometry?.boundingBox;
    if (!bounds) return null;
    surface.updateWorldMatrix?.(true, false);
    const local = surface.worldToLocal(hit.point.clone());
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerZ = (bounds.min.z + bounds.max.z) / 2;
    const halfX = Math.max((bounds.max.x - bounds.min.x) / 2, 1e-6);
    const halfZ = Math.max((bounds.max.z - bounds.min.z) / 2, 1e-6);
    return {
      layerId: metadata.layerId,
      point: Object.freeze([
        clamp((local.x - centerX) / halfX, -1, 1),
        clamp((local.z - centerZ) / halfZ, -1, 1),
      ]),
      worldPoint: hit.point.clone(),
    };
  };

  const finalizeCurrentBottleSegment = (session) => {
    if (session.currentSegment?.points.length >= 2) {
      session.completedSegments.push({
        layerId: session.currentSegment.layerId,
        points: session.currentSegment.points.map(([x, z]) => [x, z]),
      });
    }
    session.currentSegment = null;
  };

  const sampleBottleTarget = (session, event) => {
    const normalized = normalizedFoodHit(nozzleHitTest(event, session.bottle));
    session.pressureTotal += pointerPressure(event);
    session.pressureSamples += 1;
    if (!normalized) {
      finalizeCurrentBottleSegment(session);
      destroyBottlePreview(session);
      return null;
    }
    if (!session.currentSegment || session.currentSegment.layerId !== normalized.layerId) {
      finalizeCurrentBottleSegment(session);
      session.currentSegment = {
        layerId: normalized.layerId,
        points: [],
        worldPoints: [],
      };
    }
    const points = session.currentSegment.points;
    const prior = points.at(-1);
    if (points.length >= 24 || (prior && Math.hypot(
      normalized.point[0] - prior[0], normalized.point[1] - prior[1],
    ) < normalizedSaucePointSpacing)) {
      return normalized;
    }
    points.push([normalized.point[0], normalized.point[1]]);
    session.currentSegment.worldPoints.push(normalized.worldPoint);
    return normalized;
  };

  const moveBottle = (session, event) => {
    const point = projectedPoint(event, projectedScratch);
    if (point) {
      desiredScratch.set(point.x, point.y + normalizedBottleLift, point.z);
      setWorldPosition(session.bottle.root, desiredScratch);
    }
    // Hit-test from a stable home pose, then aim the physical nozzle in world space.
    // The prep projection itself came from the active camera, so the fallback is also
    // camera-aware without coupling screen X/Y to fixed bottle-local axes.
    condimentTools.setTilt(session.bottle.sauce, { x: 0, z: 0 });
    condimentTools.setActive(session.bottle.sauce, true);
    const targetHit = sampleBottleTarget(session, event);
    const targetWorld = targetHit?.worldPoint ?? point;
    if (targetWorld) {
      session.bottle.root.updateWorldMatrix?.(true, false);
      session.bottle.root.getWorldPosition(bottleOriginScratch);
      bottleAimScratch.subVectors(targetWorld, bottleOriginScratch);
      condimentTools.setTilt(session.bottle.sauce, {
        worldDirection: {
          x: bottleAimScratch.x,
          y: bottleAimScratch.y,
          z: bottleAimScratch.z,
        },
        maxTilt: normalizedMaxBottleTilt,
      });
    }
    updateBottlePreview(session);
  };

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
    const cancelledBottle = bottleSession;
    activePointers.clear();
    dragSession = null;
    bottleSession = null;
    orbitSession = null;
    pinchSession = null;
    state = "idle";
    mutationEpoch += 1;
    let invalidDetail = null;
    if (cancelledBottle) {
      destroyBottlePreview(cancelledBottle);
      condimentTools.setActive(cancelledBottle.bottle.sauce, false);
      condimentTools.dock(cancelledBottle.bottle.sauce);
      invalidDetail = Object.freeze({
        id: cancelledBottle.bottle.sauce,
        object: cancelledBottle.bottle.root,
        kind: "condiment-bottle",
        reason,
        ...(error ? { error } : {}),
        restoredPose: detachedPose(cancelledBottle.bottle.root),
      });
    } else if (cancelledDrag) {
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
      if (state === "dragging-bottle" && bottleSession) return;
      if (activePointers.has(event.pointerId) || activePointers.size >= 2) return;
      activePointers.set(event.pointerId, point);
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
      if (activePointers.size === 2) {
        beginPinch();
        return;
      }
      const condimentHit = condimentHitTest(event);
      if (condimentHit) {
        const bottle = condimentSurfaceMap.get(condimentHit.object);
        transactionSession = {
          kind: "condiment-bottle",
          pointerId: event.pointerId,
          bottle,
          snapshot: snapshotTransform(bottle.root),
          homePose: bottle.homePose,
          completedSegments: [],
          currentSegment: null,
          pressureTotal: 0,
          pressureSamples: 0,
          preview: null,
          epoch: mutationEpoch,
        };
        bottleSession = transactionSession;
        state = "dragging-bottle";
        condimentTools.setActive(bottle.sauce, true);
        const startProjection = projectedPoint(event, projectedScratch);
        if (startProjection) {
          desiredScratch.set(
            startProjection.x,
            startProjection.y + normalizedBottleLift,
            startProjection.z,
          );
          setWorldPosition(bottle.root, desiredScratch);
        }
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
        if (transactionSession?.kind === "condiment-bottle"
          && bottleSession === transactionSession) {
          cancelGesture("pointer-down-error", error);
        } else if (transactionSession && dragSession === transactionSession) {
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
    if (state === "dragging-bottle" && bottleSession?.pointerId === event.pointerId) {
      try {
        moveBottle(bottleSession, event);
      } catch (error) {
        cancelGesture("bottle-move-error", error);
        throw error;
      }
      return;
    }
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
        pitch: current.pitch + dy * normalizedOrbitSensitivity,
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

  const finishBottleGesture = (event) => {
    const session = bottleSession;
    if (!session || session.pointerId !== event.pointerId) return;
    try {
      moveBottle(session, event);
    } catch (error) {
      cancelGesture("bottle-finish-error", error);
      throw error;
    }
    finalizeCurrentBottleSegment(session);
    const amount = session.pressureSamples
      ? session.pressureTotal / session.pressureSamples
      : pointerPressure(event);
    const strokes = session.completedSegments.map(({ layerId, points }) => (
      detachedFrozenStroke(session.bottle.sauce, layerId, amount, points)
    ));
    destroyBottlePreview(session);
    condimentTools.setActive(session.bottle.sauce, false);
    condimentTools.dock(session.bottle.sauce);
    bottleSession = null;
    dragSession = null;
    orbitSession = null;
    pinchSession = null;
    state = "idle";
    activePointers.delete(event.pointerId);
    releaseCapture(event.pointerId);
    for (const stroke of strokes) onSauceStroke(stroke);
  };

  const handlePointerUp = (event) => {
    if (disposed || !activePointers.has(event.pointerId)) return;
    event.preventDefault?.();
    if (state === "dragging-bottle" && bottleSession?.pointerId === event.pointerId) {
      finishBottleGesture(event);
      return;
    }
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
      return Object.freeze([
        ...(condimentTools?.selectableSurfaces ?? []),
        ...surfaces,
      ]);
    },
    setSelectableSurfaces(nextSurfaces) {
      if (disposed) return false;
      setBaseSurfaces(nextSurfaces);
      return true;
    },
    setFoodSurfaces(nextSurfaces) {
      if (disposed) return false;
      if (bottleSession) cancelGesture("food-surfaces-changed");
      setEdibleSurfaces(nextSurfaces);
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
