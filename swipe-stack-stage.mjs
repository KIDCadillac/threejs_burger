import * as THREE from "./vendor/three.module.min.js";
import { createBurgerModel3D } from "./burger-model-3d.mjs?v=20260823-swipe38";
import { createThreeSceneHost } from "./three-scene-host.mjs?v=20260823-swipe38";

const INGREDIENT_COLORS = Object.freeze({
  "bottom-bun": 0xf0a13b,
  patty: 0x74351f,
  cheese: 0xf6c946,
  tomato: 0xd94b37,
  lettuce: 0x66a845,
  pickle: 0x8dbb42,
  onion: 0xf4e6de,
  "top-bun": 0xf2a43d,
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function easeInCubic(value) {
  return value ** 3;
}

function disposeObject(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose?.());
  });
  object?.removeFromParent?.();
}

export function createSwipeStackStage({
  canvas,
  reducedMotion = false,
  onImpact = () => {},
  onSettle = () => {},
  onError = () => {},
} = {}) {
  if (!canvas?.addEventListener) throw new TypeError("A canvas is required");
  const host = createThreeSceneHost({ canvas });
  host.renderer.shadowMap.enabled = true;
  host.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.renderer.toneMappingExposure = 1.08;

  host.scene.background = new THREE.Color(0x160b09);
  host.scene.fog = new THREE.Fog(0x160b09, 8, 20);
  host.camera.fov = 38;
  host.camera.position.set(0, 4.65, 8.3);
  host.camera.lookAt(0, 1.05, 0);
  host.camera.updateProjectionMatrix();

  const stageRoot = new THREE.Group();
  stageRoot.name = "swipe-stack-stage";
  host.scene.add(stageRoot);

  const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d351e,
    roughness: 0.72,
    metalness: 0,
  });
  const table = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.48, 5.4), tableMaterial);
  table.position.set(0, -0.32, 0.28);
  table.receiveShadow = true;
  stageRoot.add(table);

  const matMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe7aa,
    roughness: 0.58,
    metalness: 0,
  });
  const matSideMaterial = new THREE.MeshStandardMaterial({
    color: 0xb85c2c,
    roughness: 0.72,
    metalness: 0,
  });
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.62, 0.22, 64), [matSideMaterial, matMaterial, matMaterial]);
  mat.position.y = 0.02;
  mat.receiveShadow = true;
  stageRoot.add(mat);

  const landingHalo = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.34, 64),
    new THREE.MeshBasicMaterial({ color: 0xffc44d, transparent: true, opacity: 0.34, side: THREE.DoubleSide }),
  );
  landingHalo.rotation.x = -Math.PI / 2;
  landingHalo.position.y = 0.145;
  stageRoot.add(landingHalo);

  const burger = createBurgerModel3D(THREE, {
    ingredientIds: [
      "bottom-bun", "patty", "cheese", "tomato", "lettuce",
      "pickle", "onion", "middle-bun", "top-bun",
    ],
  });
  burger.root.name = "swipe-stack-burger";
  burger.root.position.y = 0.15;
  burger.root.scale.setScalar(1.08);
  stageRoot.add(burger.root);
  for (const id of burger.getLayerOrder()) burger.getLayer(id).visible = false;

  const landed = [];
  const particles = [];
  const cameraLookAt = new THREE.Vector3(0, 1.05, 0);
  let topSurfaceY = 0;
  let activeLaunch = null;
  let stackPulse = null;
  let serviceAnimation = null;
  let disposed = false;

  const spawnImpactBurst = (ingredientId, worldY, strength) => {
    const color = INGREDIENT_COLORS[ingredientId] ?? 0xffc44d;
    const geometry = new THREE.SphereGeometry(0.055, 8, 6);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
    const count = reducedMotion ? 4 : 9;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + strength * 0.3;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.cos(angle) * 0.42, worldY + 0.14, Math.sin(angle) * 0.42);
      stageRoot.add(mesh);
      particles.push({
        mesh,
        bornAt: performance.now(),
        velocity: new THREE.Vector3(
          Math.cos(angle) * (0.75 + strength * 0.35),
          1.25 + (index % 3) * 0.22,
          Math.sin(angle) * (0.75 + strength * 0.35),
        ),
        geometry,
        material,
      });
    }
  };

  const clearParticles = () => {
    const geometries = new Set();
    const materials = new Set();
    while (particles.length) {
      const particle = particles.pop();
      particle.mesh.removeFromParent();
      geometries.add(particle.geometry);
      materials.add(particle.material);
    }
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };

  const recomputeTopSurface = () => {
    topSurfaceY = landed.reduce((height, record) => height + record.height, 0);
    return topSurfaceY;
  };

  const clearLanded = () => {
    while (landed.length) burger.removeLayerInstance(landed.pop().instanceId);
    topSurfaceY = 0;
  };

  const loadVisibleStack = (ingredientIds = []) => {
    clearLanded();
    ingredientIds.forEach((ingredientId, index) => {
      const instanceId = `swipe-stack-layer-${index + 1}`;
      const layer = burger.createLayerInstance(ingredientId, instanceId);
      const minY = layer.userData.stackMinY;
      const maxY = layer.userData.stackMaxY;
      const height = Math.max(0.16, maxY - minY - 0.035);
      layer.position.set(0, topSurfaceY - minY, 0);
      layer.rotation.set(0, 0, 0);
      layer.scale.set(1, 1, 1);
      layer.visible = true;
      landed.push({ instanceId, ingredientId, layer, height });
      topSurfaceY += height;
    });
  };

  const updateCamera = () => {
    const height = Math.max(0, topSurfaceY);
    const desiredY = 4.65 + Math.max(0, height - 3.2) * 0.19;
    const desiredZ = 8.3 + Math.max(0, height - 3.2) * 0.27;
    host.camera.position.y = lerp(host.camera.position.y, desiredY, 0.045);
    host.camera.position.z = lerp(host.camera.position.z, desiredZ, 0.045);
    cameraLookAt.y = lerp(cameraLookAt.y, 1.05 + Math.max(0, height - 2.4) * 0.25, 0.045);
    host.camera.lookAt(cameraLookAt);
  };

  const settleActiveLaunch = (time) => {
    if (!activeLaunch) return;
    const launch = activeLaunch;
    const duration = reducedMotion ? 220 : 690 - launch.power * 80;
    const progress = clamp((time - launch.startedAt) / duration, 0, 1);
    const layer = launch.layer;

    if (progress < 0.6) {
      const phase = progress / 0.6;
      const eased = easeOutCubic(phase);
      layer.position.x = lerp(launch.start.x, launch.target.x, eased);
      layer.position.z = lerp(launch.start.z, launch.target.z, eased);
      layer.position.y = lerp(launch.start.y, launch.peakY, eased);
      layer.rotation.y = lerp(launch.startYaw, launch.targetYaw, eased);
      layer.rotation.z = lerp(launch.startTilt, launch.targetTilt * 0.45, eased);
      layer.scale.setScalar(lerp(0.68, 1, eased));
      return;
    }

    if (progress < 0.82) {
      const phase = (progress - 0.6) / 0.22;
      const eased = easeInCubic(phase);
      layer.position.x = launch.target.x;
      layer.position.z = launch.target.z;
      layer.position.y = lerp(launch.peakY, launch.target.y, eased);
      layer.rotation.y = launch.targetYaw;
      layer.rotation.z = lerp(launch.targetTilt * 0.45, launch.targetTilt, eased);
      return;
    }

    if (!launch.impacted) {
      launch.impacted = true;
      stackPulse = { startedAt: time, strength: 0.7 + launch.power * 0.3 };
      spawnImpactBurst(launch.ingredientId, launch.target.y + burger.root.position.y, launch.power);
      onImpact({ ingredientId: launch.ingredientId, power: launch.power, layerCount: landed.length + 1 });
    }

    const phase = clamp((progress - 0.82) / 0.18, 0, 1);
    const squash = Math.sin(phase * Math.PI);
    layer.position.copy(launch.target);
    layer.position.y -= squash * 0.075 * (0.75 + launch.power * 0.25);
    layer.rotation.set(0, launch.targetYaw, launch.targetTilt * (1 - phase));
    layer.scale.set(1 + squash * 0.09, 1 - squash * 0.2, 1 + squash * 0.09);

    if (progress < 1) return;
    layer.position.copy(launch.target);
    layer.rotation.set(0, launch.targetYaw, 0);
    layer.scale.set(1, 1, 1);
    landed.push({
      instanceId: launch.instanceId,
      ingredientId: launch.ingredientId,
      layer,
      height: launch.height,
    });
    activeLaunch = null;
    onSettle({ ingredientId: launch.ingredientId, layerCount: landed.length });
  };

  const updateStackPulse = (time) => {
    if (!stackPulse) return;
    const progress = clamp((time - stackPulse.startedAt) / 210, 0, 1);
    const amount = Math.sin(progress * Math.PI) * 0.05 * stackPulse.strength;
    landed.forEach(({ layer }) => layer.scale.set(1 + amount * 0.45, 1 - amount, 1 + amount * 0.45));
    landingHalo.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.18);
    landingHalo.material.opacity = 0.34 + Math.sin(progress * Math.PI) * 0.28;
    if (progress < 1) return;
    landed.forEach(({ layer }) => layer.scale.set(1, 1, 1));
    landingHalo.scale.setScalar(1);
    landingHalo.material.opacity = 0.34;
    stackPulse = null;
  };

  const updateParticles = (time) => {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      const age = (time - particle.bornAt) / 1000;
      const delta = 1 / 60;
      particle.velocity.y -= 4.8 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.material.opacity = clamp(1 - age / 0.58, 0, 1);
      particle.mesh.scale.setScalar(clamp(1 - age / 0.7, 0.2, 1));
      if (age < 0.62) continue;
      particle.mesh.removeFromParent();
      particles.splice(index, 1);
      if (!particles.some((entry) => entry.geometry === particle.geometry)) particle.geometry.dispose();
      if (!particles.some((entry) => entry.material === particle.material)) particle.material.dispose();
    }
  };

  const updateServiceAnimation = (time) => {
    if (!serviceAnimation) return;
    const progress = clamp((time - serviceAnimation.startedAt) / serviceAnimation.duration, 0, 1);
    const lift = Math.sin(Math.min(1, progress * 1.25) * Math.PI * 0.5);
    burger.root.position.x = easeInCubic(progress) * 4.8;
    burger.root.position.y = 0.15 + lift * 0.55;
    burger.root.rotation.y = -progress * 0.34;
    burger.root.rotation.z = -progress * 0.08;
    burger.root.scale.setScalar(1.08 * (1 - progress * 0.12));
    if (progress < 1) return;
    const callback = serviceAnimation.onComplete;
    serviceAnimation = null;
    clearLanded();
    burger.root.position.set(0, 0.15, 0);
    burger.root.rotation.set(0, 0, 0);
    burger.root.scale.setScalar(1.08);
    callback?.();
  };

  const unsubscribeFrame = host.onFrame((time) => {
    try {
      settleActiveLaunch(time);
      updateStackPulse(time);
      updateParticles(time);
      updateServiceAnimation(time);
      updateCamera();
    } catch (error) {
      onError(error);
    }
  });

  const api = {
    host,
    launch(ingredientId, { power = 0, lateral = 0 } = {}) {
      if (disposed || activeLaunch || serviceAnimation) return false;
      const instanceId = `swipe-stack-layer-${landed.length + 1}`;
      const layer = burger.createLayerInstance(ingredientId, instanceId);
      const minY = layer.userData.stackMinY;
      const maxY = layer.userData.stackMaxY;
      const height = Math.max(0.16, maxY - minY - 0.035);
      const normalizedPower = clamp(Number(power) || 0, 0, 1);
      const normalizedLateral = clamp(Number(lateral) || 0, -1, 1);
      const target = new THREE.Vector3(normalizedLateral * 0.16, topSurfaceY - minY, 0);
      const start = new THREE.Vector3(normalizedLateral * 0.85, -1.5, 2.7);
      activeLaunch = {
        ingredientId,
        instanceId,
        layer,
        height,
        start,
        target,
        peakY: target.y + 2.25 + normalizedPower * 0.6,
        power: normalizedPower,
        startedAt: performance.now(),
        startYaw: normalizedLateral * -0.75,
        targetYaw: normalizedLateral * 0.1,
        startTilt: normalizedLateral * -0.42,
        targetTilt: normalizedLateral * 0.05,
        impacted: false,
      };
      layer.position.copy(start);
      layer.rotation.set(0, activeLaunch.startYaw, activeLaunch.startTilt);
      layer.scale.setScalar(0.68);
      layer.visible = true;
      topSurfaceY += height;
      return true;
    },
    undo() {
      if (disposed || activeLaunch || serviceAnimation || !landed.length) return false;
      const record = landed.pop();
      burger.removeLayerInstance(record.instanceId);
      recomputeTopSurface();
      return true;
    },
    reset() {
      if (disposed || activeLaunch || serviceAnimation) return false;
      clearLanded();
      stackPulse = null;
      clearParticles();
      return true;
    },
    showStack(ingredientIds = []) {
      if (disposed || activeLaunch || serviceAnimation || !Array.isArray(ingredientIds)) return false;
      loadVisibleStack(ingredientIds);
      return true;
    },
    serve(onComplete = () => {}) {
      if (disposed || activeLaunch || serviceAnimation || !landed.length) return false;
      serviceAnimation = {
        startedAt: performance.now(),
        duration: reducedMotion ? 1 : 620,
        onComplete,
      };
      return true;
    },
    isBusy() {
      return Boolean(activeLaunch || serviceAnimation);
    },
    getDebugState() {
      return Object.freeze({
        layerCount: landed.length,
        activeIngredient: activeLaunch?.ingredientId ?? null,
        impacted: Boolean(activeLaunch?.impacted),
        serving: Boolean(serviceAnimation),
        topSurfaceY,
      });
    },
    resize() {
      host.resize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeFrame();
      clearParticles();
      burger.dispose();
      disposeObject(stageRoot);
      host.dispose();
    },
  };

  const handleResize = () => api.resize();
  window.addEventListener("resize", handleResize);
  const originalDispose = api.dispose.bind(api);
  api.dispose = () => {
    window.removeEventListener("resize", handleResize);
    originalDispose();
  };

  host.start();
  return api;
}
