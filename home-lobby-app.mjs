import {
  HOME_PROGRESS_KEY,
  claimDailyReward,
  createHomeProgress,
  dayStamp,
  normalizeHomeProgress,
} from "./home-lobby-state.mjs";
import {
  HOME_MAP_KEY,
  HOME_MAPS,
  cardWheelPose,
  changeMapIndex,
  mapIndexToPhysicalSlide,
  normalizeMapIndex,
  resolveSwipe,
} from "./home-map-carousel-state.mjs?v=20260724-wheel1";

const storage = window.localStorage;
const energyValue = document.querySelector("#energy-value");
const coinValue = document.querySelector("#coin-value");
const dailyDot = document.querySelector("#daily-dot");
const dailyStatus = document.querySelector("#daily-status");
const claimButton = document.querySelector("#claim-daily");
const rewardCards = [...document.querySelectorAll("[data-day]")];
const backdrop = document.querySelector("#sheet-backdrop");
const toast = document.querySelector("#home-toast");
const mapViewport = document.querySelector("#home-map-viewport");
const mapTrack = document.querySelector("#home-map-track");
const mapSlides = [...document.querySelectorAll("[data-home-map]")];
const mapLoopSlides = setupMapLoopSlides();
const mapArrows = [...document.querySelectorAll("[data-map-direction]")];
const mapCount = document.querySelector("#home-map-count");
const mapStatus = document.querySelector("#map-status");
const mapTitle = document.querySelector("#lobby-title");
const mapSubtitle = document.querySelector("#map-subtitle");
const mapPrimaryAction = document.querySelector("#map-primary-action");
let openSheet = null;
let toastTimer = 0;
let mapIndex = readMapIndex();
let wheelPhysicalIndex = mapIndexToPhysicalSlide(mapIndex);
let wheelTransitioning = false;
let wheelTimer = 0;
let dragPointerId = null;
let dragStartX = 0;
let dragStartTime = 0;
let dragDeltaX = 0;
const WHEEL_TRANSITION_MS = 400;

function cloneMapSlide(slide) {
  const clone = slide.cloneNode(true);
  clone.setAttribute("data-map-clone", "true");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  return clone;
}

function setupMapLoopSlides() {
  if (!mapTrack || mapSlides.length < 2) return mapSlides;
  const leadingClone = cloneMapSlide(mapSlides.at(-1));
  const trailingClone = cloneMapSlide(mapSlides[0]);
  mapTrack.prepend(leadingClone);
  mapTrack.append(trailingClone);
  return [leadingClone, ...mapSlides, trailingClone];
}

function readMapIndex() {
  try {
    return normalizeMapIndex(storage.getItem(HOME_MAP_KEY));
  } catch {
    return 0;
  }
}

function writeMapIndex(index) {
  try {
    storage.setItem(HOME_MAP_KEY, String(normalizeMapIndex(index)));
  } catch {
    // The lobby remains playable when private browsing blocks storage.
  }
}

function renderWheel(progress = 0) {
  const dragProgress = Math.max(-1, Math.min(1, Number(progress) || 0));
  const center = wheelPhysicalIndex + dragProgress;
  mapLoopSlides.forEach((slide, physicalIndex) => {
    const pose = cardWheelPose(physicalIndex - center);
    slide.style.setProperty("--map-translate-x", `${pose.translatePercent}%`);
    slide.style.setProperty("--map-rotate-y", `${pose.rotateY}deg`);
    slide.style.setProperty("--map-scale", String(pose.scale));
    slide.style.setProperty("--map-opacity", String(pose.opacity));
    slide.style.zIndex = String(pose.zIndex);
  });
}

function normalizeWheelLoop() {
  let normalized = wheelPhysicalIndex;
  if (normalized <= 0) normalized = HOME_MAPS.length;
  if (normalized >= HOME_MAPS.length + 1) normalized = 1;
  if (normalized === wheelPhysicalIndex) return;
  wheelPhysicalIndex = normalized;
  mapViewport?.classList.add("is-wheel-jump");
  renderWheel();
  requestAnimationFrame(() => mapViewport?.classList.remove("is-wheel-jump"));
}

