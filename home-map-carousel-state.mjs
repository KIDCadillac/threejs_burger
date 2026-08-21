export const HOME_MAP_KEY = "burger-home-map-v1";

export const HOME_MAPS = Object.freeze([
  Object.freeze({
    id: "burger",
    title: "汉堡小馆",
    subtitle: "今天也要好好做汉堡！",
    actionLabel: "开门营业",
    actionHint: "8 位顾客 · 连续出餐",
    href: "./cooking.html?mode=orders",
    available: true,
  }),
  Object.freeze({
    id: "sushi",
    title: "深夜寿司店",
    subtitle: "有肥美鱼生，配米饭吃一套！",
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

export function shiftBufferedCardOffset(offset, direction) {
  const current = Math.max(-2, Math.min(2, Math.trunc(Number(offset) || 0)));
  const step = Math.sign(Number(direction) || 0);
  if (!step) return current;
  const shifted = current - step;
  if (shifted < -2) return 2;
  if (shifted > 2) return -2;
  return shifted;
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

export function dragProgressFromDelta({ deltaX, width }) {
  const distance = Number.isFinite(deltaX) ? deltaX : 0;
  const viewportWidth = Number.isFinite(width) && width > 0 ? width : 1;
  return Math.max(-1, Math.min(1, -distance / (viewportWidth * 0.72)));
}

export function shopOpenProgress({ offset, dragProgress }) {
  const slotOffset = Math.trunc(Number(offset) || 0);
  const progress = Math.max(-1, Math.min(1, Number(dragProgress) || 0));
  if (slotOffset === 0) return Math.round((1 - Math.abs(progress)) * 1000) / 1000;
  if (Math.abs(slotOffset) !== 1) return 0;
  if (Math.sign(slotOffset) !== Math.sign(progress)) return 0;
  return Math.abs(progress);
}

export function shopDoorDuration({
  fromProgress,
  targetProgress,
  reducedMotion = false,
}) {
  if (reducedMotion) return 0;
  const from = Math.max(0, Math.min(1, Number(fromProgress) || 0));
  const target = Math.max(0, Math.min(1, Number(targetProgress) || 0));
  const distance = Math.abs(target - from);
  if (distance < 0.001) return 0;
  const fullTravelDuration = target < from ? 760 : 440;
  return Math.round(fullTravelDuration * distance);
}

export function wheelSettleDuration({
  fromProgress,
  targetProgress,
  reducedMotion = false,
}) {
  if (reducedMotion) return 0;
  const from = Math.max(-1, Math.min(1, Number(fromProgress) || 0));
  const target = Math.max(-1, Math.min(1, Number(targetProgress) || 0));
  const remaining = Math.abs(target - from);
  return Math.round(Math.max(120, Math.min(325, 120 + remaining * 205)));
}

export function afterNextPaint(requestFrame, callback) {
  requestFrame(() => requestFrame(callback));
}

export function streetShopPose(rawOffset) {
  const offset = Math.max(-2, Math.min(2, Number(rawOffset) || 0));
  const distance = Math.abs(offset);
  const round = (value) => {
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  return {
    translatePercent: round(offset * 104),
    translateYPercent: round(distance * 2.5),
    scale: round(Math.max(0.8, 1 - distance * 0.1)),
    opacity: distance >= 1.6 ? 0 : 1,
    zIndex: Math.round(30 - distance * 12),
    shadeOpacity: round(Math.min(0.44, distance * 0.22)),
  };
}

export const cardWheelPose = streetShopPose;

export function activeCardAccessoryPose(progress) {
  return streetShopPose(-(Number(progress) || 0));
}

export function createLatestFrameScheduler({ requestFrame, cancelFrame, render }) {
  let frameId = null;
  let latestValue = 0;

  return {
    schedule(value) {
      latestValue = value;
      if (frameId !== null) return;
      frameId = requestFrame(() => {
        frameId = null;
        render(latestValue);
      });
    },
    cancel() {
      if (frameId === null) return;
      cancelFrame(frameId);
      frameId = null;
    },
    flush() {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
      render(latestValue);
    },
  };
}
