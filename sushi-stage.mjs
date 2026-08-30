import * as THREE from "./vendor/three.module.min.js";
import { createCookingFirstPersonHands } from "./cooking-first-person-hands.mjs?v=20260831-sushi3";
import { createSushiChefMentor3D } from "./sushi-chef-mentor-3d.mjs?v=20260831-sushi3";
import { createSushiFishPrep3D } from "./sushi-fish-prep-3d.mjs?v=20260831-sushi3";
import {
  evaluateSushiFishGesture,
  sushiFishTechnique,
  sushiMentorCue,
} from "./sushi-fish-techniques.mjs?v=20260831-sushi3";
import {
  SUSHI_ASSEMBLY_POSES,
  createSushiIngredient3D,
} from "./sushi-model-3d.mjs?v=20260831-sushi3";
import { sushiNextTask } from "./sushi-state.mjs?v=20260831-sushi3";
import { createThreeSceneHost } from "./three-scene-host.mjs?v=20260831-sushi3";

const STATIONS = Object.freeze(["prep", "assembly"]);
const PREP_X = -3.85;
const ASSEMBLY_X = 3.85;
const STATION_X = Object.freeze({ prep: PREP_X, assembly: ASSEMBLY_X });
const FISH_TASKS = new Set([
  "scale-fish",
  "reserve-head-collar",
  "fillet-fish",
  "remove-pinbones",
  "skin-fillet",
  "slice-fillet",
]);
const PREP_TASKS = new Set([...FISH_TASKS, "portion-rice", "shape-rice"]);
const ASSEMBLY_TASKS = new Set(["place-fish", "grip-sushi", "plate-sushi", "serve"]);

const TASK_HANDS = Object.freeze({
  "scale-fish": Object.freeze({ left: "whole-fish-hold", right: "sushi-knife" }),
  "reserve-head-collar": Object.freeze({ left: "whole-fish-hold", right: "sushi-knife" }),
  "fillet-fish": Object.freeze({ left: "whole-fish-hold", right: "sushi-knife" }),
  "remove-pinbones": Object.freeze({ left: "whole-fish-hold", right: "fish-tweezers" }),
  "skin-fillet": Object.freeze({ left: "whole-fish-hold", right: "sushi-knife" }),
  "slice-fillet": Object.freeze({ left: "whole-fish-hold", right: "sushi-knife" }),
  "portion-rice": Object.freeze({ left: "rice-bed" }),
  "shape-rice": Object.freeze({ left: "sushi-grip", right: "sushi-grip" }),
  "place-fish": Object.freeze({ right: "salmon-slice" }),
  "grip-sushi": Object.freeze({ left: "sushi-grip", right: "sushi-grip" }),
  "plate-sushi": Object.freeze({ right: "sushi-grip" }),
  serve: Object.freeze({ right: "sushi-grip" }),
});

const HAND_SIDE_DETAILS = Object.freeze({
  left: Object.freeze({ side: "left" }),
  right: Object.freeze({ side: "right" }),
});

const NON_FISH_ERRORS = Object.freeze({
  "portion-rice": "左手把一口醋饭完整送到竹帘中央，别把饭丢在案板边。",
  "shape-rice": "掌根轻压，前后短揉两次；只按一下，饭粒还没有抱紧。",
  "place-fish": "右手夹住鱼片，对准饭坯中线再放；鱼肉不能悬在边上。",
  "grip-sushi": "两手从两侧收住，按到寿司回弹后再松开。",
  "plate-sushi": "托住整贯寿司，落在陶盘正中再松手。",
  serve: "寿司还没装盘，铃现在不能响。",
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const clamp01 = (value) => clamp(value, 0, 1);
const lerp = (from, to, amount) => from + (to - from) * amount;
const easeOutCubic = (value) => 1 - (1 - clamp01(value)) ** 3;
const easeInOutCubic = (value) => {
  const amount = clamp01(value);
  return amount < 0.5 ? 4 * amount ** 3 : 1 - ((-2 * amount + 2) ** 3) / 2;
};
const now = () => globalThis.performance?.now?.() ?? Date.now();

function textureFreeMaterial(THREE, color, roughness = 0.82, options = {}) {
  const Material = options.toon && THREE.MeshToonMaterial
    ? THREE.MeshToonMaterial
    : options.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const material = new Material({
    color,
    ...(Material === THREE.MeshStandardMaterial || Material === THREE.MeshPhysicalMaterial
      ? { roughness, metalness: options.metalness ?? 0 }
      : {}),
    ...(Material === THREE.MeshPhysicalMaterial
      ? {
        clearcoat: options.clearcoat ?? 0,
        clearcoatRoughness: options.clearcoatRoughness ?? 0.65,
      }
      : {}),
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
  });
  material.userData = { textureFree: true, food: "sushi", stage: "vertical-slice" };
  return material;
}

function mesh(THREE, geometry, material, name) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function roundedShape(THREE, width, depth, radius) {
  const shape = new THREE.Shape();
  const left = -width / 2;
  const right = width / 2;
  const front = depth / 2;
  const back = -depth / 2;
  shape.moveTo(left + radius, back);
  shape.lineTo(right - radius, back);
  shape.quadraticCurveTo(right, back, right, back + radius);
  shape.lineTo(right, front - radius);
  shape.quadraticCurveTo(right, front, right - radius, front);
  shape.lineTo(left + radius, front);
  shape.quadraticCurveTo(left, front, left, front - radius);
  shape.lineTo(left, back + radius);
  shape.quadraticCurveTo(left, back, left + radius, back);
  return shape;
}

function roundedSlab(THREE, {
  width,
  depth,
  height,
  radius,
  color,
  roughness = 0.76,
  name = "rounded-slab",
}) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(THREE, width, depth, radius), {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: Math.min(0.04, radius * 0.2),
    bevelThickness: 0.025,
    curveSegments: 10,
  });
  geometry.center();
  geometry.rotateX(-Math.PI / 2);
  return mesh(THREE, geometry, textureFreeMaterial(THREE, color, roughness), name);
}

function createPlate(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-assembly:service-plate";
  root.userData.sushiPriorityObject = true;
  const ceramic = textureFreeMaterial(THREE, 0x2c7168, 0.58);
  const cream = textureFreeMaterial(THREE, 0xf5d69a, 0.72);
  const base = mesh(THREE, new THREE.CylinderGeometry(0.92, 1.04, 0.14, 40), ceramic, "service-plate:base");
  const well = mesh(THREE, new THREE.CylinderGeometry(0.72, 0.82, 0.09, 40), cream, "service-plate:well");
  well.position.y = 0.1;
  const rim = mesh(THREE, new THREE.TorusGeometry(0.93, 0.075, 7, 40), cream, "service-plate:rim");
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  root.add(base, well, rim);
  return { root, surface: well };
}

