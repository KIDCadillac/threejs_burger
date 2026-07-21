import { BURGER_LAYER_IDS, SAUCE_KEYS } from "./cooking-state.mjs";

const FOOD_ID = "burger";
const AVAILABLE_BURGER_INGREDIENT_IDS = Object.freeze([
  "bottom-bun",
  "patty",
  "cheese",
  "tomato",
  "lettuce",
  "pickle",
  "onion",
  "middle-bun",
  "top-bun",
]);
const AVAILABLE_SAUCE_IDS = Object.freeze([
  ...SAUCE_KEYS,
  "ketchup",
  "house-sauce",
]);
const MAX_STROKES = 64;
const MAX_POINTS = 24;
const COLLAPSED_OVERLAP = 0.035;
const EXPANDED_GAP = 0.42;
const NO_RAYCAST = () => {};
const LETTUCE_INNER_CLEARANCE = 0.075;
// Two stable inner-rim controls per crossing bound a 24-point route to 70 points.
// Four points across an open, surface-safe half-round ribbon keep the same six
// triangles per segment as the previous triangular tube while looking smoother.
const MAX_TUBE_SEGMENTS = 72;
const SAUCE_CROSS_SECTION_POINTS = 4;
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
  ketchup: 0xd9472f,
  "house-sauce": 0xf2b76b,
});

function assertActive(disposed) {
  if (disposed) throw new Error("Burger model is disposed");
}

