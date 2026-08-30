import { SUSHI_FISH_PREP, sushiNextTask } from "./sushi-state.mjs?v=20260831-sushi3";

function textureFreeMaterial(THREE, color, roughness = 0.82, options = {}) {
  const material = options.physical
    ? new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0,
      clearcoat: options.clearcoat ?? 0,
      clearcoatRoughness: options.clearcoatRoughness ?? 0.6,
      transparent: Boolean(options.transparent),
      opacity: options.opacity ?? 1,
    })
    : new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: options.metalness ?? 0,
      transparent: Boolean(options.transparent),
      opacity: options.opacity ?? 1,
    });
  material.userData = { textureFree: true, food: "sushi", prep: "whole-fish" };
  return material;
}

function mesh(THREE, geometry, material, name) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function roundedSlab(THREE, width, depth, height, radius, material, name) {
  const shape = new THREE.Shape();
  const left = -width / 2;
  const right = width / 2;
  const top = depth / 2;
  const bottom = -depth / 2;
  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    curveSegments: 10,
  });
  geometry.center();
  geometry.rotateX(-Math.PI / 2);
  return mesh(THREE, geometry, material, name);
}

function createTray(THREE, color, name, width = 1.1) {
  const root = new THREE.Group();
  root.name = name;
  const base = roundedSlab(
    THREE,
    width,
    0.72,
    0.08,
    0.14,
    textureFreeMaterial(THREE, color, 0.64),
    `${name}:base`,
  );
  const rim = mesh(
    THREE,
    new THREE.TorusGeometry(width * 0.34, 0.035, 6, 30),
    textureFreeMaterial(THREE, 0xf2cf91, 0.7),
    `${name}:rim`,
  );
  rim.rotation.x = Math.PI / 2;
  rim.scale.z = 0.58;
  rim.position.y = 0.08;
  root.add(base, rim);
  return root;
}

