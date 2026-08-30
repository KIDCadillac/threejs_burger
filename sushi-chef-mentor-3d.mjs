function mentorMaterial(THREE, color, roughness = 0.82) {
  const Material = THREE.MeshToonMaterial ?? THREE.MeshStandardMaterial;
  const material = new Material({
    color,
    ...(Material === THREE.MeshStandardMaterial ? { roughness, metalness: 0 } : {}),
  });
  material.userData = { textureFree: true, character: "sushi-chef-mentor" };
  return material;
}

function part(THREE, geometry, material, name) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
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

export function createSushiChefMentor3D(THREE) {
  if (!THREE?.Group || !THREE?.Mesh) throw new TypeError("A compatible Three.js namespace is required");
  const root = new THREE.Group();
  root.name = "sushi-chef-mentor";
  root.userData.sushiMentor = true;

  const ink = mentorMaterial(THREE, 0x352620, 0.76);
  const skin = mentorMaterial(THREE, 0xe8ae78, 0.84);
  const white = mentorMaterial(THREE, 0xfff3d7, 0.9);
  const coatMaterial = mentorMaterial(THREE, 0xf1e6cc, 0.9);
  const red = mentorMaterial(THREE, 0xb94337, 0.76);

  const torso = part(THREE, new THREE.CapsuleGeometry(0.58, 0.8, 6, 14), coatMaterial, "mentor:torso");
  torso.position.y = 0.55;
  torso.scale.z = 0.64;
  const apron = part(THREE, new THREE.BoxGeometry(0.74, 0.74, 0.12), ink, "mentor:apron");
  apron.position.set(0, 0.47, 0.47);
  const scarf = part(THREE, new THREE.TorusGeometry(0.29, 0.07, 7, 20), red, "mentor:scarf");
  scarf.rotation.x = Math.PI / 2;
  scarf.position.set(0, 0.98, 0.14);

  const head = new THREE.Group();
  head.name = "mentor:head";
  head.position.y = 1.55;
  const face = part(THREE, new THREE.SphereGeometry(0.52, 22, 16), skin, "mentor:face");
  face.scale.set(0.86, 1, 0.82);
  const hair = part(THREE, new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), ink, "mentor:hair");
  hair.rotation.x = 0.1;
  hair.position.y = 0.16;
  const nose = part(THREE, new THREE.SphereGeometry(0.075, 12, 8), skin, "mentor:nose");
  nose.position.set(0, -0.02, 0.47);
  const moustacheLeft = part(THREE, new THREE.CapsuleGeometry(0.055, 0.2, 3, 7), ink, "mentor:moustache-left");
  moustacheLeft.rotation.z = Math.PI / 2 - 0.25;
  moustacheLeft.position.set(-0.12, -0.16, 0.46);
  const moustacheRight = moustacheLeft.clone();
  moustacheRight.name = "mentor:moustache-right";
  moustacheRight.rotation.z = Math.PI / 2 + 0.25;
  moustacheRight.position.x = 0.12;
  const eyes = [];
  const brows = [];
  for (const side of [-1, 1]) {
    const eye = part(THREE, new THREE.SphereGeometry(0.055, 10, 7), ink, `mentor:eye:${side}`);
    eye.position.set(side * 0.18, 0.08, 0.46);
    eyes.push(eye);
    const brow = part(THREE, new THREE.CapsuleGeometry(0.035, 0.2, 3, 7), ink, `mentor:brow:${side}`);
    brow.rotation.z = Math.PI / 2;
    brow.position.set(side * 0.18, 0.24, 0.45);
    brows.push(brow);
  }
  head.add(face, hair, nose, moustacheLeft, moustacheRight, ...eyes, ...brows);

  const hat = new THREE.Group();
  hat.name = "mentor:chef-hat";
  hat.position.y = 2.14;
  const hatBand = part(THREE, new THREE.CylinderGeometry(0.39, 0.43, 0.22, 18), white, "mentor:hat-band");
  for (const x of [-0.22, 0, 0.22]) {
    const puff = part(THREE, new THREE.SphereGeometry(0.29, 16, 11), white, `mentor:hat-puff:${x}`);
    puff.position.set(x, 0.24 + (x === 0 ? 0.08 : 0), 0);
    hat.add(puff);
  }
  hat.add(hatBand);

  const pointingArm = new THREE.Group();
  pointingArm.name = "mentor:pointing-arm";
  pointingArm.position.set(0.48, 0.86, 0.1);
  const sleeve = part(THREE, new THREE.CapsuleGeometry(0.16, 0.56, 4, 10), coatMaterial, "mentor:arm-sleeve");
  sleeve.position.y = -0.32;
  const hand = part(THREE, new THREE.SphereGeometry(0.19, 14, 10), skin, "mentor:pointing-hand");
  hand.scale.set(0.8, 1.15, 0.65);
  hand.position.y = -0.7;
  const finger = part(THREE, new THREE.CapsuleGeometry(0.055, 0.36, 3, 8), skin, "mentor:pointing-finger");
  finger.position.set(0, -0.92, 0.08);
  pointingArm.add(sleeve, hand, finger);
  pointingArm.rotation.z = -0.72;

  root.add(torso, apron, scarf, head, hat, pointingArm);
  root.scale.setScalar(0.78);
  root.position.set(-4.4, 1.03, -1.58);
  root.rotation.y = 0.13;

  let visible = false;
  let tone = "demo";
  let enteredAt = 0;
  let hideAt = Infinity;
  let disposed = false;

  const show = (nextTone = "demo", time = performance.now(), duration = 1800) => {
    visible = true;
    tone = nextTone;
    enteredAt = time;
    hideAt = time + Math.max(600, Number(duration) || 1800);
    root.visible = true;
    return true;
  };

  const hide = () => {
    visible = false;
    hideAt = -Infinity;
  };

  const tick = (time = 0) => {
    if (disposed || !root.visible) return;
    if (time >= hideAt) visible = false;
    // The mentor is parented to the prep station. Keep the entered pose inside
    // the narrow mobile camera instead of leaving half of his face off-screen.
    const targetX = visible ? -1.74 : -4.4;
    root.position.x += (targetX - root.position.x) * 0.16;
    const elapsed = Math.max(0, time - enteredAt);
    const angry = tone === "error" ? 1 : 0;
    brows[0].rotation.z = Math.PI / 2 - angry * 0.45;
    brows[1].rotation.z = Math.PI / 2 + angry * 0.45;
    head.rotation.z = tone === "error" ? Math.sin(elapsed * 0.035) * 0.055 : Math.sin(elapsed * 0.004) * 0.02;
    pointingArm.rotation.z = -0.72 + Math.sin(elapsed * (tone === "error" ? 0.022 : 0.008)) * (tone === "error" ? 0.16 : 0.06);
    root.position.y = 1.03 + Math.sin(elapsed * 0.005) * 0.025;
    if (!visible && root.position.x < -4.32) root.visible = false;
  };

  return Object.freeze({
    root,
    show,
    hide,
    tick,
    getState: () => Object.freeze({ visible, tone }),
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeRoot(root);
    },
  });
}
