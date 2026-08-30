const RESET_REASONS = new Set([
  "finish",
  "reset",
  "undo",
  "continue",
  "ready",
  "interaction-paused",
]);

const GRIP_POSES = Object.freeze({
  cradle: Object.freeze({
    fingerCurl: Object.freeze([0.55, 0.62, 0.68, 0.76]),
    tipCurl: Object.freeze([0.56, 0.66, 0.72, 0.82]),
    fan: Object.freeze([-0.14, -0.045, 0.045, 0.14]),
    thumbCurl: 0.62,
    thumbOpposition: 0.28,
  }),
  clamp: Object.freeze({
    fingerCurl: Object.freeze([0.86, 0.92, 0.96, 1.02]),
    tipCurl: Object.freeze([0.95, 1.02, 1.08, 1.14]),
    fan: Object.freeze([-0.04, -0.015, 0.015, 0.04]),
    thumbCurl: 0.86,
    thumbOpposition: 0.42,
  }),
  "precision-pinch": Object.freeze({
    fingerCurl: Object.freeze([0.7, 0.42, 1.16, 1.24]),
    tipCurl: Object.freeze([0.92, 0.58, 1.28, 1.34]),
    fan: Object.freeze([-0.1, 0.02, 0.08, 0.12]),
    thumbCurl: 1.02,
    thumbOpposition: 0.52,
  }),
  "scoop-pinch": Object.freeze({
    fingerCurl: Object.freeze([0.78, 0.72, 1.05, 1.18]),
    tipCurl: Object.freeze([1.06, 0.94, 1.2, 1.3]),
    fan: Object.freeze([-0.08, -0.01, 0.07, 0.14]),
    thumbCurl: 0.96,
    thumbOpposition: 0.48,
  }),
  "bottle-wrap": Object.freeze({
    fingerCurl: Object.freeze([1.02, 1.05, 1.08, 1.12]),
    tipCurl: Object.freeze([1.12, 1.16, 1.2, 1.24]),
    fan: Object.freeze([-0.025, -0.01, 0.01, 0.025]),
    thumbCurl: 0.88,
    thumbOpposition: 0.6,
  }),
});