function createWholeSalmon(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-prep:whole-salmon";
  const skin = textureFreeMaterial(THREE, 0x527c79, 0.52, {
    physical: true,
    clearcoat: 0.18,
    clearcoatRoughness: 0.62,
  });
  const belly = textureFreeMaterial(THREE, 0xb9cfbd, 0.7);
  const dark = textureFreeMaterial(THREE, 0x243e3a, 0.7);
  const salmon = textureFreeMaterial(THREE, 0xe56c50, 0.48, {
    physical: true,
    clearcoat: 0.14,
  });

  const body = mesh(THREE, new THREE.SphereGeometry(1, 34, 20), skin, "whole-salmon:body");
  body.scale.set(1.52, 0.39, 0.56);
  body.position.set(0.12, 0.48, 0.62);
  const bellyPatch = mesh(THREE, new THREE.SphereGeometry(1, 28, 16), belly, "whole-salmon:belly");
  bellyPatch.scale.set(1.42, 0.29, 0.51);
  bellyPatch.position.set(0.04, 0.43, 0.83);

  const head = new THREE.Group();
  head.name = "whole-salmon:head-collar";
  const headShell = mesh(THREE, new THREE.SphereGeometry(1, 24, 16), skin, "whole-salmon:head");
  headShell.scale.set(0.58, 0.42, 0.52);
  const snout = mesh(THREE, new THREE.ConeGeometry(0.33, 0.48, 20), belly, "whole-salmon:snout");
  snout.rotation.z = Math.PI / 2;
  snout.position.x = -0.42;
  const eyeWhite = mesh(THREE, new THREE.SphereGeometry(0.1, 14, 10), textureFreeMaterial(THREE, 0xfff5cf, 0.76), "whole-salmon:eye-white");
  eyeWhite.scale.set(1, 0.45, 1);
  eyeWhite.position.set(-0.16, 0.36, 0.29);
  const eye = mesh(THREE, new THREE.SphereGeometry(0.055, 12, 8), dark, "whole-salmon:eye");
  eye.scale.set(1, 0.5, 1);
  eye.position.set(-0.18, 0.405, 0.3);
  const gill = mesh(THREE, new THREE.TorusGeometry(0.25, 0.026, 5, 24, Math.PI * 1.35), salmon, "whole-salmon:gill");
  gill.rotation.x = Math.PI / 2;
  gill.rotation.z = -0.45;
  gill.position.set(0.25, 0.2, 0.18);
  head.add(headShell, snout, eyeWhite, eye, gill);
  head.position.set(-1.35, 0.49, 0.62);

  const tail = new THREE.Group();
  tail.name = "whole-salmon:tail";
  for (const z of [-0.23, 0.23]) {
    const fin = mesh(THREE, new THREE.ConeGeometry(0.48, 0.9, 3), skin, `whole-salmon:tail-fin:${z}`);
    fin.rotation.z = -Math.PI / 2;
    fin.rotation.x = z < 0 ? -0.35 : 0.35;
    fin.scale.y = 0.26;
    fin.position.z = z;
    tail.add(fin);
  }
  tail.position.set(1.63, 0.49, 0.62);

  const fins = new THREE.Group();
  fins.name = "whole-salmon:fins";
  for (const [x, z, rotation] of [[-0.55, 0.98, 0.35], [0.65, 0.28, -0.45]]) {
    const fin = mesh(THREE, new THREE.ConeGeometry(0.24, 0.58, 3), dark, `whole-salmon:fin:${x}`);
    fin.rotation.set(Math.PI / 2, 0, rotation);
    fin.scale.y = 0.35;
    fin.position.set(x, 0.45, z);
    fins.add(fin);
  }

  const scaleZones = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  scaleZones.forEach((zone, index) => {
    zone.name = `whole-salmon:scale-zone:${index + 1}`;
    root.add(zone);
  });
  const scaleMaterial = textureFreeMaterial(THREE, 0xd0d7b9, 0.62);
  for (let index = 0; index < 27; index += 1) {
    const zoneIndex = index % 3;
    const row = Math.floor(index / 9);
    const column = index % 9;
    const scale = mesh(THREE, new THREE.RingGeometry(0.055, 0.085, 12), scaleMaterial, `whole-salmon:scale:${index + 1}`);
    scale.rotation.x = -Math.PI / 2;
    scale.position.set(-0.88 + column * 0.23, 0.865 - Math.abs(column - 4) * 0.018, 0.42 + row * 0.18);
    scaleZones[zoneIndex].add(scale);
  }
  root.add(body, bellyPatch, head, tail, fins);
  return { root, body, bellyPatch, head, tail, fins, scaleZones };
}

function createFishFrame(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-prep:reserved-fish-frame";
  const boneMaterial = textureFreeMaterial(THREE, 0xf2ddac, 0.9);
  const spine = mesh(THREE, new THREE.CylinderGeometry(0.045, 0.06, 2.55, 10), boneMaterial, "fish-frame:spine");
  spine.rotation.z = Math.PI / 2;
  spine.position.y = 0.18;
  root.add(spine);
  for (let index = 0; index < 8; index += 1) {
    const rib = mesh(THREE, new THREE.CylinderGeometry(0.018, 0.028, 0.7, 7), boneMaterial, `fish-frame:rib:${index + 1}`);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = (index % 2 ? -1 : 1) * 0.12;
    rib.position.set(-0.88 + index * 0.25, 0.16, 0.08);
    root.add(rib);
  }
  return root;
}

function createFillet(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-prep:salmon-fillet";
  const flesh = roundedSlab(
    THREE,
    2.62,
    0.9,
    0.2,
    0.22,
    textureFreeMaterial(THREE, 0xef7255, 0.46, { physical: true, clearcoat: 0.2 }),
    "salmon-fillet:flesh",
  );
  const skin = roundedSlab(
    THREE,
    2.6,
    0.87,
    0.06,
    0.2,
    textureFreeMaterial(THREE, 0x355b58, 0.58),
    "salmon-fillet:skin",
  );
  skin.position.y = -0.13;
  const stripeMaterial = textureFreeMaterial(THREE, 0xffcfaa, 0.64);
  for (let index = 0; index < 7; index += 1) {
    const stripe = mesh(THREE, new THREE.BoxGeometry(0.035, 0.025, 0.72), stripeMaterial, `salmon-fillet:fat-line:${index + 1}`);
    stripe.position.set(-1.02 + index * 0.34, 0.13, 0);
    stripe.rotation.y = 0.12 * (index % 2 ? 1 : -1);
    root.add(stripe);
  }
  const pins = [];
  for (let index = 0; index < SUSHI_FISH_PREP.pinBonesRequired; index += 1) {
    const pin = mesh(THREE, new THREE.CapsuleGeometry(0.025, 0.26, 3, 6), textureFreeMaterial(THREE, 0xffefd1, 0.9), `salmon-fillet:pin-bone:${index + 1}`);
    pin.rotation.z = 0.7;
    pin.position.set(-0.55 + index * 0.55, 0.24, 0.08);
    pins.push(pin);
    root.add(pin);
  }
  root.add(skin, flesh);
  return { root, flesh, skin, pins };
}