function createServiceBell(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-assembly:service-bell";
  root.userData.sushiPriorityObject = true;
  const dark = textureFreeMaterial(THREE, 0x35251f, 0.76);
  const brass = textureFreeMaterial(THREE, 0xd9a64c, 0.42, {
    physical: true,
    metalness: 0.08,
    clearcoat: 0.14,
  });
  const base = mesh(THREE, new THREE.CylinderGeometry(0.46, 0.55, 0.15, 30), dark, "service-bell:base");
  const dome = mesh(THREE, new THREE.SphereGeometry(0.44, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), brass, "service-bell:dome");
  dome.position.y = 0.1;
  const button = mesh(THREE, new THREE.CylinderGeometry(0.1, 0.13, 0.16, 18), brass, "service-bell:button");
  button.position.y = 0.57;
  root.add(base, dome, button);
  return { root, surface: dome, button };
}

function createRiceTub(THREE) {
  const root = new THREE.Group();
  root.name = "sushi-prep:rice-tub";
  root.userData.sushiPriorityObject = true;
  const wood = textureFreeMaterial(THREE, 0xb9703f, 0.7);
  const band = textureFreeMaterial(THREE, 0x4f3428, 0.78);
  const body = mesh(THREE, new THREE.CylinderGeometry(0.7, 0.78, 0.42, 32), wood, "rice-tub:body");
  const rim = mesh(THREE, new THREE.TorusGeometry(0.7, 0.065, 7, 32), band, "rice-tub:rim");
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.22;
  const rice = mesh(THREE, new THREE.CylinderGeometry(0.61, 0.65, 0.08, 32), textureFreeMaterial(THREE, 0xffefc8, 0.96), "rice-tub:rice");
  rice.position.y = 0.25;
  root.add(body, rim, rice);
  return { root, surface: rice };
}

function createTransferTray(THREE, name) {
  const root = new THREE.Group();
  root.name = name;
  const base = roundedSlab(THREE, {
    width: 2.15,
    depth: 0.86,
    height: 0.1,
    radius: 0.18,
    color: 0x284c47,
    roughness: 0.7,
    name: `${name}:base`,
  });
  const rail = mesh(THREE, new THREE.BoxGeometry(2.08, 0.08, 0.08), textureFreeMaterial(THREE, 0xd8b06a, 0.68), `${name}:rail`);
  rail.position.set(0, 0.09, -0.34);
  root.add(base, rail);
  return root;
}