function assertLayerId(layerId, ingredientIds = BURGER_LAYER_IDS) {
  if (!ingredientIds.includes(layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
  }
}

function normalizeIngredientIds(value) {
  if (value === undefined) return Object.freeze([...BURGER_LAYER_IDS]);
  if (!Array.isArray(value) || value.length < BURGER_LAYER_IDS.length) {
    throw new TypeError("options.ingredientIds must contain every legacy burger ingredient");
  }
  const uniqueIds = new Set(value);
  if (
    uniqueIds.size !== value.length
    || value.some((id) => !AVAILABLE_BURGER_INGREDIENT_IDS.includes(id))
    || BURGER_LAYER_IDS.some((id) => !uniqueIds.has(id))
  ) {
    throw new TypeError("options.ingredientIds must be unique known burger ingredients");
  }
  return Object.freeze([...value]);
}

function normalizeSauceIds(value) {
  if (value === undefined) return Object.freeze([...SAUCE_KEYS]);
  if (!Array.isArray(value) || value.length < 1) {
    throw new TypeError("options.sauceIds must contain at least one sauce");
  }
  const uniqueIds = new Set(value);
  if (
    uniqueIds.size !== value.length
    || value.some((id) => !AVAILABLE_SAUCE_IDS.includes(id))
  ) {
    throw new TypeError("options.sauceIds must be unique known sauces");
  }
  return Object.freeze([...value]);
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

function assertPermutation(order, ingredientIds = BURGER_LAYER_IDS) {
  if (!Array.isArray(order) || order.length !== ingredientIds.length) {
    throw new TypeError(`layerOrder must contain all ${ingredientIds.length} burger layers`);
  }
  if (new Set(order).size !== order.length || order.some((id) => !ingredientIds.includes(id))) {
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

function validateStroke(
  stroke,
  isKnownLayer = (layerId) => BURGER_LAYER_IDS.includes(layerId),
  sauceIds = SAUCE_KEYS,
) {
  assertExactKeys(stroke, STROKE_KEYS, "Sauce stroke");
  if (!sauceIds.includes(stroke.sauce)) {
    throw new TypeError(`Unknown sauce: ${String(stroke.sauce)}`);
  }
  if (!isKnownLayer(stroke.layerId)) {
    throw new TypeError(`Unknown burger layer: ${String(stroke.layerId)}`);
  }
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
  // Keep the edible body thin. The corners still droop for a soft-cheese silhouette,
  // but no single decorative tip is allowed to dictate the whole burger's spacing.
  for (const [x, z, corner] of perimeter) positions.push(x, corner ? 0.015 : 0.055, z);
  for (const [x, z, corner] of perimeter) positions.push(x, corner ? -0.085 : -0.045, z);
  positions.push(0, 0.055, 0, 0, -0.045, 0);
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
  const segments = 42;
  const positions = [];
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const outerRadius = 1.16 + 0.12 * Math.sin(angle * 7) + 0.05 * Math.cos(angle * 11);
    const innerRadius = 0.34 + 0.035 * Math.cos(angle * 5);
    const wave = 0.015 * Math.sin(angle * 6);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(outerRadius * cos, 0.03 + wave, outerRadius * sin);
    positions.push(innerRadius * cos, 0.024 - wave * 0.3, innerRadius * sin);
    positions.push(outerRadius * cos, -0.03 + wave, outerRadius * sin);
    positions.push(innerRadius * cos, -0.024 - wave * 0.3, innerRadius * sin);
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

function createOnionGeometry(THREE) {
  const positions = [];
  const indices = [];

  const appendFragment = ({
    x,
    z,
    angle,
    tangentHalf,
    radialHalf,
    yOffset = 0,
  }) => {
    const tangentX = -Math.sin(angle);
    const tangentZ = Math.cos(angle);
    const radialX = Math.cos(angle);
    const radialZ = Math.sin(angle);
    const localCorners = [
      [-tangentHalf * 0.78, -radialHalf],
      [tangentHalf * 0.78, -radialHalf],
      [tangentHalf, radialHalf],
      [-tangentHalf, radialHalf],
    ];
    const baseIndex = positions.length / 3;
    for (const y of [-0.055 + yOffset, 0.055 + yOffset]) {
      for (const [tangent, radial] of localCorners) {
        positions.push(
          x + tangentX * tangent + radialX * radial,
          y,
          z + tangentZ * tangent + radialZ * radial,
        );
      }
    }
    indices.push(
      baseIndex, baseIndex + 2, baseIndex + 1,
      baseIndex, baseIndex + 3, baseIndex + 2,
      baseIndex + 4, baseIndex + 5, baseIndex + 6,
      baseIndex + 4, baseIndex + 6, baseIndex + 7,
    );
    for (let edge = 0; edge < 4; edge += 1) {
      const next = (edge + 1) % 4;
      indices.push(
        baseIndex + edge,
        baseIndex + next,
        baseIndex + next + 4,
        baseIndex + edge,
        baseIndex + next + 4,
        baseIndex + edge + 4,
      );
    }
  };

  appendFragment({
    x: 0,
    z: 0,
    angle: Math.PI / 7,
    tangentHalf: 0.2,
    radialHalf: 0.14,
  });
  for (let index = 0; index < 9; index += 1) {
    const angle = index / 9 * Math.PI * 2 + 0.14;
    const radius = index % 2 ? 0.82 : 0.7;
    appendFragment({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      angle,
      tangentHalf: 0.2 + (index % 3) * 0.025,
      radialHalf: 0.11 + (index % 2) * 0.018,
      yOffset: ((index % 3) - 1) * 0.006,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
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
      new THREE.Vector2(0.42, -0.23),
      new THREE.Vector2(0.78, -0.21),
      new THREE.Vector2(1.06, -0.16),
      new THREE.Vector2(1.23, 0.08),
      new THREE.Vector2(1.22, 0.23),
      new THREE.Vector2(1.15, 0.38),
      new THREE.Vector2(1.05, 0.54),
      new THREE.Vector2(0.91, 0.67),
      new THREE.Vector2(0.74, 0.78),
      new THREE.Vector2(0.55, 0.86),
      new THREE.Vector2(0, 0.93),
    ]
    : [
      new THREE.Vector2(0, -0.2),
      new THREE.Vector2(0.5, -0.2),
      new THREE.Vector2(0.86, -0.18),
      new THREE.Vector2(1.12, -0.13),
      new THREE.Vector2(1.22, 0.05),
      new THREE.Vector2(1.13, 0.24),
      new THREE.Vector2(0.96, 0.3),
      new THREE.Vector2(0.76, 0.34),
      new THREE.Vector2(0, 0.36),
    ];
  return new THREE.LatheGeometry(points, 40);
}

function makeMaterial(THREE, options) {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.72,
    flatShading: false,
    ...options,
  });
}

function createSesameDecoration(THREE, material) {
  const geometry = new THREE.CapsuleGeometry(0.035, 0.1, 2, 5);
  const placements = Array.from({ length: 18 }, (_, index) => {
    const ring = index < 6 ? 0.38 : index < 13 ? 0.66 : 0.86;
    const ringIndex = index < 6 ? index : index < 13 ? index - 6 : index - 13;
    const ringCount = index < 6 ? 6 : index < 13 ? 7 : 5;
    const angle = ringIndex / ringCount * Math.PI * 2 + (index % 2) * 0.16;
    const x = Math.cos(angle) * ring;
    const z = Math.sin(angle) * ring * 0.82;
    const y = 0.92 - ring * ring * 0.33;
    return [x, y, z, angle + 0.35];
  });
  const seeds = new THREE.InstancedMesh(geometry, material, placements.length);
  seeds.name = "top-bun-sesame";
  seeds.userData.foodDecoration = Object.freeze({ kind: "sesame", food: FOOD_ID });
  seeds.raycast = NO_RAYCAST;
  const dummy = new THREE.Object3D();
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

function createInstancedFoodDetail(THREE, {
  geometry, material, kind, food, placements,
}) {
  const detail = new THREE.InstancedMesh(geometry, material, placements.length);
  detail.name = `food-detail:${food}:${kind}`;
  detail.userData.foodDecoration = Object.freeze({ kind, food: FOOD_ID, layerId: food });
  detail.raycast = NO_RAYCAST;
  const dummy = new THREE.Object3D();
  placements.forEach((placement, index) => {
    dummy.position.set(...placement.position);
    dummy.rotation.set(...(placement.rotation ?? [0, 0, 0]));
    dummy.scale.set(...(placement.scale ?? [1, 1, 1]));
    dummy.updateMatrix();
    detail.setMatrixAt(index, dummy.matrix);
  });
  detail.instanceMatrix.needsUpdate = true;
  return detail;
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

function createSurfaceSauceGeometry(
  THREE,
  { surfacePoints, surfaceNormals, radius, clearance, path },
) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];
  const framePoints = new Float32Array(surfacePoints.length * 3);
  const frameNormals = new Float32Array(surfaceNormals.length * 3);
  const previousSide = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const crossAngles = [Math.PI, Math.PI * 2 / 3, Math.PI / 3, 0];
  const width = radius * 1.18;
  const height = radius * 1.05;

  for (let frame = 0; frame < surfacePoints.length; frame += 1) {
    const point = surfacePoints[frame];
    const normal = surfaceNormals[frame].clone().normalize();
    if (normal.y < 0) normal.multiplyScalar(-1);
    const before = surfacePoints[Math.max(0, frame - 1)];
    const after = surfacePoints[Math.min(surfacePoints.length - 1, frame + 1)];
    tangent.subVectors(after, before);
    if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
    tangent.normalize();
    side.crossVectors(tangent, normal);
    if (side.lengthSq() < 1e-12) side.set(1, 0, 0);
    side.normalize();
    if (frame > 0 && side.dot(previousSide) < 0) side.multiplyScalar(-1);
    previousSide.copy(side);
    point.toArray(framePoints, frame * 3);
    normal.toArray(frameNormals, frame * 3);

    for (const angle of crossAngles) {
      vertex.copy(point)
        .addScaledVector(side, Math.cos(angle) * width)
        .addScaledVector(normal, clearance + Math.sin(angle) * height);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  }

  for (let frame = 0; frame < surfacePoints.length - 1; frame += 1) {
    const row = frame * SAUCE_CROSS_SECTION_POINTS;
    const next = row + SAUCE_CROSS_SECTION_POINTS;
    const a = new THREE.Vector3().fromArray(positions, row * 3);
    const c = new THREE.Vector3().fromArray(positions, next * 3);
    const d = new THREE.Vector3().fromArray(positions, (next + 1) * 3);
    const faceNormal = d.clone().sub(a).cross(c.clone().sub(a));
    const desiredNormal = surfaceNormals[frame].clone()
      .add(surfaceNormals[frame + 1])
      .normalize();
    const facesOutward = faceNormal.dot(desiredNormal) >= 0;
    for (let cross = 0; cross < SAUCE_CROSS_SECTION_POINTS - 1; cross += 1) {
      if (facesOutward) {
        indices.push(row + cross, next + cross + 1, next + cross);
        indices.push(row + cross, row + cross + 1, next + cross + 1);
      } else {
        indices.push(row + cross, next + cross, next + cross + 1);
        indices.push(row + cross, next + cross + 1, row + cross + 1);
      }
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.sauceShape = "surface-ribbon";
  geometry.userData.sauceSegments = surfacePoints.length - 1;
  geometry.userData.sauceCrossSectionPoints = SAUCE_CROSS_SECTION_POINTS;
  geometry.userData.surfaceFramePoints = framePoints;
  geometry.userData.surfaceFrameNormals = frameNormals;
  geometry.parameters = Object.freeze({
    path,
    tubularSegments: surfacePoints.length - 1,
    radialSegments: SAUCE_CROSS_SECTION_POINTS - 1,
    radius,
  });
  return geometry;
}

function buildLayerDefinitions(THREE) {
  const bunMaterial = makeMaterial(THREE, {
    color: 0xd98a36,
    roughness: 0.54,
    clearcoat: 0.08,
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
  const onionMaterial = makeMaterial(THREE, {
    color: 0xe7d5ee,
    roughness: 0.5,
    clearcoat: 0.16,
    clearcoatRoughness: 0.5,
  });
  const sesameMaterial = makeMaterial(THREE, {
    color: 0xf3d38a,
    roughness: 0.74,
  });
  const bottomBun = createBunGeometry(THREE, false);
  const patty = displaceCylinder(new THREE.CylinderGeometry(1.15, 1.18, 0.34, 42, 3), 0.028, 7, 0.4);
  const cheese = createCheeseGeometry(THREE);
  const tomato = displaceCylinder(new THREE.CylinderGeometry(1.02, 1.04, 0.2, 40, 2), 0.01, 6, 0.9);
  const lettuce = createLettuceGeometry(THREE);
  const pickle = displaceCylinder(new THREE.CylinderGeometry(0.84, 0.86, 0.18, 40, 2), 0.014, 5, 1.2);
  const onion = createOnionGeometry(THREE);
  const middleBun = displaceCylinder(
    new THREE.CylinderGeometry(1.13, 1.16, 0.3, 42, 3),
    0.012,
    7,
    0.55,
  );
  const topBun = createBunGeometry(THREE, true);
  return {
    definitions: [
      {
        id: "bottom-bun", geometry: bottomBun, material: bunMaterial,
        stackContact: Object.freeze({ maxY: 0.285 }),
        footprint: Object.freeze({ kind: "disc", radius: 1.22, margin: 0.88 }),
      },
      {
        id: "patty", geometry: patty, material: pattyMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 1.15, margin: 0.88 }),
      },
      {
        id: "cheese", geometry: cheese, material: cheeseMaterial,
        stackContact: Object.freeze({ minY: -0.044, maxY: 0.054 }),
        footprint: Object.freeze({ kind: "polygon", perimeter: CHEESE_PERIMETER, margin: 0.88 }),
      },
      {
        id: "tomato", geometry: tomato, material: tomatoMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 1.02, margin: 0.88 }),
      },
      {
        id: "lettuce", geometry: lettuce, material: lettuceMaterial,
        stackContact: Object.freeze({ minY: -0.028, maxY: 0.028 }),
        footprint: Object.freeze({ kind: "annulus", margin: 0.86 }),
      },
      {
        id: "pickle", geometry: pickle, material: pickleMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 0.84, margin: 0.88 }),
      },
      {
        id: "onion", geometry: onion, material: onionMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 0.94, margin: 0.86 }),
      },
      {
        id: "middle-bun", geometry: middleBun, material: bunMaterial,
        footprint: Object.freeze({ kind: "disc", radius: 1.13, margin: 0.88 }),
      },
      {
        id: "top-bun", geometry: topBun, material: bunMaterial,
        stackContact: Object.freeze({ minY: -0.14 }),
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
  const onSauceGeometry = options.onSauceGeometry;
  if (onSauceGeometry !== undefined && typeof onSauceGeometry !== "function") {
    throw new TypeError("options.onSauceGeometry must be a function");
  }
  const ingredientIds = normalizeIngredientIds(options.ingredientIds);
  const sauceIds = normalizeSauceIds(options.sauceIds);

  const root = new THREE.Group();
  root.name = "food:burger";
  root.userData.foodModel = Object.freeze({ food: FOOD_ID, version: 1 });
  root.userData.biteAmount = 0;

  const { definitions: availableDefinitions, sesameMaterial } = buildLayerDefinitions(THREE);
  const definitionsById = new Map(availableDefinitions.map((definition) => [definition.id, definition]));
  const definitions = ingredientIds.map((id) => definitionsById.get(id));
  const layers = new Map();
  const ingredientByLayerId = new Map();
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
  for (const definition of availableDefinitions) {
    ownedGeometries.add(definition.geometry);
    ownedMaterials.add(definition.material);
  }

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
    group.userData.boundsMinY = bounds.min.y;
    group.userData.boundsMaxY = bounds.max.y;
    const stackMinY = definition.stackContact?.minY ?? bounds.min.y;
    const stackMaxY = definition.stackContact?.maxY ?? bounds.max.y;
    if (
      !Number.isFinite(stackMinY)
      || !Number.isFinite(stackMaxY)
      || stackMinY < bounds.min.y
      || stackMaxY > bounds.max.y
      || stackMaxY <= stackMinY
    ) {
      throw new RangeError(`Invalid stack contact planes for ${definition.id}`);
    }
    group.userData.stackMinY = stackMinY;
    group.userData.stackMaxY = stackMaxY;
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
    ingredientByLayerId.set(definition.id, definition.id);
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

  const feedbackGeometry = surfacesById.get(ingredientIds[0]).geometry;
  const selectionOutlineMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe6a0,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  });
  const selectionFeedback = new THREE.Group();
  selectionFeedback.name = "food-layer:selection-feedback";
  selectionFeedback.userData.kind = "selection-shell";
  selectionFeedback.visible = false;
  const selectionOutline = new THREE.Mesh(feedbackGeometry, selectionOutlineMaterial);
  selectionOutline.scale.setScalar(1.055);
  for (const mesh of [selectionOutline]) {
    mesh.renderOrder = 20;
    mesh.raycast = NO_RAYCAST;
    selectionFeedback.add(mesh);
  }
  ownedMaterials.add(selectionOutlineMaterial);

  const dropPreviewFillMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd261,
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  });
  const dropPreview = new THREE.Group();
  dropPreview.name = "food-layer:drop-preview";
  dropPreview.userData.kind = "insertion-preview";
  dropPreview.visible = false;
  dropPreview.raycast = NO_RAYCAST;
  const dropPreviewFill = new THREE.Mesh(feedbackGeometry, dropPreviewFillMaterial);
  dropPreviewFill.scale.setScalar(1.025);
  for (const mesh of [dropPreviewFill]) {
    mesh.renderOrder = 19;
    mesh.raycast = NO_RAYCAST;
    dropPreview.add(mesh);
  }
  ownedMaterials.add(dropPreviewFillMaterial);

  const sesame = createSesameDecoration(THREE, sesameMaterial);
  layers.get("top-bun").add(sesame);
  ownedGeometries.add(sesame.geometry);
  ownedMaterials.add(sesameMaterial);

  const detailMaterials = {
    toast: makeMaterial(THREE, { color: 0xa85b27, roughness: 0.7 }),
    char: makeMaterial(THREE, { color: 0x32170f, roughness: 0.94 }),
    seed: makeMaterial(THREE, { color: 0xffe5a0, roughness: 0.6 }),
    vein: makeMaterial(THREE, { color: 0x3e762d, roughness: 0.78 }),
  };
  Object.values(detailMaterials).forEach((material) => ownedMaterials.add(material));

  if (layers.has("middle-bun")) {
    const toastFaceGeometry = new THREE.CircleGeometry(0.94, 40);
    for (const [face, y, rotationX] of [
      ["top", 0.152, -Math.PI / 2],
      ["bottom", -0.152, Math.PI / 2],
    ]) {
      const toastFace = new THREE.Mesh(toastFaceGeometry, detailMaterials.toast);
      toastFace.name = `food-detail:middle-bun:toast-${face}`;
      toastFace.userData.foodDecoration = Object.freeze({
        kind: "middle-bun-toast",
        food: FOOD_ID,
        layerId: "middle-bun",
        face,
      });
      toastFace.position.y = y;
      toastFace.rotation.x = rotationX;
      toastFace.raycast = NO_RAYCAST;
      layers.get("middle-bun").add(toastFace);
    }
    ownedGeometries.add(toastFaceGeometry);
  }

  const toastGeometry = new THREE.TorusGeometry(1.105, 0.035, 5, 32);
  const toastBand = new THREE.Mesh(toastGeometry, detailMaterials.toast);
  toastBand.name = "food-detail:top-bun:bun-toast";
  toastBand.userData.foodDecoration = Object.freeze({
    kind: "bun-toast", food: FOOD_ID, layerId: "top-bun",
  });
  toastBand.rotation.x = Math.PI / 2;
  toastBand.position.y = 0.04;
  toastBand.raycast = NO_RAYCAST;
  layers.get("top-bun").add(toastBand);
  ownedGeometries.add(toastGeometry);

  const charGeometry = new THREE.BoxGeometry(0.42, 0.018, 0.045);
  const pattyChar = createInstancedFoodDetail(THREE, {
    geometry: charGeometry,
    material: detailMaterials.char,
    kind: "patty-char",
    food: "patty",
    placements: Array.from({ length: 7 }, (_, index) => {
      const angle = index / 7 * Math.PI * 2 + 0.18;
      const radius = index % 2 ? 0.58 : 0.78;
      return {
        position: [Math.cos(angle) * radius, 0.185, Math.sin(angle) * radius],
        rotation: [0, angle + Math.PI / 3, 0],
      };
    }),
  });
  layers.get("patty").add(pattyChar);
  ownedGeometries.add(charGeometry);

  const seedGeometry = new THREE.CapsuleGeometry(0.027, 0.075, 2, 4);
  const radialSeeds = (count, y, radius) => Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2 + (index % 2) * 0.12;
    const distance = radius * (index % 3 === 0 ? 0.54 : 0.78);
    return {
      position: [Math.cos(angle) * distance, y, Math.sin(angle) * distance],
      rotation: [Math.PI / 2, angle + 0.25, 0],
      scale: [1, 1, index % 2 ? 0.9 : 1.08],
    };
  });
  const tomatoSeeds = createInstancedFoodDetail(THREE, {
    geometry: seedGeometry,
    material: detailMaterials.seed,
    kind: "tomato-seed",
    food: "tomato",
    placements: radialSeeds(12, 0.115, 0.78),
  });
  const pickleSeeds = createInstancedFoodDetail(THREE, {
    geometry: seedGeometry,
    material: detailMaterials.seed,
    kind: "pickle-seed",
    food: "pickle",
    placements: radialSeeds(10, 0.105, 0.62),
  });
  layers.get("tomato").add(tomatoSeeds);
  layers.get("pickle").add(pickleSeeds);
  ownedGeometries.add(seedGeometry);

  const veinGeometry = new THREE.BoxGeometry(0.48, 0.016, 0.025);
  const lettuceVeins = createInstancedFoodDetail(THREE, {
    geometry: veinGeometry,
    material: detailMaterials.vein,
    kind: "lettuce-vein",
    food: "lettuce",
    placements: Array.from({ length: 11 }, (_, index) => {
      const angle = index / 11 * Math.PI * 2;
      return {
        position: [Math.cos(angle) * 0.73, 0.044, Math.sin(angle) * 0.73],
        rotation: [0, -angle, 0],
        scale: [0.85 + (index % 3) * 0.08, 1, 1],
      };
    }),
  });
  layers.get("lettuce").add(lettuceVeins);
  ownedGeometries.add(veinGeometry);

  const sauceMaterials = new Map(sauceIds.map((sauce) => {
    const material = makeMaterial(THREE, {
      color: SAUCE_COLORS[sauce],
      roughness: sauce === "sticky" ? 0.24 : 0.32,
      clearcoat: sauce === "sticky" ? 0.72 : 0.58,
      clearcoatRoughness: 0.22,
    });
    ownedMaterials.add(material);
    return [sauce, material];
  }));

  let order = [...ingredientIds];
  let expanded = false;
  let disposed = false;
  const sauceEntries = [];
  const previewEntriesByKey = new Map();
  const projectionRaycaster = new THREE.Raycaster();
  const projectionDirection = new THREE.Vector3(0, -1, 0);

  const applyStackHeights = ({ snapHorizontal = false, snapRotation = false } = {}) => {
    let cursorY = 0;
    order.forEach((id, index) => {
      const layer = layers.get(id);
      const scaleY = layer.scale.y;
      const minY = layer.userData.stackMinY * scaleY;
      const maxY = layer.userData.stackMaxY * scaleY;
      const y = cursorY - minY + (expanded ? index * EXPANDED_GAP : 0);
      layer.position.y = y;
      layer.userData.stackY = y;
      if (snapHorizontal) {
        layer.position.x = 0;
        layer.position.z = 0;
      }
      if (snapRotation) layer.rotation.set(0, 0, 0);
      cursorY += maxY - minY - COLLAPSED_OVERLAP;
    });
  };
  applyStackHeights({ snapHorizontal: true, snapRotation: true });

  const getLayer = (layerId) => {
    assertActive(disposed);
    if (!layers.has(layerId)) {
      throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
    }
    return layers.get(layerId);
  };

  const ingredientFor = (layerId) => {
    const ingredientId = ingredientByLayerId.get(layerId);
    if (!ingredientId) throw new TypeError(`Unknown burger layer: ${String(layerId)}`);
    return ingredientId;
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
    biteX(source.x, amount, biteThresholdsById.get(ingredientFor(layerId))),
    source.y,
    source.z,
  );

  const projectBaseSurface = (layerId, x, z) => {
    const ingredientId = ingredientFor(layerId);
    const profile = footprintsById.get(ingredientId);
    const maxY = surfaceBoundsById.get(ingredientId).max.y;
    for (let attempt = 0; attempt <= 20; attempt += 1) {
      const scale = 1 - attempt * 0.0425;
      const [clampedX, clampedZ] = clampLocalFootprint(profile, x * scale, z * scale);
      projectionRaycaster.set(
        new THREE.Vector3(clampedX, maxY + 1, clampedZ),
        projectionDirection,
      );
      const [hit] = projectionRaycaster.intersectObject(
        projectionMeshesById.get(ingredientId), false,
      );
      if (hit) {
        const normal = hit.face?.normal?.clone?.() ?? new THREE.Vector3(0, 1, 0);
        normal.normalize();
        if (normal.y < 0) normal.multiplyScalar(-1);
        return {
          point: new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z),
          normal,
        };
      }
    }
    throw new Error(`Cannot project sauce onto ${layerId} surface`);
  };

  const projectBaseLocalPoint = (layerId, x, z) => projectBaseSurface(layerId, x, z).point;

  const projectLocalPoint = (layerId, x, z) => applyBiteToPoint(
    layerId,
    projectBaseLocalPoint(layerId, x, z),
    root.userData.biteAmount,
  );

  const projectSurfacePoint = (layerId, point) => {
    assertActive(disposed);
    const ingredientId = ingredientFor(layerId);
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError("Surface point must be an [x, z] pair");
    }
    const normalizedX = assertFinite(point[0], "point[0]");
    const normalizedZ = assertFinite(point[1], "point[1]");
    if (normalizedX < -1 || normalizedX > 1 || normalizedZ < -1 || normalizedZ > 1) {
      throw new TypeError("Surface point coordinates must be between -1 and 1");
    }
    const [x, z] = projectNormalizedFootprint(
      footprintsById.get(ingredientId),
      normalizedX,
      normalizedZ,
    );
    return projectLocalPoint(layerId, x, z);
  };

  const clearSauces = () => {
    assertActive(disposed);
    while (sauceEntries.length) disposeSauceEntry(sauceEntries.pop());
    for (const entry of previewEntriesByKey.values()) disposeSauceEntry(entry);
    previewEntriesByKey.clear();
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
      const threshold = biteThresholdsById.get(ingredientFor(entry.stroke.layerId));
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

  const createSauceEntry = (normalized, nameIndex, previewKey = null) => {
    const profile = footprintsById.get(ingredientFor(normalized.layerId));
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
    const surfaceClearance = 0.012;
    const surfaceOffset = tubeRadius + surfaceClearance;
    const curveState = { biteAmount: 0 };
    const surfaceCurve = new THREE.Curve();
    surfaceCurve.getPoint = (time, target = new THREE.Vector3()) => {
      const planar = planarCurve.getPoint(time, target);
      const { point: surface, normal } = projectBaseSurface(
        normalized.layerId, planar.x, planar.z,
      );
      surface.addScaledVector(normal, surfaceOffset);
      return applyBiteToPoint(
        normalized.layerId, surface, curveState.biteAmount, target,
      );
    };
    // Keep TubeGeometry rings aligned with generated route controls. The inherited
    // arc-length remapping can skip an inner-rim waypoint on long alternating paths.
    surfaceCurve.getPointAt = surfaceCurve.getPoint;
    const surfacePoints = [];
    const surfaceNormals = [];
    for (let segment = 0; segment <= tubularSegments; segment += 1) {
      const planar = planarCurve.getPoint(segment / tubularSegments, new THREE.Vector3());
      const { point, normal } = projectBaseSurface(normalized.layerId, planar.x, planar.z);
      surfacePoints.push(point);
      surfaceNormals.push(normal);
    }
    let geometry = createSurfaceSauceGeometry(THREE, {
      surfacePoints,
      surfaceNormals,
      radius: tubeRadius,
      clearance: surfaceClearance,
      path: surfaceCurve,
    });
    try {
      onSauceGeometry?.(geometry);
    } catch (error) {
      geometry.dispose();
      geometry = null;
      throw error;
    }
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
    mesh.userData.surfaceClearance = surfaceClearance;
    mesh.userData.tubeRadius = tubeRadius;
    mesh.userData.preview = previewKey !== null;
    if (previewKey !== null) mesh.userData.previewKey = previewKey;
    mesh.userData.inputPointCount = normalized.points.length;
    mesh.userData.routePointCount = pathPoints.length;
    const entry = {
      mesh,
      stroke: normalized,
      previewKey,
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
    for (const entry of previewEntriesByKey.values()) disposeSauceEntry(entry);
    previewEntriesByKey.clear();
    const previous = sauceEntries.splice(0, sauceEntries.length, ...replacements);
    for (const entry of previous) entry.mesh.removeFromParent();
    for (const entry of replacements) layers.get(entry.stroke.layerId).add(entry.mesh);
    for (const entry of previous) disposeSauceEntry(entry);
  };

  const addSauceStroke = (stroke) => {
    assertActive(disposed);
    const normalized = validateStroke(stroke, (layerId) => layers.has(layerId), sauceIds);
    const entry = createSauceEntry(normalized, sauceEntries.length);
    layers.get(normalized.layerId).add(entry.mesh);
    sauceEntries.push(entry);
    if (sauceEntries.length > MAX_STROKES) disposeSauceEntry(sauceEntries.shift());
    return entry.mesh;
  };

  const assertPreviewIdentifier = (value, label) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
  };

  const previewSauceStroke = (previewKey, stroke) => {
    assertActive(disposed);
    const key = assertPreviewIdentifier(previewKey, "previewKey");
    const normalized = validateStroke(stroke, (layerId) => layers.has(layerId), sauceIds);
    const next = createSauceEntry(normalized, `preview:${key}`, key);
    layers.get(normalized.layerId).add(next.mesh);
    const previous = previewEntriesByKey.get(key);
    previewEntriesByKey.set(key, next);
    if (previous) disposeSauceEntry(previous);
    return next.mesh;
  };

  const matchingPreviewEntries = (gestureId) => {
    const id = assertPreviewIdentifier(gestureId, "gestureId");
    const prefix = `${id}:`;
    return [...previewEntriesByKey.entries()].filter(([key]) => key.startsWith(prefix));
  };

  const commitSaucePreviews = (gestureId) => {
    assertActive(disposed);
    const matches = matchingPreviewEntries(gestureId);
    const meshes = [];
    for (const [key, entry] of matches) {
      previewEntriesByKey.delete(key);
      entry.previewKey = null;
      entry.mesh.userData.preview = false;
      delete entry.mesh.userData.previewKey;
      sauceEntries.push(entry);
      meshes.push(entry.mesh);
      if (sauceEntries.length > MAX_STROKES) disposeSauceEntry(sauceEntries.shift());
    }
    return Object.freeze(meshes);
  };

  const cancelSaucePreviews = (gestureId) => {
    assertActive(disposed);
    const matches = matchingPreviewEntries(gestureId);
    for (const [key, entry] of matches) {
      previewEntriesByKey.delete(key);
      disposeSauceEntry(entry);
    }
    return matches.length;
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
    getLayer(layerId);
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
      layerTypes: Object.fromEntries(order.map((id) => [id, ingredientFor(id)])),
      layerPoses: Object.fromEntries(order.map((id) => {
        const layer = layers.get(id);
        return [id, {
          x: layer.position.x,
          z: layer.position.z,
          yaw: layer.rotation.y,
        }];
      })),
      layerTransforms: Object.fromEntries(order.map((id) => {
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
    assertPermutation(composition.layerOrder, ingredientIds);
    if (!composition.layerPoses || typeof composition.layerPoses !== "object"
      || Array.isArray(composition.layerPoses)) {
      throw new TypeError("composition.layerPoses must be an object");
    }
    const poseKeys = Object.keys(composition.layerPoses);
    if (poseKeys.length !== ingredientIds.length
      || poseKeys.some((id) => !ingredientIds.includes(id))) {
      throw new TypeError("composition.layerPoses must contain every burger layer exactly once");
    }
    if (!Array.isArray(composition.strokes)
      || composition.strokes.length < 1
      || composition.strokes.length > MAX_STROKES) {
      throw new TypeError(`composition.strokes must contain 1 to ${MAX_STROKES} strokes`);
    }
    const validatedPoses = Object.fromEntries(ingredientIds.map((id) => {
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
    const validatedStrokes = composition.strokes.map((stroke) => (
      validateStroke(stroke, (layerId) => layers.has(layerId), sauceIds)
    ));
    const stagedSauces = stageSauceEntries(validatedStrokes);

    order = [...composition.layerOrder];
    applyStackHeights();
    for (const id of ingredientIds) {
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
    for (const layerId of ingredientIds) {
      const surface = surfacesById.get(layerId);
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
    for (const entry of previewEntriesByKey.values()) {
      applySauceBite(entry, normalizedAmount);
    }
    root.userData.biteAmount = normalizedAmount;
  };

  const createLayerInstance = (ingredientId, instanceId) => {
    assertActive(disposed);
    assertLayerId(ingredientId, ingredientIds);
    if (typeof instanceId !== "string" || !instanceId.trim()) {
      throw new TypeError("instanceId must be a non-empty string");
    }
    if (layers.has(instanceId)) throw new TypeError(`Duplicate burger layer: ${instanceId}`);
    const template = layers.get(ingredientId);
    const templateSurface = template.userData.selectableSurface;
    const layer = template.clone(true);
    layer.name = `food-layer:${instanceId}`;
    layer.userData = {
      ...template.userData,
      foodLayer: Object.freeze({ food: FOOD_ID, layerId: instanceId, ingredientId }),
    };
    const surface = layer.getObjectByName(templateSurface.name);
    if (!surface?.isMesh) throw new Error(`Ingredient ${ingredientId} has no cloneable surface`);
    surface.name = `food-layer:${instanceId}:surface`;
    surface.userData = {
      ...surface.userData,
      cookingSelectable: Object.freeze({
        kind: "food-layer",
        food: FOOD_ID,
        layerId: instanceId,
        ingredientId,
      }),
    };
    const transientClones = [];
    layer.traverse((object) => {
      if (object !== surface && object.userData?.sauceStroke) transientClones.push(object);
    });
    transientClones.forEach((object) => object.removeFromParent());
    layer.userData.selectableSurface = surface;
    root.add(layer);
    layers.set(instanceId, layer);
    ingredientByLayerId.set(instanceId, ingredientId);
    surfacesById.set(instanceId, surface);
    order.push(instanceId);
    return layer;
  };

  const removeLayerInstance = (instanceId) => {
    assertActive(disposed);
    if (ingredientIds.includes(instanceId)) {
      throw new TypeError("Canonical burger layers cannot be removed");
    }
    const layer = layers.get(instanceId);
    if (!layer) return false;
    for (let index = sauceEntries.length - 1; index >= 0; index -= 1) {
      if (sauceEntries[index].stroke.layerId !== instanceId) continue;
      disposeSauceEntry(sauceEntries[index]);
      sauceEntries.splice(index, 1);
    }
    for (const [key, entry] of previewEntriesByKey) {
      if (entry.stroke.layerId !== instanceId) continue;
      previewEntriesByKey.delete(key);
      disposeSauceEntry(entry);
    }
    layer.removeFromParent();
    layers.delete(instanceId);
    ingredientByLayerId.delete(instanceId);
    surfacesById.delete(instanceId);
    const index = order.indexOf(instanceId);
    if (index >= 0) order.splice(index, 1);
    return true;
  };

  const selectableSurfaces = Object.freeze(ingredientIds.map((id) => surfacesById.get(id)));
  const readonlyLayers = createReadonlyMapView(layers);
  const api = {
    root,
    layers: readonlyLayers,
    selectableSurfaces,
    selectionFeedback,
    dropPreview,
    noRaycast: NO_RAYCAST,
    getLayer,
    createLayerInstance,
    removeLayerInstance,
    getSelectableSurfaces() {
      assertActive(disposed);
      return Object.freeze([...surfacesById.values()]);
    },
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
    setLayerHighlighted(layerId, highlighted = true) {
      assertActive(disposed);
      getLayer(layerId);
      if (!highlighted) {
        selectionFeedback.visible = false;
        selectionFeedback.removeFromParent();
        return false;
      }
      const layer = layers.get(layerId);
      const geometry = layer.userData.selectableSurface.geometry;
      for (const mesh of selectionFeedback.children) mesh.geometry = geometry;
      layer.add(selectionFeedback);
      selectionFeedback.position.set(0, 0, 0);
      selectionFeedback.rotation.set(0, 0, 0);
      selectionFeedback.scale.set(1, 1, 1);
      selectionFeedback.visible = true;
      return true;
    },
    setLayerDropPreview(layerId, {
      position,
      scale,
      yaw = 0,
      targetIndex,
    } = {}) {
      assertActive(disposed);
      getLayer(layerId);
      if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
        throw new TypeError("drop preview position must contain finite x, y, and z");
      }
      if (!scale || ![scale.x, scale.y, scale.z].every((value) => (
        Number.isFinite(value) && value > 0
      ))) {
        throw new TypeError("drop preview scale must contain positive finite x, y, and z");
      }
      const normalizedYaw = assertFinite(yaw, "drop preview yaw");
      if (!Number.isInteger(targetIndex) || targetIndex < 0) {
        throw new TypeError("drop preview targetIndex must be a non-negative integer");
      }
      const geometry = layers.get(layerId).userData.selectableSurface.geometry;
      for (const mesh of dropPreview.children) mesh.geometry = geometry;
      root.add(dropPreview);
      dropPreview.position.set(position.x, position.y, position.z);
      dropPreview.rotation.set(0, normalizedYaw, 0);
      dropPreview.scale.set(scale.x, scale.y, scale.z);
      dropPreview.userData.layerId = layerId;
      dropPreview.userData.targetIndex = targetIndex;
      dropPreview.visible = true;
      return true;
    },
    clearLayerDropPreview() {
      if (disposed) return;
      dropPreview.visible = false;
      dropPreview.removeFromParent();
      delete dropPreview.userData.layerId;
      delete dropPreview.userData.targetIndex;
    },
    reorderLayer,
    snapLayer,
    applyComposition,
    projectSurfacePoint,
    addSauceStroke,
    previewSauceStroke,
    commitSaucePreviews,
    cancelSaucePreviews,
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
      for (const entry of previewEntriesByKey.values()) disposeSauceEntry(entry);
      previewEntriesByKey.clear();
      disposed = true;
      root.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      ownedGeometries.clear();
      ownedMaterials.clear();
      layers.clear();
      ingredientByLayerId.clear();
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
