import { SAUCE_KEYS } from "./cooking-state.mjs";

const NO_RAYCAST = () => {};
const MAX_TILT = Math.PI / 3;
const ACTIVE_SCALE = 1.08;
const SAUCE_COLORS = Object.freeze({
  chili: 0xc73a28,
  mustard: 0xe5ad2c,
  sour: 0x79ad44,
  sticky: 0x70402f,
});

function requireThree(THREE) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.CylinderGeometry) {
    throw new TypeError("A compatible Three.js namespace is required");
  }
}

function validateDocks(toolDocks) {
  if (!Array.isArray(toolDocks) || toolDocks.length !== SAUCE_KEYS.length) {
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
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("Condiment docks contain duplicate ids");
  }
  if (ids.some((id) => !SAUCE_KEYS.includes(id))
    || SAUCE_KEYS.some((id) => !ids.includes(id))) {
    throw new TypeError("toolDocks must exactly match sauce keys");
  }
  const parents = new Set(toolDocks.map(({ dock }) => dock.parent));
  if (parents.size !== 1 || !toolDocks[0].dock.parent?.isObject3D) {
    throw new TypeError("Condiment docks must share one Three parent");
  }
  return toolDocks;
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

export function createCondimentTools3D(THREE, { toolDocks } = {}) {
  requireThree(THREE);
  const docks = validateDocks(toolDocks);
  const dockById = new Map(docks.map((dock) => [dock.id, dock]));
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
  const bodyMaterials = new Map(SAUCE_KEYS.map((sauce) => [sauce,
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
  const directionScratch = new THREE.Vector3();
  const homeDirectionScratch = new THREE.Vector3();
  const axisScratch = new THREE.Vector3();
  const clampedDirectionScratch = new THREE.Vector3();
  const parentInverseScratch = new THREE.Matrix4();
  const homeQuaternionScratch = new THREE.Quaternion();
  const deltaQuaternionScratch = new THREE.Quaternion();

  for (const sauce of SAUCE_KEYS) {
    const dock = dockById.get(sauce);
    const bottleRoot = new THREE.Group();
    bottleRoot.name = `condiment:${sauce}`;
    const metadata = Object.freeze({ kind: "condiment-bottle", sauce, id: sauce });
    bottleRoot.userData.condimentBottle = metadata;
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
    for (const surface of [body, cap, nozzle]) {
      surface.userData.cookingSelectable = metadata;
      selectableSurfaces.push(surface);
    }
    const label = new THREE.Mesh(shared.labelGeometry, shared.labelMaterial);
    label.name = `condiment:${sauce}:label`;
    label.raycast = NO_RAYCAST;
    label.rotation.x = Math.PI / 2;
    label.position.set(0, 0.8, 0);
    const nozzleAnchor = new THREE.Object3D();
    nozzleAnchor.name = `condiment:${sauce}:nozzle-anchor`;
    nozzleAnchor.position.y = -0.18;
    nozzleAnchor.userData.condimentNozzle = metadata;
    bottleRoot.add(body, cap, nozzle, label, nozzleAnchor);
    root.add(bottleRoot);

    root.updateWorldMatrix?.(true, true);
    const homeWorld = dock.pickupAnchor.getWorldPosition(new THREE.Vector3());
    bottleRoot.position.copy(root.worldToLocal(homeWorld.clone()));
    bottleRoot.updateMatrixWorld?.(true);
    const homePose = frozenPose(bottleRoot);
    homePoses.set(sauce, homePose);
    bottles.set(sauce, Object.freeze({
      id: sauce,
      sauce,
      root: bottleRoot,
      body,
      cap,
      nozzle,
      nozzleAnchor,
      decoration: Object.freeze([label]),
      selectableSurfaces: Object.freeze([body, cap, nozzle]),
      metadata,
      homePose,
      dock,
    }));
  }

  let disposed = false;
  const requireBottle = (sauce) => {
    if (!SAUCE_KEYS.includes(sauce) || !bottles.has(sauce)) {
      throw new TypeError(`Unknown condiment: ${String(sauce)}`);
    }
    return bottles.get(sauce);
  };
  const dockBottle = (sauce) => {
    if (disposed) return false;
    const bottle = requireBottle(sauce);
    restorePose(bottle.root, homePoses.get(sauce));
    bottle.root.userData.active = false;
    return true;
  };

  return {
    root,
    previewRoot,
    bottles,
    selectableSurfaces: Object.freeze(selectableSurfaces),
    noRaycast: NO_RAYCAST,
    get(sauce) {
      return bottles.get(sauce) ?? null;
    },
    dock: dockBottle,
    setTilt(sauce, tilt = {}) {
      if (disposed) return false;
      const bottle = requireBottle(sauce);
      if (!tilt || typeof tilt !== "object" || Array.isArray(tilt)) {
        throw new TypeError("tilt must be an object");
      }
      const pose = homePoses.get(sauce);
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
    setActive(sauce, active = true) {
      if (disposed) return false;
      const bottle = requireBottle(sauce);
      const enabled = Boolean(active);
      bottle.root.userData.active = enabled;
      const scale = enabled ? ACTIVE_SCALE : 1;
      bottle.root.scale.setScalar(scale);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      ownedGeometries.clear();
      ownedMaterials.clear();
    },
  };
}