const INGREDIENT_PROFILES = Object.freeze({
  "bottom-bun": Object.freeze({
    poseId: "cradle", scale: 1.17, sideOffset: 0.08, cameraOffset: 0.18,
    clearance: 0.3, rotationX: -1.06, rotationY: 0.06, rotationZ: 0.1,
    reachX: 2.25, reachY: 0.58, reachZ: 1.2, reachArc: 0.32,
    carryBob: 0.025, carryRoll: 0.018,
  }),
  patty: Object.freeze({
    poseId: "clamp", scale: 1.08, sideOffset: 0.03, cameraOffset: 0.13,
    clearance: 0.25, rotationX: -1.2, rotationY: 0.14, rotationZ: -0.08,
    reachX: 2.05, reachY: 0.42, reachZ: 0.94, reachArc: 0.16,
    carryBob: 0.012, carryRoll: 0.01,
  }),
  pickle: Object.freeze({
    poseId: "precision-pinch", scale: 0.9, sideOffset: 0, cameraOffset: 0.08,
    clearance: 0.26, rotationX: -1.3, rotationY: 0.22, rotationZ: 0.28,
    reachX: 1.82, reachY: 0.52, reachZ: 0.78, reachArc: 0.12,
    carryBob: 0.018, carryRoll: 0.035,
  }),
  onion: Object.freeze({
    poseId: "scoop-pinch", scale: 0.92, sideOffset: 0, cameraOffset: 0.1,
    clearance: 0.27, rotationX: -1.24, rotationY: 0.28, rotationZ: -0.3,
    reachX: 1.9, reachY: 0.64, reachZ: 0.84, reachArc: 0.24,
    carryBob: 0.032, carryRoll: 0.05,
  }),
  "top-bun": Object.freeze({
    poseId: "cradle", scale: 1.2, sideOffset: 0.09, cameraOffset: 0.2,
    clearance: 0.34, rotationX: -1.02, rotationY: 0.04, rotationZ: 0.12,
    reachX: 2.3, reachY: 0.68, reachZ: 1.24, reachArc: 0.36,
    carryBob: 0.03, carryRoll: 0.02,
  }),
  "rice-bed": Object.freeze({
    poseId: "cradle", scale: 0.98, sideOffset: 0.04, cameraOffset: 0.1,
    clearance: 0.23, rotationX: -1.1, rotationY: 0.1, rotationZ: 0.08,
    reachX: 1.9, reachY: 0.48, reachZ: 0.88, reachArc: 0.22,
    carryBob: 0.018, carryRoll: 0.014,
  }),
  "salmon-slice": Object.freeze({
    poseId: "precision-pinch", scale: 0.88, sideOffset: 0.02, cameraOffset: 0.07,
    clearance: 0.2, rotationX: -1.28, rotationY: 0.2, rotationZ: 0.2,
    reachX: 1.72, reachY: 0.46, reachZ: 0.72, reachArc: 0.12,
    carryBob: 0.014, carryRoll: 0.024,
  }),
  "whole-fish-hold": Object.freeze({
    poseId: "cradle", scale: 0.92, sideOffset: 0.02, cameraOffset: 0.08,
    clearance: 0.18, rotationX: -1.12, rotationY: 0.12, rotationZ: 0.16,
    reachX: 1.82, reachY: 0.38, reachZ: 0.72, reachArc: 0.16,
    carryBob: 0.006, carryRoll: 0.006,
  }),
  "sushi-knife": Object.freeze({
    poseId: "bottle-wrap", scale: 0.8, sideOffset: 0.02, cameraOffset: 0.06,
    clearance: 0.18, rotationX: -0.58, rotationY: 0.22, rotationZ: 0.5,
    reachX: 1.65, reachY: 0.36, reachZ: 0.65, reachArc: 0.12,
    carryBob: 0.006, carryRoll: 0.008,
  }),
  "fish-tweezers": Object.freeze({
    poseId: "precision-pinch", scale: 0.74, sideOffset: 0, cameraOffset: 0.04,
    clearance: 0.16, rotationX: -0.82, rotationY: 0.18, rotationZ: 0.32,
    reachX: 1.55, reachY: 0.34, reachZ: 0.58, reachArc: 0.1,
    carryBob: 0.005, carryRoll: 0.01,
  }),
  "sushi-grip": Object.freeze({
    poseId: "cradle", scale: 0.86, sideOffset: 0.04, cameraOffset: 0.08,
    clearance: 0.2, rotationX: -1.08, rotationY: 0.1, rotationZ: 0.22,
    reachX: 1.66, reachY: 0.4, reachZ: 0.68, reachArc: 0.16,
    carryBob: 0.008, carryRoll: 0.008,
  }),
  default: Object.freeze({
    poseId: "clamp", scale: 1, sideOffset: 0.04, cameraOffset: 0.12,
    clearance: 0.28, rotationX: -1.16, rotationY: 0.1, rotationZ: 0,
    reachX: 2.05, reachY: 0.5, reachZ: 1, reachArc: 0.2,
    carryBob: 0.02, carryRoll: 0.02,
  }),
});

