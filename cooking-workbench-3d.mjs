import { BURGER_LAYER_IDS, SAUCE_KEYS } from "./cooking-state.mjs";
import { WORKBENCH_REGION_OPTIONS } from "./workbench-loadout.mjs";

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

const SLOT_KIND_BY_REGION = Object.freeze({
  bread: "ingredient",
  filling: "ingredient",
  sauce: "tool",
});
const SLOT_REGION_ORDER = Object.freeze(["bread", "filling", "sauce"]);
const SLOT_INDICES_BY_REGION = Object.freeze({
  bread: Object.freeze([0, 1, 2]),
  filling: Object.freeze([0, 1, 2, 3]),
  sauce: Object.freeze([0, 1, 2]),
});

function normalizeSlotDescriptors(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("slotDescriptors must contain at least one descriptor");
  }
  const descriptors = value.map((descriptor) => {
    if (descriptor === null || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      throw new TypeError("slotDescriptors must contain descriptor objects");
    }
    const slotId = typeof descriptor.slotId === "string" ? descriptor.slotId.trim() : "";
    if (!slotId || slotId.length > 64) {
      throw new TypeError("slotDescriptors must contain non-empty slotId strings");
    }
    const { contentId, kind, region, index } = descriptor;
    const expectedKind = SLOT_KIND_BY_REGION[region];
    if (!expectedKind || kind !== expectedKind) {
      throw new TypeError(`slot ${slotId} has an invalid kind/region pairing`);
    }
    if (!WORKBENCH_REGION_OPTIONS[region].includes(contentId)) {
      throw new TypeError(`content ${String(contentId)} is not valid for ${region} slot ${slotId}`);
    }
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new TypeError(`slot ${slotId} index must be a non-negative integer`);
    }
    return Object.freeze({ slotId, contentId, kind, region, index });
  });
  const slotIds = descriptors.map(({ slotId }) => slotId);
  if (new Set(slotIds).size !== slotIds.length) {
    throw new TypeError("slotDescriptors must contain unique slotId values");
  }
  const hasFixedTopology = Object.entries(SLOT_INDICES_BY_REGION).every(([
    region,
    expectedIndices,
  ]) => {
    const actualIndices = descriptors
      .filter((descriptor) => descriptor.region === region)
      .map(({ index }) => index)
      .sort((left, right) => left - right);
    return actualIndices.length === expectedIndices.length
      && actualIndices.every((index, position) => index === expectedIndices[position]);
  });
  if (!hasFixedTopology) {
    throw new TypeError("slotDescriptors must use the fixed 3/4/3 topology and regional indices");
  }
  return Object.freeze([...descriptors].sort((left, right) => (
    SLOT_REGION_ORDER.indexOf(left.region) - SLOT_REGION_ORDER.indexOf(right.region)
      || left.index - right.index
  )));
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

