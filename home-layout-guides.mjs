export const DEFAULT_ALIGNMENT_SETTINGS = Object.freeze({
  snapping: true,
  showGrid: true,
  gridSize: 8,
  inset: 0,
  threshold: 7,
});

const finiteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeAlignmentSettings(value = {}) {
  return {
    snapping:
      value.snapping === undefined
        ? DEFAULT_ALIGNMENT_SETTINGS.snapping
        : Boolean(value.snapping),
    showGrid:
      value.showGrid === undefined
        ? DEFAULT_ALIGNMENT_SETTINGS.showGrid
        : Boolean(value.showGrid),
    gridSize: Math.round(
      clamp(
        finiteNumber(value.gridSize, DEFAULT_ALIGNMENT_SETTINGS.gridSize),
        1,
        64,
      ),
    ),
    inset: Math.round(
      clamp(
        finiteNumber(value.inset, DEFAULT_ALIGNMENT_SETTINGS.inset),
        0,
        200,
      ),
    ),
    threshold: clamp(
      finiteNumber(value.threshold, DEFAULT_ALIGNMENT_SETTINGS.threshold),
      1,
      24,
    ),
  };
}

function axisAlignment(mode, elementStart, elementSize, referenceStart, referenceSize, inset) {
  if (mode === "start") {
    return referenceStart + inset - elementStart;
  }
  if (mode === "center") {
    return (
      referenceStart +
      referenceSize / 2 -
      (elementStart + elementSize / 2)
    );
  }
  return referenceStart + referenceSize - inset - (elementStart + elementSize);
}

export function alignmentPatch({
  mode,
  value,
  elementRect,
  referenceRect,
  inset = 0,
}) {
  const patch = {};
  if (mode === "left") {
    patch.x = value.x + axisAlignment(
      "start",
      elementRect.left,
      elementRect.width,
      referenceRect.left,
      referenceRect.width,
      inset,
    );
  } else if (mode === "hcenter") {
    patch.x = value.x + axisAlignment(
      "center",
      elementRect.left,
      elementRect.width,
      referenceRect.left,
      referenceRect.width,
      inset,
    );
  } else if (mode === "right") {
    patch.x = value.x + axisAlignment(
      "end",
      elementRect.left,
      elementRect.width,
      referenceRect.left,
      referenceRect.width,
      inset,
    );
  } else if (mode === "top") {
    patch.y = value.y + axisAlignment(
      "start",
      elementRect.top,
      elementRect.height,
      referenceRect.top,
      referenceRect.height,
      inset,
    );
  } else if (mode === "vcenter") {
    patch.y = value.y + axisAlignment(
      "center",
      elementRect.top,
      elementRect.height,
      referenceRect.top,
      referenceRect.height,
      inset,
    );
  } else if (mode === "bottom") {
    patch.y = value.y + axisAlignment(
      "end",
      elementRect.top,
      elementRect.height,
      referenceRect.top,
      referenceRect.height,
      inset,
    );
  }
  return patch;
}

function snapAxis({
  candidateStart,
  size,
  referenceStart,
  referenceSize,
  inset,
  gridSize,
  threshold,
  axis,
}) {
  const candidates = [
    {
      key: axis === "x" ? "left" : "top",
      delta: referenceStart + inset - candidateStart,
    },
    {
      key: axis === "x" ? "center" : "middle",
      delta:
        referenceStart +
        referenceSize / 2 -
        (candidateStart + size / 2),
    },
    {
      key: axis === "x" ? "right" : "bottom",
      delta:
        referenceStart +
        referenceSize -
        inset -
        (candidateStart + size),
    },
  ].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

  if (Math.abs(candidates[0].delta) <= threshold) {
    return candidates[0];
  }

  const gridOrigin = referenceStart + inset;
  const gridTarget =
    gridOrigin +
    Math.round((candidateStart - gridOrigin) / gridSize) * gridSize;
  const gridDelta = gridTarget - candidateStart;
  if (Math.abs(gridDelta) <= Math.min(4, gridSize / 2)) {
    return { key: "grid", delta: gridDelta };
  }
  return { key: "", delta: 0 };
}

export function snapDragLayout({
  startValue,
  startRect,
  referenceRect,
  deltaX,
  deltaY,
  settings,
}) {
  const normalized = normalizeAlignmentSettings(settings);
  if (!normalized.snapping || !referenceRect) {
    return {
      x: startValue.x + deltaX,
      y: startValue.y + deltaY,
      snapX: "",
      snapY: "",
    };
  }

  const xSnap = snapAxis({
    candidateStart: startRect.left + deltaX,
    size: startRect.width,
    referenceStart: referenceRect.left,
    referenceSize: referenceRect.width,
    inset: normalized.inset,
    gridSize: normalized.gridSize,
    threshold: normalized.threshold,
    axis: "x",
  });
  const ySnap = snapAxis({
    candidateStart: startRect.top + deltaY,
    size: startRect.height,
    referenceStart: referenceRect.top,
    referenceSize: referenceRect.height,
    inset: normalized.inset,
    gridSize: normalized.gridSize,
    threshold: normalized.threshold,
    axis: "y",
  });

  return {
    x: startValue.x + deltaX + xSnap.delta,
    y: startValue.y + deltaY + ySnap.delta,
    snapX: xSnap.key,
    snapY: ySnap.key,
  };
}
