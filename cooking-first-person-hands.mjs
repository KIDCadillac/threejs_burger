const RESET_REASONS = new Set([
  "finish",
  "reset",
  "undo",
  "continue",
  "ready",
  "interaction-paused",
]);

const INGREDIENT_PROFILES = Object.freeze({
  "bottom-bun": Object.freeze({ scale: 1.25, spread: 0.42, height: 0.18 }),
  patty: Object.freeze({ scale: 1.18, spread: 0.4, height: 0.12 }),
  pickle: Object.freeze({ scale: 0.96, spread: 0.3, height: 0.09 }),
  onion: Object.freeze({ scale: 0.96, spread: 0.3, height: 0.09 }),
  "top-bun": Object.freeze({ scale: 1.28, spread: 0.44, height: 0.21 }),
  default: Object.freeze({ scale: 1.08, spread: 0.36, height: 0.13 }),
});

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value) => 1 - (1 - clamp01(value)) ** 3;

function sideForSlot(slotId, layerId = "") {
  const normalized = String(slotId ?? "");
  if (normalized.startsWith("bread-left")) return "left";
  if (normalized.startsWith("sauce-right")) return "right";
  if (normalized.startsWith("filling-back")) {
    const index = Number.parseInt(normalized.split("-").at(-1), 10);
    return Number.isFinite(index) && index >= 3 ? "right" : "left";
  }
  const checksum = [...String(layerId)].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return checksum % 2 ? "left" : "right";
}

function finitePoint(value) {
  if (![value?.x, value?.y, value?.z].every(Number.isFinite)) return null;
  return value;
}

function profileFor(ingredientId) {
  return INGREDIENT_PROFILES[ingredientId] ?? INGREDIENT_PROFILES.default;
}

function proceduralMaterial(THREE, color, roughness = 0.8) {
  const Material = THREE.MeshToonMaterial ?? THREE.MeshStandardMaterial;
  const material = new Material({
    color,
    ...(Material === THREE.MeshStandardMaterial ? { roughness, metalness: 0.02 } : {}),
  });
  material.name = "procedural-hand-material";
  material.userData = { procedural: true, textureFree: true };
  return material;
}

function meshPart(THREE, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.procedural = true;
  return mesh;
}

function createFinger(THREE, material, name, x, length, radius) {
  const root = new THREE.Group();
  root.name = `${name}-knuckle`;
  root.position.set(x, 0.26, -0.02);
  const first = meshPart(
    THREE,
    new THREE.CapsuleGeometry(radius, length * 0.42, 4, 8),
    material,
    `${name}-proximal`,
  );
  first.position.y = length * 0.28;
  const tipJoint = new THREE.Group();
  tipJoint.name = `${name}-tip-joint`;
  tipJoint.position.y = length * 0.56;
  const seam = meshPart(
    THREE,
    new THREE.TorusGeometry(radius * 1.02, 0.018, 4, 10),
    material.userData.outlineMaterial ?? material,
    `${name}-joint-seam`,
  );
  seam.rotation.x = Math.PI / 2;
  const tip = meshPart(
    THREE,
    new THREE.CapsuleGeometry(radius * 0.94, length * 0.34, 4, 8),
    material,
    `${name}-distal`,
  );
  tip.position.y = length * 0.23;
  tipJoint.add(seam, tip);
  root.add(first, tipJoint);
  return { root, tipJoint };
}