function freezeStationLayout(station, object, halfExtent, descriptorMode) {
  const physicalLayout = {
    position: freezePosition(object.position),
    bounds: freezeBounds(object.position, halfExtent.x, halfExtent.z),
    halfExtent,
  };
  if (!descriptorMode) {
    return Object.freeze({
      kind: object.userData.cookingStation.kind,
      id: station.id,
      ...physicalLayout,
    });
  }
  return Object.freeze({
    kind: station.kind,
    get id() { return station.id; },
    get contentId() { return station.contentId; },
    slotId: station.slotId,
    region: station.region,
    index: station.index,
    ...physicalLayout,
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

function centeredLinePositions(count, { x, z, spacing, axis }) {
  return Array.from({ length: count }, (_, positionIndex) => {
    const offset = (positionIndex - (count - 1) / 2) * spacing;
    return {
      x: axis === "x" ? offset : x,
      y: 0,
      z: axis === "z" ? offset : z,
    };
  });
}

function switchableStationPositions(descriptors) {
  const byRegion = new Map();
  for (const region of SLOT_REGION_ORDER) {
    const regionDescriptors = descriptors.filter((descriptor) => descriptor.region === region);
    let positions;
    if (region === "bread") {
      positions = centeredLinePositions(regionDescriptors.length, {
        x: -3.85,
        z: 0,
        spacing: 1.65,
        axis: "z",
      });
    } else if (region === "filling") {
      positions = centeredLinePositions(regionDescriptors.length, {
        x: 0,
        z: -3.35,
        spacing: 1.7,
        axis: "x",
      });
    } else {
      positions = centeredLinePositions(regionDescriptors.length, {
        x: 3.85,
        z: 0,
        spacing: 1.65,
        axis: "z",
      });
    }
    regionDescriptors.forEach((descriptor) => {
      byRegion.set(descriptor.slotId, positions[descriptor.index]);
    });
  }
  return byRegion;
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

function createStationControlAnchor(THREE, { slotId, region }) {
  const controlAnchor = new THREE.Object3D();
  controlAnchor.name = `station:${slotId}:control-anchor`;
  controlAnchor.position.y = 0.64;
  if (region === "bread") controlAnchor.position.x = -1.08;
  if (region === "filling") controlAnchor.position.z = -0.98;
  if (region === "sauce") controlAnchor.position.x = 1.08;
  controlAnchor.raycast = NO_RAYCAST;
  controlAnchor.userData.workbenchSlotControl = Object.freeze({
    slotId,
    region,
  });
  return controlAnchor;
}

function updateSwitchableStationMetadata({
  descriptor,
  contentId,
  group,
  surface,
  highlight,
  pickupAnchor,
  dropAnchor,
}) {
  const { slotId, kind, region, index } = descriptor;
  group.name = `${kind}:${contentId}`;
  surface.name = `${kind}:${contentId}:surface`;
  highlight.name = `${kind}:${contentId}:highlight`;
  dropAnchor.name = `${kind}:${contentId}:drop`;
  pickupAnchor.name = `${kind}:${contentId}:pickup`;
  group.userData.cookingStation = Object.freeze({
    kind,
    id: contentId,
    index,
    slotId,
    contentId,
    region,
  });
  surface.userData.cookingSelectable = Object.freeze({
    kind,
    id: contentId,
    index,
    slotId,
    contentId,
    region,
  });
  dropAnchor.userData.cookingAnchor = Object.freeze({
    kind,
    id: contentId,
    role: "drop",
    slotId,
    contentId,
    region,
  });
  pickupAnchor.userData.cookingAnchor = Object.freeze({
    kind,
    id: contentId,
    role: "pickup",
    slotId,
    contentId,
    region,
  });
}

function createIngredientStation(THREE, resources, id, index, position, descriptor = null) {
  let contentId = descriptor?.contentId ?? id;
  const stationIndex = descriptor?.index ?? index;
  const group = new THREE.Group();
  group.name = `ingredient:${contentId}`;
  group.position.set(position.x, position.y, position.z);
  group.userData.cookingStation = Object.freeze({ kind: "ingredient", id: contentId, index });

  const shadow = new THREE.Mesh(resources.shadowGeometry, resources.shadowMaterial);
  shadow.raycast = NO_RAYCAST;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  const surface = new THREE.Mesh(
    resources.binBaseGeometry,
    new THREE.MeshStandardMaterial({
      color: resources.binColors[stationIndex % resources.binColors.length],
      roughness: 0.72,
      metalness: 0.02,
      flatShading: true,
    }),
  );
  surface.name = `ingredient:${contentId}:surface`;
  surface.position.y = 0.16;
  surface.userData.cookingSelectable = Object.freeze({ kind: "ingredient", id: contentId, index });
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
  highlight.name = `ingredient:${contentId}:highlight`;
  highlight.raycast = NO_RAYCAST;
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.y = 0.43;
  highlight.visible = false;
  group.add(shadow, surface, ...rims, highlight);
  const { dropAnchor, pickupAnchor } = addStationAnchors(
    THREE,
    group,
    contentId,
    "ingredient",
    0.42,
    0.74,
  );
  const controlAnchor = descriptor ? createStationControlAnchor(THREE, descriptor) : null;
  if (controlAnchor) group.add(controlAnchor);
  const station = descriptor ? Object.freeze({
    get id() { return contentId; },
    get contentId() { return contentId; },
    slotId: descriptor.slotId,
    kind: descriptor.kind,
    region: descriptor.region,
    index: descriptor.index,
    bin: group,
    surface,
    highlight,
    pickupAnchor,
    dropAnchor,
    controlAnchor,
  }) : Object.freeze({
    id: contentId,
    bin: group,
    surface,
    highlight,
    pickupAnchor,
    dropAnchor,
  });
  const updateContent = descriptor ? (nextContentId) => {
    contentId = nextContentId;
    updateSwitchableStationMetadata({
      descriptor,
      contentId,
      group,
      surface,
      highlight,
      pickupAnchor,
      dropAnchor,
    });
  } : null;
  updateContent?.(contentId);
  return { station, updateContent };
}

function createToolStation(THREE, resources, id, index, position, descriptor = null) {
  let contentId = descriptor?.contentId ?? id;
  const group = new THREE.Group();
  group.name = `tool:${contentId}`;
  group.position.set(position.x, position.y, position.z);
  group.userData.cookingStation = Object.freeze({ kind: "tool", id: contentId, index });

  const shadow = new THREE.Mesh(resources.toolShadowGeometry, resources.shadowMaterial);
  shadow.raycast = NO_RAYCAST;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;
  const surface = new THREE.Mesh(resources.toolBaseGeometry, resources.toolBaseMaterial);
  surface.name = `tool:${contentId}:surface`;
  surface.position.y = 0.1;
  surface.userData.cookingSelectable = Object.freeze({ kind: "tool", id: contentId, index });
  const rim = new THREE.Mesh(resources.toolRimGeometry, resources.toolRimMaterial);
  rim.raycast = NO_RAYCAST;
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.22;
  const highlight = new THREE.Mesh(resources.toolHighlightGeometry, resources.highlightMaterial);
  highlight.name = `tool:${contentId}:highlight`;
  highlight.raycast = NO_RAYCAST;
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.y = 0.32;
  highlight.visible = false;
  group.add(shadow, surface, rim, highlight);
  const { dropAnchor, pickupAnchor } = addStationAnchors(
    THREE,
    group,
    contentId,
    "tool",
    0.31,
    0.76,
  );
  const controlAnchor = descriptor ? createStationControlAnchor(THREE, descriptor) : null;
  if (controlAnchor) group.add(controlAnchor);
  const station = descriptor ? Object.freeze({
    get id() { return contentId; },
    get contentId() { return contentId; },
    slotId: descriptor.slotId,
    kind: descriptor.kind,
    region: descriptor.region,
    index: descriptor.index,
    dock: group,
    surface,
    highlight,
    pickupAnchor,
    dropAnchor,
    controlAnchor,
  }) : Object.freeze({ id: contentId, dock: group, surface, highlight, pickupAnchor, dropAnchor });
  const updateContent = descriptor ? (nextContentId) => {
    contentId = nextContentId;
    updateSwitchableStationMetadata({
      descriptor,
      contentId,
      group,
      surface,
      highlight,
      pickupAnchor,
      dropAnchor,
    });
  } : null;
  updateContent?.(contentId);
  return { station, updateContent };
}

export function createCookingWorkbench3D(THREE, options = {}) {
  const {
    ingredientIds = BURGER_LAYER_IDS,
    toolIds = SAUCE_KEYS,
    slotDescriptors,
  } = options;
  const descriptorMode = slotDescriptors !== undefined;
  let normalizedIngredientIds = [];
  let normalizedToolIds = [];
  let normalizedSlotDescriptors = null;
  if (descriptorMode) {
    normalizedSlotDescriptors = normalizeSlotDescriptors(slotDescriptors);
  } else {
    normalizedIngredientIds = normalizeIds(ingredientIds, "ingredientIds", {
      minimum: 1,
      maximum: MAX_INGREDIENT_SLOTS,
    });
    normalizedToolIds = normalizeIds(toolIds, "toolIds", {
      minimum: 0,
      maximum: MAX_TOOL_DOCKS,
    });
    const allIds = [...normalizedIngredientIds, ...normalizedToolIds];
    if (new Set(allIds).size !== allIds.length) {
      throw new TypeError("ingredientIds and toolIds must not share identifiers");
    }
  }

  const root = new THREE.Group();
  root.name = "cooking-workbench";
  const previewRoot = new THREE.Group();
  previewRoot.name = "workbench-slot-preview";
  previewRoot.raycast = NO_RAYCAST;
  root.add(previewRoot);

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
  plate.geometry.computeBoundingBox();
  const prepSupportY = plate.position.y
    + plate.geometry.boundingBox.max.y * plate.scale.y;
  const prepDropAnchor = new THREE.Object3D();
  prepDropAnchor.name = "prep-drop-anchor";
  prepDropAnchor.position.y = prepSupportY;
  prepDropAnchor.userData.cookingAnchor = Object.freeze({ kind: "prep", role: "drop" });
  const dropCueGeometry = new THREE.RingGeometry(0.74, 0.92, 32);
  const dropCueMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc84d,
    transparent: true,
    opacity: 0.28,
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
  let ingredientRecords;
  let toolRecords;
  if (descriptorMode) {
    const positionsBySlot = switchableStationPositions(normalizedSlotDescriptors);
    ingredientRecords = normalizedSlotDescriptors
      .filter(({ kind }) => kind === "ingredient")
      .map((descriptor) => ({
        ...createIngredientStation(
          THREE,
          resources,
          descriptor.contentId,
          descriptor.index,
          positionsBySlot.get(descriptor.slotId),
          descriptor,
        ),
        descriptor,
        slotId: descriptor.slotId,
      }));
    toolRecords = normalizedSlotDescriptors
      .filter(({ kind }) => kind === "tool")
      .map((descriptor) => ({
        ...createToolStation(
          THREE,
          resources,
          descriptor.contentId,
          descriptor.index,
          positionsBySlot.get(descriptor.slotId),
          descriptor,
        ),
        descriptor,
        slotId: descriptor.slotId,
      }));
  } else {
    const ingredientSlotPositions = ingredientPositions(normalizedIngredientIds.length);
    ingredientRecords = normalizedIngredientIds.map((id, index) => ({
      ...createIngredientStation(THREE, resources, id, index, ingredientSlotPositions[index]),
      descriptor: null,
      slotId: id,
    }));
    const toolDockPositions = toolPositions(normalizedToolIds.length);
    toolRecords = normalizedToolIds.map((id, index) => ({
      ...createToolStation(THREE, resources, id, index, toolDockPositions[index]),
      descriptor: null,
      slotId: id,
    }));
  }
  const ingredientSlots = Object.freeze(ingredientRecords.map(({ station }) => {
    root.add(station.bin);
    return station;
  }));
  const toolDocks = Object.freeze(toolRecords.map(({ station }) => {
    root.add(station.dock);
    return station;
  }));
  const stationRecords = [...ingredientRecords, ...toolRecords];
  const stationsBySlot = new Map(stationRecords.map((record) => [record.slotId, record]));
  const allStations = Object.freeze(stationRecords.map(({ station }) => station));
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
      supportY: prepSupportY,
    }),
    ingredients: Object.freeze(ingredientSlots.map((slot) => freezeStationLayout(
      slot,
      slot.bin,
      INGREDIENT_HALF_EXTENT,
      descriptorMode,
    ))),
    tools: Object.freeze(toolDocks.map((slot) => freezeStationLayout(
      slot,
      slot.dock,
      TOOL_HALF_EXTENT,
      descriptorMode,
    ))),
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

  const stationKind = (station) => station.kind ?? (station.bin ? "ingredient" : "tool");
  const findStationsByContent = (kind, contentId) => allStations.filter((station) => (
    stationKind(station) === kind && station.id === contentId
  ));
  let disposed = false;
  return {
    root,
    previewRoot,
    counter,
    dropCue,
    layout,
    prep: Object.freeze({
      anchor: prepAnchor,
      surface: board,
      board,
      plate,
      dropAnchor: prepDropAnchor,
      supportY: prepSupportY,
    }),
    ingredientSlots,
    toolDocks,
    selectableSurfaces,
    noRaycast: NO_RAYCAST,
    getStation(kind, id) {
      return findStationsByContent(kind, id)[0] ?? null;
    },
    getStationBySlot(slotId) {
      return stationsBySlot.get(slotId)?.station ?? null;
    },
    getStationsByContent(kind, contentId) {
      return Object.freeze(findStationsByContent(kind, contentId));
    },
    getSlotControlAnchors() {
      return Object.freeze(allStations
        .filter(({ controlAnchor }) => controlAnchor?.isObject3D)
        .map(({ slotId, region, controlAnchor }) => Object.freeze({
          slotId,
          region,
          anchor: controlAnchor,
        })));
    },
    getLayout() {
      return layout;
    },
    setHighlighted(kind, id, highlighted = true) {
      if (disposed) return false;
      const station = findStationsByContent(kind, id)[0];
      if (!station) return false;
      station.highlight.visible = Boolean(highlighted);
      return true;
    },
    setSlotHighlighted(slotId, highlighted = true) {
      if (disposed) return false;
      const station = stationsBySlot.get(slotId)?.station;
      if (!station) return false;
      station.highlight.visible = Boolean(highlighted);
      return true;
    },
    setStationContent(slotId, contentId) {
      if (disposed) return false;
      const record = stationsBySlot.get(slotId);
      if (!record?.descriptor || !record.updateContent) {
        throw new TypeError(`Unknown switchable workbench slot: ${String(slotId)}`);
      }
      const { region } = record.descriptor;
      if (!WORKBENCH_REGION_OPTIONS[region].includes(contentId)) {
        throw new TypeError(`Content ${String(contentId)} is not valid for ${region} slot ${slotId}`);
      }
      record.updateContent(contentId);
      return true;
    },
    clearHighlights() {
      if (disposed) return;
      for (const station of allStations) station.highlight.visible = false;
    },
    setDropCue({ targetIndex, y, radius } = {}) {
      if (disposed) return false;
      if (!Number.isInteger(targetIndex) || targetIndex < 0) {
        throw new TypeError("drop cue targetIndex must be a non-negative integer");
      }
      if (!Number.isFinite(y)) throw new TypeError("drop cue y must be finite");
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new TypeError("drop cue radius must be a positive finite number");
      }
      dropCue.userData.targetIndex = targetIndex;
      dropCue.position.set(0, y, 0);
      dropCue.scale.set(radius, radius, 1);
      dropCue.visible = true;
      return true;
    },
    clearDropCue() {
      if (disposed) return;
      dropCue.visible = false;
      delete dropCue.userData.targetIndex;
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
