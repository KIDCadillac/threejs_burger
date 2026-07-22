export const WORKBENCH_LOADOUT_STORAGE_KEY = "solo-cooking-workbench-loadout:v1";

export const WORKBENCH_REGION_OPTIONS = Object.freeze({
  bread: Object.freeze(["bottom-bun", "middle-bun", "top-bun"]),
  filling: Object.freeze([
    "patty",
    "cheese",
    "tomato",
    "lettuce",
    "pickle",
    "onion",
  ]),
  sauce: Object.freeze(["ketchup", "mustard", "house-sauce"]),
});

export const WORKBENCH_CONTENT_PRESENTATION = Object.freeze(Object.fromEntries([
  ["bottom-bun", "下层面包", "🍞"],
  ["middle-bun", "中层面包", "🥯"],
  ["top-bun", "上层面包", "🍔"],
  ["patty", "牛肉饼", "🥩"],
  ["cheese", "芝士", "🧀"],
  ["tomato", "番茄", "🍅"],
  ["lettuce", "生菜", "🥬"],
  ["pickle", "酸黄瓜", "🥒"],
  ["onion", "洋葱", "🧅"],
  ["ketchup", "番茄酱", "🔴"],
  ["mustard", "芥末酱", "🟡"],
  ["house-sauce", "秘制酱", "🟠"],
].map(([contentId, label, icon]) => [
  contentId,
  Object.freeze({ label, icon }),
])));

export const WORKBENCH_SLOTS = Object.freeze([
  ["bread-left-1", "bread", "bottom-bun"],
  ["bread-left-2", "bread", "middle-bun"],
  ["bread-left-3", "bread", "top-bun"],
  ["filling-back-1", "filling", "patty"],
  ["filling-back-2", "filling", "cheese"],
  ["filling-back-3", "filling", "tomato"],
  ["filling-back-4", "filling", "lettuce"],
  ["sauce-right-1", "sauce", "ketchup"],
  ["sauce-right-2", "sauce", "mustard"],
  ["sauce-right-3", "sauce", "house-sauce"],
].map(([slotId, region, defaultContentId]) => Object.freeze({
  slotId,
  region,
  defaultContentId,
})));

export const WORKBENCH_SLOT_PRESENTATION = Object.freeze(Object.fromEntries([
  ["bread-left-1", "左侧面包 1"],
  ["bread-left-2", "左侧面包 2"],
  ["bread-left-3", "左侧面包 3"],
  ["filling-back-1", "后排配料 1"],
  ["filling-back-2", "后排配料 2"],
  ["filling-back-3", "后排配料 3"],
  ["filling-back-4", "后排配料 4"],
  ["sauce-right-1", "右侧酱料 1"],
  ["sauce-right-2", "右侧酱料 2"],
  ["sauce-right-3", "右侧酱料 3"],
].map(([slotId, label]) => [slotId, Object.freeze({ label })])));

const SLOT_BY_ID = new Map(WORKBENCH_SLOTS.map((slot) => [slot.slotId, slot]));

function freezeLoadout(entries) {
  return Object.freeze(Object.fromEntries(entries));
}

function readStoredContent(value, slotId) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return Object.prototype.hasOwnProperty.call(value, slotId)
      ? value[slotId]
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function createDefaultWorkbenchLoadout() {
  return freezeLoadout(WORKBENCH_SLOTS.map(({ slotId, defaultContentId }) => [
    slotId,
    defaultContentId,
  ]));
}

export function normalizeWorkbenchLoadout(value) {
  return freezeLoadout(WORKBENCH_SLOTS.map((slot) => {
    const contentId = readStoredContent(value, slot.slotId);
    const normalizedContentId = WORKBENCH_REGION_OPTIONS[slot.region].includes(contentId)
      ? contentId
      : slot.defaultContentId;
    return [slot.slotId, normalizedContentId];
  }));
}

export function getWorkbenchSlot(slotId) {
  const slot = SLOT_BY_ID.get(slotId);
  if (!slot) throw new TypeError(`Unknown workbench slot: ${String(slotId)}`);
  return slot;
}

export function setWorkbenchSlotContent(loadout, slotId, contentId) {
  const slot = getWorkbenchSlot(slotId);
  if (!WORKBENCH_REGION_OPTIONS[slot.region].includes(contentId)) {
    throw new TypeError(
      `Content ${String(contentId)} is not valid for ${slot.region} slot ${slotId}`,
    );
  }

  const normalized = normalizeWorkbenchLoadout(loadout);
  return freezeLoadout(WORKBENCH_SLOTS.map(({ slotId: currentSlotId }) => [
    currentSlotId,
    currentSlotId === slotId ? contentId : normalized[currentSlotId],
  ]));
}

export function getNextWorkbenchSlotContent(loadout, slotId, direction = 1) {
  const slot = SLOT_BY_ID.get(slotId);
  if (!slot) throw new RangeError(`Unknown workbench slot: ${String(slotId)}`);

  const normalized = normalizeWorkbenchLoadout(loadout);
  const candidates = WORKBENCH_REGION_OPTIONS[slot.region];
  const currentIndex = candidates.indexOf(normalized[slotId]);
  const offset = direction < 0 ? -1 : 1;
  return candidates[(currentIndex + offset + candidates.length) % candidates.length];
}

export function cycleWorkbenchSlotContent(loadout, slotId, direction = 1) {
  const contentId = getNextWorkbenchSlotContent(loadout, slotId, direction);
  return setWorkbenchSlotContent(loadout, slotId, contentId);
}

export function loadWorkbenchLoadout(storage) {
  try {
    const resolvedStorage = resolveStorage(storage);
    if (typeof resolvedStorage?.getItem !== "function") {
      return createDefaultWorkbenchLoadout();
    }
    const serialized = resolvedStorage.getItem(WORKBENCH_LOADOUT_STORAGE_KEY);
    if (serialized === null) return createDefaultWorkbenchLoadout();
    return normalizeWorkbenchLoadout(JSON.parse(serialized));
  } catch {
    return createDefaultWorkbenchLoadout();
  }
}

export function saveWorkbenchLoadout(loadout, storage) {
  const normalized = normalizeWorkbenchLoadout(loadout);
  try {
    const resolvedStorage = resolveStorage(storage);
    if (typeof resolvedStorage?.setItem === "function") {
      resolvedStorage.setItem(
        WORKBENCH_LOADOUT_STORAGE_KEY,
        JSON.stringify(normalized),
      );
    }
  } catch {
    // Persistence is optional; the in-memory normalized config is still usable.
  }
  return normalized;
}

export function resetWorkbenchLoadout(storage) {
  const defaults = createDefaultWorkbenchLoadout();
  try {
    const resolvedStorage = resolveStorage(storage);
    if (typeof resolvedStorage?.removeItem === "function") {
      resolvedStorage.removeItem(WORKBENCH_LOADOUT_STORAGE_KEY);
    }
  } catch {
    // Persistence is optional; callers still receive the default config.
  }
  return defaults;
}
