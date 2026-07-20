import { BURGER_LAYER_IDS, SAUCE_KEYS } from "./cooking-state.mjs";

const FOOD_ID = "burger";
const MAX_STROKES = 64;
const MAX_POINTS = 24;
const COLLAPSED_OVERLAP = 0.035;
const EXPANDED_GAP = 0.42;
const NO_RAYCAST = () => {};
const LETTUCE_INNER_CLEARANCE = 0.075;
// Two stable inner-rim controls per crossing bound a 24-point route to 70 points.
// The 72 longitudinal x 3 radial cap keeps 64 worst-case strokes plus the food
// at 27,798 triangles, below the established 30k mobile ceiling.
const MAX_TUBE_SEGMENTS = 72;
const TUBE_RADIAL_SEGMENTS = 3;
const COMPOSITION_KEYS = Object.freeze(["food", "layerOrder", "layerPoses", "strokes"]);
const POSE_KEYS = Object.freeze(["x", "z", "yaw"]);
const STROKE_KEYS = Object.freeze(["sauce", "layerId", "amount", "points"]);
const CHEESE_PERIMETER = Object.freeze([
  Object.freeze([-0.96, -0.83, true]), Object.freeze([-0.32, -1.03, false]),
  Object.freeze([0.32, -1.03, false]), Object.freeze([0.96, -0.83, true]),
  Object.freeze([1.04, -0.28, false]), Object.freeze([1.01, 0.3, false]),
  Object.freeze([0.84, 0.96, true]), Object.freeze([0.28, 1.02, false]),
  Object.freeze([-0.3, 1.02, false]), Object.freeze([-0.88, 0.93, true]),
  Object.freeze([-1.04, 0.3, false]), Object.freeze([-1.03, -0.28, false]),
]);

const SAUCE_COLORS = Object.freeze({
  chili: 0xc72f21,
  mustard: 0xe6ab20,
  sour: 0x8ebf36,
  sticky: 0x784127,
});

function assertActive(disposed) {
  if (disposed) throw new Error("Burger model is disposed");
}

function assertLayerId(layerId) {
  if (!BURGER_LAYER_IDS.includes(layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
}

function assertFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function setOptionalVector(vector, value, label) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const axis of ["x", "y", "z"]) {
    if (Object.hasOwn(value, axis)) vector[axis] = assertFinite(value[axis], `${label}.${axis}`);
  }
}

function assertPermutation(order) {
  if (!Array.isArray(order) || order.length !== BURGER_LAYER_IDS.length) {
    throw new TypeError("layerOrder must contain all seven burger layers");
  }
  if (new Set(order).size !== order.length || order.some((id) => !BURGER_LAYER_IDS.includes(id))) {
    throw new TypeError("layerOrder must be an exact burger layer permutation");
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new TypeError(`${label} contains invalid fields`);
  }
  return value;
}

function createReadonlyMapView(source) {
  const view = {
    get size() {
      return source.size;
    },
    get(key) {
      return source.get(key);
    },
    has(key) {
      return source.has(key);
    },
    keys() {
      return source.keys();
    },
    values() {
      return source.values();
    },
    entries() {
      return source.entries();
    },
    forEach(callback, thisArg) {
      source.forEach((value, key) => callback.call(thisArg, value, key, view));
    },
    [Symbol.iterator]() {
      return source[Symbol.iterator]();
    },
  };
  return Object.freeze(view);
}

function validateStroke(stroke) {
  assertExactKeys(stroke, STROKE_KEYS, "Sauce stroke");
  if (!SAUCE_KEYS.includes(stroke.sauce)) {
    throw new TypeError(`Unknown sauce: ${String(stroke.sauce)}`);
  }
  assertLayerId(stroke.layerId);
  const amount = assertFinite(stroke.amount, "stroke.amount");
  if (amount < 0.01 || amount > 1) {
    throw new TypeError("stroke.amount must be between 0.01 and 1");
  }
  if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > MAX_POINTS) {
    throw new TypeError(`stroke.points must contain 2 to ${MAX_POINTS} points`);
  }
  const points = stroke.points.map((point, pointIndex) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError(`stroke.points[${pointIndex}] must be an [x, z] pair`);
    }
    const x = assertFinite(point[0], `stroke.points[${pointIndex}][0]`);
    const z = assertFinite(point[1], `stroke.points[${pointIndex}][1]`);
    if (x < -1 || x > 1 || z < -1 || z > 1) {
      throw new TypeError("Sauce point coordinates must be between -1 and 1");
    }
    return Object.freeze([x, z]);
  });
  return Object.freeze({
    sauce: stroke.sauce,
    layerId: stroke.layerId,
    amount,
    points: Object.freeze(points),
  });
}

