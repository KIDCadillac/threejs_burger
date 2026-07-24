export const HOME_MAP_KEY = "burger-home-map-v1";

export const HOME_MAPS = Object.freeze([
  Object.freeze({
    id: "burger",
    title: "汉堡小馆",
    subtitle: "今天也要好好做汉堡",
    actionLabel: "开门营业",
    actionHint: "3 位顾客 · 连续出餐",
    href: "./cooking.html?mode=orders",
    available: true,
  }),
  Object.freeze({
    id: "sushi",
    title: "深夜寿司店",
    subtitle: "月亮升起后，再来吃一贯",
    actionLabel: "寿司店筹备中",
    actionHint: "下一张料理地图",
    href: "",
    available: false,
  }),
]);

export function normalizeMapIndex(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < HOME_MAPS.length ? parsed : 0;
}

export function changeMapIndex(index, direction) {
  const current = normalizeMapIndex(index);
  const step = Math.sign(Number(direction) || 0);
  return (current + step + HOME_MAPS.length) % HOME_MAPS.length;
}

export function mapIndexToPhysicalSlide(index) {
  return normalizeMapIndex(index) + 1;
}

export function physicalSlideToMapIndex(physicalSlide) {
  const physical = Math.round(Number(physicalSlide) || 0);
  if (physical <= 0) return HOME_MAPS.length - 1;
  if (physical >= HOME_MAPS.length + 1) return 0;
  return physical - 1;
}

export function resolveSwipe({ deltaX, width, velocityX }) {
  const distance = Number.isFinite(deltaX) ? deltaX : 0;
  const viewportWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const velocity = Number.isFinite(velocityX) ? velocityX : 0;
  if (Math.abs(distance) >= Math.max(48, viewportWidth * 0.18)) {
    return distance < 0 ? 1 : -1;
  }
  if (Math.abs(velocity) >= 0.65) {
    return velocity < 0 ? 1 : -1;
  }
  return 0;
}
