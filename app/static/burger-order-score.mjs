const MAX_ORDER_MS = 45_000;
const MAX_OFFSET_RADIUS = 1.45;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value, maximum) {
  return Math.round(clamp(value, 0, maximum));
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function ingredientPoints(targetTypes, actualTypes) {
  const targetCounts = countValues(targetTypes);
  const actualCounts = countValues(actualTypes);
  let matches = 0;
  for (const [ingredientId, targetCount] of targetCounts) {
    matches += Math.min(targetCount, actualCounts.get(ingredientId) ?? 0);
  }
  return rounded(350 * matches / Math.max(targetTypes.length, actualTypes.length, 1), 350);
}

function longestCommonSubsequence(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => (
    Array(right.length + 1).fill(0)
  ));
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      rows[leftIndex][rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? rows[leftIndex - 1][rightIndex - 1] + 1
        : Math.max(rows[leftIndex - 1][rightIndex], rows[leftIndex][rightIndex - 1]);
    }
  }
  return rows[left.length][right.length];
}

function orderPoints(targetTypes, actualTypes) {
  const subsequence = longestCommonSubsequence(targetTypes, actualTypes);
  return rounded(250 * subsequence / Math.max(targetTypes.length, actualTypes.length, 1), 250);
}

function saucePoints(order, snapshot, actualTypes) {
  const expected = Array.isArray(order.sauces) ? order.sauces : [];
  const strokes = Array.isArray(snapshot.strokes) ? snapshot.strokes : [];
  if (!expected.length) return strokes.length ? rounded(150 - strokes.length * 50, 150) : 150;

  let earned = 0;
  for (const sauce of expected) {
    const targetIndex = order.layers.findIndex(({ slotId }) => (
      slotId === sauce.targetLayerSlotId
    ));
    const targetLayer = order.layers[targetIndex];
    const actualLayerId = snapshot.assembledOrder[targetIndex];
    if (
      targetIndex < 0
      || !actualLayerId
      || actualTypes[targetIndex] !== targetLayer.ingredientId
    ) {
      continue;
    }
    const matching = strokes.filter((stroke) => (
      stroke?.sauce === sauce.sauceId && stroke?.layerId === actualLayerId
    ));
    if (!matching.length) continue;
    const amount = matching.reduce((sum, stroke) => (
      sum + (Number.isFinite(stroke.amount) ? Math.max(0, stroke.amount) : 0)
    ), 0);
    const targetCoverage = sauce.targetCoverage || 0.5;
    const coverage = 1 - clamp(Math.abs(amount - targetCoverage) / targetCoverage, 0, 1);
    earned += 0.6 + coverage * 0.4;
  }

  const expectedRatio = earned / expected.length;
  const excessPenalty = expected.length / Math.max(expected.length, strokes.length);
  return rounded(150 * expectedRatio * excessPenalty, 150);
}

function placementPoints(snapshot) {
  const order = snapshot.assembledOrder;
  if (!order.length) return 0;
  const meanRadius = order.reduce((sum, layerId) => {
    const offset = snapshot.offsets?.[layerId] ?? { x: 0, z: 0 };
    const x = Number.isFinite(offset.x) ? offset.x : MAX_OFFSET_RADIUS;
    const z = Number.isFinite(offset.z) ? offset.z : MAX_OFFSET_RADIUS;
    return sum + Math.hypot(x, z);
  }, 0) / order.length;
  return rounded(100 * (1 - clamp(meanRadius / MAX_OFFSET_RADIUS, 0, 1)), 100);
}

function emptyResult() {
  return Object.freeze({
    total: 0,
    parts: Object.freeze({
      ingredients: 0,
      order: 0,
      sauce: 0,
      placement: 0,
      speed: 0,
    }),
    reaction: "low",
  });
}

export function scoreBurgerOrder(order, snapshot, { remainingMs = 0 } = {}) {
  const assembledOrder = Array.isArray(snapshot?.assembledOrder)
    ? snapshot.assembledOrder
    : [];
  if (!assembledOrder.length) return emptyResult();

  const targetTypes = order.layers.map(({ ingredientId }) => ingredientId);
  const actualTypes = assembledOrder.map((layerId) => snapshot.instances?.[layerId] ?? null);
  const parts = Object.freeze({
    ingredients: ingredientPoints(targetTypes, actualTypes),
    order: orderPoints(targetTypes, actualTypes),
    sauce: saucePoints(order, { ...snapshot, assembledOrder }, actualTypes),
    placement: placementPoints({ ...snapshot, assembledOrder }),
    speed: rounded(150 * clamp(remainingMs / MAX_ORDER_MS, 0, 1), 150),
  });
  const total = Object.values(parts).reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    total,
    parts,
    reaction: total >= 850 ? "high" : total >= 550 ? "medium" : "low",
  });
}

export function summarizeBurgerRun(orderScores) {
  if (!Array.isArray(orderScores)) throw new TypeError("orderScores must be an array");
  const totalScore = orderScores.reduce((sum, item) => (
    sum + (Number.isFinite(item?.total) ? Math.max(0, item.total) : 0)
  ), 0);
  const stars = totalScore >= 2_550
    ? 3
    : totalScore >= 2_100
      ? 2
      : totalScore >= 1_500
        ? 1
        : 0;
  return Object.freeze({
    totalScore,
    stars,
    coins: Math.floor(totalScore / 100) + stars * 5,
  });
}
