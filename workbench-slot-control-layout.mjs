import { WORKBENCH_SLOTS } from "./workbench-loadout.mjs";

export const SLOT_CONTROL_HIT_SIZE = 52;
export const SLOT_CONTROL_GAP = 8;
export const SLOT_CONTROL_MAX_ANCHOR_DISTANCE = 96;
export const SLOT_CONTROL_COMPACT_WIDTH = 360;

const REGION_ORDER = Object.freeze(["bread", "filling", "sauce"]);
const SLOT_IDS = new Set(WORKBENCH_SLOTS.map(({ slotId }) => slotId));
const STEP = SLOT_CONTROL_HIT_SIZE + SLOT_CONTROL_GAP;

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function freezeResult(individual, regionFallbacks) {
  return Object.freeze({
    individual: Object.freeze(individual.map((entry) => Object.freeze(entry))),
    regionFallbacks: Object.freeze(regionFallbacks.map((entry) => Object.freeze({
      ...entry,
      slotIds: Object.freeze([...entry.slotIds]),
    }))),
  });
}

function normalizeAnchors(anchors) {
  const bySlot = new Map();
  if (!Array.isArray(anchors)) return bySlot;
  for (const anchor of anchors) {
    if (!anchor || !SLOT_IDS.has(anchor.slotId) || bySlot.has(anchor.slotId)) continue;
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) continue;
    bySlot.set(anchor.slotId, Object.freeze({
      x: anchor.x,
      y: anchor.y,
      visible: anchor.visible === true,
    }));
  }
  return bySlot;
}

function fallbackPosition(region, viewport, safeInset) {
  const half = SLOT_CONTROL_HIT_SIZE / 2;
  const y = viewport.height - safeInset - half;
  if (region === "bread") return { x: safeInset + half, y };
  if (region === "sauce") return { x: viewport.width - safeInset - half, y };
  return { x: viewport.width / 2, y };
}

function fallbackRailAnchor(region, order, count, viewport, safeInset) {
  const half = SLOT_CONTROL_HIT_SIZE / 2;
  const centeredOffset = (order - (count - 1) / 2) * STEP;
  if (region === "filling") {
    return Object.freeze({
      x: viewport.width / 2 + centeredOffset,
      y: safeInset + half,
      visible: false,
    });
  }
  return Object.freeze({
    x: region === "bread" ? safeInset + half : viewport.width - safeInset - half,
    y: viewport.height / 2 + centeredOffset,
    visible: false,
  });
}

function placeAlongAxis(items, axis, minimum, maximum) {
  if (items.length === 0) return [];
  if (maximum < minimum || maximum - minimum < STEP * (items.length - 1)) return null;

  const sorted = [...items].sort((left, right) => (
    left.anchor[axis] - right.anchor[axis]
      || left.order - right.order
  ));
  const positions = sorted.map(({ anchor }) => (
    Math.min(maximum, Math.max(minimum, anchor[axis]))
  ));

  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + STEP);
  }
  if (positions.at(-1) > maximum) {
    positions[positions.length - 1] = maximum;
    for (let index = positions.length - 2; index >= 0; index -= 1) {
      positions[index] = Math.min(positions[index], positions[index + 1] - STEP);
    }
  }
  if (positions[0] < minimum) return null;

  return sorted.map((item, index) => ({ item, position: positions[index] }));
}

function tryRegionLayout(region, items, viewport, safeInset) {
  const half = SLOT_CONTROL_HIT_SIZE / 2;
  const topRailY = safeInset + half;
  const sideMinimumY = topRailY + STEP;
  const sideMaximumY = viewport.height - safeInset - half - STEP;
  let placed;

  if (region === "filling") {
    placed = placeAlongAxis(
      items,
      "x",
      safeInset + half,
      viewport.width - safeInset - half,
    );
    if (!placed) return null;
    placed = placed.map(({ item, position }) => ({
      ...item,
      x: position,
      y: topRailY,
    }));
  } else {
    placed = placeAlongAxis(items, "y", sideMinimumY, sideMaximumY);
    if (!placed) return null;
    const x = region === "bread"
      ? safeInset + half
      : viewport.width - safeInset - half;
    placed = placed.map(({ item, position }) => ({
      ...item,
      x,
      y: position,
    }));
  }

  return placed;
}

export function layoutWorkbenchSlotControls({ viewport, anchors, safeInset = 8 } = {}) {
  const width = viewport?.width;
  const height = viewport?.height;
  if (!finitePositive(width) || !finitePositive(height)) {
    throw new TypeError("A positive finite slot-control viewport is required");
  }
  if (!Number.isFinite(safeInset) || safeInset < 0) {
    throw new TypeError("safeInset must be a non-negative finite number");
  }
  if (width < SLOT_CONTROL_HIT_SIZE + safeInset * 2
    || height < SLOT_CONTROL_HIT_SIZE + safeInset * 2) {
    throw new TypeError("The slot-control viewport is too small");
  }

  const anchorBySlot = normalizeAnchors(anchors);
  if (width < SLOT_CONTROL_COMPACT_WIDTH) {
    return freezeResult([], REGION_ORDER.map((region) => ({
      region,
      slotIds: WORKBENCH_SLOTS
        .filter((slot) => slot.region === region)
        .map(({ slotId }) => slotId),
      ...fallbackPosition(region, { width, height }, safeInset),
    })));
  }

  const individualBySlot = new Map();
  for (const region of REGION_ORDER) {
    const regionSlots = WORKBENCH_SLOTS.filter((slot) => slot.region === region);
    const regionItems = regionSlots.map((slot, order) => {
      const anchor = anchorBySlot.get(slot.slotId);
      return {
        slot,
        order,
        anchor: anchor?.visible
          ? anchor
          : fallbackRailAnchor(region, order, regionSlots.length, { width, height }, safeInset),
      };
    });

    const placed = tryRegionLayout(region, regionItems, { width, height }, safeInset);
    if (!placed) {
      throw new RangeError(`The slot-control viewport cannot fit the ${region} rail`);
    }
    for (const { slot, anchor, x, y } of placed) {
      individualBySlot.set(slot.slotId, {
        slotId: slot.slotId,
        region,
        x,
        y,
        anchorX: anchor.x,
        anchorY: anchor.y,
        anchorVisible: anchor.visible === true,
      });
    }
  }

  const individual = WORKBENCH_SLOTS
    .map(({ slotId }) => individualBySlot.get(slotId))
    .filter(Boolean);
  return freezeResult(individual, []);
}