function createHand(THREE, side, materials, geometries) {
  const sign = side === "left" ? -1 : 1;
  const root = new THREE.Group();
  root.name = `procedural-${side}-glove`;
  root.visible = false;
  root.userData = { procedural: true, textureFree: true, side };

  const joint = meshPart(
    THREE,
    new THREE.SphereGeometry(0.19, 12, 8),
    materials.wood,
    `${side}-wooden-wrist-joint`,
  );
  joint.position.y = -0.55;
  const forearm = meshPart(
    THREE,
    new THREE.CapsuleGeometry(0.16, 0.62, 4, 10),
    materials.wood,
    `${side}-wooden-forearm`,
  );
  forearm.position.y = -1.02;
  const forearmJoint = meshPart(
    THREE,
    new THREE.SphereGeometry(0.2, 12, 8),
    materials.outline,
    `${side}-forearm-joint`,
  );
  forearmJoint.position.y = -1.43;
  const cuff = meshPart(
    THREE,
    new THREE.CylinderGeometry(0.32, 0.38, 0.32, 12),
    materials.cuff,
    `${side}-red-cuff`,
  );
  cuff.position.y = -0.31;
  const cuffBand = meshPart(
    THREE,
    new THREE.TorusGeometry(0.34, 0.045, 5, 14),
    materials.outline,
    `${side}-cuff-band`,
  );
  cuffBand.rotation.x = Math.PI / 2;
  cuffBand.position.y = -0.15;
  const palm = meshPart(
    THREE,
    new THREE.SphereGeometry(0.45, 16, 11),
    materials.glove,
    `${side}-palm`,
  );
  palm.scale.set(0.88, 1.04, 0.48);
  palm.position.y = 0.12;

  const fingers = [];
  const specs = [
    [-0.27, 0.62, 0.115],
    [-0.09, 0.7, 0.12],
    [0.09, 0.67, 0.115],
    [0.27, 0.56, 0.105],
  ];
  for (let index = 0; index < specs.length; index += 1) {
    const [x, length, radius] = specs[index];
    materials.glove.userData.outlineMaterial = materials.outline;
    const finger = createFinger(
      THREE,
      materials.glove,
      `${side}-finger-${index + 1}`,
      x,
      length,
      radius,
    );
    fingers.push(finger);
    root.add(finger.root);
  }

  const thumbRoot = new THREE.Group();
  thumbRoot.name = `${side}-thumb-joint`;
  thumbRoot.position.set(sign * 0.38, 0.03, 0.02);
  thumbRoot.rotation.z = sign * -0.74;
  const thumb = meshPart(
    THREE,
    new THREE.CapsuleGeometry(0.13, 0.34, 4, 8),
    materials.glove,
    `${side}-thumb`,
  );
  thumb.position.y = 0.23;
  thumbRoot.add(thumb);
  root.add(forearmJoint, forearm, joint, cuff, cuffBand, palm, thumbRoot);
  root.scale.setScalar(0.82);

  for (const child of root.children) {
    if (child.geometry) geometries.add(child.geometry);
    child.traverse?.((node) => {
      if (node.geometry) geometries.add(node.geometry);
    });
  }

  return {
    root,
    fingers,
    thumbRoot,
    side,
    sign,
    gestureId: null,
    mode: "idle",
    ingredientId: null,
    targetObject: null,
    target: new THREE.Vector3(),
    reachStart: new THREE.Vector3(),
    reachStartedAt: 0,
    gripStartedAt: 0,
    releaseStartedAt: 0,
    releaseDuration: 520,
  };
}

function setGrip(hand, amount, squeeze = 0) {
  const grip = clamp01(amount);
  const pressure = clamp01(squeeze);
  for (let index = 0; index < hand.fingers.length; index += 1) {
    const finger = hand.fingers[index];
    finger.root.rotation.x = -(0.12 + grip * (0.72 + index * 0.025) + pressure * 0.12);
    finger.tipJoint.rotation.x = -(0.08 + grip * 0.94 + pressure * 0.18);
  }
  hand.thumbRoot.rotation.x = -(0.12 + grip * 0.58 + pressure * 0.18);
  hand.thumbRoot.rotation.z = hand.sign * (-0.68 + grip * 0.18);
}

function applyGripTransform(hand, worldPoint, ingredientId, { sauce = false } = {}) {
  const profile = sauce
    ? { scale: 1.02, spread: 0.24, height: 0.22 }
    : profileFor(ingredientId);
  const offsetX = sauce ? hand.sign * profile.spread : 0;
  const offsetZ = sauce ? 0.1 : -hand.sign * profile.spread;
  hand.target.set(
    worldPoint.x + offsetX,
    worldPoint.y + profile.height,
    worldPoint.z + offsetZ,
  );
  hand.root.position.copy(hand.target);
  // The local hand is authored upright in XY. Lay the palm almost parallel to
  // the counter for ingredient grips so the fixed top-down camera reads four
  // distinct fingers, a thumb and the red cuff instead of one white silhouette.
  hand.root.rotation.set(
    sauce ? -0.16 : -1.16,
    hand.sign * (sauce ? 0.38 : 0.08),
    hand.sign * (sauce ? 0.54 : 0),
  );
  hand.root.scale.setScalar(profile.scale);
}