function createKnife(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-tool:deba-knife";
  const bladeMaterial = textureFreeMaterial(THREE, 0xd9e2df, 0.28, { metalness: 0.34 });
  const dark = textureFreeMaterial(THREE, 0x34241f, 0.72);
  const blade = mesh(THREE, new THREE.BoxGeometry(1.28, 0.1, 0.42), bladeMaterial, "deba-knife:blade");
  blade.position.x = -0.62;
  const edge = mesh(THREE, new THREE.BoxGeometry(1.24, 0.025, 0.045), textureFreeMaterial(THREE, 0xffffff, 0.2, { metalness: 0.5 }), "deba-knife:edge");
  edge.position.set(-0.62, -0.02, 0.2);
  const handle = mesh(THREE, new THREE.CapsuleGeometry(0.13, 0.64, 4, 10), dark, "deba-knife:handle");
  handle.rotation.z = Math.PI / 2;
  handle.position.x = 0.62;
  root.add(blade, edge, handle);
  root.position.set(2.15, 0.38, 0.52);
  root.rotation.y = -0.18;
  root.userData.sushiToolId = "deba-knife";
  return { root, surface: handle, home: root.position.clone(), homeRotation: root.rotation.clone() };
}

function createTweezers(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-tool:bone-tweezers";
  const steel = textureFreeMaterial(THREE, 0xd5dfdc, 0.3, { metalness: 0.3 });
  let surface = null;
  for (const side of [-1, 1]) {
    const arm = mesh(THREE, new THREE.BoxGeometry(0.12, 0.08, 0.88), steel, `bone-tweezers:arm:${side}`);
    arm.position.x = side * 0.065;
    arm.rotation.y = side * 0.06;
    root.add(arm);
    if (!surface) surface = arm;
  }
  const bridge = mesh(THREE, new THREE.BoxGeometry(0.26, 0.1, 0.12), steel, "bone-tweezers:bridge");
  bridge.position.z = -0.44;
  root.add(bridge);
  root.position.set(2.35, 0.36, 0.82);
  root.rotation.y = -0.35;
  root.userData.sushiToolId = "bone-tweezers";
  return { root, surface, home: root.position.clone(), homeRotation: root.rotation.clone() };
}

function disposeRoot(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => materials.add(material));
  });
  root.removeFromParent();
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

