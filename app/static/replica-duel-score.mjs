const FULL_POINTS = Object.freeze({
  ingredients: 25,
  order: 40,
  sauce: 15,
  placement: 10,
  speed: 10,
});

const clamp = (value, minimum = 0, maximum = 1) => (
  Math.min(maximum, Math.max(minimum, value))
);

const display = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

function requireLayers(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label}.layers must be an array`);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`${label}.layers[${index}] must be an object`);
    }
    if (typeof entry.ingredientId !== "string" || !entry.ingredientId) {
      throw new TypeError(`${label}.layers[${index}].ingredientId must be a string`);
    }
    for (const key of ["x", "z", "yaw"]) {
      if (!Number.isFinite(entry[key])) {
        throw new TypeError(`${label}.layers[${index}].${key} must be finite`);
      }
    }
    return entry;
  });
}

function requireStrokes(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label}.strokes must be an array`);
  return value;
}

export function alignReplicaLayers(target, replica) {
  if (!Array.isArray(target) || !Array.isArray(replica)) {
    throw new TypeError("target and replica must be arrays");
  }
  const rows = target.length + 1;
  const columns = replica.length + 1;
  const distance = Array.from({ length: rows }, () => Array(columns).fill(0));
  for (let row = 0; row < rows; row += 1) distance[row][0] = row;
  for (let column = 0; column < columns; column += 1) distance[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = distance[row - 1][column - 1]
        + (target[row - 1] === replica[column - 1] ? 0 : 1);
      distance[row][column] = Math.min(
        substitution,
        distance[row - 1][column] + 1,
        distance[row][column - 1] + 1,
      );
    }
  }

  const matches = [];
  let row = target.length;
  let column = replica.length;
  while (row > 0 || column > 0) {
    // Stable tie break: diagonal, delete target, insert replica.
    if (row > 0 && column > 0) {
      const equal = target[row - 1] === replica[column - 1];
      const diagonal = distance[row - 1][column - 1] + (equal ? 0 : 1);
      if (distance[row][column] === diagonal) {
        if (equal) {
          matches.push(Object.freeze({
            targetIndex: row - 1,
            replicaIndex: column - 1,
            ingredientId: target[row - 1],
          }));
        }
        row -= 1;
        column -= 1;
        continue;
      }
    }
    if (row > 0 && distance[row][column] === distance[row - 1][column] + 1) {
      row -= 1;
      continue;
    }
    column -= 1;
  }

  matches.reverse();
  return Object.freeze({
    distance: distance[target.length][replica.length],
    matches: Object.freeze(matches),
  });
}

function sauceGroups(strokes) {
  const groups = new Map();
  for (const stroke of strokes) {
    if (!stroke || typeof stroke !== "object" || Array.isArray(stroke)) continue;
    const sauceId = String(stroke.sauceId ?? "");
    const targetLayerIndex = Number(stroke.targetLayerIndex);
    if (!sauceId || !Number.isInteger(targetLayerIndex) || targetLayerIndex < 0) continue;
    const key = `${sauceId}\0${targetLayerIndex}`;
    const group = groups.get(key) ?? { amount: 0, cells: new Set() };
    const amount = Number(stroke.amount);
    group.amount += Number.isFinite(amount) && amount >= 0
      ? amount
      : Array.isArray(stroke.cells) ? stroke.cells.length : 0;
    if (Array.isArray(stroke.cells)) {
      for (const cell of stroke.cells) group.cells.add(String(cell));
    }
    groups.set(key, group);
  }
  return groups;
}

function setIntersection(first, second) {
  return new Set([...first].filter((entry) => second.has(entry)));
}

function ratio(first, second) {
  const maximum = Math.max(first, second);
  return maximum > 0 ? Math.min(first, second) / maximum : 1;
}

export function scoreSauceSimilarity(targetStrokes, replicaStrokes) {
  if (!Array.isArray(targetStrokes) || !Array.isArray(replicaStrokes)) {
    throw new TypeError("targetStrokes and replicaStrokes must be arrays");
  }
  const target = sauceGroups(targetStrokes);
  const replica = sauceGroups(replicaStrokes);
  if (!target.size && !replica.size) {
    return Object.freeze({ raw: 15, groupSet: 5, usage: 5, coverage: 5 });
  }
  if (!target.size || !replica.size) {
    return Object.freeze({ raw: 0, groupSet: 0, usage: 0, coverage: 0 });
  }

  const targetKeys = new Set(target.keys());
  const replicaKeys = new Set(replica.keys());
  const common = setIntersection(targetKeys, replicaKeys);
  const unionSize = new Set([...targetKeys, ...replicaKeys]).size;
  const groupSet = 5 * common.size / unionSize;
  let usage = 0;
  let coverage = 0;
  if (common.size) {
    for (const key of common) {
      const targetGroup = target.get(key);
      const replicaGroup = replica.get(key);
      usage += ratio(targetGroup.amount, replicaGroup.amount);
      const cellIntersection = setIntersection(targetGroup.cells, replicaGroup.cells).size;
      const cellUnion = new Set([...targetGroup.cells, ...replicaGroup.cells]).size;
      coverage += cellUnion ? cellIntersection / cellUnion : 1;
    }
    usage = 5 * usage / common.size;
    coverage = 5 * coverage / common.size;
  }
  return Object.freeze({ raw: groupSet + usage + coverage, groupSet, usage, coverage });
}