function finishWheelTransition() {
  window.clearTimeout(wheelTimer);
  normalizeWheelLoop();
  wheelTransitioning = false;
  mapViewport?.removeAttribute("aria-busy");
}

function queueWheelFinish() {
  window.clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(finishWheelTransition, WHEEL_TRANSITION_MS);
}

function renderMap() {
  if (!mapViewport || !HOME_MAPS.length) return;
  const map = HOME_MAPS[mapIndex];
  mapTitle.textContent = map.title;
  mapSubtitle.textContent = map.subtitle;
  mapStatus.textContent = map.available ? "今日营业" : "新店预告";
  mapCount.textContent = `${mapIndex + 1}/${HOME_MAPS.length}`;

  mapSlides.forEach((slide, index) => {
    slide.setAttribute("aria-hidden", String(index !== mapIndex));
  });
  const hint = mapPrimaryAction?.querySelector("small");
  const label = mapPrimaryAction?.querySelector("strong");
  if (hint) hint.textContent = map.actionHint;
  if (label) label.textContent = map.actionLabel;
  mapPrimaryAction?.classList.toggle("is-disabled", !map.available);
  mapPrimaryAction?.setAttribute("aria-disabled", String(!map.available));
  if (map.available) {
    mapPrimaryAction.href = map.href;
  } else {
    mapPrimaryAction.removeAttribute("href");
  }
}

function selectMap(nextIndex, { persist = true } = {}) {
  const normalized = normalizeMapIndex(nextIndex);
  if (normalized === mapIndex) return false;
  const direction = changeMapIndex(mapIndex, 1) === normalized ? 1 : -1;
  return moveMap(direction, { persist });
}

function moveMap(direction, { persist = true } = {}) {
  const step = Math.sign(Number(direction) || 0);
  if (!step || wheelTransitioning || HOME_MAPS.length < 2) return false;
  const previousIndex = mapIndex;
  const nextIndex = changeMapIndex(previousIndex, step);
  let physicalTarget = mapIndexToPhysicalSlide(nextIndex);
  if (step < 0 && previousIndex === 0) physicalTarget = 0;
  if (step > 0 && previousIndex === HOME_MAPS.length - 1) {
    physicalTarget = HOME_MAPS.length + 1;
  }
  mapIndex = nextIndex;
  wheelPhysicalIndex = physicalTarget;
  wheelTransitioning = true;
  mapViewport?.classList.remove("is-dragging");
  mapViewport?.setAttribute("aria-busy", "true");
  if (persist) writeMapIndex(mapIndex);
  renderMap();
  renderWheel();
  queueWheelFinish();
  return true;
}

function snapWheelBack() {
  wheelTransitioning = true;
  mapViewport?.classList.remove("is-dragging");
  mapViewport?.setAttribute("aria-busy", "true");
  renderWheel();
  queueWheelFinish();
}

function beginMapDrag(event) {
  if (wheelTransitioning || HOME_MAPS.length < 2) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  dragPointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartTime = performance.now();
  dragDeltaX = 0;
  mapViewport.classList.add("is-dragging");
  mapViewport.setPointerCapture?.(event.pointerId);
}

function updateMapDrag(event) {
  if (event.pointerId !== dragPointerId) return;
  dragDeltaX = event.clientX - dragStartX;
  const width = Math.max(1, mapViewport.clientWidth);
  const progress = -dragDeltaX / (width * 0.72);
  renderWheel(progress);
  if (Math.abs(dragDeltaX) > 8) event.preventDefault();
}

function endMapDrag(event, cancelled = false) {
  if (event.pointerId !== dragPointerId) return;
  const elapsed = Math.max(1, performance.now() - dragStartTime);
  const direction = cancelled ? 0 : resolveSwipe({
    deltaX: dragDeltaX,
    width: mapViewport.clientWidth,
    velocityX: dragDeltaX / elapsed,
  });
  mapViewport.releasePointerCapture?.(event.pointerId);
  dragPointerId = null;
  mapViewport.classList.remove("is-dragging");
  if (direction) moveMap(direction);
  else snapWheelBack();
}

