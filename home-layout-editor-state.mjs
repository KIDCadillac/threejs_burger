export const LAYOUT_VERSION = 1;

export const DEFAULT_LAYOUT_VALUE = Object.freeze({
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  z: 0,
  opacity: 1,
  visible: true,
  locked: false,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const finiteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function normalizeLayoutValue(value = {}) {
  return {
    x: clamp(finiteNumber(value.x, DEFAULT_LAYOUT_VALUE.x), -4000, 4000),
    y: clamp(finiteNumber(value.y, DEFAULT_LAYOUT_VALUE.y), -4000, 4000),
    scale: clamp(
      finiteNumber(value.scale, DEFAULT_LAYOUT_VALUE.scale),
      0.1,
      4,
    ),
    rotate: clamp(
      finiteNumber(value.rotate, DEFAULT_LAYOUT_VALUE.rotate),
      -180,
      180,
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
  };
}

export function normalizeLayoutDocument(input = {}) {
  const rawElements = input?.elements;
  if (
    rawElements !== undefined &&
    (!rawElements || typeof rawElements !== "object" || Array.isArray(rawElements))
  ) {
    throw new Error("布局文件结构无效");
  }

  const elements = {};
  for (const [id, value] of Object.entries(rawElements ?? {})) {
    if (!id || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("布局文件结构无效");
    }
    elements[id] = normalizeLayoutValue(value);
  }

  return {
    version: LAYOUT_VERSION,
    elements,
  };
}

export function updateLayoutElement(document, id, patch) {
  const source = normalizeLayoutDocument(document);
  if (!id || typeof id !== "string") {
    throw new Error("布局元素标识无效");
  }

  return {
    version: LAYOUT_VERSION,
    elements: {
      ...source.elements,
      [id]: normalizeLayoutValue({
        ...(source.elements[id] ?? DEFAULT_LAYOUT_VALUE),
        ...patch,
      }),
    },
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
