import { SAUCE_KEYS } from "./cooking-state.mjs";
import { SOLO_COOKING_SAUCE_IDS } from "./burger-recipes.mjs";

const NO_RAYCAST = () => {};
const MAX_TILT = Math.PI / 3;
const ACTIVE_SCALE = 1.08;
const SAUCE_COLORS = Object.freeze({
  chili: 0xc73a28,
  ketchup: 0xd9472f,
  mustard: 0xe5ad2c,
  "house-sauce": 0xf2b76b,
  sour: 0x79ad44,
  sticky: 0x70402f,
});
const SUPPORTED_SAUCE_IDS = Object.freeze([
  ...new Set([...SAUCE_KEYS, ...SOLO_COOKING_SAUCE_IDS]),
]);

function requireThree(THREE) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.CylinderGeometry) {
    throw new TypeError("A compatible Three.js namespace is required");
  }
}

function normalizeSauceIds(sauceIds) {
  if (!Array.isArray(sauceIds)) {
    throw new TypeError("sauceIds must be an array");
  }
  if (sauceIds.length === 0) {
    throw new TypeError("sauceIds must contain at least one sauce id");
  }
  const normalized = sauceIds.map((sauce) => {
    if (typeof sauce !== "string" || !SUPPORTED_SAUCE_IDS.includes(sauce)) {
      throw new TypeError(`Unsupported sauce id: ${String(sauce)}`);
    }
    return sauce;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("sauceIds contain duplicate sauce ids");
  }
  return Object.freeze(normalized);
}

function validateDocks(toolDocks, sauceIds) {
  if (!Array.isArray(toolDocks) || toolDocks.length === 0) {
    throw new TypeError("toolDocks must exactly match sauce keys");
  }
  const ids = toolDocks.map((dock) => {
    if (!dock || typeof dock !== "object" || Array.isArray(dock)) {
      throw new TypeError("Each condiment dock must be an object");
    }
    if (typeof dock.id !== "string" || !dock.id) {
      throw new TypeError("Each condiment dock must have an id");
    }
    if (!dock.dock?.isObject3D || !dock.pickupAnchor?.isObject3D) {
      throw new TypeError("Each condiment dock needs Three dock and pickupAnchor objects");
    }
    if (dock.pickupAnchor.parent !== dock.dock) {
      throw new TypeError("Each condiment pickupAnchor must belong to its dock");
    }
    return dock.id;
  });
  const slotFlags = toolDocks.map(({ slotId }) => typeof slotId === "string" && Boolean(slotId));
  const descriptorMode = slotFlags.every(Boolean);
  if (!descriptorMode && slotFlags.some(Boolean)) {
    throw new TypeError("Condiment docks must either all use slot ids or none use slot ids");
  }
  if (descriptorMode) {
    const slotIds = toolDocks.map(({ slotId }) => slotId);
    if (new Set(slotIds).size !== slotIds.length) {
      throw new TypeError("Condiment docks contain duplicate slot ids");
    }
    if (ids.some((id) => !sauceIds.includes(id))) {
      throw new TypeError("toolDocks must use supported sauce keys");
    }
  } else if (new Set(ids).size !== ids.length) {
    throw new TypeError("Condiment docks contain duplicate ids");
  } else if (toolDocks.length !== sauceIds.length
    || ids.some((id) => !sauceIds.includes(id))
    || sauceIds.some((id) => !ids.includes(id))) {
    throw new TypeError("toolDocks must exactly match sauce keys");
  }
  const parents = new Set(toolDocks.map(({ dock }) => dock.parent));
  if (parents.size !== 1 || !toolDocks[0].dock.parent?.isObject3D) {
    throw new TypeError("Condiment docks must share one Three parent");
  }
  return Object.freeze({ docks: toolDocks, descriptorMode });
}

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function frozenPose(object) {
  return Object.freeze({
    position: Object.freeze({
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
    }),
    quaternion: Object.freeze({
      x: object.quaternion.x,
      y: object.quaternion.y,
      z: object.quaternion.z,
      w: object.quaternion.w,
    }),
    scale: Object.freeze({ x: object.scale.x, y: object.scale.y, z: object.scale.z }),
  });
}

function restorePose(object, pose) {
  object.position.set(pose.position.x, pose.position.y, pose.position.z);
  object.quaternion.set(
    pose.quaternion.x,
    pose.quaternion.y,
    pose.quaternion.z,
    pose.quaternion.w,
  );
  object.scale.set(pose.scale.x, pose.scale.y, pose.scale.z);
}

export function createCondimentTools3D(THREE, {
  toolDocks,
  sauceIds = SAUCE_KEYS,
} = {}) {
  requireThree(THREE);
  const activeSauceIds = normalizeSauceIds(sauceIds);
  const { docks, descriptorMode } = validateDocks(toolDocks, activeSauceIds);
  const commonParent = docks[0].dock.parent;
  const root = new THREE.Group();
  root.name = "condiment-tools";
  commonParent.add(root);
  commonParent.updateWorldMatrix?.(true, true);

  const previewRoot = new THREE.Group();
  previewRoot.name = "condiment-preview";
  previewRoot.raycast = NO_RAYCAST;
  root.add(previewRoot);

  const shared = {
    bodyGeometry: new THREE.CylinderGeometry(0.27, 0.34, 1.12, 12),
    capGeometry: new THREE.CylinderGeometry(0.22, 0.27, 0.18, 12),
    nozzleGeometry: new THREE.CylinderGeometry(0.07, 0.14, 0.24, 10),
    labelGeometry: new THREE.TorusGeometry(0.285, 0.025, 5, 14),
    capMaterial: new THREE.MeshStandardMaterial({
      color: 0x382b2a,
      roughness: 0.58,
      metalness: 0.02,
      flatShading: true,
    }),
    nozzleMaterial: new THREE.MeshStandardMaterial({
      color: 0xeee2cf,
      roughness: 0.48,
      metalness: 0,
      flatShading: true,
    }),
    labelMaterial: new THREE.MeshStandardMaterial({
      color: 0xffe3a3,
      roughness: 0.64,
      metalness: 0,
      flatShading: true,
    }),
  };
  const bodyMaterials = new Map(activeSauceIds.map((sauce) => [sauce,
    new THREE.MeshStandardMaterial({
      color: SAUCE_COLORS[sauce],
      roughness: 0.56,
      metalness: 0.01,
      flatShading: true,
    }),
  ]));
  const ownedGeometries = new Set([
    shared.bodyGeometry,
    shared.capGeometry,
    shared.nozzleGeometry,
    shared.labelGeometry,
  ]);
  const ownedMaterials = new Set([
    shared.capMaterial,
    shared.nozzleMaterial,
    shared.labelMaterial,
    ...bodyMaterials.values(),
  ]);
  const bottles = new Map();
  const selectableSurfaces = [];
  const homePoses = new Map();
  const updateBottleContent = new Map();
  let activePreview = null;
  const directionScratch = new THREE.Vector3();
  const homeDirectionScratch = new THREE.Vector3();
  const axisScratch = new THREE.Vector3();
  const clampedDirectionScratch = new THREE.Vector3();
  const parentInverseScratch = new THREE.Matrix4();
  const homeQuaternionScratch = new THREE.Quaternion();
  const deltaQuaternionScratch = new THREE.Quaternion();

  for (const dock of docks) {
    const bottleId = descriptorMode ? dock.slotId : dock.id;
    let sauce = dock.id;
    const bottleRoot = new THREE.Group();
    let metadata = null;
    bottleRoot.userData.active = false;

    const body = new THREE.Mesh(shared.bodyGeometry, bodyMaterials.get(sauce));
    body.name = `condiment:${sauce}:body`;
    body.position.y = 0.76;
    const cap = new THREE.Mesh(shared.capGeometry, shared.capMaterial);
    cap.name = `condiment:${sauce}:cap`;
    cap.position.y = 0.15;
    const nozzle = new THREE.Mesh(shared.nozzleGeometry, shared.nozzleMaterial);
    nozzle.name = `condiment:${sauce}:nozzle`;
    nozzle.position.y = -0.04;
    const bottleSurfaces = [body, cap, nozzle];
    bottleSurfaces.forEach((surface) => selectableSurfaces.push(surface));
    const label = new THREE.Mesh(shared.labelGeometry, shared.labelMaterial);
    label.name = `condiment:${sauce}:label`;
    label.raycast = NO_RAYCAST;
    label.rotation.x = Math.PI / 2;
    label.position.set(0, 0.8, 0);
    const nozzleAnchor = new THREE.Object3D();
    nozzleAnchor.name = `condiment:${sauce}:nozzle-anchor`;
    nozzleAnchor.position.y = -0.18;
    bottleRoot.add(body, cap, nozzle, label, nozzleAnchor);
    root.add(bottleRoot);

    const applyContent = (nextSauce) => {
      sauce = nextSauce;
      metadata = Object.freeze({
        kind: "condiment-bottle",
        sauce,
        id: bottleId,
        ...(descriptorMode ? { slotId: bottleId } : {}),
      });
      bottleRoot.name = `condiment:${bottleId}:${sauce}`;
      bottleRoot.userData.condimentBottle = metadata;
      body.name = `condiment:${bottleId}:${sauce}:body`;
      cap.name = `condiment:${bottleId}:${sauce}:cap`;
      nozzle.name = `condiment:${bottleId}:${sauce}:nozzle`;
      label.name = `condiment:${bottleId}:${sauce}:label`;
      nozzleAnchor.name = `condiment:${bottleId}:${sauce}:nozzle-anchor`;
      bottleSurfaces.forEach((surface) => {
        surface.userData.cookingSelectable = metadata;
      });
      nozzleAnchor.userData.condimentNozzle = metadata;
      body.material = bodyMaterials.get(sauce);
    };
    applyContent(sauce);

    root.updateWorldMatrix?.(true, true);
    const homeWorld = dock.pickupAnchor.getWorldPosition(new THREE.Vector3());
    bottleRoot.position.copy(root.worldToLocal(homeWorld.clone()));
    bottleRoot.updateMatrixWorld?.(true);
    const homePose = frozenPose(bottleRoot);
    homePoses.set(bottleId, homePose);
    const bottle = Object.freeze({
      id: bottleId,
      get sauce() { return sauce; },
      root: bottleRoot,
      body,
      cap,
      nozzle,
      nozzleAnchor,
      decoration: Object.freeze([label]),
      selectableSurfaces: Object.freeze(bottleSurfaces),
      get metadata() { return metadata; },
      homePose,
      dock,
    });
    bottles.set(bottleId, bottle);
    updateBottleContent.set(bottleId, applyContent);
  }

  let disposed = false;
  const resolveBottle = (id) => (
    bottles.get(id) ?? [...bottles.values()].find(({ sauce }) => sauce === id) ?? null
  );
  const requireBottle = (id) => {
    const bottle = resolveBottle(id);
    if (!bottle) throw new TypeError(`Unknown condiment: ${String(id)}`);
    return bottle;
  };
  const dockBottle = (id) => {
    if (disposed) return false;
    const bottle = requireBottle(id);
    restorePose(bottle.root, homePoses.get(bottle.id));
    bottle.root.userData.active = false;
    return true;
  };
  const clearSlotContentPreview = () => {
    if (!activePreview) return false;
    activePreview.root.removeFromParent();
    for (const material of activePreview.materials) material.dispose?.();
    activePreview = null;
    return true;
  };
  const previewSlotContent = (slotId, sauce) => {
    if (disposed) return false;
    if (!descriptorMode) {
      throw new TypeError("Physical sauce previews require slot-addressed docks");
    }
    if (!activeSauceIds.includes(sauce)) {
      throw new TypeError(`Unsupported sauce id: ${String(sauce)}`);
    }
    const source = bottles.get(slotId);
    if (!source) throw new TypeError(`Unknown condiment slot: ${String(slotId)}`);
    clearSlotContentPreview();

    const preview = source.root.clone(true);
    const materials = new Set();
    preview.traverse((object) => {
      object.raycast = NO_RAYCAST;
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
      if (/:body$/u.test(object.name)) object.material.color?.setHex?.(SAUCE_COLORS[sauce]);
    });
    restorePose(preview, homePoses.get(source.id));
    preview.userData.slotId = slotId;
    preview.userData.sauce = sauce;
    preview.userData.active = false;
    previewRoot.add(preview);
    activePreview = { root: preview, materials };
    return true;
  };

  return {
    root,
    previewRoot,
    bottles,
    selectableSurfaces: Object.freeze(selectableSurfaces),
    noRaycast: NO_RAYCAST,
    get(id) {
      return resolveBottle(id);
    },
    getBySlot(slotId) {
      return descriptorMode ? bottles.get(slotId) ?? null : null;
    },
    previewSlotContent,
    clearSlotContentPreview,
    dock: dockBottle,
    setTilt(id, tilt = {}) {
      if (disposed) return false;
      const bottle = requireBottle(id);
      if (!tilt || typeof tilt !== "object" || Array.isArray(tilt)) {
        throw new TypeError("tilt must be an object");
      }
      const pose = homePoses.get(bottle.id);
      if (tilt.worldDirection !== undefined) {
        const worldDirection = tilt.worldDirection;
        if (!worldDirection || typeof worldDirection !== "object"
          || Array.isArray(worldDirection)) {
          throw new TypeError("tilt.worldDirection must be a vector object");
        }
        directionScratch.set(
          finite(worldDirection.x, "tilt.worldDirection.x"),
          finite(worldDirection.y, "tilt.worldDirection.y"),
          finite(worldDirection.z, "tilt.worldDirection.z"),
        );
        homeQuaternionScratch.set(
          pose.quaternion.x,
          pose.quaternion.y,
          pose.quaternion.z,
          pose.quaternion.w,
        );
        if (directionScratch.lengthSq() < 1e-12) {
          bottle.root.quaternion.copy(homeQuaternionScratch);
          return true;
        }
        bottle.root.parent?.updateWorldMatrix?.(true, false);
        if (bottle.root.parent) {
          parentInverseScratch.copy(bottle.root.parent.matrixWorld).invert();
          directionScratch.transformDirection(parentInverseScratch);
        } else {
          directionScratch.normalize();
        }
        homeDirectionScratch.set(0, -1, 0).applyQuaternion(homeQuaternionScratch).normalize();
        const maximum = clamp(
          finite(tilt.maxTilt ?? MAX_TILT, "tilt.maxTilt"),
          0,
          MAX_TILT,
        );
        const angle = homeDirectionScratch.angleTo(directionScratch);
        clampedDirectionScratch.copy(directionScratch);
        if (angle > maximum) {
          axisScratch.crossVectors(homeDirectionScratch, directionScratch);
          if (axisScratch.lengthSq() < 1e-12) {
            axisScratch.set(1, 0, 0);
            if (Math.abs(axisScratch.dot(homeDirectionScratch)) > 0.9) {
              axisScratch.set(0, 0, 1);
            }
            axisScratch.cross(homeDirectionScratch);
          }
          axisScratch.normalize();
          deltaQuaternionScratch.setFromAxisAngle(axisScratch, maximum);
          clampedDirectionScratch.copy(homeDirectionScratch)
            .applyQuaternion(deltaQuaternionScratch)
            .normalize();
        }
        deltaQuaternionScratch.setFromUnitVectors(
          homeDirectionScratch,
          clampedDirectionScratch,
        );
        bottle.root.quaternion.multiplyQuaternions(
          deltaQuaternionScratch,
          homeQuaternionScratch,
        ).normalize();
        return true;
      }
      const x = clamp(finite(tilt.x ?? 0, "tilt.x"), -MAX_TILT, MAX_TILT);
      const z = clamp(finite(tilt.z ?? 0, "tilt.z"), -MAX_TILT, MAX_TILT);
      bottle.root.quaternion.set(
        pose.quaternion.x,
        pose.quaternion.y,
        pose.quaternion.z,
        pose.quaternion.w,
      );
      bottle.root.rotateX(x);
      bottle.root.rotateZ(z);
      return true;
    },
    setActive(id, active = true) {
      if (disposed) return false;
      const bottle = requireBottle(id);
      const enabled = Boolean(active);
      bottle.root.userData.active = enabled;
      const scale = enabled ? ACTIVE_SCALE : 1;
      bottle.root.scale.setScalar(scale);
      return true;
    },
    setSlotContent(slotId, sauce) {
      if (disposed) return false;
      if (!descriptorMode) {
        throw new TypeError("Physical sauce slot switching requires slot-addressed docks");
      }
      if (!activeSauceIds.includes(sauce)) {
        throw new TypeError(`Unsupported sauce id: ${String(sauce)}`);
      }
      const bottle = bottles.get(slotId);
      if (!bottle) throw new TypeError(`Unknown condiment slot: ${String(slotId)}`);
      if (bottle.sauce === sauce) return false;
      dockBottle(slotId);
      updateBottleContent.get(slotId)(sauce);
      return true;
    },
    dispose() {
      if (disposed) return;
      clearSlotContentPreview();
      disposed = true;
      root.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      ownedGeometries.clear();
      ownedMaterials.clear();
    },
  };
}