function sideFromDetail(detail) {
  if (detail?.side === "left" || detail?.side === "right") return detail.side;
  return sideForSlot(detail?.slotId, detail?.layerId);
}

export function createCookingFirstPersonHands(THREE, {
  parent,
  reducedMotion = false,
} = {}) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.CapsuleGeometry) {
    throw new TypeError("A compatible Three.js namespace is required");
  }
  if (!parent?.isObject3D) throw new TypeError("parent must be a Three Object3D");

  const root = new THREE.Group();
  root.name = "procedural-cooking-hands-3d";
  root.userData = { procedural: true, textureFree: true };
  const geometries = new Set();
  const materials = {
    glove: proceduralMaterial(THREE, 0xfff3d2),
    cuff: proceduralMaterial(THREE, 0xc84230),
    wood: proceduralMaterial(THREE, 0xa66534),
    outline: proceduralMaterial(THREE, 0x3b241d),
  };
  const hands = {
    left: createHand(THREE, "left", materials, geometries),
    right: createHand(THREE, "right", materials, geometries),
  };
  root.add(hands.left.root, hands.right.root);
  parent.add(root);
  parent.userData.cookingHandRig = null;

  let disposed = false;
  let activeIngredientSide = null;
  let activeToolSide = null;
  let lastTime = 0;

  const hide = (hand) => {
    hand.mode = "idle";
    hand.gestureId = null;
    hand.targetObject = null;
    hand.root.visible = false;
    setGrip(hand, 0);
  };
  const reset = () => {
    hide(hands.left);
    hide(hands.right);
    activeIngredientSide = null;
    activeToolSide = null;
  };
  const worldPositionFor = (detail, object = null) => {
    const direct = finitePoint(detail?.worldPosition);
    if (direct) return direct;
    if (!object?.getWorldPosition) return null;
    return object.getWorldPosition(new THREE.Vector3());
  };

  const handleIngredientGesture = (detail = {}, context = {}) => {
    if (disposed) return null;
    const side = detail.phase === "reach"
      ? sideFromDetail(detail)
      : activeIngredientSide;
    if (!side) return null;
    const hand = hands[side];
    const gestureId = detail.gestureId ?? null;
    if (detail.phase === "reach") {
      if (!gestureId) return null;
      activeIngredientSide = side;
      hand.gestureId = gestureId;
      hand.mode = "reach";
      hand.ingredientId = detail.ingredientId ?? context.ingredientId ?? null;
      hand.targetObject = context.object ?? null;
      hand.root.visible = true;
    } else if (hand.gestureId !== gestureId) {
      return null;
    }
    const point = worldPositionFor(detail, context.object ?? hand.targetObject);
    if (point) applyGripTransform(hand, point, hand.ingredientId);
    if (detail.phase === "reach") {
      hand.reachStartedAt = lastTime;
      hand.reachStart.copy(hand.target).add({
        x: hand.sign * 2.1,
        y: 0.55,
        z: 1.35,
      });
      hand.root.position.copy(hand.reachStart);
      setGrip(hand, 0);
    } else if (detail.phase === "grip") {
      hand.mode = "grip";
      hand.gripStartedAt = lastTime;
      hand.targetObject = context.object ?? hand.targetObject;
      setGrip(hand, 0);
    } else if (detail.phase === "carry" || detail.phase === "move") {
      hand.mode = "hold";
      hand.targetObject = context.object ?? hand.targetObject;
      setGrip(hand, 1);
    } else if (detail.phase === "end") {
      hand.mode = "withdraw";
      hand.releaseStartedAt = lastTime;
      // Pointer-up is the real release point. Freeze the hand at that pose,
      // open the fingers, and sever the object reference before the ingredient
      // starts its independent gravity fall. The hand must never ride the food
      // down to the stack.
      hand.targetObject = null;
      setGrip(hand, detail.reason === "pointer-up" ? 0.72 : 0.45);
      activeIngredientSide = null;
    }
    return Object.freeze({ mode: hand.mode, side, gestureId });
  };

  const handleToolGesture = (detail = {}, context = {}) => {
    if (disposed) return null;
    const side = "right";
    const hand = hands[side];
    const gestureId = detail.gestureId ?? null;
    if (detail.phase === "start") {
      if (!gestureId) return null;
      activeToolSide = side;
      hand.gestureId = gestureId;
      hand.mode = "sauce-hold";
      hand.targetObject = context.object ?? null;
      hand.root.visible = true;
    } else if (hand.gestureId !== gestureId) {
      return null;
    }
    const point = worldPositionFor(detail, context.object ?? hand.targetObject);
    if (point) applyGripTransform(hand, point, null, { sauce: true });
    if (detail.phase === "start" || detail.phase === "move") {
      hand.mode = "sauce-hold";
      hand.targetObject = context.object ?? hand.targetObject;
      setGrip(hand, 0.92, detail.squeezing ? 1 : 0);
    } else if (detail.phase === "end") {
      hand.mode = "withdraw";
      hand.releaseStartedAt = lastTime;
      hand.targetObject = null;
      activeToolSide = null;
    }
    return Object.freeze({ mode: hand.mode, side, gestureId });
  };

  const handleStageChange = (detail = {}) => {
    if (RESET_REASONS.has(detail.reason)) reset();
  };

  const tick = (time = 0) => {
    if (disposed) return;
    lastTime = Number.isFinite(time) ? time : lastTime;
    for (const hand of Object.values(hands)) {
      if (!hand.root.visible || hand.mode === "idle") continue;
      if (hand.mode === "reach") {
        const duration = reducedMotion ? 1 : 95;
        const progress = clamp01((lastTime - hand.reachStartedAt) / duration);
        hand.root.position.lerpVectors(hand.reachStart, hand.target, easeOutCubic(progress));
        setGrip(hand, progress * 0.12);
        continue;
      }
      if (hand.mode === "grip") {
        const duration = reducedMotion ? 1 : 65;
        const progress = clamp01((lastTime - hand.gripStartedAt) / duration);
        hand.root.position.copy(hand.target);
        setGrip(hand, easeOutCubic(progress));
        if (progress >= 1) hand.mode = "hold";
        continue;
      }
      if (hand.mode.includes("hold")) continue;
      const elapsed = Math.max(0, lastTime - hand.releaseStartedAt);
      const duration = reducedMotion ? 1 : 220;
      const progress = clamp01(elapsed / duration);
      hand.root.position.x += hand.sign * 0.035 * easeOutCubic(progress);
      hand.root.position.y += 0.025 + progress * 0.018;
      hand.root.rotation.z += hand.sign * 0.015;
      hand.root.scale.multiplyScalar(1 - progress * 0.012);
      setGrip(hand, 0.4 * (1 - progress));
      if (progress >= 1) hide(hand);
    }
  };

  const api = Object.freeze({
    root,
    handleStageChange,
    handleToolGesture,
    handleIngredientGesture,
    tick,
    createDebugIngredientPose({
      side = "left",
      phase = "reach",
      ingredientId = "bottom-bun",
      position = { x: 0, y: 1.1, z: 0.35 },
    } = {}) {
      if (disposed) return null;
      if (side !== "left" && side !== "right") return null;
      const hand = hands[side];
      const detail = {
        phase,
        side,
        gestureId: `debug-${side}`,
        ingredientId,
        worldPosition: position,
      };
      if (phase === "reach") {
        activeIngredientSide = side;
        hand.gestureId = detail.gestureId;
      }
      return handleIngredientGesture(detail, {});
    },
    getDebugState() {
      return Object.freeze(Object.fromEntries(Object.entries(hands).map(([side, hand]) => [
        side,
        Object.freeze({
          visible: hand.root.visible,
          mode: hand.mode,
          gestureId: hand.gestureId,
          ingredientId: hand.ingredientId,
          position: Object.freeze({
            x: hand.root.position.x,
            y: hand.root.position.y,
            z: hand.root.position.z,
          }),
        }),
      ])));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      if (parent.userData.cookingHandRig === api) parent.userData.cookingHandRig = null;
      root.removeFromParent();
      for (const geometry of geometries) geometry.dispose?.();
      for (const material of Object.values(materials)) material.dispose?.();
    },
  });
  parent.userData.cookingHandRig = api;
  return api;
}