function createCheeseGeometry(THREE) {
  const perimeter = CHEESE_PERIMETER;
  const positions = [];
  for (const [x, z, corner] of perimeter) positions.push(x, corner ? -0.08 : 0.09, z);
  for (const [x, z, corner] of perimeter) positions.push(x, corner ? -0.3 : -0.09, z);
  positions.push(0, 0.09, 0, 0, -0.09, 0);
  const topCenter = perimeter.length * 2;
  const bottomCenter = topCenter + 1;
  const indices = [];
  for (let index = 0; index < perimeter.length; index += 1) {
    const next = (index + 1) % perimeter.length;
    const bottom = index + perimeter.length;
    const nextBottom = next + perimeter.length;
    indices.push(topCenter, next, index);
    indices.push(bottomCenter, bottom, nextBottom);
    indices.push(index, next, nextBottom, index, nextBottom, bottom);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createLettuceGeometry(THREE) {
  const segments = 30;
  const positions = [];
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const outerRadius = 1.16 + 0.12 * Math.sin(angle * 7) + 0.05 * Math.cos(angle * 11);
    const innerRadius = 0.34 + 0.035 * Math.cos(angle * 5);
    const wave = 0.035 * Math.sin(angle * 6);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(outerRadius * cos, 0.07 + wave, outerRadius * sin);
    positions.push(innerRadius * cos, 0.055 - wave * 0.3, innerRadius * sin);
    positions.push(outerRadius * cos, -0.07 + wave, outerRadius * sin);
    positions.push(innerRadius * cos, -0.055 - wave * 0.3, innerRadius * sin);
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const topOuter = index * 4;
    const topInner = topOuter + 1;
    const bottomOuter = topOuter + 2;
    const bottomInner = topOuter + 3;
    const nextTopOuter = next * 4;
    const nextTopInner = nextTopOuter + 1;
    const nextBottomOuter = nextTopOuter + 2;
    const nextBottomInner = nextTopOuter + 3;
    indices.push(topOuter, nextTopInner, nextTopOuter, topOuter, topInner, nextTopInner);
    indices.push(bottomOuter, bottomInner, nextBottomInner, bottomOuter, nextBottomInner, nextBottomOuter);
    indices.push(topOuter, bottomOuter, nextBottomOuter, topOuter, nextBottomOuter, nextTopOuter);
    indices.push(topInner, nextTopInner, nextBottomInner, topInner, nextBottomInner, bottomInner);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function displaceCylinder(geometry, amplitude, frequency, phase = 0) {
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    if (radius < 0.05) continue;
    const angle = Math.atan2(z, x);
    const scale = 1 + amplitude * Math.sin(angle * frequency + phase)
      + amplitude * 0.45 * Math.cos(angle * (frequency + 3) - phase);
    positions.setX(index, x * scale);
    positions.setZ(index, z * scale);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBunGeometry(THREE, top) {
  const points = top
    ? [
      new THREE.Vector2(0, -0.23),
      new THREE.Vector2(0.7, -0.23),
      new THREE.Vector2(1.12, -0.14),
      new THREE.Vector2(1.23, 0.08),
      new THREE.Vector2(1.15, 0.38),
      new THREE.Vector2(0.91, 0.67),
      new THREE.Vector2(0.55, 0.86),
      new THREE.Vector2(0, 0.93),
    ]
    : [
      new THREE.Vector2(0, -0.2),
      new THREE.Vector2(0.78, -0.2),
      new THREE.Vector2(1.14, -0.14),
      new THREE.Vector2(1.22, 0.05),
      new THREE.Vector2(1.13, 0.24),
      new THREE.Vector2(0.76, 0.34),
      new THREE.Vector2(0, 0.36),
    ];
  return new THREE.LatheGeometry(points, 24);
}

function makeMaterial(THREE, options) {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.72,
    flatShading: true,
    ...options,
  });
}

function createSesameDecoration(THREE, material) {
  const geometry = new THREE.CapsuleGeometry(0.035, 0.1, 2, 5);
  const seeds = new THREE.InstancedMesh(geometry, material, 9);
  seeds.name = "top-bun-sesame";
  seeds.userData.foodDecoration = Object.freeze({ kind: "sesame", food: FOOD_ID });
  seeds.raycast = NO_RAYCAST;
  const dummy = new THREE.Object3D();
  const placements = [
    [-0.47, 0.82, -0.16, -0.35], [0, 0.91, -0.2, 0.15], [0.48, 0.81, -0.12, 0.45],
    [-0.7, 0.67, 0.2, 0.4], [-0.25, 0.86, 0.25, -0.2], [0.3, 0.84, 0.28, 0.25],
    [0.68, 0.66, 0.22, -0.5], [-0.38, 0.7, -0.48, 0.55], [0.38, 0.69, -0.46, -0.35],
  ];
  placements.forEach(([x, y, z, yaw], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(Math.PI / 2.5, yaw, 0.18 * Math.sin(index));
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    seeds.setMatrixAt(index, dummy.matrix);
  });
  seeds.instanceMatrix.needsUpdate = true;
  return seeds;
}

function polygonBoundaryRadius(perimeter, directionX, directionZ) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < perimeter.length; index += 1) {
    const [ax, az] = perimeter[index];
    const [bx, bz] = perimeter[(index + 1) % perimeter.length];
    const edgeX = bx - ax;
    const edgeZ = bz - az;
    const cross = directionX * edgeZ - directionZ * edgeX;
    if (Math.abs(cross) < 1e-8) continue;
    const rayDistance = (ax * edgeZ - az * edgeX) / cross;
    const edgeDistance = (ax * directionZ - az * directionX) / cross;
    if (rayDistance >= 0 && edgeDistance >= 0 && edgeDistance <= 1) {
      nearest = Math.min(nearest, rayDistance);
    }
  }
  if (!Number.isFinite(nearest)) throw new Error("Food footprint is not star-shaped");
  return nearest;
}

