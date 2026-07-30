export const LAYOUT_VERSION = 4;
export const WORKBENCH_FILE_FORMAT = "burger-ui-adjustment";
export const WORKBENCH_FILE_VERSION = 4;

export const DEFAULT_MOTION_VALUE = Object.freeze({
  enabled: false,
  trigger: "manual",
  fromX: -80,
  fromY: 0,
  fromScale: 0.9,
  fromRotate: 0,
  fromOpacity: 0,
  duration: 800,
  delay: 0,
  easing: "cubic-bezier(.2,.8,.2,1)",
  iterations: 1,
  direction: "normal",
});

export const DEFAULT_LAYOUT_VALUE = Object.freeze({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  scale: 1,
  rotate: 0,
  perspective: 0,
  rotateX: 0,
  rotateY: 0,
  originX: 50,
  originY: 50,
  z: 0,
  opacity: 1,
  visible: true,
  locked: false,
  brightness: 1,
  saturate: 1,
  blur: 0,
  radius: -1,
  background: "",
  color: "",
  motion: DEFAULT_MOTION_VALUE,
});

// v4 取消车头、车身和车轮，档口使用 CSS 原位作为新的项目基准。
export const PROJECT_DEFAULT_LAYOUT_ELEMENTS = Object.freeze({});

const REMOVED_LAYOUT_IDS = new Set([
  "burger.body",
  "burger.wheel-front",
  "burger.wheel-rear",
]);