function readProgress() {
  try {
    return normalizeHomeProgress(JSON.parse(storage.getItem(HOME_PROGRESS_KEY) || "null"));
  } catch {
    return createHomeProgress();
  }
}

function writeProgress(progress) {
  storage.setItem(HOME_PROGRESS_KEY, JSON.stringify(normalizeHomeProgress(progress)));
}

let progress = readProgress();

function renderProgress() {
  energyValue.textContent = String(progress.energy);
  coinValue.textContent = String(progress.coins);
  const claimedToday = progress.lastClaimDay === dayStamp();
  dailyDot.hidden = claimedToday;
  claimButton.disabled = claimedToday;
  claimButton.textContent = claimedToday ? "今天已领取" : "签到领取";
  dailyStatus.textContent = claimedToday ? "奖励已放进口袋，明天再来！" : "";
  const currentDay = claimedToday ? progress.streak : (progress.streak >= 7 ? 1 : progress.streak + 1);
  rewardCards.forEach((card) => {
    const day = Number(card.dataset.day);
    card.classList.toggle("is-claimed", claimedToday && day <= progress.streak);
    card.classList.toggle("is-current", !claimedToday && day === currentDay);
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function closeCurrentSheet() {
  if (!openSheet) return;
  openSheet.dataset.open = "false";
  openSheet.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  const closing = openSheet;
  openSheet = null;
  window.setTimeout(() => {
    if (closing.dataset.open !== "true") closing.hidden = true;
  }, 190);
}

function showSheet(id) {
  closeCurrentSheet();
  const sheet = document.querySelector(`#${id}`);
  if (!sheet) return;
  sheet.hidden = false;
  backdrop.hidden = false;
  openSheet = sheet;
  requestAnimationFrame(() => {
    sheet.dataset.open = "true";
    sheet.setAttribute("aria-hidden", "false");
    sheet.querySelector("button, a")?.focus({ preventScroll: true });
  });
}

document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close-sheet]");
  if (close || event.target === backdrop) {
    closeCurrentSheet();
    return;
  }

  const action = event.target.closest("[data-home-action]")?.dataset.homeAction;
  if (!action) return;
  if (action === "daily-checkin") showSheet("daily-checkin");
  if (action === "cookbook") showSheet("cookbook-sheet");
  if (action === "settings") showSheet("settings-sheet");
  if (action === "sushi") selectMap(1);
  if (action === "ad-reward") showToast("广告奖励暂未接入，不会让你白看广告。");
  if (action === "reset-home") {
    storage.removeItem(HOME_PROGRESS_KEY);
    progress = createHomeProgress();
    renderProgress();
    closeCurrentSheet();
    showToast("主页记录已经重置");
  }
});

mapPrimaryAction?.addEventListener("click", (event) => {
  if (HOME_MAPS[mapIndex]?.available) return;
  event.preventDefault();
  showToast("寿司店还在筹备，先去汉堡小馆营业吧");
});

mapArrows.forEach((arrow) => {
  arrow.addEventListener("click", () => moveMap(Number(arrow.dataset.mapDirection)));
});

mapViewport?.addEventListener("pointerdown", beginMapDrag);
mapViewport?.addEventListener("pointermove", updateMapDrag);
mapViewport?.addEventListener("pointerup", (event) => endMapDrag(event));
mapViewport?.addEventListener("pointercancel", (event) => endMapDrag(event, true));
mapViewport?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveMap(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveMap(1);
  }
});

window.addEventListener("resize", () => {
  renderMap();
  renderWheel();
});

claimButton.addEventListener("click", () => {
  const result = claimDailyReward(progress);
  progress = result.progress;
  writeProgress(progress);
  renderProgress();
  if (result.claimed) {
    showToast("签到成功，奖励已到账！");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCurrentSheet();
});

renderProgress();
requestAnimationFrame(() => {
  renderMap();
  renderWheel();
});
if (progress.lastClaimDay !== dayStamp()) {
  window.setTimeout(() => showSheet("daily-checkin"), 280);
}