function lettuceOuterRadius(angle) {
  return 1.16 + 0.12 * Math.sin(angle * 7) + 0.05 * Math.cos(angle * 11);
}

function lettuceInnerRadius(angle) {
  return 0.34 + 0.035 * Math.cos(angle * 5);
}

function footprintBoundary(profile, angle) {
  if (profile.kind === "disc") return profile.radius;
  if (profile.kind === "polygon") {
    return polygonBoundaryRadius(profile.perimeter, Math.cos(angle), Math.sin(angle));
  }
  if (profile.kind === "annulus") return lettuceOuterRadius(angle);
  throw new Error(`Unknown food footprint: ${profile.kind}`);
}

function clampLocalFootprint(profile, x, z) {
  const angle = Math.hypot(x, z) < 1e-8 ? 0 : Math.atan2(z, x);
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  const outer = footprintBoundary(profile, angle) * profile.margin;
  const inner = profile.kind === "annulus"
    ? lettuceInnerRadius(angle) + LETTUCE_INNER_CLEARANCE
    : 0;
  const distance = Math.min(outer, Math.max(inner, Math.hypot(x, z)));
  return [directionX * distance, directionZ * distance];
}

function projectNormalizedFootprint(profile, normalizedX, normalizedZ) {
  const normalizedDistance = Math.min(1, Math.hypot(normalizedX, normalizedZ));
  const angle = normalizedDistance < 1e-8 ? 0 : Math.atan2(normalizedZ, normalizedX);
  const outer = footprintBoundary(profile, angle) * profile.margin;
  const inner = profile.kind === "annulus"
    ? lettuceInnerRadius(angle) + LETTUCE_INNER_CLEARANCE
    : 0;
  const distance = inner + normalizedDistance * (outer - inner);
  return [Math.cos(angle) * distance, Math.sin(angle) * distance];
}

function segmentEntersLettuceHole(start, end) {
  for (let step = 0; step <= 16; step += 1) {
    const progress = step / 16;
    const x = start.x + (end.x - start.x) * progress;
    const z = start.z + (end.z - start.z) * progress;
    const angle = Math.hypot(x, z) < 1e-8 ? 0 : Math.atan2(z, x);
    if (Math.hypot(x, z) < lettuceInnerRadius(angle) + LETTUCE_INNER_CLEARANCE + 0.01) {
      return true;
    }
  }
  return false;
}

function preferredAnnularDelta(startAngle, endAngle, coincident) {
  if (coincident) return Math.PI / 3;
  let delta = Math.atan2(
    Math.sin(endAngle - startAngle),
    Math.cos(endAngle - startAngle),
  );
  if (Math.abs(Math.abs(delta) - Math.PI) < 1e-6) {
    const positiveMidpoint = startAngle + Math.PI / 2;
    const negativeMidpoint = startAngle - Math.PI / 2;
    const score = (angle) => Math.sin(angle) * 2 + Math.cos(angle);
    delta = score(positiveMidpoint) >= score(negativeMidpoint) ? Math.PI : -Math.PI;
  }
  return delta;
}

function routeLettucePath(THREE, points) {
  const routed = [points[0].clone()];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (segmentEntersLettuceHole(start, end)) {
      const coincident = start.distanceToSquared(end) < 1e-10;
      const startAngle = Math.atan2(start.z, start.x);
      const endAngle = Math.atan2(end.z, end.x);
      const delta = preferredAnnularDelta(startAngle, endAngle, coincident);
      for (const progress of [1 / 3, 2 / 3]) {
        const angle = startAngle + delta * progress;
        const radius = lettuceInnerRadius(angle) + LETTUCE_INNER_CLEARANCE + 0.025;
        routed.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        ));
      }
    }
    routed.push(end.clone());
  }
  return routed;
}