function countMatches(targetLayers, replicaLayers) {
  const targetCounts = new Map();
  const replicaCounts = new Map();
  for (const { ingredientId } of targetLayers) {
    targetCounts.set(ingredientId, (targetCounts.get(ingredientId) ?? 0) + 1);
  }
  for (const { ingredientId } of replicaLayers) {
    replicaCounts.set(ingredientId, (replicaCounts.get(ingredientId) ?? 0) + 1);
  }
  let matches = 0;
  for (const [ingredientId, count] of targetCounts) {
    matches += Math.min(count, replicaCounts.get(ingredientId) ?? 0);
  }
  return matches;
}

function shortestAngle(first, second) {
  const period = Math.PI * 2;
  const raw = Math.abs(first - second) % period;
  return Math.min(raw, period - raw);
}

function placementScore(targetLayers, replicaLayers, matches, placementRadii) {
  if (!targetLayers.length || !matches.length) return 0;
  let total = 0;
  for (const match of matches) {
    const target = targetLayers[match.targetIndex];
    const replica = replicaLayers[match.replicaIndex];
    const configured = Number(placementRadii?.[match.ingredientId]);
    const embedded = Number(target.placementRadius);
    const radius = Number.isFinite(configured) && configured > 0
      ? configured
      : Number.isFinite(embedded) && embedded > 0 ? embedded : 1;
    const horizontal = Math.hypot(target.x - replica.x, target.z - replica.z);
    const distanceCredit = clamp(1 - horizontal / (0.35 * radius));
    const yawCredit = clamp(1 - shortestAngle(target.yaw, replica.yaw) / (Math.PI / 6));
    total += distanceCredit * 0.7 + yawCredit * 0.3;
  }
  return FULL_POINTS.placement * total / targetLayers.length;
}

export function scoreReplicaDuelRound({
  target,
  replica,
  elapsedMs,
  placementRadii = {},
} = {}) {
  if (!target || !replica) throw new TypeError("target and replica are required");
  const targetLayers = requireLayers(target.layers, "target");
  const replicaLayers = requireLayers(replica.layers, "replica");
  const targetStrokes = requireStrokes(target.strokes, "target");
  const replicaStrokes = requireStrokes(replica.strokes, "replica");
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new TypeError("elapsedMs must be a non-negative finite number");
  }

  const maximumCount = Math.max(targetLayers.length, replicaLayers.length, 1);
  const matchedCount = countMatches(targetLayers, replicaLayers);
  const ingredients = FULL_POINTS.ingredients * matchedCount / maximumCount;
  const alignment = alignReplicaLayers(
    targetLayers.map(({ ingredientId }) => ingredientId),
    replicaLayers.map(({ ingredientId }) => ingredientId),
  );
  const order = FULL_POINTS.order
    * clamp(1 - alignment.distance / maximumCount);
  const sauceResult = scoreSauceSimilarity(targetStrokes, replicaStrokes);
  const placement = placementScore(
    targetLayers,
    replicaLayers,
    alignment.matches,
    placementRadii,
  );
  const accuracy = ingredients + order + sauceResult.raw + placement;
  const elapsedSeconds = elapsedMs / 1_000;
  const speed = accuracy >= 54
    ? FULL_POINTS.speed * clamp((45 - elapsedSeconds) / 30)
    : 0;
  const rawScore = accuracy + speed;
  const raw = Object.freeze({
    ingredients,
    order,
    sauce: sauceResult.raw,
    placement,
    speed,
    accuracy,
  });
  const displayed = Object.freeze({
    ingredients: display(ingredients),
    order: display(order),
    sauce: display(sauceResult.raw),
    placement: display(placement),
    speed: display(speed),
  });
  return Object.freeze({
    rawScore,
    displayScore: display(rawScore),
    breakdown: Object.freeze({ raw, display: displayed, sauce: sauceResult }),
    alignment,
  });
}