export function createSushiFishPrep3D(THREE) {
  if (!THREE?.Group || !THREE?.Mesh) throw new TypeError("A compatible Three.js namespace is required");
  const root = new THREE.Group();
  root.name = "sushi-station:whole-fish-prep";
  root.userData.sushiStation = "prep";

  const board = roundedSlab(
    THREE,
    4.7,
    2.65,
    0.2,
    0.24,
    textureFreeMaterial(THREE, 0xd4aa6c, 0.68),
    "whole-fish-prep:cutting-board",
  );
  board.position.set(0, 0.16, 0.68);
  const boardUnderlay = roundedSlab(
    THREE,
    4.94,
    2.88,
    0.1,
    0.28,
    textureFreeMaterial(THREE, 0x28211e, 0.78),
    "whole-fish-prep:board-underlay",
  );
  boardUnderlay.position.set(0, 0.05, 0.68);

  const headTray = createTray(THREE, 0x356d61, "byproduct:head-collar", 1.25);
  headTray.position.set(-2.35, 0.26, 1.68);
  const frameTray = createTray(THREE, 0x9b5b38, "byproduct:fish-frame", 1.25);
  frameTray.position.set(0, 0.26, 1.68);
  const skinTray = createTray(THREE, 0xa6483e, "byproduct:salmon-skin", 1.25);
  skinTray.position.set(2.35, 0.26, 1.68);

  const wholeFish = createWholeSalmon(THREE);
  const frame = createFishFrame(THREE);
  frame.position.set(0, 0.48, 0.58);
  frame.visible = false;
  const fillet = createFillet(THREE);
  fillet.root.position.set(0.05, 0.62, 0.62);
  fillet.root.visible = false;
  const preparedSlice = new THREE.Group();
  preparedSlice.name = "sushi-prep:prepared-nigiri-slice";
  for (let index = 0; index < SUSHI_FISH_PREP.sliceCutsRequired; index += 1) {
    const slice = roundedSlab(
      THREE,
      0.82,
      0.42,
      0.12,
      0.13,
      textureFreeMaterial(THREE, 0xf07959, 0.44, { physical: true, clearcoat: 0.22 }),
      `sushi-prep:prepared-nigiri-slice:${index + 1}`,
    );
    slice.position.set((index - 0.5) * 0.38, index * 0.04, index * 0.16);
    slice.rotation.y = (index - 0.5) * 0.12;
    preparedSlice.add(slice);
  }
  preparedSlice.position.set(2.25, 0.44, -0.28);
  preparedSlice.visible = false;

  const knife = createKnife(THREE);
  const tweezers = createTweezers(THREE);
  tweezers.root.visible = false;

  const guideMaterial = textureFreeMaterial(THREE, 0xffd56f, 0.64, { transparent: true, opacity: 0.82 });
  const guides = {
    scale: new THREE.Group(),
    head: mesh(THREE, new THREE.BoxGeometry(0.035, 0.025, 1.12), guideMaterial, "prep-guide:head-collar"),
    fillet: mesh(THREE, new THREE.BoxGeometry(2.5, 0.025, 0.035), guideMaterial, "prep-guide:fillet"),
    skin: mesh(THREE, new THREE.BoxGeometry(2.45, 0.025, 0.035), guideMaterial, "prep-guide:skin"),
    slice: new THREE.Group(),
  };
  for (let index = 0; index < 3; index += 1) {
    const line = mesh(THREE, new THREE.BoxGeometry(2.55, 0.018, 0.025), guideMaterial, `prep-guide:scale:${index + 1}`);
    line.position.set(0.08, 0.91, 0.42 + index * 0.2);
    guides.scale.add(line);
  }
  guides.head.position.set(-0.94, 0.91, 0.62);
  guides.fillet.position.set(0.15, 0.91, 0.62);
  guides.skin.position.set(0.05, 0.9, 0.62);
  for (const x of [-0.38, 0.38]) {
    const line = mesh(THREE, new THREE.BoxGeometry(0.035, 0.025, 0.86), guideMaterial, `prep-guide:slice:${x}`);
    line.position.set(x, 0.88, 0.62);
    guides.slice.add(line);
  }
  Object.values(guides).forEach((guide) => {
    guide.visible = false;
    root.add(guide);
  });

  root.add(
    boardUnderlay,
    board,
    headTray,
    frameTray,
    skinTray,
    wholeFish.root,
    frame,
    fillet.root,
    preparedSlice,
    knife.root,
    tweezers.root,
  );

  let currentState = null;
  const applyState = (state) => {
    currentState = state;
    wholeFish.body.scale.set(1.52, 0.39, 0.56);
    wholeFish.bellyPatch.scale.set(1.42, 0.29, 0.51);
    wholeFish.scaleZones.forEach((zone, index) => {
      zone.visible = index >= state.scaleStrokes && !state.filleted;
    });
    wholeFish.body.visible = !state.filleted;
    wholeFish.bellyPatch.visible = !state.filleted;
    wholeFish.tail.visible = !state.filleted;
    wholeFish.fins.visible = !state.filleted;
    wholeFish.head.position.set(-1.35, 0.49, 0.62);
    wholeFish.head.rotation.set(0, 0, 0);
    wholeFish.head.scale.setScalar(1);
    if (state.headCollarReserved) {
      wholeFish.head.position.set(-2.35, 0.62, 1.68);
      wholeFish.head.rotation.y = -0.28;
      wholeFish.head.scale.setScalar(0.68);
    }
    frame.visible = state.filleted;
    if (state.filleted) frame.position.set(0, 0.52, 1.68);
    fillet.root.visible = state.filleted;
    fillet.root.position.set(0.05, 0.62, 0.62);
    fillet.root.rotation.set(0, 0, 0);
    fillet.pins.forEach((pin, index) => {
      pin.visible = index >= state.pinBonesRemoved;
      pin.position.y = 0.24;
    });
    fillet.skin.position.set(0, -0.13, 0);
    fillet.skin.rotation.set(0, 0, 0);
    if (state.skinReserved) {
      fillet.skin.position.set(2.3, -0.12, 1.05);
      fillet.skin.rotation.y = 0.16;
    }
    preparedSlice.visible = state.sliceCuts > 0;
    preparedSlice.children.forEach((slice, index) => {
      slice.visible = index < state.sliceCuts;
    });
    knife.root.visible = sushiNextTask(state) !== "remove-pinbones";
    tweezers.root.visible = sushiNextTask(state) === "remove-pinbones";
    knife.root.position.copy(knife.home);
    knife.root.rotation.copy(knife.homeRotation);
    tweezers.root.position.copy(tweezers.home);
    tweezers.root.rotation.copy(tweezers.homeRotation);
    Object.values(guides).forEach((guide) => { guide.visible = false; });
    const task = sushiNextTask(state);
    if (task === "scale-fish") guides.scale.visible = true;
    if (task === "reserve-head-collar") guides.head.visible = true;
    if (task === "fillet-fish") guides.fillet.visible = true;
    if (task === "skin-fillet") guides.skin.visible = true;
    if (task === "slice-fillet") guides.slice.visible = true;
  };

  const setActionProgress = (actionId, progress) => {
    const amount = Math.max(0, Math.min(1, Number(progress) || 0));
    if (!currentState) return;
    if (actionId === "reserve-head-collar") {
      wholeFish.head.position.lerpVectors(
        new THREE.Vector3(-1.35, 0.49, 0.62),
        new THREE.Vector3(-2.35, 0.62, 1.68),
        amount,
      );
      wholeFish.head.rotation.y = -0.28 * amount;
      wholeFish.head.scale.setScalar(1 - amount * 0.32);
    } else if (actionId === "fillet-fish") {
      frame.visible = true;
      fillet.root.visible = true;
      fillet.root.position.set(0.05, 0.5 + amount * 0.34, 0.62 - amount * 0.25);
      fillet.root.rotation.z = -amount * 0.08;
      wholeFish.body.scale.y = 0.39 * (1 - amount * 0.58);
    } else if (actionId === "remove-pinbones") {
      const pin = fillet.pins[currentState.pinBonesRemoved];
      if (pin) pin.position.y = 0.24 + amount * 0.5;
    } else if (actionId === "skin-fillet") {
      fillet.skin.position.set(amount * 2.3, -0.13, amount * 1.05);
      fillet.skin.rotation.y = amount * 0.16;
      fillet.root.position.y = 0.62 + Math.sin(amount * Math.PI) * 0.1;
    } else if (actionId === "slice-fillet") {
      const visibleCuts = currentState.sliceCuts + (amount >= 0.72 ? 1 : 0);
      preparedSlice.visible = visibleCuts > 0;
      preparedSlice.children.forEach((slice, index) => {
        slice.visible = index < visibleCuts;
      });
      preparedSlice.position.y = 0.44 + Math.sin(amount * Math.PI) * 0.18;
    }
  };

  return Object.freeze({
    root,
    knife,
    tweezers,
    wholeFish,
    fillet,
    preparedSlice,
    applyState,
    setActionProgress,
    getToolForTask(taskId) {
      return taskId === "remove-pinbones" ? tweezers : knife;
    },
    dispose() {
      disposeRoot(root);
    },
  });
}