function ensureNonDegeneratePath(THREE, points, profile) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += points[index - 1].distanceTo(points[index]);
  }
  if (length > 1e-5) return points;
  const first = points[0];
  let candidate;
  if (profile.kind === "annulus") {
    const angle = Math.atan2(first.z, first.x) + 0.12;
    const radius = Math.max(
      Math.hypot(first.x, first.z),
      lettuceInnerRadius(angle) + LETTUCE_INNER_CLEARANCE + 0.025,
    );
    candidate = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  } else {
    const [x, z] = clampLocalFootprint(profile, first.x + 0.045, first.z);
    candidate = new THREE.Vector3(x, 0, z);
    if (candidate.distanceToSquared(first) < 1e-10) {
      const [fallbackX, fallbackZ] = clampLocalFootprint(profile, first.x - 0.045, first.z);
      candidate.set(fallbackX, 0, fallbackZ);
    }
  }
  return [points[0], candidate, ...points.slice(1)];
}

function buildLayerDefinitions(THREE) {
  const bunMaterial = makeMaterial(THREE, {
    color: 0xd98a36,
    roughness: 0.62,
  });
  const pattyMaterial = makeMaterial(THREE, {
    color: 0x63321f,
    roughness: 0.92,
  });
  const cheeseMaterial = makeMaterial(THREE, {
    color: 0xf3bd2f,
    roughness: 0.52,
  });
  const tomatoMaterial = makeMaterial(THREE, {
    color: 0xd8422f,
    roughness: 0.6,
    clearcoat: 0.12,
  });
  const lettuceMaterial = makeMaterial(THREE, {
    color: 0x62a83d,
    roughness: 0.78,
  });
  const pickleMaterial = makeMaterial(THREE, {
    color: 0x769d35,
    roughness: 0.66,
    clearcoat: 0.08,
  });
  const sesameMaterial = makeMaterial(THREE, {
    color: 0xf3d38a,
    roughness: 0.74,
  });
  const bottomBun = createBunGeometry(THREE, false);
  const patty = displaceCylinder(new THREE.CylinderGeometry(1.15, 1.18, 0.34, 26, 2), 0.035, 7, 0.4);
  const cheese = createCheeseGeometry(THREE);
  const tomato = displaceCylinder(new THREE.CylinderGeometry(1.02, 1.04, 0.2, 24, 1), 0.012, 6, 0.9);
  const lettuce = createLettuceGeometry(THREE);
  const pickle = displaceCylinder(new THREE.CylinderGeometry(0.84, 0.86, 0.18, 22, 1), 0.018, 5, 1.2);
  const topBun = createBunGeometry(THREE, true);
  return {
    definitions: [
      {
        id: "bottom-bun", geometry: bottomBun, material: bunMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 1.22, margin: 0.88 }),
      },
      {
        id: "patty", geometry: patty, material: pattyMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 1.15, margin: 0.88 }),
      },
      {
        id: "cheese", geometry: cheese, material: cheeseMaterial,
        footprint: Object.freeze({ kind: "polygon", perimeter: CHEESE_PERIMETER, margin: 0.88 }),
      },
      {
        id: "tomato", geometry: tomato, material: tomatoMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 1.02, margin: 0.88 }),
      },
      {
        id: "lettuce", geometry: lettuce, material: lettuceMaterial,
        footprint: Object.freeze({ kind: "annulus", margin: 0.86 }),
      },
      {
        id: "pickle", geometry: pickle, material: pickleMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 0.84, margin: 0.88 }),
      },
      {
        id: "top-bun", geometry: topBun, material: bunMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 1.23, margin: 0.88 }),
      },
    ],
    sesameMaterial,
  };
}

function detachStroke(stroke) {
  return {
    sauce: stroke.sauce,
    layerId: stroke.layerId,
    amount: stroke.amount,
    points: stroke.points.map((point) => [...point]),
  };
}