export const DEFAULT_TRUCK_TIMELINE = Object.freeze({
  cameraStartX: 0,
  cameraStartY: -165,
  cameraStartScale: 1,
  cameraEndX: 0,
  cameraEndY: 0,
  cameraEndScale: 1,
  cameraDuration: 3150,
  bodyDuration: 2200,
  shutterDelay: 2200,
  shutterDuration: 620,
  menuDuration: 6800,
  menuStagger: 160,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const finiteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const safeText = (value, fallback = "") =>
  typeof value === "string" ? value.slice(0, 160) : fallback;

export function normalizeMotionValue(value = {}) {
  const trigger = ["manual", "load", "loop"].includes(value.trigger)
    ? value.trigger
    : DEFAULT_MOTION_VALUE.trigger;
  const direction = ["normal", "reverse", "alternate"].includes(value.direction)
    ? value.direction
    : DEFAULT_MOTION_VALUE.direction;

  return {
    enabled:
      value.enabled === undefined
        ? DEFAULT_MOTION_VALUE.enabled
        : Boolean(value.enabled),
    trigger,
    fromX: clamp(
      finiteNumber(value.fromX, DEFAULT_MOTION_VALUE.fromX),
      -4000,
      4000,
    ),
    fromY: clamp(
      finiteNumber(value.fromY, DEFAULT_MOTION_VALUE.fromY),
      -4000,
      4000,
    ),
    fromScale: clamp(
      finiteNumber(value.fromScale, DEFAULT_MOTION_VALUE.fromScale),
      0.05,
      8,
    ),
    fromRotate: clamp(
      finiteNumber(value.fromRotate, DEFAULT_MOTION_VALUE.fromRotate),
      -1080,
      1080,
    ),
    fromOpacity: clamp(
      finiteNumber(value.fromOpacity, DEFAULT_MOTION_VALUE.fromOpacity),
      0,
      1,
    ),
    duration: Math.round(
      clamp(
        finiteNumber(value.duration, DEFAULT_MOTION_VALUE.duration),
        50,
        30000,
      ),
    ),
    delay: Math.round(
      clamp(finiteNumber(value.delay, DEFAULT_MOTION_VALUE.delay), 0, 30000),
    ),
    easing: safeText(value.easing, DEFAULT_MOTION_VALUE.easing),
    iterations: Math.round(
      clamp(
        finiteNumber(value.iterations, DEFAULT_MOTION_VALUE.iterations),
        1,
        99,
      ),
    ),
    direction,
  };
}

export function normalizeLayoutValue(value = {}) {
  return {
    x: clamp(finiteNumber(value.x, DEFAULT_LAYOUT_VALUE.x), -4000, 4000),
    y: clamp(finiteNumber(value.y, DEFAULT_LAYOUT_VALUE.y), -4000, 4000),
    width: clamp(
      finiteNumber(value.width, DEFAULT_LAYOUT_VALUE.width),
      0,
      4000,
    ),
    height: clamp(
      finiteNumber(value.height, DEFAULT_LAYOUT_VALUE.height),
      0,
      4000,
    ),
    scale: clamp(
      finiteNumber(value.scale, DEFAULT_LAYOUT_VALUE.scale),
      0.05,
      8,
    ),
    rotate: clamp(
      finiteNumber(value.rotate, DEFAULT_LAYOUT_VALUE.rotate),
      -1080,
      1080,
    ),
    perspective: clamp(
      finiteNumber(value.perspective, DEFAULT_LAYOUT_VALUE.perspective),
      0,
      4000,
    ),
    rotateX: clamp(
      finiteNumber(value.rotateX, DEFAULT_LAYOUT_VALUE.rotateX),
      -180,
      180,
    ),
    rotateY: clamp(
      finiteNumber(value.rotateY, DEFAULT_LAYOUT_VALUE.rotateY),
      -180,
      180,
    ),
    originX: clamp(
      finiteNumber(value.originX, DEFAULT_LAYOUT_VALUE.originX),
      0,
      100,
    ),
    originY: clamp(
      finiteNumber(value.originY, DEFAULT_LAYOUT_VALUE.originY),
      0,
      100,
    ),
    z: Math.round(
      clamp(finiteNumber(value.z, DEFAULT_LAYOUT_VALUE.z), -999, 999),
    ),
    opacity: clamp(
      finiteNumber(value.opacity, DEFAULT_LAYOUT_VALUE.opacity),
      0,
      1,
    ),
    visible:
      value.visible === undefined
        ? DEFAULT_LAYOUT_VALUE.visible
        : Boolean(value.visible),
    locked:
      value.locked === undefined
        ? DEFAULT_LAYOUT_VALUE.locked
        : Boolean(value.locked),
    brightness: clamp(
      finiteNumber(value.brightness, DEFAULT_LAYOUT_VALUE.brightness),
      0,
      4,
    ),
    saturate: clamp(
      finiteNumber(value.saturate, DEFAULT_LAYOUT_VALUE.saturate),
      0,
      4,
    ),
    blur: clamp(
      finiteNumber(value.blur, DEFAULT_LAYOUT_VALUE.blur),
      0,
      40,
    ),
    radius: clamp(
      finiteNumber(value.radius, DEFAULT_LAYOUT_VALUE.radius),
      -1,
      999,
    ),
    background: safeText(value.background),
    color: safeText(value.color),
    motion: normalizeMotionValue(value.motion),
  };
}

export function normalizeTruckTimeline(value = {}) {
  return {
    cameraStartX: clamp(
      finiteNumber(value.cameraStartX, DEFAULT_TRUCK_TIMELINE.cameraStartX),
      -500,
      500,
    ),
    cameraStartY: clamp(
      finiteNumber(value.cameraStartY, DEFAULT_TRUCK_TIMELINE.cameraStartY),
      -500,
      500,
    ),
    cameraStartScale: clamp(
      finiteNumber(
        value.cameraStartScale,
        DEFAULT_TRUCK_TIMELINE.cameraStartScale,
      ),
      0.05,
      8,
    ),
    cameraEndX: clamp(
      finiteNumber(value.cameraEndX, DEFAULT_TRUCK_TIMELINE.cameraEndX),
      -500,
      500,
    ),
    cameraEndY: clamp(
      finiteNumber(value.cameraEndY, DEFAULT_TRUCK_TIMELINE.cameraEndY),
      -500,
      500,
    ),
    cameraEndScale: clamp(
      finiteNumber(value.cameraEndScale, DEFAULT_TRUCK_TIMELINE.cameraEndScale),
      0.05,
      8,
    ),
    cameraDuration: Math.round(
      clamp(
        finiteNumber(
          value.cameraDuration,
          DEFAULT_TRUCK_TIMELINE.cameraDuration,
        ),
        200,
        30000,
      ),
    ),
    bodyDuration: Math.round(
      clamp(
        finiteNumber(value.bodyDuration, DEFAULT_TRUCK_TIMELINE.bodyDuration),
        100,
        30000,
      ),
    ),
    shutterDelay: Math.round(
      clamp(
        finiteNumber(value.shutterDelay, DEFAULT_TRUCK_TIMELINE.shutterDelay),
        0,
        30000,
      ),
    ),
    shutterDuration: Math.round(
      clamp(
        finiteNumber(
          value.shutterDuration,
          DEFAULT_TRUCK_TIMELINE.shutterDuration,
        ),
        100,
        30000,
      ),
    ),
    menuDuration: Math.round(
      clamp(
        finiteNumber(value.menuDuration, DEFAULT_TRUCK_TIMELINE.menuDuration),
        300,
        30000,
      ),
    ),
    menuStagger: Math.round(
      clamp(
        finiteNumber(value.menuStagger, DEFAULT_TRUCK_TIMELINE.menuStagger),
        0,
        5000,
      ),
    ),
  };
}

export function normalizeLayoutDocument(input = {}) {
  const inputVersion = Number(input?.version);
  const sourceVersion = Number.isFinite(inputVersion)
    ? inputVersion
    : LAYOUT_VERSION;
  const rawElements = input?.elements;
  if (
    rawElements !== undefined &&
    (!rawElements ||
      typeof rawElements !== "object" ||
      Array.isArray(rawElements))
  ) {
    throw new Error("布局文件结构无效");
  }

  const elements = {};
  for (const [id, value] of Object.entries(rawElements ?? {})) {
    if (!id || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("布局文件结构无效");
    }
    if (REMOVED_LAYOUT_IDS.has(id)) continue;
    elements[id] = normalizeLayoutValue(value);
  }

  return {
    version: LAYOUT_VERSION,
    elements,
    truckTimeline: normalizeTruckTimeline(
      sourceVersion < LAYOUT_VERSION
        ? DEFAULT_TRUCK_TIMELINE
        : input?.truckTimeline,
    ),
  };
}

export function createProjectDefaultLayoutDocument() {
  return normalizeLayoutDocument({
    elements: PROJECT_DEFAULT_LAYOUT_ELEMENTS,
  });
}

export function mergeProjectDefaultLayout(document = {}) {
  const defaults = createProjectDefaultLayoutDocument();
  const source = normalizeLayoutDocument(document);
  return normalizeLayoutDocument({
    elements: {
      ...defaults.elements,
      ...source.elements,
    },
    truckTimeline: source.truckTimeline,
  });
}

export function projectDefaultLayoutValue(id) {
  return normalizeLayoutValue(PROJECT_DEFAULT_LAYOUT_ELEMENTS[id]);
}

export function updateLayoutElement(document, id, patch) {
  const source = normalizeLayoutDocument(document);
  if (!id || typeof id !== "string") {
    throw new Error("布局元素标识无效");
  }
  const current = source.elements[id] ?? DEFAULT_LAYOUT_VALUE;

  return {
    ...source,
    elements: {
      ...source.elements,
      [id]: normalizeLayoutValue({
        ...current,
        ...patch,
        motion: patch?.motion
          ? { ...current.motion, ...patch.motion }
          : current.motion,
      }),
    },
  };
}

export function updateTruckTimeline(document, patch) {
  const source = normalizeLayoutDocument(document);
  return {
    ...source,
    truckTimeline: normalizeTruckTimeline({
      ...source.truckTimeline,
      ...patch,
    }),
  };
}

export function parseLayoutDocument(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("布局文件不是有效 JSON");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !parsed.elements ||
    typeof parsed.elements !== "object" ||
    Array.isArray(parsed.elements)
  ) {
    throw new Error("布局文件结构无效");
  }

  return normalizeLayoutDocument(parsed);
}

export function createWorkbenchFile(
  document,
  theatreState = null,
  metadata = {},
) {
  const layoutDocument = normalizeLayoutDocument(document);
  const editedElementIds = Object.keys(layoutDocument.elements).sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    format: WORKBENCH_FILE_FORMAT,
    version: WORKBENCH_FILE_VERSION,
    project: metadata.project || "KIDCadillac/threejs_burger",
    createdAt: metadata.createdAt || new Date().toISOString(),
    sourcePage: metadata.sourcePage || "",
    handoff: {
      purpose: "把可视化 UI 与动画调整交给 Codex，并固化到项目代码",
      instruction:
        "请将此 JSON 文件直接上传给 Codex；layoutDocument 是布局调整，theatreState 是关键帧与时间轴。",
    },
    summary: {
      editedElementCount: editedElementIds.length,
      editedElementIds,
      includesTheatreTimeline: Boolean(theatreState),
    },
    layoutDocument,
    theatreState,
  };
}

export function parseWorkbenchFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("调整文件不是有效 JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("调整文件结构无效");
  }

  const layoutSource = parsed.layoutDocument || parsed;
  return {
    format: parsed.format || "legacy-layout-document",
    version: parsed.version || 1,
    layoutDocument: parseLayoutDocument(JSON.stringify(layoutSource)),
    theatreState: parsed.theatreState ?? null,
  };
}

export function createLayoutHistory(initialDocument = {}) {
  let stack = [normalizeLayoutDocument(initialDocument)];
  let index = 0;

  return {
    current() {
      return stack[index];
    },
    commit(nextDocument) {
      const normalized = normalizeLayoutDocument(nextDocument);
      stack = [...stack.slice(0, index + 1), normalized];
      index = stack.length - 1;
      return normalized;
    },
    undo() {
      index = Math.max(0, index - 1);
      return stack[index];
    },
    redo() {
      index = Math.min(stack.length - 1, index + 1);
      return stack[index];
    },
    canUndo() {
      return index > 0;
    },
    canRedo() {
      return index < stack.length - 1;
    },
    replace(nextDocument) {
      const normalized = normalizeLayoutDocument(nextDocument);
      stack = [normalized];
      index = 0;
      return normalized;
    },
  };
}
