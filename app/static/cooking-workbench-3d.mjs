import { BURGER_LAYER_IDS, SAUCE_KEYS } from "./cooking-state.mjs";

const MAX_INGREDIENT_SLOTS = 12;
const MAX_TOOL_DOCKS = 8;

function normalizeIds(value, label, { minimum, maximum }) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new TypeError(`${label} must contain ${minimum} to ${maximum} identifiers`);
  }
  const normalized = value.map((id) => {
    if (typeof id !== "string" || !id.trim() || id.trim().length > 64) {
      throw new TypeError(`${label} must contain non-empty string identifiers`);
    }
    return id.trim();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} must not contain duplicate identifiers`);
  }
  return normalized;
}

const NO_RAYCAST = () => {};
const PREP_HALF_EXTENT = Object.freeze({ x: 2.55, z: 1.65 });
const INGREDIENT_HALF_EXTENT = Object.freeze({ x: 0.69, z: 0.69 });
const TOOL_HALF_EXTENT = Object.freeze({ x: 0.52, z: 0.52 });
const PREP_BOUNDS = Object.freeze({ minX: -2.55, maxX: 2.55, minZ: -1.65, maxZ: 1.65 });
const WORKSPACE_BOUNDS = Object.freeze({ minX: -5.3, maxX: 5.3, minZ: -4.9, maxZ: 4.9 });
const PORTRAIT_CAMERA_VIEW = Object.freeze({
  fov: 44,
  near: 0.1,
  far: 100,
  minPortraitAspect: 0.46,
  position: Object.freeze({ x: 0, y: 22, z: 27 }),
  target: Object.freeze({ x: 0, y: 0.05, z: -0.25 }),
});

function freezePosition(position) {
  return Object.freeze({ x: position.x, y: position.y, z: position.z });
}

function freezeBounds(position, halfWidth, halfDepth) {
  return Object.freeze({
    minX: position.x - halfWidth,
    maxX: position.x + halfWidth,
    minZ: position.z - halfDepth,
    maxZ: position.z + halfDepth,
  });
}

function ingredientPositions(count) {
  const topCount = Math.min(5, count);
  const positions = Array.from({ length: topCount }, (_, index) => ({
    x: (index - (topCount - 1) / 2) * 1.7,
    y: 0,
    z: -3.2,
  }));
  for (let index = topCount; index < count; index += 1) {
    const sideIndex = index - topCount;
    positions.push({
      x: sideIndex % 2 === 0 ? -3.55 : 3.55,
      y: 0,
      z: -1.65 + Math.floor(sideIndex / 2) * 1.4,
    });
  }
  return positions;
}

function toolPositions(count) {
  const spacing = count <= 1 ? 0 : Math.min(1.26, 8.82 / (count - 1));
  return Array.from({ length: count }, (_, index) => ({
    x: (index - (count - 1) / 2) * spacing,
    y: 0,
    z: 4.05,
  }));
}

function addStationAnchors(THREE, group, id, kind, dropHeight, pickupHeight) {
  const dropAnchor = new THREE.Object3D();
  dropAnchor.name = `${kind}:${id}:drop`;
  dropAnchor.position.y = dropHeight;
  dropAnchor.userData.cookingAnchor = Object.freeze({ kind, id, role: "drop" });
  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = `${kind}:${id}:pickup`;
  pickupAnchor.position.y = pickupHeight;
  pickupAnchor.userData.cookingAnchor = Object.freeze({ kind, id, role: "pickup" });
  group.add(dropAnchor, pickupAnchor);
  return { dropAnchor, pickupAnchor };
}

function createIngredientStation(THREE, resources, id, index, position) {
  const group = new THREE.Group();
  group.name = `ingredient:${id}`;
  group.position.set(position.x, position.y, position.z);
  group.userData.cookingStation = Object.freeze({ kind: "ingredient", id, index });

  const shadow = new THREE.Mesh(resources.shadowGeometry, resources.shadowMaterial);
  shadow.raycast = NO_RAYCAST;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  const surface = new THREE.Mesh(
    resources.binBaseGeometry,
    new THREE.MeshStandardMaterial({
      color: resources.binColors[index % resources.binColors.length],
      roughness: 0.72,
      metalness: 0.02,
      flatShading: true,
    }),
  );
  surface.name = `ingredient:${id}:surface`;
  surface.position.y = 0.16;
  surface.userData.cookingSelectable = Object.freeze({ kind: "ingredient", id, index });
  const rimOffsets = [
    [resources.binRimHorizontalGeometry, 0, 0.3, -0.71],
    [resources.binRimHorizontalGeometry, 0, 0.3, 0.71],
    [resources.binRimVerticalGeometry, -0.71, 0.3, 0],
    [resources.binRimVerticalGeometry, 0.71, 0.3, 0],
  ];
  const rims = rimOffsets.map(([geometry, x, y, z]) => {
    const rim = new THREE.Mesh(geometry, resources.binRimMaterial);
    rim.raycast = NO_RAYCAST;
    rim.position.set(x, y, z);
    return rim;
  });
  const highlight = new THREE.Mesh(resources.binHighlightGeometry, resources.highlightMaterial);
  highlight.name = `ingredient:${id}:highlight`;
  highlight.raycast = NO_RAYCAST;
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.y = 0.43;
  highlight.visible = false;
  group.add(shadow, surface, ...rims, highlight);
  const { dropAnchor, pickupAnchor } = addStationAnchors(
    THREE,
    group,
    id,
    "ingredient",
    0.42,
    0.74,
  );
  return Object.freeze({
    id,
    bin: group,
    surface,
    highlight,
    pickupAnchor,
    dropAnchor,
  });
}

function createToolStation(THREE, resources, id, index, position) {
  const group = new THREE.Group();
  group.name = `tool:${id}`;
  group.position.set(position.x, position.y, position.z);
  group.userData.cookingStation = Object.freeze({ kind: "tool", id, index });

  const shadow = new THREE.Mesh(resources.toolShadowGeometry, resources.shadowMaterial);
  shadow.raycast = NO_RAYCAST;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  const surface = new THREE.Mesh(resources.toolBaseGeometry, resources.toolBaseMaterial);
  surface.name = `tool:${id}:surface`;
  surface.position.y = 0.1;
  surface.userData.cookingSelectable = Object.freeze({ kind: "tool", id, index });
  const rim = new THREE.Mesh(resources.toolRimGeometry, resources.toolRimMaterial);
  rim.raycast = NO_RAYCAST;
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.22;
  const highlight = new THREE.Mesh(resources.toolHighlightGeometry, resources.highlightMaterial);
  highlight.name = `tool:${id}:highlight`;
  highlight.raycast = NO_RAYCAST;
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.y = 0.32;
  highlight.visible = false;
  group.add(shadow, surface, rim, highlight);
  const { dropAnchor, pickupAnchor } = addStationAnchors(
    THREE,
    group,
    id,
    "tool",
    0.31,
    0.76,
  );
  return Object.freeze({ id, dock: group, surface, highlight, pickupAnchor, dropAnchor });
}

export function createCookingWorkbench3D(THREE, {
  ingredientIds = BURGER_LAYER_IDS,
  toolIds = SAUCE_KEYS,
} = {}) {
  const normalizedIngredientIds = normalizeIds(ingredientIds, "ingredientIds", {
    minimum: 1,
    maximum: MAX_INGREDIENT_SLOTS,
  });
  const normalizedToolIds = normalizeIds(toolIds, "toolIds", {
    minimum: 0,
    maximum: MAX_TOOL_DOCKS,
  });
  const allIds = [...normalizedIngredientIds, ...normalizedToolIds];
  if (new Set(allIds).size !== allIds.length) {
    throw new TypeError("ingredientIds and toolIds must not share identifiers");
  }

  const root = new THREE.Group();
  root.name = "cooking-workbench";

  const counterGeometry = new THREE.BoxGeometry(10.6, 0.35, 9.8);
  const counterMaterial = new THREE.MeshStandardMaterial({
    color: 0x965631,
    roughness: 0.82,
    metalness: 0.01,
    flatShading: true,
  });
  const counter = new THREE.Mesh(counterGeometry, counterMaterial);
  counter.name = "workbench-counter";
  counter.raycast = NO_RAYCAST;
  counter.position.y = -0.3;
  root.add(counter);

  const backRail = new THREE.Mesh(
    new THREE.BoxGeometry(10.15, 0.32, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0x6e3d27,
      roughness: 0.76,
      flatShading: true,
    }),
  );
  backRail.name = "workbench-back-rail";
  backRail.raycast = NO_RAYCAST;
  backRail.position.set(0, 0.02, -4.55);
  root.add(backRail);

  const prepAnchor = new THREE.Object3D();
  prepAnchor.name = "prep-anchor";
  const boardBase = new THREE.Mesh(
    new THREE.BoxGeometry(5.28, 0.12, 3.46),
    new THREE.MeshStandardMaterial({ color: 0x8b4a2d, roughness: 0.78, flatShading: true }),
  );
  boardBase.name = "prep-board-base";
  boardBase.raycast = NO_RAYCAST;
  boardBase.position.y = -0.01;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5.1, 0.18, 3.3),
    new THREE.MeshStandardMaterial({
      color: 0xe4ad63,
      roughness: 0.68,
      metalness: 0,
      flatShading: true,
    }),
  );
  board.name = "prep-board";
  board.position.y = 0.08;
  board.userData.cookingSelectable = Object.freeze({ kind: "prep", id: "prep", index: 0 });
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.62, 1.72, 0.16, 28),
    new THREE.MeshStandardMaterial({
      color: 0xf3e2c4,
      roughness: 0.52,
      metalness: 0,
      flatShading: true,
    }),
  );
  plate.name = "prep-plate";
  plate.raycast = NO_RAYCAST;
  plate.position.y = 0.24;
  const prepDropAnchor = new THREE.Object3D();
  prepDropAnchor.name = "prep-drop-anchor";
  prepDropAnchor.position.y = 0.38;
  prepDropAnchor.userData.cookingAnchor = Object.freeze({ kind: "prep", role: "drop" });
  const dropCueGeometry = new THREE.RingGeometry(0.74, 0.92, 32);
  const dropCueMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc84d,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
  const dropCue = new THREE.Mesh(dropCueGeometry, dropCueMaterial);
  dropCue.name = "prep:drop-cue";
  dropCue.rotation.x = -Math.PI / 2;
  dropCue.visible = false;
  dropCue.renderOrder = 18;
  dropCue.raycast = NO_RAYCAST;
  prepDropAnchor.add(dropCue);
  prepAnchor.add(boardBase, board, plate, prepDropAnchor);
  root.add(prepAnchor);

  const resources = {
    binColors: [0xc36f3f, 0xb85c45, 0xd18b4f, 0xa8573f],
    binBaseGeometry: new THREE.BoxGeometry(1.38, 0.22, 1.38),
    binRimHorizontalGeometry: new THREE.BoxGeometry(1.54, 0.18, 0.1),
    binRimVerticalGeometry: new THREE.BoxGeometry(0.1, 0.18, 1.54),
    binHighlightGeometry: new THREE.RingGeometry(0.78, 0.89, 24),
    binRimMaterial: new THREE.MeshStandardMaterial({
      color: 0x693e2e,
      roughness: 0.66,
      metalness: 0.02,
      flatShading: true,
    }),
    shadowGeometry: new THREE.CircleGeometry(0.86, 20),
    toolShadowGeometry: new THREE.CircleGeometry(0.61, 20),
    shadowMaterial: new THREE.MeshBasicMaterial({
      color: 0x2d1b1a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    toolBaseGeometry: new THREE.CylinderGeometry(0.46, 0.52, 0.2, 16),
    toolRimGeometry: new THREE.TorusGeometry(0.45, 0.045, 6, 20),
    toolHighlightGeometry: new THREE.RingGeometry(0.53, 0.61, 24),
    toolBaseMaterial: new THREE.MeshStandardMaterial({
      color: 0x654235,
      roughness: 0.7,
      metalness: 0.04,
      flatShading: true,
    }),
    toolRimMaterial: new THREE.MeshStandardMaterial({
      color: 0xd6a65b,
      roughness: 0.48,
      metalness: 0.14,
      flatShading: true,
    }),
    highlightMaterial: new THREE.MeshBasicMaterial({
      color: 0xffd45c,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  const ingredientSlotPositions = ingredientPositions(normalizedIngredientIds.length);
  const ingredientSlots = Object.freeze(normalizedIngredientIds.map((id, index) => {
    const slot = createIngredientStation(
      THREE,
      resources,
      id,
      index,
      ingredientSlotPositions[index],
    );
    root.add(slot.bin);
    return slot;
  }));

  const toolDockPositions = toolPositions(normalizedToolIds.length);
  const toolDocks = Object.freeze(normalizedToolIds.map((id, index) => {
    const slot = createToolStation(
      THREE,
      resources,
      id,
      index,
      toolDockPositions[index],
    );
    root.add(slot.dock);
    return slot;
  }));

  const stations = new Map();
  for (const slot of ingredientSlots) stations.set(`ingredient\0${slot.id}`, slot);
  for (const slot of toolDocks) stations.set(`tool\0${slot.id}`, slot);
  const selectableSurfaces = Object.freeze([
    board,
    ...ingredientSlots.map(({ surface }) => surface),
    ...toolDocks.map(({ surface }) => surface),
  ]);
  const layout = Object.freeze({
    bounds: WORKSPACE_BOUNDS,
    camera: PORTRAIT_CAMERA_VIEW,
    prep: Object.freeze({
      position: freezePosition(prepAnchor.position),
      bounds: PREP_BOUNDS,
      halfExtent: PREP_HALF_EXTENT,
    }),
    ingredients: Object.freeze(ingredientSlots.map((slot) => Object.freeze({
      kind: "ingredient",
      id: slot.id,
      position: freezePosition(slot.bin.position),
      bounds: freezeBounds(
        slot.bin.position,
        INGREDIENT_HALF_EXTENT.x,
        INGREDIENT_HALF_EXTENT.z,
      ),
      halfExtent: INGREDIENT_HALF_EXTENT,
    }))),
    tools: Object.freeze(toolDocks.map((slot) => Object.freeze({
      kind: "tool",
      id: slot.id,
      position: freezePosition(slot.dock.position),
      bounds: freezeBounds(slot.dock.position, TOOL_HALF_EXTENT.x, TOOL_HALF_EXTENT.z),
      halfExtent: TOOL_HALF_EXTENT,
    }))),
  });

  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const collectObjectResources = (object) => {
    if (object.geometry?.dispose) ownedGeometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (material?.dispose) ownedMaterials.add(material);
    }
  };
  root.traverse(collectObjectResources);
  for (const resource of Object.values(resources)) {
    if (resource?.isBufferGeometry && resource.dispose) ownedGeometries.add(resource);
    if (resource?.isMaterial && resource.dispose) ownedMaterials.add(resource);
  }

  let disposed = false;
  return {
    root,
    counter,
    dropCue,
    prep: {
      anchor: prepAnchor,
      surface: board,
      board,
      plate,
      dropAnchor: prepDropAnchor,
    },
    ingredientSlots,
    toolDocks,
    selectableSurfaces,
    getStation(kind, id) {
      return stations.get(`${kind}\0${id}`) ?? null;
    },
    getLayout() {
      return layout;
    },
    setHighlighted(kind, id, highlighted = true) {
      if (disposed) return false;
      const station = stations.get(`${kind}\0${id}`);
      if (!station) return false;
      station.highlight.visible = Boolean(highlighted);
      return true;
    },
    clearHighlights() {
      if (disposed) return;
      for (const station of stations.values()) station.highlight.visible = false;
    },
    setDropCue(intent, { y } = {}) {
      if (disposed) return false;
      if (intent !== "top" && intent !== "bottom") {
        throw new TypeError("drop cue intent must be top or bottom");
      }
      if (!Number.isFinite(y)) throw new TypeError("drop cue y must be finite");
      dropCue.userData.intent = intent;
      dropCue.position.set(0, y, 0);
      const scale = intent === "bottom" ? 1.12 : 1;
      dropCue.scale.set(scale, scale, 1);
      dropCue.visible = true;
      return true;
    },
    clearDropCue() {
      if (disposed) return;
      dropCue.visible = false;
      delete dropCue.userData.intent;
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