const SAUCE_PROFILE = Object.freeze({
  poseId: "bottle-wrap", scale: 0.98, sideOffset: 0.05, cameraOffset: 0.12,
  clearance: 0.28, rotationX: -0.18, rotationY: 0.38, rotationZ: 0.54,
  reachX: 2.1, reachY: 0.54, reachZ: 0.86, reachArc: 0.2,
  carryBob: 0.012, carryRoll: 0.012,
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

function poseFor(profile) {
  return GRIP_POSES[profile?.poseId] ?? GRIP_POSES.clamp;
}

function lerpAngle(from, to, amount) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
}

function proceduralMaterial(THREE, color, roughness = 0.8) {
  const Material = THREE.MeshToonMaterial ?? THREE.MeshStandardMaterial;
  const material = new Material({
    color,
    ...(Material === THREE.MeshStandardMaterial ? { roughness, metalness: 0.02 } : {}),
  });
  material.name = "procedural-hand-material";
  material.userData = { procedural: true, textureFree: true };
  // The hand is the actor, not a label behind the prop. Keep depth testing so
  // fingers can still wrap around the food, but bias the glove slightly toward
  // the camera to prevent coplanar ingredients from erasing the grip contact.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1.5;
  material.polygonOffsetUnits = -1.5;
  return material;
}

function meshPart(THREE, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.procedural = true;
  mesh.userData.cookingHandForeground = true;
  mesh.renderOrder = 60;
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
  return { root, tipJoint, baseX: x };
}

function createHand(THREE, side, materials, geometries) {
  const sign = side === "left" ? -1 : 1;
  // First-person anatomy: both thumbs point toward the centre of the board.
  // The left hand lives on the left, but its thumb is on the screen-right side.
  const thumbSign = -sign;
  const root = new THREE.Group();
  root.name = `procedural-${side}-glove`;
  root.visible = false;
  root.userData = { procedural: true, textureFree: true, side };

  const wrist = meshPart(
    THREE,
    new THREE.CapsuleGeometry(0.17, 0.14, 4, 10),
    materials.glove,
    `${side}-glove-wrist`,
  );
  wrist.position.y = -0.28;
  const sleeve = meshPart(
    THREE,
    new THREE.CylinderGeometry(0.3, 0.46, 0.72, 14),
    materials.sleeve,
    `${side}-chef-sleeve`,
  );
  sleeve.position.y = -0.82;
  const sleeveHem = meshPart(
    THREE,
    new THREE.TorusGeometry(0.43, 0.035, 5, 16),
    materials.cuff,
    `${side}-sleeve-hem`,
  );
  sleeveHem.rotation.x = Math.PI / 2;
  sleeveHem.position.y = -1.17;
  const cuff = meshPart(
    THREE,
    new THREE.CylinderGeometry(0.32, 0.38, 0.32, 12),
    materials.cuff,
    `${side}-red-cuff`,
  );
  cuff.position.y = -0.43;
  const cuffBand = meshPart(
    THREE,
    new THREE.TorusGeometry(0.34, 0.045, 5, 14),
    materials.outline,
    `${side}-cuff-band`,
  );
  cuffBand.rotation.x = Math.PI / 2;
  cuffBand.position.y = -0.26;
  const palm = meshPart(
    THREE,
    new THREE.SphereGeometry(0.45, 16, 11),
    materials.glove,
    `${side}-palm`,
  );
  palm.scale.set(0.88, 1.04, 0.48);
  palm.position.y = 0.12;

  const fingers = [];
  // Index -> middle -> ring -> little finger, mirrored as an anatomical pair.
  const specs = [
    [-0.27 * sign, 0.62, 0.115],
    [-0.09 * sign, 0.7, 0.12],
    [0.09 * sign, 0.67, 0.115],
    [0.27 * sign, 0.56, 0.105],
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
  thumbRoot.position.set(thumbSign * 0.38, 0.03, 0.02);
  thumbRoot.rotation.z = thumbSign * -0.74;
  const thumb = meshPart(
    THREE,
    new THREE.CapsuleGeometry(0.13, 0.34, 4, 8),
    materials.glove,
    `${side}-thumb`,
  );
  thumb.position.y = 0.23;
  thumbRoot.add(thumb);
  root.add(sleeve, sleeveHem, wrist, cuff, cuffBand, palm, thumbRoot);
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
    thumbSign,
    gestureId: null,
    mode: "idle",
    ingredientId: null,
    targetObject: null,
    target: new THREE.Vector3(),
    targetRotation: new THREE.Euler(),
    reachStartRotation: new THREE.Euler(),
    reachStart: new THREE.Vector3(),
    reachStartedAt: 0,
    gripStartedAt: 0,
    releaseStartedAt: 0,
    releaseDuration: 520,
    activeProfile: INGREDIENT_PROFILES.default,
    poseId: INGREDIENT_PROFILES.default.poseId,
    objectTopY: 0,
    gripAmount: 0,
    squeezeAmount: 0,
    carryStartedAt: 0,
  };
}

function setGrip(hand, amount, squeeze = 0, profile = hand.activeProfile) {
  const grip = clamp01(amount);
  const pressure = clamp01(squeeze);
  const pose = poseFor(profile);
  hand.gripAmount = grip;
  hand.squeezeAmount = pressure;
  for (let index = 0; index < hand.fingers.length; index += 1) {
    const finger = hand.fingers[index];
    const semanticIndex = index;
    const curl = pose.fingerCurl[semanticIndex];
    const tipCurl = pose.tipCurl[semanticIndex];
    finger.root.position.x = finger.baseX;
    finger.root.rotation.x = -(0.08 + grip * curl + pressure * 0.14);
    finger.root.rotation.z = hand.sign * pose.fan[semanticIndex] * (0.3 + grip * 0.7);
    finger.tipJoint.rotation.x = -(0.06 + grip * tipCurl + pressure * 0.2);
  }
  hand.thumbRoot.rotation.x = -(0.1 + grip * pose.thumbCurl + pressure * 0.2);
  hand.thumbRoot.rotation.z = hand.thumbSign * (-0.72 + grip * pose.thumbOpposition);
}

function applyGripTransform(hand, anchor, ingredientId, {
  sauce = false,
  scaleMultiplier = 1,
  sideBias = 0,
  angleBias = 0,
} = {}) {
  const profile = sauce ? SAUCE_PROFILE : profileFor(ingredientId);
  hand.activeProfile = profile;
  hand.poseId = profile.poseId;
  hand.objectTopY = anchor.topY;
  hand.target.set(
    anchor.x + hand.sign * (profile.sideOffset + sideBias),
    anchor.topY + profile.clearance,
    anchor.z + profile.cameraOffset,
  );
  hand.root.position.copy(hand.target);
  hand.targetRotation.set(
    profile.rotationX,
    hand.sign * profile.rotationY,
    hand.sign * (profile.rotationZ + angleBias),
  );
  hand.root.rotation.copy(hand.targetRotation);
  hand.root.scale.setScalar(profile.scale * scaleMultiplier);
}

function sideFromDetail(detail, anchor = null) {
  if (detail?.side === "left" || detail?.side === "right") return detail.side;
  const slotId = String(detail?.slotId ?? "");
  if (slotId.startsWith("bread-left")) return "left";
  if (slotId.startsWith("sauce-right")) return "right";
  if (Number.isFinite(anchor?.x) && Math.abs(anchor.x) > 0.08) {
    return anchor.x < 0 ? "left" : "right";
  }
  return sideForSlot(detail?.slotId, detail?.layerId);
}

export function createCookingFirstPersonHands(THREE, {
  parent,
  reducedMotion = false,
  handScale = 1,
  handSideBias = 0,
  handAngleBias = 0,
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
    sleeve: proceduralMaterial(THREE, 0xfff8e8),
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
  const scaleMultiplier = Math.max(0.6, Math.min(1.25, Number(handScale) || 1));
  const sideBias = Math.max(0, Math.min(0.55, Number(handSideBias) || 0));
  const angleBias = Math.max(0, Math.min(0.6, Number(handAngleBias) || 0));
  let activeIngredientSide = null;
  let activeToolSide = null;
  let lastTime = 0;
  const anchorBoundsScratch = new THREE.Box3();

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
  const worldAnchorFor = (detail, object = null) => {
    const direct = finitePoint(detail?.worldPosition);
    if (!direct && !object?.getWorldPosition) return null;
    const center = direct
      ? new THREE.Vector3(direct.x, direct.y, direct.z)
      : object.getWorldPosition(new THREE.Vector3());
    let topY = center.y + 0.12;
    if (object?.isObject3D) {
      object.updateWorldMatrix?.(true, true);
      const bounds = anchorBoundsScratch.setFromObject(object);
      if (Number.isFinite(bounds.max.y)) topY = Math.max(topY, bounds.max.y);
    }
    return Object.freeze({ x: center.x, y: center.y, z: center.z, topY });
  };

  const handleIngredientGesture = (detail = {}, context = {}) => {
    if (disposed) return null;
    const object = context.object ?? null;
    const anchor = worldAnchorFor(detail, object);
    const side = detail.phase === "reach"
      ? sideFromDetail(detail, anchor)
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
    const liveAnchor = anchor ?? worldAnchorFor(detail, hand.targetObject);
    if (liveAnchor) applyGripTransform(hand, liveAnchor, hand.ingredientId, {
      scaleMultiplier,
      sideBias,
      angleBias,
    });
    if (detail.phase === "reach") {
      hand.reachStartedAt = lastTime;
      hand.reachStartRotation.set(
        hand.targetRotation.x + 0.24,
        hand.targetRotation.y - hand.sign * 0.18,
        hand.targetRotation.z - hand.sign * 0.22,
      );
      hand.reachStart.copy(hand.target).add({
        x: hand.sign * hand.activeProfile.reachX,
        y: hand.activeProfile.reachY,
        z: hand.activeProfile.reachZ,
      });
      hand.root.position.copy(hand.reachStart);
      hand.root.rotation.copy(hand.reachStartRotation);
      setGrip(hand, 0, 0, hand.activeProfile);
    } else if (detail.phase === "grip") {
      hand.mode = "grip";
      hand.gripStartedAt = lastTime;
      hand.targetObject = context.object ?? hand.targetObject;
      setGrip(hand, 0, 0, hand.activeProfile);
    } else if (detail.phase === "carry" || detail.phase === "move") {
      hand.mode = "hold";
      hand.carryStartedAt = lastTime;
      hand.targetObject = context.object ?? hand.targetObject;
      setGrip(hand, 1, 0, hand.activeProfile);
    } else if (detail.phase === "end") {
      hand.mode = "withdraw";
      hand.releaseStartedAt = lastTime;
      // Pointer-up is the real release point. Freeze the hand at that pose,
      // open the fingers, and sever the object reference before the ingredient
      // starts its independent gravity fall. The hand must never ride the food
      // down to the stack.
      hand.targetObject = null;
      setGrip(
        hand,
        detail.reason === "pointer-up" ? 0.72 : 0.45,
        0,
        hand.activeProfile,
      );
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
    const anchor = worldAnchorFor(detail, context.object ?? hand.targetObject);
    if (anchor) applyGripTransform(hand, anchor, null, {
      sauce: true,
      scaleMultiplier,
      sideBias,
      angleBias,
    });
    if (detail.phase === "start" || detail.phase === "move") {
      hand.mode = "sauce-hold";
      hand.targetObject = context.object ?? hand.targetObject;
      setGrip(hand, 0.92, detail.squeezing ? 1 : 0, hand.activeProfile);
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
        const eased = easeOutCubic(progress);
        hand.root.position.lerpVectors(hand.reachStart, hand.target, eased);
        hand.root.position.y += Math.sin(progress * Math.PI) * hand.activeProfile.reachArc;
        hand.root.rotation.set(
          lerpAngle(hand.reachStartRotation.x, hand.targetRotation.x, eased),
          lerpAngle(hand.reachStartRotation.y, hand.targetRotation.y, eased),
          lerpAngle(hand.reachStartRotation.z, hand.targetRotation.z, eased),
        );
        setGrip(hand, progress * 0.12, 0, hand.activeProfile);
        continue;
      }
      if (hand.mode === "grip") {
        const duration = reducedMotion ? 1 : 65;
        const progress = clamp01((lastTime - hand.gripStartedAt) / duration);
        hand.root.position.copy(hand.target);
        hand.root.rotation.copy(hand.targetRotation);
        setGrip(hand, easeOutCubic(progress), 0, hand.activeProfile);
        if (progress >= 1) hand.mode = "hold";
        continue;
      }
      if (hand.mode.includes("hold")) {
        const elapsed = Math.max(0, lastTime - hand.carryStartedAt);
        hand.root.position.copy(hand.target);
        hand.root.position.y += Math.sin(elapsed * 0.014) * hand.activeProfile.carryBob;
        hand.root.rotation.copy(hand.targetRotation);
        hand.root.rotation.z += hand.sign
          * Math.sin(elapsed * 0.011) * hand.activeProfile.carryRoll;
        setGrip(hand, hand.gripAmount || 1, hand.squeezeAmount, hand.activeProfile);
        continue;
      }
      const elapsed = Math.max(0, lastTime - hand.releaseStartedAt);
      const duration = reducedMotion ? 1 : 220;
      const progress = clamp01(elapsed / duration);
      hand.root.position.x += hand.sign * 0.035 * easeOutCubic(progress);
      hand.root.position.y += 0.025 + progress * 0.018;
      hand.root.rotation.z += hand.sign * 0.015;
      hand.root.scale.multiplyScalar(1 - progress * 0.012);
      setGrip(hand, 0.4 * (1 - progress), 0, hand.activeProfile);
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
    createDebugToolPose({
      phase = "start",
      position = { x: 3.85, y: 1.1, z: 0 },
      squeezing = false,
    } = {}) {
      if (disposed) return null;
      const detail = {
        phase,
        gestureId: "debug-right-sauce",
        bottleId: "debug-sauce-bottle",
        worldPosition: position,
        squeezing,
        pressure: squeezing ? 0.8 : 0,
      };
      if (phase === "start") {
        activeToolSide = "right";
        hands.right.gestureId = detail.gestureId;
      }
      return handleToolGesture(detail, {});
    },
    getDebugState() {
      return Object.freeze(Object.fromEntries(Object.entries(hands).map(([side, hand]) => [
        side,
        Object.freeze({
          visible: hand.root.visible,
          mode: hand.mode,
          gestureId: hand.gestureId,
          ingredientId: hand.ingredientId,
          side: hand.side,
          poseId: hand.poseId,
          objectTopY: hand.objectTopY,
          handBottomY: hand.root.position.y - 0.18 * hand.root.scale.x,
          isAboveObject: hand.root.position.y - 0.18 * hand.root.scale.x > hand.objectTopY,
          gripAmount: hand.gripAmount,
          squeezeAmount: hand.squeezeAmount,
          fingerCurls: Object.freeze(hand.fingers.map((finger) => Object.freeze({
            root: finger.root.rotation.x,
            tip: finger.tipJoint.rotation.x,
          }))),
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