export function createBurgerModel3D(THREE, options = {}) {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.BufferGeometry) {
    throw new TypeError("A compatible Three.js namespace is required");
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }

  const root = new THREE.Group();
  root.name = "food:burger";
  root.userData.foodModel = Object.freeze({ food: FOOD_ID, version: 1 });
  root.userData.biteAmount = 0;

  const { definitions, sesameMaterial } = buildLayerDefinitions(THREE);
  const layers = new Map();
  const surfacesById = new Map();
  const footprintsById = new Map();
  const projectionMeshesById = new Map();
  const surfaceBoundsById = new Map();
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const biteSources = new Map();
  const biteThresholdsById = new Map();
  const projectionMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  ownedMaterials.add(projectionMaterial);

  for (const definition of definitions) {
    const group = new THREE.Group();
    group.name = `food-layer:${definition.id}`;
    group.userData.foodLayer = Object.freeze({ food: FOOD_ID, layerId: definition.id });
    const surface = new THREE.Mesh(definition.geometry, definition.material);
    surface.name = `food-layer:${definition.id}:surface`;
    surface.castShadow = true;
    surface.receiveShadow = true;
    surface.userData.cookingSelectable = Object.freeze({
      kind: "food-layer",
      food: FOOD_ID,
      layerId: definition.id,
    });
    definition.geometry.computeBoundingBox();
    definition.geometry.computeBoundingSphere();
    const bounds = definition.geometry.boundingBox;
    surfaceBoundsById.set(definition.id, bounds.clone());
    group.userData.halfHeight = (bounds.max.y - bounds.min.y) / 2;
    group.userData.surfaceY = bounds.max.y + 0.025;
    group.userData.surfaceRadius = Math.max(
      Math.abs(bounds.min.x), Math.abs(bounds.max.x),
      Math.abs(bounds.min.z), Math.abs(bounds.max.z),
    );
    group.userData.surfaceProfile = definition.footprint;
    group.userData.selectableSurface = surface;
    group.add(surface);
    root.add(group);
    layers.set(definition.id, group);
    surfacesById.set(definition.id, surface);
    footprintsById.set(definition.id, definition.footprint);
    const projectionGeometry = definition.geometry.clone();
    const projectionMesh = new THREE.Mesh(projectionGeometry, projectionMaterial);
    projectionMesh.updateMatrixWorld(true);
    projectionMeshesById.set(definition.id, projectionMesh);
    ownedGeometries.add(definition.geometry);
    ownedGeometries.add(projectionGeometry);
    ownedMaterials.add(definition.material);
    const biteSource = {
      positions: Float32Array.from(definition.geometry.attributes.position.array),
      normals: Float32Array.from(definition.geometry.attributes.normal.array),
    };
    biteSources.set(definition.geometry, biteSource);
    let maxRadius = 0;
    for (let index = 0; index < biteSource.positions.length; index += 3) {
      maxRadius = Math.max(maxRadius, Math.abs(biteSource.positions[index]));
    }
    biteThresholdsById.set(definition.id, maxRadius * 0.12);
  }

  const sesame = createSesameDecoration(THREE, sesameMaterial);
  layers.get("top-bun").add(sesame);
  ownedGeometries.add(sesame.geometry);
  ownedMaterials.add(sesameMaterial);

  const sauceMaterials = new Map(SAUCE_KEYS.map((sauce) => {
    const material = makeMaterial(THREE, {
      color: SAUCE_COLORS[sauce],
      roughness: sauce === "sticky" ? 0.38 : 0.46,
      clearcoat: sauce === "sticky" ? 0.3 : 0.2,
    });
    ownedMaterials.add(material);
    return [sauce, material];
  }));

  let order = [...BURGER_LAYER_IDS];
  let expanded = false;
  let disposed = false;
  const sauceEntries = [];
  const projectionRaycaster = new THREE.Raycaster();
  const projectionDirection = new THREE.Vector3(0, -1, 0);

  const applyStackHeights = ({ snapHorizontal = false, snapRotation = false } = {}) => {
    let cursorY = 0;
    order.forEach((id, index) => {
      const layer = layers.get(id);
      const halfHeight = layer.userData.halfHeight;
      const y = cursorY + halfHeight + (expanded ? index * EXPANDED_GAP : 0);
      layer.position.y = y;
      layer.userData.stackY = y;
      if (snapHorizontal) {
        layer.position.x = 0;
        layer.position.z = 0;
      }
      if (snapRotation) layer.rotation.set(0, 0, 0);
      cursorY += halfHeight * 2 - COLLAPSED_OVERLAP;
    });
  };
  applyStackHeights({ snapHorizontal: true, snapRotation: true });

  const getLayer = (layerId) => {
    assertActive(disposed);
    assertLayerId(layerId);
    return layers.get(layerId);
  };

  const disposeSauceEntry = (entry) => {
    entry.mesh.removeFromParent();
    entry.mesh.geometry.dispose();
  };

  const biteX = (sourceX, amount, threshold) => {
    if (sourceX <= threshold) return sourceX;
    // A shared piecewise-affine clip keeps every point on the food and its sauce in
    // the same surface mapping; varying this by height/depth can fold the bun mesh.
    return sourceX - amount * (sourceX - threshold) * 0.6;
  };

  const applyBiteToPoint = (layerId, source, amount, target = new THREE.Vector3()) => target.set(
    biteX(source.x, amount, biteThresholdsById.get(layerId)),
    source.y,
    source.z,
  );

  const projectBaseLocalPoint = (layerId, x, z) => {
    const profile = footprintsById.get(layerId);
    const maxY = surfaceBoundsById.get(layerId).max.y;
    for (let attempt = 0; attempt <= 20; attempt += 1) {
      const scale = 1 - attempt * 0.0425;
      const [clampedX, clampedZ] = clampLocalFootprint(profile, x * scale, z * scale);
      projectionRaycaster.set(
        new THREE.Vector3(clampedX, maxY + 1, clampedZ),
        projectionDirection,
      );
      const [hit] = projectionRaycaster.intersectObject(
        projectionMeshesById.get(layerId), false,
      );
      if (hit) return new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
    }
    throw new Error(`Cannot project sauce onto ${layerId} surface`);
  };

  const projectLocalPoint = (layerId, x, z) => applyBiteToPoint(
    layerId,
    projectBaseLocalPoint(layerId, x, z),
    root.userData.biteAmount,
  );

  const projectSurfacePoint = (layerId, point) => {
    assertActive(disposed);
    assertLayerId(layerId);
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError("Surface point must be an [x, z] pair");
    }
    const normalizedX = assertFinite(point[0], "point[0]");
    const normalizedZ = assertFinite(point[1], "point[1]");
    if (normalizedX < -1 || normalizedX > 1 || normalizedZ < -1 || normalizedZ > 1) {
      throw new TypeError("Surface point coordinates must be between -1 and 1");
    }
    const [x, z] = projectNormalizedFootprint(
      footprintsById.get(layerId),
      normalizedX,
      normalizedZ,
    );
    return projectLocalPoint(layerId, x, z);
  };

  const clearSauces = () => {
    assertActive(disposed);
    while (sauceEntries.length) disposeSauceEntry(sauceEntries.pop());
  };

  const applySauceBite = (entry, amount) => {
    const { geometry } = entry.mesh;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const { basePositions, baseNormals } = entry;
    entry.curveState.biteAmount = amount;
    if (amount === 0) {
      position.array.set(basePositions);
      normal.array.set(baseNormals);
      normal.needsUpdate = true;
    } else {
      const threshold = biteThresholdsById.get(entry.stroke.layerId);
      for (let index = 0; index < position.count; index += 1) {
        const offset = index * 3;
        const sourceX = basePositions[offset];
        const sourceY = basePositions[offset + 1];
        const sourceZ = basePositions[offset + 2];
        position.setXYZ(
          index,
          biteX(sourceX, amount, threshold),
          sourceY,
          sourceZ,
        );
      }
      geometry.computeVertexNormals();
    }
    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  };

  const createSauceEntry = (normalized, nameIndex) => {
    const profile = footprintsById.get(normalized.layerId);
    let pathPoints = normalized.points.map(([x, z]) => {
      const [localX, localZ] = projectNormalizedFootprint(
        profile, x, z,
      );
      return new THREE.Vector3(localX, 0, localZ);
    });
    if (profile.kind === "annulus") pathPoints = routeLettucePath(THREE, pathPoints);
    pathPoints = ensureNonDegeneratePath(THREE, pathPoints, profile);
    const planarCurve = new THREE.CatmullRomCurve3(pathPoints, false, "centripetal");
    const tubularSegments = Math.min(MAX_TUBE_SEGMENTS, Math.max(
      8,
      pathPoints.length - 1,
      (normalized.points.length - 1) * 3,
    ));
    const tubeRadius = 0.025 + normalized.amount * 0.035;
    const surfaceOffset = tubeRadius * 0.7;
    const curveState = { biteAmount: 0 };
    const surfaceCurve = new THREE.Curve();
    surfaceCurve.getPoint = (time, target = new THREE.Vector3()) => {
      const planar = planarCurve.getPoint(time, target);
      const surface = projectBaseLocalPoint(normalized.layerId, planar.x, planar.z);
      surface.y += surfaceOffset;
      return applyBiteToPoint(
        normalized.layerId, surface, curveState.biteAmount, target,
      );
    };
    // Keep TubeGeometry rings aligned with generated route controls. The inherited
    // arc-length remapping can skip an inner-rim waypoint on long alternating paths.
    surfaceCurve.getPointAt = surfaceCurve.getPoint;
    const tangentBefore = new THREE.Vector3();
    const tangentAfter = new THREE.Vector3();
    const coherentTangent = (time, target = new THREE.Vector3()) => {
      const delta = 1e-4;
      const beforeTime = Math.max(0, time - delta);
      const afterTime = Math.min(1, time + delta);
      surfaceCurve.getPoint(beforeTime, tangentBefore);
      surfaceCurve.getPoint(afterTime, tangentAfter);
      target.subVectors(tangentAfter, tangentBefore);
      if (target.lengthSq() < 1e-12) target.set(1, 0, 0);
      return target.normalize();
    };
    surfaceCurve.getTangent = coherentTangent;
    surfaceCurve.getTangentAt = coherentTangent;
    const geometry = new THREE.TubeGeometry(
      surfaceCurve, tubularSegments, tubeRadius, TUBE_RADIAL_SEGMENTS, false,
    );
    const mesh = new THREE.Mesh(geometry, sauceMaterials.get(normalized.sauce));
    mesh.name = `sauce:${normalized.sauce}:${normalized.layerId}:${nameIndex}`;
    mesh.castShadow = true;
    mesh.raycast = NO_RAYCAST;
    mesh.userData.sauceStroke = Object.freeze({
      sauce: normalized.sauce,
      layerId: normalized.layerId,
      amount: normalized.amount,
    });
    mesh.userData.surfaceOffset = surfaceOffset;
    mesh.userData.inputPointCount = normalized.points.length;
    mesh.userData.routePointCount = pathPoints.length;
    const entry = {
      mesh,
      stroke: normalized,
      curveState,
      basePositions: Float32Array.from(geometry.attributes.position.array),
      baseNormals: Float32Array.from(geometry.attributes.normal.array),
    };
    applySauceBite(entry, root.userData.biteAmount);
    return entry;
  };

  const stageSauceEntries = (strokes) => {
    const staged = [];
    try {
      strokes.forEach((stroke, index) => staged.push(createSauceEntry(stroke, index)));
      return staged;
    } catch (error) {
      for (const entry of staged) disposeSauceEntry(entry);
      throw error;
    }
  };

  const replaceSauceEntries = (replacements) => {
    const previous = sauceEntries.splice(0, sauceEntries.length, ...replacements);
    for (const entry of previous) entry.mesh.removeFromParent();
    for (const entry of replacements) layers.get(entry.stroke.layerId).add(entry.mesh);
    for (const entry of previous) disposeSauceEntry(entry);
  };

  const addSauceStroke = (stroke) => {
    assertActive(disposed);
    const normalized = validateStroke(stroke);
    const entry = createSauceEntry(normalized, sauceEntries.length);
    layers.get(normalized.layerId).add(entry.mesh);
    sauceEntries.push(entry);
    if (sauceEntries.length > MAX_STROKES) disposeSauceEntry(sauceEntries.shift());
    return entry.mesh;
  };

  const setLayerPose = (layerId, pose = {}) => {
    assertActive(disposed);
    const layer = getLayer(layerId);
    if (!pose || typeof pose !== "object" || Array.isArray(pose)) {
      throw new TypeError("pose must be an object");
    }
    const nextPosition = layer.position.clone();
    const nextRotation = layer.rotation.clone();
    setOptionalVector(nextPosition, pose.position, "pose.position");
    setOptionalVector(nextRotation, pose.rotation, "pose.rotation");
    if (Object.hasOwn(pose, "x")) nextPosition.x = assertFinite(pose.x, "pose.x");
    if (Object.hasOwn(pose, "z")) nextPosition.z = assertFinite(pose.z, "pose.z");
    if (Object.hasOwn(pose, "yaw")) nextRotation.y = assertFinite(pose.yaw, "pose.yaw");
    layer.position.copy(nextPosition);
    layer.rotation.copy(nextRotation);
    return layer;
  };

  const reorderLayer = (layerId, targetIndex) => {
    assertActive(disposed);
    assertLayerId(layerId);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= order.length) {
      throw new TypeError(`targetIndex must be an integer from 0 to ${order.length - 1}`);
    }
    const sourceIndex = order.indexOf(layerId);
    order.splice(sourceIndex, 1);
    order.splice(targetIndex, 0, layerId);
    applyStackHeights();
    return Object.freeze([...order]);
  };

  const snapLayer = (layerId, targetIndex) => {
    assertActive(disposed);
    if (targetIndex !== undefined) reorderLayer(layerId, targetIndex);
    const layer = getLayer(layerId);
    layer.position.set(0, layer.userData.stackY, 0);
    layer.rotation.set(0, 0, 0);
    return layer;
  };

  const getSnapshot = () => {
    assertActive(disposed);
    return {
      food: FOOD_ID,
      expanded,
      layerOrder: [...order],
      layerPoses: Object.fromEntries(BURGER_LAYER_IDS.map((id) => {
        const layer = layers.get(id);
        return [id, {
          x: layer.position.x,
          z: layer.position.z,
          yaw: layer.rotation.y,
        }];
      })),
      layerTransforms: Object.fromEntries(BURGER_LAYER_IDS.map((id) => {
        const layer = layers.get(id);
        return [id, {
          position: { x: layer.position.x, y: layer.position.y, z: layer.position.z },
          rotation: { x: layer.rotation.x, y: layer.rotation.y, z: layer.rotation.z },
        }];
      })),
      strokes: sauceEntries.map(({ stroke }) => detachStroke(stroke)),
      biteAmount: root.userData.biteAmount,
    };
  };

  const applyComposition = (composition) => {
    assertActive(disposed);
    assertExactKeys(composition, COMPOSITION_KEYS, "composition");
    if (composition.food !== FOOD_ID) throw new TypeError("composition.food must be burger");
    assertPermutation(composition.layerOrder);
    if (!composition.layerPoses || typeof composition.layerPoses !== "object"
      || Array.isArray(composition.layerPoses)) {
      throw new TypeError("composition.layerPoses must be an object");
    }
    const poseKeys = Object.keys(composition.layerPoses);
    if (poseKeys.length !== BURGER_LAYER_IDS.length
      || poseKeys.some((id) => !BURGER_LAYER_IDS.includes(id))) {
      throw new TypeError("composition.layerPoses must contain every burger layer exactly once");
    }
    if (!Array.isArray(composition.strokes)
      || composition.strokes.length < 1
      || composition.strokes.length > MAX_STROKES) {
      throw new TypeError(`composition.strokes must contain 1 to ${MAX_STROKES} strokes`);
    }
    const validatedPoses = Object.fromEntries(BURGER_LAYER_IDS.map((id) => {
      const pose = assertExactKeys(
        composition.layerPoses[id], POSE_KEYS, `composition.layerPoses.${id}`,
      );
      const x = assertFinite(pose.x, `composition.layerPoses.${id}.x`);
      const z = assertFinite(pose.z, `composition.layerPoses.${id}.z`);
      const yaw = assertFinite(pose.yaw, `composition.layerPoses.${id}.yaw`);
      if (x < -1 || x > 1 || z < -1 || z > 1 || yaw < -3.1416 || yaw > 3.1416) {
        throw new TypeError(`composition.layerPoses.${id} is outside server bounds`);
      }
      return [id, {
        x,
        z,
        yaw,
      }];
    }));
    const validatedStrokes = composition.strokes.map(validateStroke);
    const stagedSauces = stageSauceEntries(validatedStrokes);

    order = [...composition.layerOrder];
    applyStackHeights();
    for (const id of BURGER_LAYER_IDS) {
      const layer = layers.get(id);
      const pose = validatedPoses[id];
      layer.position.x = pose.x;
      layer.position.z = pose.z;
      layer.rotation.set(0, pose.yaw, 0);
    }
    replaceSauceEntries(stagedSauces);
    return getSnapshot();
  };

  const applyBiteGeometry = (normalizedAmount) => {
    for (const [layerId, surface] of surfacesById) {
      const geometry = surface.geometry;
      const source = biteSources.get(geometry);
      const position = geometry.attributes.position;
      const normal = geometry.attributes.normal;
      const threshold = biteThresholdsById.get(layerId);
      const biteScale = 1 - normalizedAmount * 0.6;
      if (normalizedAmount === 0) {
        position.array.set(source.positions);
        normal.array.set(source.normals);
      } else {
        for (let index = 0; index < position.count; index += 1) {
          const offset = index * 3;
          const sourceX = source.positions[offset];
          const sourceY = source.positions[offset + 1];
          const sourceZ = source.positions[offset + 2];
          position.setXYZ(index, biteX(sourceX, normalizedAmount, threshold), sourceY, sourceZ);
          let normalX = source.normals[offset];
          let normalY = source.normals[offset + 1];
          let normalZ = source.normals[offset + 2];
          if (sourceX > threshold) normalX /= biteScale;
          const normalLength = Math.hypot(normalX, normalY, normalZ);
          if (normalLength > 1e-12) {
            normalX /= normalLength;
            normalY /= normalLength;
            normalZ /= normalLength;
          } else {
            normalX = 0;
            normalY = 1;
            normalZ = 0;
          }
          normal.setXYZ(index, normalX, normalY, normalZ);
        }
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      surfaceBoundsById.get(layerId).copy(geometry.boundingBox);
    }
  };

  const setBiteAmount = (amount) => {
    assertActive(disposed);
    const normalizedAmount = assertFinite(amount, "biteAmount");
    if (normalizedAmount < 0 || normalizedAmount > 1) {
      throw new TypeError("biteAmount must be between 0 and 1");
    }
    const previousAmount = root.userData.biteAmount;
    if (normalizedAmount === previousAmount) return;
    applyBiteGeometry(normalizedAmount);
    for (const entry of sauceEntries) applySauceBite(entry, normalizedAmount);
    root.userData.biteAmount = normalizedAmount;
  };

  const selectableSurfaces = Object.freeze(BURGER_LAYER_IDS.map((id) => surfacesById.get(id)));
  const readonlyLayers = createReadonlyMapView(layers);
  const api = {
    root,
    layers: readonlyLayers,
    selectableSurfaces,
    noRaycast: NO_RAYCAST,
    getLayer,
    getLayerOrder() {
      assertActive(disposed);
      return Object.freeze([...order]);
    },
    setExpanded(value) {
      assertActive(disposed);
      expanded = Boolean(value);
      applyStackHeights();
      root.userData.expanded = expanded;
      return expanded;
    },
    setLayerPose,
    reorderLayer,
    snapLayer,
    applyComposition,
    projectSurfacePoint,
    addSauceStroke,
    clearSauces,
    setBiteAmount,
    getSnapshot,
    serializeComposition() {
      const snapshot = getSnapshot();
      return {
        food: snapshot.food,
        layerOrder: snapshot.layerOrder,
        layerPoses: snapshot.layerPoses,
        strokes: snapshot.strokes,
      };
    },
    dispose() {
      if (disposed) return;
      while (sauceEntries.length) disposeSauceEntry(sauceEntries.pop());
      disposed = true;
      root.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      ownedGeometries.clear();
      ownedMaterials.clear();
      layers.clear();
      surfacesById.clear();
      footprintsById.clear();
      projectionMeshesById.clear();
      surfaceBoundsById.clear();
      biteSources.clear();
      biteThresholdsById.clear();
    },
  };
  return api;
}
