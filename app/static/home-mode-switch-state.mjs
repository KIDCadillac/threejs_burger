export const HOME_MODE_KEY = "burger-home-mode-v1";
export const HOME_BUSINESS_KEY = "burger-home-business-v1";

export const HOME_MODES = Object.freeze([
  Object.freeze({
    id: "practice",
    label: "自由练习",
    hint: "不限时间",
    action: "practice",
  }),
  Object.freeze({
    id: "cookbook",
    label: "汉堡图鉴",
    hint: "配方收藏",
    action: "cookbook",
  }),
  Object.freeze({
    id: "duel",
    label: "复刻对决",
    hint: "双人轮换",
    action: "duel",
  }),
  Object.freeze({
    id: "sushi",
    label: "寿司店",
    hint: "筹备中",
    action: "sushi",
  }),
]);

export const HOME_MAP_MODE_IDS = Object.freeze({
  burger: Object.freeze(["practice", "cookbook", "duel"]),
  sushi: Object.freeze(["sushi"]),
});

export function normalizeModeIndex(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < HOME_MODES.length ? parsed : 0;
}

export function changeModeIndex(index, direction) {
  const current = normalizeModeIndex(index);
  const step = Math.sign(Number(direction) || 0);
  return (current + step + HOME_MODES.length) % HOME_MODES.length;
}

function modeIndexesForMap(mapId) {
  const ids = HOME_MAP_MODE_IDS[mapId] ?? HOME_MAP_MODE_IDS.burger;
  return ids
    .map((id) => HOME_MODES.findIndex((mode) => mode.id === id))
    .filter((index) => index >= 0);
}

export function modeIndexForMap(mapId, index) {
  const available = modeIndexesForMap(mapId);
  const current = normalizeModeIndex(index);
  return available.includes(current) ? current : (available[0] ?? 0);
}

export function changeModeIndexForMap(mapId, index, direction) {
  const available = modeIndexesForMap(mapId);
  const current = modeIndexForMap(mapId, index);
  const step = Math.sign(Number(direction) || 0);
  if (!step || available.length < 2) return current;
  const position = Math.max(0, available.indexOf(current));
  return available[(position + step + available.length) % available.length];
}

export function lockGestureAxis({ deltaX, deltaY, threshold = 12, dominance = 1.25 }) {
  const horizontal = Math.abs(Number.isFinite(deltaX) ? deltaX : 0);
  const vertical = Math.abs(Number.isFinite(deltaY) ? deltaY : 0);
  if (Math.max(horizontal, vertical) < threshold) return null;
  if (horizontal >= vertical * dominance) return "horizontal";
  if (vertical >= horizontal * dominance) return "vertical";
  return null;
}

export function resolveModeSwipe({ deltaY, height, velocityY }) {
  const distance = Number.isFinite(deltaY) ? deltaY : 0;
  const viewportHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const velocity = Number.isFinite(velocityY) ? velocityY : 0;
  if (Math.abs(distance) >= Math.max(48, viewportHeight * 0.18)) {
    return distance < 0 ? 1 : -1;
  }
  if (Math.abs(velocity) >= 0.65) {
    return velocity < 0 ? 1 : -1;
  }
  return 0;
}

export function normalizeBusinessOpen(value) {
  return value === true || value === "open";
}