function createTargetRing(THREE, name, color = 0xf2c85f) {
  const ring = mesh(
    THREE,
    new THREE.RingGeometry(0.57, 0.64, 38),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    name,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 4;
  ring.visible = false;
  return ring;
}

function collectMeshes(root, filter = () => true) {
  const meshes = [];
  root?.traverse?.((object) => {
    if (object.isMesh && filter(object)) meshes.push(object);
  });
  return meshes;
}

function fishIsPrepared(state) {
  return Boolean(
    state
    && state.scaleStrokes >= 3
    && state.headCollarReserved
    && state.filleted
    && state.pinBonesRemoved >= 3
    && state.skinReserved
    && state.sliceCuts >= 2,
  );
}

function taskStation(taskId) {
  if (PREP_TASKS.has(taskId)) return "prep";
  if (ASSEMBLY_TASKS.has(taskId)) return "assembly";
  return null;
}

export function createSushiStage({
  canvas,
  reducedMotion = false,
  onActionComplete = () => {},
  onStationChange = () => {},
  onMentorCue = () => {},
  onImpact = () => {},
  onServeComplete = () => {},
  onError = () => {},
} = {}) {
  if (!canvas?.addEventListener) throw new TypeError("A sushi canvas is required");

  const host = createThreeSceneHost({ canvas });
  host.renderer.shadowMap.enabled = true;
  host.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.renderer.toneMappingExposure = 0.94;
  host.scene.background = new THREE.Color(0x16332f);
  host.scene.fog = new THREE.Fog(0x16332f, 12, 24);

  const stageRoot = new THREE.Group();
  stageRoot.name = "first-person-sushi-vertical-slice";
  stageRoot.userData = { textureFree: true, food: "sushi", stationCount: 2 };
  host.scene.add(stageRoot);

  const wall = mesh(THREE, new THREE.BoxGeometry(18.5, 5.2, 0.34), textureFreeMaterial(THREE, 0x173d37, 0.94), "sushi-shop:continuous-wall");
  wall.position.set(0, 1.68, -2.72);
  const dado = mesh(THREE, new THREE.BoxGeometry(18.2, 1.08, 0.2), textureFreeMaterial(THREE, 0x653a29, 0.84), "sushi-shop:wood-dado");
  dado.position.set(0, 0.43, -2.48);
  const wallRail = mesh(THREE, new THREE.BoxGeometry(18.2, 0.14, 0.24), textureFreeMaterial(THREE, 0xd0a35f, 0.7), "sushi-shop:wall-rail");
  wallRail.position.set(0, 1.05, -2.35);
  const counter = mesh(THREE, new THREE.BoxGeometry(18.5, 0.68, 5.9), textureFreeMaterial(THREE, 0x7e442c, 0.72), "sushi-shop:continuous-counter");
  counter.position.set(0, -0.42, 0.42);
  const counterTop = mesh(THREE, new THREE.BoxGeometry(18.55, 0.12, 5.94), textureFreeMaterial(THREE, 0xa85f38, 0.63), "sushi-shop:counter-top");
  counterTop.position.set(0, -0.03, 0.42);
  const tableEdge = mesh(THREE, new THREE.BoxGeometry(18.55, 0.18, 0.24), textureFreeMaterial(THREE, 0xe1b968, 0.62), "sushi-shop:swipeable-table-edge");
  tableEdge.position.set(0, -0.2, 3.34);
  tableEdge.userData.sushiSwipeSurface = true;
  stageRoot.add(wall, dado, wallRail, counter, counterTop, tableEdge);

  for (const stationId of STATIONS) {
    const centerX = STATION_X[stationId];
    const norenColor = stationId === "prep" ? 0x27685e : 0xa4443b;
    for (let index = 0; index < 3; index += 1) {
      const panel = mesh(THREE, new THREE.BoxGeometry(1.62, 0.88, 0.1), textureFreeMaterial(THREE, norenColor, 0.88), `${stationId}-station:noren:${index + 1}`);
      panel.position.set(centerX - 1.66 + index * 1.66, 3.02, -2.4);
      const emblem = mesh(THREE, new THREE.RingGeometry(0.13, 0.2, 24), textureFreeMaterial(THREE, 0xf4d69b, 0.78), `${stationId}-station:noren-emblem:${index + 1}`);
      emblem.position.set(panel.position.x, 3.04, -2.33);
      stageRoot.add(panel, emblem);
    }
  }
  const divider = mesh(THREE, new THREE.BoxGeometry(0.14, 4.5, 0.18), textureFreeMaterial(THREE, 0xd4ae69, 0.7), "sushi-shop:station-divider");
  divider.position.set(0, 1.33, -2.45);
  stageRoot.add(divider);

  const fill = new THREE.DirectionalLight(0xc6eee0, 1.08);
  fill.position.set(-4, 5, 4);
  const warm = new THREE.PointLight(0xffc98e, 20, 13, 2);
  warm.position.set(0, 5.2, 2.5);
  stageRoot.add(fill, warm);

  const prepRoot = new THREE.Group();
  prepRoot.name = "sushi-station:prep-root";
  prepRoot.position.x = PREP_X;
  stageRoot.add(prepRoot);
  const fishPrep = createSushiFishPrep3D(THREE);
  fishPrep.root.position.z = -0.7;
  prepRoot.add(fishPrep.root);
  const riceTub = createRiceTub(THREE);
  riceTub.root.position.set(-1.66, 0.26, 2.04);
  prepRoot.add(riceTub.root);
  const shapingMat = roundedSlab(THREE, {
    width: 2.15,
    depth: 1.12,
    height: 0.1,
    radius: 0.18,
    color: 0xc69652,
    roughness: 0.76,
    name: "sushi-prep:rice-shaping-mat",
  });
  shapingMat.position.set(0.58, 0.12, 2.02);
  prepRoot.add(shapingMat);
  const prepTransferTray = createTransferTray(THREE, "sushi-prep:transfer-tray");
  prepTransferTray.position.set(2.02, 0.18, 1.54);
  prepRoot.add(prepTransferTray);
  const shapingTarget = createTargetRing(THREE, "sushi-prep:shaping-target", 0xf1c455);
  shapingTarget.position.set(0.58, 0.29, 2.02);
  prepRoot.add(shapingTarget);
  const mentor = createSushiChefMentor3D(THREE);
  prepRoot.add(mentor.root);

  const assemblyRoot = new THREE.Group();
  assemblyRoot.name = "sushi-station:assembly-root";
  assemblyRoot.position.x = ASSEMBLY_X;
  stageRoot.add(assemblyRoot);
  const assemblyUnderlay = roundedSlab(THREE, {
    width: 4.5,
    depth: 2.85,
    height: 0.1,
    radius: 0.28,
    color: 0x30241f,
    roughness: 0.78,
    name: "sushi-assembly:board-underlay",
  });
  assemblyUnderlay.position.set(0, 0.06, 0.76);
  const assemblyBoard = roundedSlab(THREE, {
    width: 4.26,
    depth: 2.6,
    height: 0.2,
    radius: 0.23,
    color: 0xd4aa68,
    roughness: 0.68,
    name: "sushi-assembly:board",
  });
  assemblyBoard.position.set(0, 0.16, 0.76);
  const assemblyTarget = createTargetRing(THREE, "sushi-assembly:nigiri-target", 0x54b795);
  assemblyTarget.position.set(0, 0.3, 0.76);
  assemblyRoot.add(assemblyUnderlay, assemblyBoard, assemblyTarget);
  const assemblyTransferTray = createTransferTray(THREE, "sushi-assembly:transfer-tray");
  assemblyTransferTray.position.set(-1.58, 0.2, 1.84);
  assemblyRoot.add(assemblyTransferTray);
  const plate = createPlate(THREE);
  plate.root.position.set(1.55, 0.22, 0.88);
  assemblyRoot.add(plate.root);
  const plateTarget = createTargetRing(THREE, "sushi-assembly:plate-target", 0xe6b94e);
  plateTarget.position.set(1.55, 0.43, 0.88);
  assemblyRoot.add(plateTarget);
  const bell = createServiceBell(THREE);
  // Keep the physical service bell clear of the plated nigiri on narrow
  // screens; its brass button must remain an obvious final action target.
  bell.root.position.set(2.28, 0.2, -0.58);
  assemblyRoot.add(bell.root);

  const riceModel = createSushiIngredient3D(THREE, "rice-bed");
  const fishModel = createSushiIngredient3D(THREE, "salmon-slice");
  stageRoot.add(riceModel.root, fishModel.root);
  const riceBaseScale = riceModel.root.scale.clone();
  const fishBaseScale = fishModel.root.scale.clone();
  const handRig = createCookingFirstPersonHands(THREE, {
    parent: stageRoot,
    reducedMotion,
    handScale: 0.6,
    handSideBias: 0.5,
    handAngleBias: 0.52,
  });

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pointerWorldScratch = new THREE.Vector3();
  const anchorScratch = new THREE.Vector3();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.78);
  const attempts = new Map();
  const fishMeshes = collectMeshes(fishPrep.wholeFish.root);
  const filletMeshes = collectMeshes(fishPrep.fillet.root);
  const prioritySurfaces = [
    ...fishMeshes,
    ...filletMeshes,
    fishPrep.knife.surface,
    fishPrep.tweezers.surface,
    riceTub.surface,
    riceModel.surface,
    fishModel.surface,
    plate.surface,
    bell.surface,
    bell.button,
  ];

  let currentState = null;
  let station = "prep";
  let cameraX = PREP_X;
  let cameraTransition = null;
  let interaction = null;
  let motion = null;
  let lastTime = 0;
  let disposed = false;
  let errorReported = false;
  let targetPulseAt = 0;

  const reportError = (error) => {
    if (errorReported || disposed) return;
    errorReported = true;
    try { onError(error instanceof Error ? error : new Error(String(error))); } catch { /* last resort */ }
  };

  const frameCamera = () => {
    const bounds = canvas.getBoundingClientRect();
    const aspect = Math.max(0.4, bounds.width / Math.max(1, bounds.height));
    if (aspect < 0.72) {
      host.camera.fov = 50;
      host.camera.position.set(cameraX, 5.18, 8.85);
    } else if (aspect < 1.15) {
      host.camera.fov = 47;
      host.camera.position.set(cameraX, 4.88, 8.15);
    } else {
      host.camera.fov = 42;
      host.camera.position.set(cameraX, 4.45, 7.45);
    }
    host.camera.lookAt(cameraX, 0.58, 0.5);
    host.camera.updateProjectionMatrix();
  };
  frameCamera();

  const pointerRay = (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
    pointerNdc.y = -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, host.camera);
    return bounds;
  };
  const worldFromEvent = (event) => {
    pointerRay(event);
    if (!raycaster.ray.intersectPlane(dragPlane, pointerWorldScratch)) return null;
    return pointerWorldScratch.clone();
  };
  const firstVisibleHit = (event, objects) => {
    pointerRay(event);
    return raycaster.intersectObjects(objects.filter(Boolean), true).find((hit) => {
      let object = hit.object;
      while (object) {
        if (!object.visible) return false;
        object = object.parent;
      }
      return true;
    }) ?? null;
  };
  const worldPoint = (object) => object.getWorldPosition(anchorScratch).clone();
  const handEvent = (side, ingredientId, object, gestureId, phase, reason = null) => {
    const point = worldPoint(object);
    return handRig.handleIngredientGesture({
      ...HAND_SIDE_DETAILS[side],
      phase,
      gestureId,
      ingredientId,
      slotId: side === "left" ? "bread-left-sushi" : "filling-back-4",
      worldPosition: { x: point.x, y: point.y, z: point.z },
      ...(reason ? { reason } : {}),
    }, { object, ingredientId });
  };
  const startHeldHand = (side, ingredientId, object, gestureId) => {
    handEvent(side, ingredientId, object, gestureId, "reach");
    handEvent(side, ingredientId, object, gestureId, "grip");
    handEvent(side, ingredientId, object, gestureId, "carry");
  };
  const startTaskHands = (taskId, gestureId) => {
    const hands = TASK_HANDS[taskId] ?? {};
    const tool = FISH_TASKS.has(taskId) ? fishPrep.getToolForTask(taskId).root : null;
    const fishHoldAnchor = ["remove-pinbones", "skin-fillet", "slice-fillet"].includes(taskId)
      ? fishPrep.fillet.flesh
      : fishPrep.wholeFish.body;
    const leftAnchor = taskId === "portion-rice" || taskId === "shape-rice" || taskId === "grip-sushi"
      ? riceModel.root
      : fishHoldAnchor;
    const rightAnchor = taskId === "place-fish"
      ? fishModel.root
      : taskId === "grip-sushi" || taskId === "plate-sushi"
        ? fishModel.root
        : taskId === "serve" ? bell.root : tool;
    if (hands.left && leftAnchor) startHeldHand("left", hands.left, leftAnchor, `${gestureId}:left`);
    if (hands.right && rightAnchor) startHeldHand("right", hands.right, rightAnchor, `${gestureId}:right`);
  };
  const updateRightTaskHand = (taskId, gestureId) => {
    const profile = TASK_HANDS[taskId]?.right;
    if (!profile) return;
    const object = FISH_TASKS.has(taskId)
      ? fishPrep.getToolForTask(taskId).root
      : taskId === "place-fish" ? fishModel.root
        : taskId === "plate-sushi" || taskId === "grip-sushi" ? fishModel.root
          : taskId === "serve" ? bell.root : null;
    if (object) handEvent("right", profile, object, `${gestureId}:right`, "move");
  };
  const updateLeftTaskHand = (taskId, gestureId) => {
    const profile = TASK_HANDS[taskId]?.left;
    if (!profile) return;
    handEvent("left", profile, riceModel.root, `${gestureId}:left`, "move");
  };
  const hideHands = () => handRig.handleStageChange({ reason: "reset" });

  const fishPath = (taskId) => {
    const pinIndex = currentState?.pinBonesRemoved ?? 0;
    const sliceIndex = currentState?.sliceCuts ?? 0;
    const paths = {
      "scale-fish": [new THREE.Vector3(1.18, 1.02, 0.35), new THREE.Vector3(-1.18, 1.02, 0.35)],
      "reserve-head-collar": [new THREE.Vector3(-0.92, 1.04, 0.12), new THREE.Vector3(-0.92, 0.62, 0.92)],
      "fillet-fish": [new THREE.Vector3(-1.14, 0.98, 0.58), new THREE.Vector3(1.18, 0.91, 0.58)],
      "remove-pinbones": [new THREE.Vector3(-0.55 + pinIndex * 0.55, 0.92, 0.58), new THREE.Vector3(-0.55 + pinIndex * 0.55, 1.48, 0.38)],
      "skin-fillet": [new THREE.Vector3(-1.14, 0.76, 0.6), new THREE.Vector3(1.16, 0.7, 0.6)],
      "slice-fillet": [new THREE.Vector3(-0.38 + sliceIndex * 0.76, 1.02, 0.22), new THREE.Vector3(-0.38 + sliceIndex * 0.76, 0.67, 1.04)],
    };
    return paths[taskId] ?? [new THREE.Vector3(), new THREE.Vector3()];
  };
  const renderFishProgress = (taskId, progress) => {
    const amount = clamp01(progress);
    const tool = fishPrep.getToolForTask(taskId);
    const [from, to] = fishPath(taskId);
    tool.root.position.lerpVectors(from, to, easeInOutCubic(amount));
    tool.root.rotation.copy(tool.homeRotation);
    tool.root.rotation.z += Math.sin(amount * Math.PI) * 0.1;
    tool.root.rotation.y += taskId === "slice-fillet" ? -0.22 : 0;
    fishPrep.setActionProgress(taskId, amount);
  };

  const stationFoodPositions = (targetStation) => targetStation === "assembly"
    ? {
      rice: new THREE.Vector3(ASSEMBLY_X - 1.82, 0.5, 1.86),
      fish: new THREE.Vector3(ASSEMBLY_X - 1.18, 0.5, 1.86),
    }
    : {
      rice: new THREE.Vector3(PREP_X + 1.68, 0.49, 1.53),
      fish: new THREE.Vector3(PREP_X + 2.3, 0.49, 1.53),
    };
  const positionTransferFood = (fromStation = station, toStation = station, amount = 1) => {
    if (!currentState || currentState.fishPlaced || currentState.plated) return;
    const from = stationFoodPositions(fromStation);
    const to = stationFoodPositions(toStation);
    const eased = easeInOutCubic(amount);
    if (currentState.riceShaped) riceModel.root.position.lerpVectors(from.rice, to.rice, eased);
    if (fishIsPrepared(currentState)) fishModel.root.position.lerpVectors(from.fish, to.fish, eased);
  };

  const syncFoodVisuals = () => {
    if (!currentState || interaction || (motion && motion.kind === "action")) return;
    const taskId = sushiNextTask(currentState);
    riceModel.root.visible = currentState.phase !== "serving";
    fishModel.root.visible = fishIsPrepared(currentState) && currentState.phase !== "serving";
    riceModel.root.rotation.set(0, 0, 0);
    fishModel.root.rotation.set(0, 0, 0);
    riceModel.root.scale.copy(riceBaseScale);
    fishModel.root.scale.copy(fishBaseScale);
    if (!currentState.ricePortioned) {
      riceModel.root.position.set(PREP_X - 1.66, 0.58, 2.04);
      riceModel.root.scale.multiplyScalar(0.72);
    } else if (!currentState.riceShaped) {
      riceModel.root.position.set(PREP_X + 0.58, 0.47, 2.02);
      riceModel.root.scale.set(1.12, 0.72, 1.08);
    } else if (!currentState.fishPlaced) {
      positionTransferFood(station, station, 1);
    } else {
      const ricePose = SUSHI_ASSEMBLY_POSES["rice-bed"];
      const fishPose = SUSHI_ASSEMBLY_POSES["salmon-slice"];
      const plateOffset = currentState.plated ? new THREE.Vector3(1.55, 0.08, 0.16) : new THREE.Vector3();
      riceModel.root.position.set(ASSEMBLY_X + ricePose.x + plateOffset.x, ricePose.y + plateOffset.y, ricePose.z + plateOffset.z);
      fishModel.root.position.set(ASSEMBLY_X + fishPose.x + plateOffset.x, fishPose.y + plateOffset.y, fishPose.z + plateOffset.z);
      if (currentState.gripped) {
        riceModel.root.scale.set(1.04, 0.94, 0.96);
        fishModel.root.scale.set(1.02, 0.94, 0.98);
      }
    }
    shapingTarget.visible = taskId === "portion-rice" || taskId === "shape-rice";
    assemblyTarget.visible = taskId === "place-fish" || taskId === "grip-sushi";
    plateTarget.visible = taskId === "plate-sushi";
  };

  const emitMentorError = (taskId, fallback = null) => {
    const attempt = (attempts.get(taskId) ?? 0) + 1;
    attempts.set(taskId, attempt);
    const cue = FISH_TASKS.has(taskId)
      ? sushiMentorCue(taskId, "error", attempt)
      : Object.freeze({
        kind: "error",
        taskId,
        message: fallback ?? NON_FISH_ERRORS[taskId] ?? "先看清工位和动作，再下手。",
        slowReplay: false,
      });
    mentor.show("error", lastTime || now(), cue?.slowReplay ? 2900 : 1800);
    onMentorCue(cue);
    targetPulseAt = lastTime || now();
    return cue;
  };
  const resetTransientVisuals = () => {
    hideHands();
    if (currentState) fishPrep.applyState(currentState);
    bell.root.position.y = 0.2;
    bell.root.rotation.set(0, 0, 0);
    bell.button.position.y = 0.57;
    plate.root.position.set(1.55, 0.22, 0.88);
    syncFoodVisuals();
  };
  const startMotion = ({ kind = "action", taskId, duration, fromProgress = 0, update, complete }) => {
    motion = {
      kind,
      taskId,
      startedAt: lastTime || now(),
      duration: reducedMotion ? 1 : duration,
      fromProgress,
      update,
      complete,
    };
    return true;
  };
  const completeActionAfterMotion = (taskId, impact = null) => {
    attempts.delete(taskId);
    hideHands();
    motion = null;
    if (impact) onImpact({ taskId, ...impact });
    onActionComplete({ taskId });
  };
  const beginFishMotion = (taskId, fromProgress = 0, gestureId = `sushi-${taskId}`) => startMotion({
    taskId,
    duration: 360 + (1 - fromProgress) * 240,
    fromProgress,
    update(progress) {
      renderFishProgress(taskId, lerp(fromProgress, 1, easeInOutCubic(progress)));
      updateRightTaskHand(taskId, gestureId);
    },
    complete() {
      completeActionAfterMotion(taskId, {
        message: sushiFishTechnique(taskId)?.success ?? "刀路完成",
        strength: taskId === "fillet-fish" ? 0.58 : 0.34,
      });
    },
  });
  const beginRicePortionMotion = (start, gestureId = "sushi-portion-rice") => {
    const target = new THREE.Vector3(PREP_X + 0.58, 0.47, 2.02);
    return startMotion({
      taskId: "portion-rice",
      duration: 330,
      update(progress) {
        riceModel.root.position.lerpVectors(start, target, easeOutCubic(progress));
        riceModel.root.position.y += Math.sin(progress * Math.PI) * 0.18;
        updateLeftTaskHand("portion-rice", gestureId);
      },
      complete() {
        completeActionAfterMotion("portion-rice", { message: "醋饭落到竹帘", strength: 0.32 });
      },
    });
  };
  const beginShapeMotion = () => {
    const startScale = riceModel.root.scale.clone();
    return startMotion({
      taskId: "shape-rice",
      duration: 620,
      update(progress) {
        const pulse = Math.sin(progress * Math.PI * 2.5) * (1 - progress) * 0.1;
        const settle = easeOutCubic(progress);
        riceModel.root.scale.set(
          lerp(startScale.x, 1, settle) + pulse,
          lerp(startScale.y, 1, settle) - Math.abs(pulse) * 0.8,
          lerp(startScale.z, 1, settle) - pulse * 0.45,
        );
        riceModel.root.rotation.y = Math.sin(progress * Math.PI * 2) * 0.08 * (1 - progress);
      },
      complete() {
        completeActionAfterMotion("shape-rice", { message: "饭坯收紧回弹", strength: 0.66 });
      },
    });
  };
  const beginPlaceFishMotion = (start, gestureId = "sushi-place-fish") => {
    const pose = SUSHI_ASSEMBLY_POSES["salmon-slice"];
    const target = new THREE.Vector3(ASSEMBLY_X + pose.x, pose.y, pose.z);
    return startMotion({
      taskId: "place-fish",
      duration: 380,
      update(progress) {
        fishModel.root.position.lerpVectors(start, target, easeOutCubic(progress));
        fishModel.root.position.y += Math.sin(progress * Math.PI) * 0.15;
        fishModel.root.rotation.z = Math.sin(progress * Math.PI) * 0.05;
        updateRightTaskHand("place-fish", gestureId);
      },
      complete() {
        completeActionAfterMotion("place-fish", { message: "鱼片贴合饭坯", strength: 0.42 });
      },
    });
  };
  const beginGripMotion = () => {
    const riceStart = riceModel.root.scale.clone();
    const fishStart = fishModel.root.scale.clone();
    return startMotion({
      taskId: "grip-sushi",
      duration: 540,
      update(progress) {
        const compression = Math.sin(progress * Math.PI);
        riceModel.root.scale.set(riceStart.x * (1 + compression * 0.07), riceStart.y * (1 - compression * 0.17), riceStart.z * (1 - compression * 0.08));
        fishModel.root.scale.set(fishStart.x * (1 + compression * 0.045), fishStart.y * (1 - compression * 0.12), fishStart.z * (1 - compression * 0.05));
        riceModel.root.position.y = SUSHI_ASSEMBLY_POSES["rice-bed"].y - compression * 0.045;
        fishModel.root.position.y = SUSHI_ASSEMBLY_POSES["salmon-slice"].y - compression * 0.07;
      },
      complete() {
        completeActionAfterMotion("grip-sushi", { message: "两手定型，寿司回弹", strength: 0.82 });
      },
    });
  };
  const beginPlateMotion = (riceStart, fishStart, gestureId = "sushi-plate-sushi") => {
    const ricePose = SUSHI_ASSEMBLY_POSES["rice-bed"];
    const fishPose = SUSHI_ASSEMBLY_POSES["salmon-slice"];
    const riceTarget = new THREE.Vector3(ASSEMBLY_X + 1.55 + ricePose.x, ricePose.y + 0.08, ricePose.z + 0.16);
    const fishTarget = new THREE.Vector3(ASSEMBLY_X + 1.55 + fishPose.x, fishPose.y + 0.08, fishPose.z + 0.16);
    return startMotion({
      taskId: "plate-sushi",
      duration: 430,
      update(progress) {
        const eased = easeOutCubic(progress);
        const lift = Math.sin(progress * Math.PI) * 0.18;
        riceModel.root.position.lerpVectors(riceStart, riceTarget, eased);
        fishModel.root.position.lerpVectors(fishStart, fishTarget, eased);
        riceModel.root.position.y += lift;
        fishModel.root.position.y += lift;
        updateRightTaskHand("plate-sushi", gestureId);
      },
      complete() {
        completeActionAfterMotion("plate-sushi", { message: "落盘", strength: 0.48 });
      },
    });
  };
  const beginServiceMotion = () => {
    startTaskHands("serve", "sushi-serve");
    const riceStart = riceModel.root.position.clone();
    const fishStart = fishModel.root.position.clone();
    const plateStart = plate.root.position.clone();
    return startMotion({
      kind: "service",
      taskId: "serve",
      duration: 980,
      update(progress) {
        const ring = Math.sin(clamp01(progress / 0.24) * Math.PI);
        bell.button.position.y = 0.57 - ring * 0.12;
        bell.root.rotation.z = Math.sin(progress * Math.PI * 6) * 0.025 * (1 - progress);
        if (progress < 0.25) return;
        const travel = easeInOutCubic((progress - 0.25) / 0.75);
        const travelX = travel * 3.55;
        riceModel.root.position.copy(riceStart).add(new THREE.Vector3(travelX, Math.sin(travel * Math.PI) * 0.18, 0));
        fishModel.root.position.copy(fishStart).add(new THREE.Vector3(travelX, Math.sin(travel * Math.PI) * 0.18, 0));
        plate.root.position.copy(plateStart).add(new THREE.Vector3(travelX, Math.sin(travel * Math.PI) * 0.18, 0));
      },
      complete() {
        hideHands();
        motion = null;
        onServeComplete({ taskId: "serve" });
      },
    });
  };

  const activeTaskSurfaces = (taskId) => {
    if (FISH_TASKS.has(taskId)) {
      if (taskId === "remove-pinbones") return [fishPrep.tweezers.surface, ...fishPrep.fillet.pins.filter((pin) => pin.visible)];
      if (taskId === "skin-fillet") return [fishPrep.knife.surface, fishPrep.fillet.flesh, fishPrep.fillet.skin];
      if (taskId === "slice-fillet") return [fishPrep.knife.surface, fishPrep.fillet.flesh];
      if (taskId === "reserve-head-collar") return [fishPrep.knife.surface, ...collectMeshes(fishPrep.wholeFish.head)];
      return [fishPrep.knife.surface, ...fishMeshes];
    }
    if (taskId === "portion-rice") return [riceTub.surface, riceModel.surface];
    if (taskId === "shape-rice") return [riceModel.surface];
    if (taskId === "place-fish") return [fishModel.surface];
    if (taskId === "grip-sushi" || taskId === "plate-sushi") return [riceModel.surface, fishModel.surface];
    if (taskId === "serve") return [bell.surface, bell.button];
    return [];
  };
  const expectedObjectHit = (event, taskId) => firstVisibleHit(event, activeTaskSurfaces(taskId));
  const anyPriorityHit = (event) => firstVisibleHit(event, prioritySurfaces);

  const beginInteraction = (event) => {
    if (disposed || interaction || motion || cameraTransition) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const taskId = sushiNextTask(currentState);
    const expectedStation = taskStation(taskId);
    const activeHit = expectedObjectHit(event, taskId);
    const priorityHit = activeHit ?? anyPriorityHit(event);
    const gestureId = `sushi-${taskId ?? "idle"}-${Math.round(now())}`;
    const startWorld = worldFromEvent(event);
    const base = {
      pointerId: event.pointerId,
      taskId,
      gestureId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: now(),
      startWorld,
      moved: 0,
      cancelled: false,
    };
    if (priorityHit) {
      if (!taskId || expectedStation !== station || !activeHit) {
        const direction = expectedStation === "assembly" ? "向左横滑桌沿，去右侧握寿司台。" : "向右横滑桌沿，回左侧备料台。";
        emitMentorError(taskId ?? "serve", expectedStation !== station ? direction : null);
        event.preventDefault();
        return;
      }
      interaction = { ...base, kind: FISH_TASKS.has(taskId) ? "fish" : taskId };
      if (interaction.kind === "fish") {
        renderFishProgress(taskId, 0);
        startTaskHands(taskId, gestureId);
        interaction.progress = 0;
      } else if (taskId === "portion-rice") {
        startTaskHands(taskId, gestureId);
        interaction.objectStart = riceModel.root.position.clone();
      } else if (taskId === "shape-rice") {
        startTaskHands(taskId, gestureId);
        interaction.totalTravel = 0;
        interaction.lastDirection = 0;
        interaction.directionChanges = 0;
        interaction.baseScale = riceModel.root.scale.clone();
        interaction.lastRecordedY = event.clientY;
      } else if (taskId === "place-fish") {
        startTaskHands(taskId, gestureId);
        interaction.objectStart = fishModel.root.position.clone();
      } else if (taskId === "grip-sushi") {
        startTaskHands(taskId, gestureId);
        interaction.holdProgress = 0;
      } else if (taskId === "plate-sushi") {
        startTaskHands(taskId, gestureId);
        interaction.riceStart = riceModel.root.position.clone();
        interaction.fishStart = fishModel.root.position.clone();
      } else if (taskId === "serve") {
        interaction.kind = "serve";
      }
    } else {
      interaction = { ...base, kind: "station-swipe", fromStation: station };
    }
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* synthetic pointer */ }
    event.preventDefault();
  };

  const moveInteraction = (event) => {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;
    interaction.lastX = event.clientX;
    interaction.lastY = event.clientY;
    interaction.moved = Math.hypot(dx, dy);
    if (interaction.kind === "station-swipe") {
      const bounds = canvas.getBoundingClientRect();
      const drag = clamp(dx / Math.max(1, bounds.width) * 2.1, -0.72, 0.72);
      cameraX = STATION_X[interaction.fromStation] - drag;
      frameCamera();
    } else if (interaction.kind === "fish") {
      const technique = sushiFishTechnique(interaction.taskId);
      const primary = technique?.gesture.axis === "x" ? dx : dy;
      const directional = primary * (technique?.gesture.direction ?? 1);
      interaction.progress = clamp01(directional / Math.max(1, technique?.gesture.minDistance ?? 60));
      renderFishProgress(interaction.taskId, interaction.progress);
      updateRightTaskHand(interaction.taskId, interaction.gestureId);
    } else if (interaction.kind === "portion-rice") {
      const point = worldFromEvent(event);
      if (point) {
        riceModel.root.position.set(clamp(point.x, PREP_X - 2.5, PREP_X + 1.75), 0.78, clamp(point.z, 0.25, 2.55));
        updateLeftTaskHand(interaction.taskId, interaction.gestureId);
      }
    } else if (interaction.kind === "shape-rice") {
      const delta = event.clientY - interaction.lastRecordedY;
      interaction.totalTravel += Math.abs(delta);
      const direction = Math.abs(delta) >= 2 ? Math.sign(delta) : interaction.lastDirection;
      if (direction && interaction.lastDirection && direction !== interaction.lastDirection) interaction.directionChanges += 1;
      if (direction) interaction.lastDirection = direction;
      interaction.lastRecordedY = event.clientY;
      const compression = clamp01(interaction.totalTravel / 100);
      riceModel.root.scale.set(
        interaction.baseScale.x * (1 + compression * 0.07),
        interaction.baseScale.y * (1 - compression * 0.18),
        interaction.baseScale.z * (1 - compression * 0.06),
      );
    } else if (interaction.kind === "place-fish") {
      const point = worldFromEvent(event);
      if (point) {
        fishModel.root.position.set(clamp(point.x, ASSEMBLY_X - 2.45, ASSEMBLY_X + 1.8), 1.03, clamp(point.z, -0.35, 2.42));
        updateRightTaskHand(interaction.taskId, interaction.gestureId);
      }
    } else if (interaction.kind === "plate-sushi") {
      const point = worldFromEvent(event);
      if (point) {
        const deltaWorld = point.clone().sub(interaction.startWorld ?? point);
        riceModel.root.position.copy(interaction.riceStart).add(deltaWorld).setY(0.95);
        fishModel.root.position.copy(interaction.fishStart).add(deltaWorld).setY(1.31);
        updateRightTaskHand(interaction.taskId, interaction.gestureId);
      }
    }
    event.preventDefault();
  };

  const startStationTransition = (nextStation, { notify = false } = {}) => {
    if (!STATIONS.includes(nextStation) || nextStation === station || motion || cameraTransition) return false;
    cameraTransition = {
      fromStation: station,
      toStation: nextStation,
      fromX: cameraX,
      toX: STATION_X[nextStation],
      startedAt: lastTime || now(),
      duration: reducedMotion ? 1 : 310,
      notify,
    };
    hideHands();
    return true;
  };

  const finishInteraction = (event, cancelled = false) => {
    if (!interaction || (event && event.pointerId !== interaction.pointerId)) return false;
    const active = interaction;
    interaction = null;
    if (event) {
      try { canvas.releasePointerCapture?.(active.pointerId); } catch { /* already released */ }
    }
    if (cancelled) {
      resetTransientVisuals();
      return true;
    }
    const dx = (event?.clientX ?? active.lastX) - active.startX;
    const dy = (event?.clientY ?? active.lastY) - active.startY;
    const elapsed = now() - active.startedAt;
    if (active.kind === "station-swipe") {
      const bounds = canvas.getBoundingClientRect();
      const threshold = Math.max(42, bounds.width * 0.12);
      const horizontal = Math.abs(dx) >= threshold && Math.abs(dx) >= Math.abs(dy) * 1.35;
      const requested = dx < 0 ? "assembly" : "prep";
      cameraX = STATION_X[active.fromStation];
      frameCamera();
      if (horizontal && requested !== active.fromStation) startStationTransition(requested, { notify: true });
      return true;
    }
    if (active.kind === "fish") {
      const result = evaluateSushiFishGesture(active.taskId, { dx, dy });
      if (!result.accepted) {
        resetTransientVisuals();
        emitMentorError(active.taskId);
        return true;
      }
      beginFishMotion(active.taskId, active.progress ?? 0, active.gestureId);
      return true;
    }
    if (active.kind === "portion-rice") {
      const target = new THREE.Vector3(PREP_X + 0.58, 0.47, 2.02);
      const closeEnough = riceModel.root.position.distanceTo(target) <= 1.05 && dx >= 42;
      if (!closeEnough) {
        resetTransientVisuals();
        emitMentorError(active.taskId);
        return true;
      }
      beginRicePortionMotion(riceModel.root.position.clone(), active.gestureId);
      return true;
    }
    if (active.kind === "shape-rice") {
      const accepted = elapsed >= (reducedMotion ? 1 : 240) && active.totalTravel >= 58 && active.directionChanges >= 2;
      if (!accepted) {
        resetTransientVisuals();
        emitMentorError(active.taskId);
        return true;
      }
      beginShapeMotion();
      return true;
    }
    if (active.kind === "place-fish") {
      const pose = SUSHI_ASSEMBLY_POSES["salmon-slice"];
      const target = new THREE.Vector3(ASSEMBLY_X + pose.x, pose.y, pose.z);
      if (fishModel.root.position.distanceTo(target) > 1.15) {
        resetTransientVisuals();
        emitMentorError(active.taskId);
        return true;
      }
      beginPlaceFishMotion(fishModel.root.position.clone(), active.gestureId);
      return true;
    }
    if (active.kind === "grip-sushi") {
      if (elapsed < (reducedMotion ? 1 : 420) || active.moved > 28) {
        resetTransientVisuals();
        emitMentorError(active.taskId);
        return true;
      }
      beginGripMotion();
      return true;
    }
    if (active.kind === "plate-sushi") {
      const target = new THREE.Vector3(ASSEMBLY_X + 1.55, 0.7, 0.88);
      const center = riceModel.root.position.clone().add(fishModel.root.position).multiplyScalar(0.5);
      if (Math.hypot(center.x - target.x, center.z - target.z) > 1.1) {
        resetTransientVisuals();
        emitMentorError(active.taskId);
        return true;
      }
      beginPlateMotion(riceModel.root.position.clone(), fishModel.root.position.clone(), active.gestureId);
      return true;
    }
    if (active.kind === "serve") {
      if (active.moved > 18) {
        resetTransientVisuals();
        emitMentorError(active.taskId);
        return true;
      }
      beginServiceMotion();
      return true;
    }
    return false;
  };

  const cancelActive = () => {
    let cancelled = false;
    if (interaction) {
      const pointerId = interaction.pointerId;
      cancelled = finishInteraction(null, true) || cancelled;
      try { canvas.releasePointerCapture?.(pointerId); } catch { /* already released */ }
    }
    if (motion) {
      motion = null;
      resetTransientVisuals();
      cancelled = true;
    }
    if (cameraTransition) {
      cameraTransition = null;
      cameraX = STATION_X[station];
      frameCamera();
      positionTransferFood(station, station, 1);
      cancelled = true;
    }
    return cancelled;
  };
  const updateMotion = (time) => {
    if (!motion) return;
    const active = motion;
    const progress = clamp01((time - active.startedAt) / active.duration);
    active.update?.(progress);
    if (progress < 1 || motion !== active) return;
    active.complete?.();
    if (motion === active) motion = null;
  };
  const updateCameraTransition = (time) => {
    if (!cameraTransition) return;
    const active = cameraTransition;
    const progress = clamp01((time - active.startedAt) / active.duration);
    const eased = easeInOutCubic(progress);
    cameraX = lerp(active.fromX, active.toX, eased);
    frameCamera();
    positionTransferFood(active.fromStation, active.toStation, eased);
    if (progress < 1) return;
    station = active.toStation;
    cameraX = active.toX;
    cameraTransition = null;
    frameCamera();
    positionTransferFood(station, station, 1);
    if (active.notify) onStationChange({ station });
  };
  const updateTargetPulse = (time) => {
    const taskId = sushiNextTask(currentState);
    const activeTarget = taskId === "portion-rice" || taskId === "shape-rice"
      ? shapingTarget
      : taskId === "plate-sushi" ? plateTarget : assemblyTarget;
    for (const target of [shapingTarget, assemblyTarget, plateTarget]) {
      if (!target.visible) continue;
      const idle = 0.56 + Math.sin(time * 0.005) * 0.11;
      const reject = target === activeTarget && time - targetPulseAt < 420
        ? Math.sin((time - targetPulseAt) / 420 * Math.PI) * 0.35
        : 0;
      target.material.opacity = clamp(idle + reject, 0.25, 0.95);
      target.rotation.z = time * 0.00014;
    }
  };

  const unsubscribeFrame = host.onFrame((time) => {
    try {
      lastTime = time;
      updateMotion(time);
      updateCameraTransition(time);
      mentor.tick(time);
      handRig.tick(time);
      updateTargetPulse(time);
      if (interaction?.kind === "grip-sushi") {
        interaction.holdProgress = clamp01((time - interaction.startedAt) / (reducedMotion ? 1 : 420));
        const compression = interaction.holdProgress * 0.11;
        riceModel.root.scale.set(1 + compression * 0.5, 1 - compression, 1 - compression * 0.45);
        fishModel.root.scale.set(1 + compression * 0.32, 1 - compression * 0.72, 1 - compression * 0.3);
      }
    } catch (error) {
      reportError(error);
    }
  });

  const handlePointerMove = (event) => moveInteraction(event);
  const handlePointerUp = (event) => finishInteraction(event);
  const handlePointerCancel = (event) => finishInteraction(event, true);
  const handleLostPointerCapture = (event) => {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    finishInteraction(event, true);
  };
  const handleDocumentPointerUp = (event) => finishInteraction(event);
  const handleVisibilityChange = () => {
    if (document.hidden) cancelActive("document-hidden");
  };
  const handleWindowBlur = () => cancelActive("window-blur");
  const handleKeyDown = (event) => {
    if (event.key === "Escape" && cancelActive("escape")) event.preventDefault();
  };
  canvas.addEventListener("pointerdown", beginInteraction);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("lostpointercapture", handleLostPointerCapture);
  document.addEventListener("pointerup", handleDocumentPointerUp);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("keydown", handleKeyDown);

  const api = {
    host,
    syncState(stateValue) {
      if (disposed || !stateValue || typeof stateValue !== "object") return false;
      currentState = stateValue;
      if (!cameraTransition && STATIONS.includes(stateValue.station) && station !== stateValue.station) {
        station = stateValue.station;
        cameraX = STATION_X[station];
        frameCamera();
      }
      fishPrep.applyState(stateValue);
      syncFoodVisuals();
      return true;
    },
    setStation(nextStation, { animate = true } = {}) {
      if (disposed || !STATIONS.includes(nextStation)) return false;
      if (nextStation === station && !cameraTransition) return true;
      if (!animate || reducedMotion) {
        cameraTransition = null;
        station = nextStation;
        cameraX = STATION_X[nextStation];
        frameCamera();
        positionTransferFood(nextStation, nextStation, 1);
        return true;
      }
      return startStationTransition(nextStation, { notify: false });
    },
    demonstrate(taskId, { slow = false } = {}) {
      if (disposed || interaction || motion || cameraTransition || !FISH_TASKS.has(taskId) || station !== "prep") return false;
      const gestureId = `sushi-demo-${taskId}-${Math.round(now())}`;
      mentor.show("demo", lastTime || now(), slow ? 3000 : 1900);
      renderFishProgress(taskId, 0);
      startTaskHands(taskId, gestureId);
      return startMotion({
        kind: "demo",
        taskId,
        duration: slow ? 1900 : 920,
        update(progress) {
          const pause = progress < 0.16 ? 0 : clamp01((progress - 0.16) / 0.84);
          renderFishProgress(taskId, easeInOutCubic(pause));
          updateRightTaskHand(taskId, gestureId);
        },
        complete() {
          motion = null;
          resetTransientVisuals();
        },
      });
    },
    reset() {
      if (disposed) return false;
      cancelActive("reset");
      attempts.clear();
      mentor.hide();
      if (currentState) fishPrep.applyState(currentState);
      syncFoodVisuals();
      return true;
    },
    isBusy() {
      return Boolean(interaction || motion || cameraTransition);
    },
    getDebugState() {
      const bounds = canvas.getBoundingClientRect();
      const projectDebugTarget = (object) => {
        const point = object.getWorldPosition(new THREE.Vector3()).project(host.camera);
        return Object.freeze({
          name: object.name,
          x: Math.round(bounds.left + (point.x + 1) * 0.5 * bounds.width),
          y: Math.round(bounds.top + (1 - point.y) * 0.5 * bounds.height),
        });
      };
      const debugTargets = activeTaskSurfaces(sushiNextTask(currentState))
        .filter((object) => object?.visible)
        .map(projectDebugTarget);
      const debugDropTargets = [shapingTarget, assemblyTarget, plateTarget, bell.button]
        .filter((object) => object?.visible)
        .map(projectDebugTarget);
      return Object.freeze({
        station,
        cameraX,
        targetStation: cameraTransition?.toStation ?? null,
        taskId: sushiNextTask(currentState),
        busy: Boolean(interaction || motion || cameraTransition),
        interaction: interaction ? Object.freeze({ kind: interaction.kind, taskId: interaction.taskId }) : null,
        motion: motion ? Object.freeze({ kind: motion.kind, taskId: motion.taskId }) : null,
        preparedFishVisible: fishModel.root.visible,
        byproducts: Object.freeze({
          headCollar: Boolean(currentState?.headCollarReserved),
          fishFrame: Boolean(currentState?.fishFrameReserved),
          salmonSkin: Boolean(currentState?.skinReserved),
        }),
        hands: handRig.getDebugState(),
        mentor: mentor.getState(),
        targets: Object.freeze(debugTargets),
        dropTargets: Object.freeze(debugDropTargets),
      });
    },
    resize() {
      if (disposed) return;
      host.resize();
      frameCamera();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeFrame();
      canvas.removeEventListener("pointerdown", beginInteraction);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("lostpointercapture", handleLostPointerCapture);
      document.removeEventListener("pointerup", handleDocumentPointerUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pagehide", handlePageHide);
      handRig.dispose();
      mentor.dispose();
      fishPrep.dispose();
      riceModel.dispose();
      fishModel.dispose();
      host.dispose();
    },
  };
  const handleResize = () => api.resize();
  const handlePageHide = () => api.dispose();
  window.addEventListener("resize", handleResize);
  window.addEventListener("pagehide", handlePageHide, { once: true });
  host.start();
  return Object.freeze(api);
}
