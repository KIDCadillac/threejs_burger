import * as THREE from "./vendor/three.module.min.js";
import { createBurgerModel3D } from "./burger-model-3d.mjs";

const FOOD_IDS = Object.freeze(["burger", "sushi"]);

function clampPixelRatio(value) {
  return Math.max(1, Math.min(2, Number(value) || 1));
}

function createShadow() {
  const material = new THREE.MeshBasicMaterial({
    color: 0x3a2018,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.65, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.72;
  mesh.scale.set(1.15, 0.72, 1);
  return mesh;
}

function createBurgerDisplay() {
  const display = new THREE.Group();
  display.name = "home-food:burger";
  const burger = createBurgerModel3D(THREE);
  burger.root.scale.setScalar(0.9);
  burger.root.position.y = -0.62;
  display.add(createShadow(), burger.root);
  display.userData.disposeFood = () => burger.dispose();
  return display;
}

function createSushiDisplay() {
  const display = new THREE.Group();
  display.name = "home-food:sushi";

  const riceMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff1cd,
    roughness: 0.9,
    metalness: 0,
  });
  const salmonMaterial = new THREE.MeshStandardMaterial({
    color: 0xf06a46,
    roughness: 0.72,
    metalness: 0,
  });
  const salmonStripeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc48f,
    roughness: 0.75,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const plateMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d7776,
    roughness: 0.76,
    metalness: 0.02,
  });

  const rice = new THREE.Mesh(new THREE.CapsuleGeometry(0.63, 1.2, 7, 16), riceMaterial);
  rice.rotation.z = Math.PI / 2;
  rice.scale.set(0.52, 1, 0.75);
  rice.position.y = -0.02;
  rice.castShadow = true;

  const salmon = new THREE.Mesh(new THREE.CapsuleGeometry(0.49, 1.33, 7, 16), salmonMaterial);
  salmon.rotation.z = Math.PI / 2;
  salmon.scale.set(0.2, 1.08, 0.78);
  salmon.position.y = 0.42;
  salmon.castShadow = true;

  const stripeGeometry = new THREE.PlaneGeometry(0.1, 0.72);
  [-0.64, -0.22, 0.22, 0.64].forEach((x) => {
    const stripe = new THREE.Mesh(stripeGeometry, salmonStripeMaterial);
    stripe.position.set(x, 0.525, -0.01);
    stripe.rotation.x = -Math.PI / 2;
    stripe.rotation.y = -0.08;
    display.add(stripe);
  });

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.02, 0.16, 64), plateMaterial);
  plate.position.y = -0.72;
  plate.receiveShadow = true;

  display.add(createShadow(), plate, rice, salmon);
  display.scale.setScalar(1.05);
  display.position.y = -0.06;
  display.userData.disposeFood = () => {
    display.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
  };
  return display;
}

function softenAsGhost(display) {
  display.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = Math.min(0.22, Number(material.opacity) || 1);
      material.depthWrite = false;
    });
  });
  return display;
}

