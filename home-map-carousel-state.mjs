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

export function mapIndexAtOffset(index, offset, count = HOME_MAPS.length) {
  const size = Math.max(1, Math.trunc(Number(count) || 0));
  const current = ((Math.trunc(Number(index) || 0) % size) + size) % size;
  const step = Math.trunc(Number(offset) || 0);
  return ((current + step) % size + size) % size;
}

export function createMapCardWindow(index, count = HOME_MAPS.length) {
  return [-2, -1, 0, 1, 2].map((offset) => ({
    offset,
    mapIndex: mapIndexAtOffset(index, offset, count),
  }));
}

export function resolveSwipe({ deltaX, width, velocityX }) {
  const distance = Number.isFinite(deltaX) ? deltaX : 0;
  const viewportWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const velocity = Number.isFinite(velocityX) ? velocityX : 0;
  const switchDistance = Math.max(22, Math.min(32, viewportWidth * 0.065));
  if (Math.abs(distance) >= switchDistance) {
    return distance < 0 ? 1 : -1;
  }
  if (Math.abs(velocity) >= 0.45) {
    return velocity < 0 ? 1 : -1;
  }
  return 0;
}

export function afterNextPaint(requestFrame, callback) {
  requestFrame(() => requestFrame(callback));
}

export function cardWheelPose(rawOffset) {
  const offset = Math.max(-2, Math.min(2, Number(rawOffset) || 0));
  const distance = Math.abs(offset);
  const round = (value) => {
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  return {
    translatePercent: round(offset * 62),
    rotateY: round(offset * -45),
    scale: round(Math.max(0.8, 1 - distance * 0.1)),
    opacity: distance >= 1.6 ? 0 : round(Math.max(0, 1 - distance * 0.12)),
    zIndex: Math.round(30 - distance * 12),
  };
}

export function activeCardAccessoryPose(progress) {
  return cardWheelPose(-(Number(progress) || 0));
}
