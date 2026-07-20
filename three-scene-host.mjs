import * as THREE from "./vendor/three.module.min.js";

const MAX_PIXEL_RATIO = 2;
const REQUIRED_RENDERER_METHODS = Object.freeze([
  "setAnimationLoop",
  "setPixelRatio",
  "setSize",
  "render",
  "dispose",
]);

function defaultViewport(canvas) {
  const bounds = canvas.getBoundingClientRect?.();
  return {
    width: bounds?.width ?? canvas.clientWidth ?? canvas.width,
    height: bounds?.height ?? canvas.clientHeight ?? canvas.height,
    pixelRatio: globalThis.devicePixelRatio ?? 1,
  };
}

function positiveDimension(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function pixelRatio(value) {
  return Math.min(MAX_PIXEL_RATIO, Math.max(1, Number.isFinite(value) ? value : 1));
}

function disposeSceneResources(scene) {
  const geometries = new Set();
  const materials = new Set();

  scene.traverse((object) => {
    if (object.geometry?.dispose) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (material?.dispose) materials.add(material);
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function createThreeSceneHost({
  canvas,
  rendererFactory = (options) => new THREE.WebGLRenderer(options),
  viewport = defaultViewport,
} = {}) {
  if (!canvas?.addEventListener || !canvas?.removeEventListener) {
    throw new TypeError("A canvas event target is required");
  }
  if (typeof rendererFactory !== "function") {
    throw new TypeError("rendererFactory must be a function");
  }
  if (typeof viewport !== "function") {
    throw new TypeError("viewport must be a function");
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  camera.position.set(0, 4.8, 7.2);
  camera.lookAt(0, 0.5, 0);

  const ambient = new THREE.HemisphereLight(0xfff1d6, 0x34253f, 2.2);
  const key = new THREE.DirectionalLight(0xffd2a6, 3.2);
  key.position.set(4, 7, 5);
  scene.add(ambient, key);

  const renderer = rendererFactory({ canvas, alpha: true, antialias: true });
  if (!renderer || REQUIRED_RENDERER_METHODS.some((method) => typeof renderer[method] !== "function")) {
    throw new TypeError("rendererFactory must return a compatible WebGL renderer");
  }

  const frameCallbacks = new Set();
  const contextErrorCallbacks = new Set();
  const visibilityTarget = globalThis.document;
  let started = false;
  let disposed = false;
  let requestedVisible = true;
  let documentVisible = !visibilityTarget?.hidden;
  let contextLost = false;
  let loopActive = false;

  const renderFrame = (time) => {
    if (disposed || !loopActive) return;
    for (const callback of frameCallbacks) callback(time);
    if (disposed || !loopActive) return;
    renderer.render(scene, camera);
  };

  const syncAnimationLoop = () => {
    const shouldRun = started && requestedVisible && documentVisible && !contextLost && !disposed;
    if (shouldRun === loopActive) return;
    loopActive = shouldRun;
    renderer.setAnimationLoop(shouldRun ? renderFrame : null);
  };

  const resize = () => {
    if (disposed) return;
    const dimensions = viewport(canvas) ?? {};
    const width = positiveDimension(dimensions.width);
    const height = positiveDimension(dimensions.height);
    renderer.setPixelRatio(pixelRatio(dimensions.pixelRatio));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const handleVisibilityChange = () => {
    documentVisible = !visibilityTarget.hidden;
    syncAnimationLoop();
  };

  const handleContextLost = (event) => {
    event?.preventDefault?.();
    if (disposed || contextLost) return;
    contextLost = true;
    syncAnimationLoop();
    const error = new Error("WebGL context lost");
    for (const callback of contextErrorCallbacks) callback(error);
  };

  const handleContextRestored = () => {
    if (disposed || !contextLost) return;
    contextLost = false;
    resize();
    syncAnimationLoop();
  };

  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  visibilityTarget?.addEventListener?.("visibilitychange", handleVisibilityChange);
  resize();

  return {
    scene,
    camera,
    renderer,
    start() {
      if (disposed || started) return;
      started = true;
      syncAnimationLoop();
    },
    resize,
    setVisible(visible) {
      if (disposed) return;
      requestedVisible = Boolean(visible);
      syncAnimationLoop();
    },
    onFrame(callback) {
      if (typeof callback !== "function") throw new TypeError("frame callback must be a function");
      if (disposed) return () => {};
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
    onContextError(callback) {
      if (typeof callback !== "function") throw new TypeError("context error callback must be a function");
      if (disposed) return () => {};
      contextErrorCallbacks.add(callback);
      return () => contextErrorCallbacks.delete(callback);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (loopActive) {
        loopActive = false;
        renderer.setAnimationLoop(null);
      }
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      visibilityTarget?.removeEventListener?.("visibilitychange", handleVisibilityChange);
      frameCallbacks.clear();
      contextErrorCallbacks.clear();
      disposeSceneResources(scene);
      renderer.dispose();
    },
  };
}