export function createHomeFoodOrbit(canvas, {
  windowTarget = globalThis,
  initialFood = "burger",
} = {}) {
  if (!canvas?.getBoundingClientRect) throw new TypeError("A canvas element is required");

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(0, 2.45, 8.2);
  camera.lookAt(0, 0.42, 0);

  const ambient = new THREE.HemisphereLight(0xfff2cf, 0x503327, 2.45);
  const key = new THREE.DirectionalLight(0xffd49a, 4.1);
  key.position.set(4.8, 7, 4.5);
  key.castShadow = true;
  const fill = new THREE.DirectionalLight(0x8ed5d7, 1.35);
  fill.position.set(-4, 2.5, 3);
  scene.add(ambient, key, fill);

  const displays = {
    burger: createBurgerDisplay(),
    sushi: createSushiDisplay(),
  };
  FOOD_IDS.forEach((id) => scene.add(displays[id]));

  const ghostDisplays = {
    burger: [softenAsGhost(createBurgerDisplay()), softenAsGhost(createBurgerDisplay())],
    sushi: [softenAsGhost(createSushiDisplay()), softenAsGhost(createSushiDisplay())],
  };
  FOOD_IDS.forEach((id) => ghostDisplays[id].forEach((display) => scene.add(display)));

  let activeFood = FOOD_IDS.includes(initialFood) ? initialFood : "burger";
  let transition = null;
  let frameId = 0;
  let disposed = false;
  let lastTime = windowTarget.performance?.now?.() ?? 0;
  let transitionDistance = 4.6;
  let stableScale = 1;

  const placeGhosts = () => {
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z;
    const edgeX = Math.max(2.8, halfHeight * camera.aspect * 0.92);
    transitionDistance = Math.max(3.4, edgeX * 0.76);
    FOOD_IDS.forEach((id) => {
      const visible = id !== activeFood && !transition;
      ghostDisplays[id].forEach((display, index) => {
        display.visible = visible;
        display.position.set(index === 0 ? -edgeX : edgeX, -0.08, 0);
        display.scale.setScalar(id === "burger" ? 0.42 : 0.48);
      });
    });
  };

  const placeStable = () => {
    FOOD_IDS.forEach((id) => {
      const active = id === activeFood;
      displays[id].visible = active;
      displays[id].position.x = active ? 0 : 4.6;
      displays[id].scale.setScalar(stableScale * (active ? 1 : 0.82));
    });
    placeGhosts();
  };

  const resize = () => {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setPixelRatio(clampPixelRatio(windowTarget.devicePixelRatio));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    stableScale = Math.max(0.84, Math.min(1.25, 0.7 + camera.aspect * 0.14));
    if (!transition) placeStable();
    placeGhosts();
  };

  const easeOut = (value) => 1 - ((1 - value) ** 3);
  const render = (time) => {
    if (disposed) return;
    const delta = Math.min(50, Math.max(0, time - lastTime));
    lastTime = time;
    FOOD_IDS.forEach((id) => {
      displays[id].rotation.y += delta * (id === activeFood ? 0.00072 : 0.0004);
      ghostDisplays[id].forEach((display, index) => {
        display.rotation.y += delta * (index === 0 ? 0.00024 : -0.00024);
      });
    });

    if (transition) {
      const raw = Math.min(1, (time - transition.startedAt) / 360);
      const progress = easeOut(raw);
      const outgoing = displays[transition.from];
      const incoming = displays[transition.to];
      outgoing.position.x = -transition.direction * transitionDistance * progress;
      outgoing.rotation.z = transition.direction * -0.08 * progress;
      outgoing.scale.setScalar(stableScale * (1 - progress * 0.18));
      incoming.position.x = transition.direction * transitionDistance * (1 - progress);
      incoming.rotation.z = transition.direction * 0.08 * (1 - progress);
      incoming.scale.setScalar(stableScale * (0.82 + progress * 0.18));
      if (raw >= 1) {
        outgoing.visible = false;
        outgoing.rotation.z = 0;
        incoming.rotation.z = 0;
        transition = null;
        placeStable();
      }
    }

    renderer.render(scene, camera);
    frameId = windowTarget.requestAnimationFrame(render);
  };

  const setFood = (foodId, direction = 1) => {
    if (!FOOD_IDS.includes(foodId) || foodId === activeFood) return false;
    const from = activeFood;
    activeFood = foodId;
    const incoming = displays[foodId];
    FOOD_IDS.forEach((id) => ghostDisplays[id].forEach((display) => { display.visible = false; }));
    incoming.visible = true;
    incoming.position.x = Math.sign(direction || 1) * transitionDistance;
    incoming.scale.setScalar(stableScale * 0.82);
    transition = {
      from,
      to: foodId,
      direction: Math.sign(direction || 1),
      startedAt: windowTarget.performance?.now?.() ?? lastTime,
    };
    return true;
  };

  placeStable();
  resize();
  const resizeObserver = typeof windowTarget.ResizeObserver === "function"
    ? new windowTarget.ResizeObserver(resize)
    : null;
  resizeObserver?.observe(canvas);
  windowTarget.addEventListener?.("resize", resize);
  frameId = windowTarget.requestAnimationFrame(render);

  return Object.freeze({
    setFood,
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      windowTarget.cancelAnimationFrame?.(frameId);
      resizeObserver?.disconnect();
      windowTarget.removeEventListener?.("resize", resize);
      FOOD_IDS.forEach((id) => {
        displays[id].userData.disposeFood?.();
        ghostDisplays[id].forEach((display) => display.userData.disposeFood?.());
      });
      renderer.dispose();
    },
  });
}
