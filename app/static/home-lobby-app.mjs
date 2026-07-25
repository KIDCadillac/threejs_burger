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
  activeCardAccessoryPose,
  afterNextPaint,
  changeMapIndex,
  createLatestFrameScheduler,
  createMapCardWindow,
  dragProgressFromDelta,
  mapIndexAtOffset,
  normalizeMapIndex,
  resolveSwipe,
  shiftBufferedCardOffset,
  streetShopPose,
} from "./home-map-carousel-state.mjs?v=20260725-streetshop2";
import {
  HOME_BUSINESS_KEY,
  HOME_MODE_KEY,
  HOME_MODES,
  changeModeIndexForMap,
  lockGestureAxis,
  modeIndexForMap,
  normalizeBusinessOpen,
  normalizeModeIndex,
  resolveModeSwipe,
} from "./home-mode-switch-state.mjs?v=20260724-coupled1";

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
const mapTemplates = [...document.querySelectorAll("[data-map-template]")];
const bufferedMapSlides = setupBufferedMapSlides();
const mapArrows = [...document.querySelectorAll("[data-map-direction]")];
const mapStatus = document.querySelector("#map-status");
const mapTitle = document.querySelector("#lobby-title");
const lobbyStage = document.querySelector(".lobby-stage");
const modeIndicator = document.querySelector("#home-mode-indicator");
const modeLabel = document.querySelector("#home-mode-label");
const modeHint = document.querySelector("#home-mode-hint");
const businessToggle = document.querySelector("[data-business-toggle]");
const businessLabel = document.querySelector("#business-label");
let openSheet = null;
let toastTimer = 0;
let mapIndex = readMapIndex();
let modeIndex = readModeIndex();
let businessOpen = readBusinessOpen();
let pendingMapIndex = null;
let pendingMapStep = 0;
let wheelTransitioning = false;
let wheelTimer = 0;
let openTimer = 0;
let dragPointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartTime = 0;
let dragDeltaX = 0;
let dragDeltaY = 0;
let gestureAxis = null;
let gestureMoved = false;
let suppressMapClick = false;
const WHEEL_TRANSITION_MS = 280;
const SHOP_OPEN_MS = 260;
const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const wheelFrameScheduler = createLatestFrameScheduler({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (frameId) => cancelAnimationFrame(frameId),
  render: (progress) => renderWheel(progress),
});

function setupBufferedMapSlides() {
  if (!mapTrack || !mapTemplates.length) return [];
  const slots = [-2, -1, 0, 1, 2].map((offset) => {
    const slot = mapTemplates[0].cloneNode(true);
    slot.removeAttribute("data-map-template");
    slot.setAttribute("data-card-offset", String(offset));
    return slot;
  });
  mapTrack.replaceChildren(...slots);
  return slots;
}

function refreshBufferedMapSlides(activeIndex = mapIndex) {
  const cardWindow = createMapCardWindow(activeIndex, mapTemplates.length);
  cardWindow.forEach(({ offset, mapIndex: templateIndex }, slotIndex) => {
    const slot = bufferedMapSlides[slotIndex];
    hydrateBufferedMapSlide(slot, templateIndex, offset);
  });
}

function updateBufferedMapSlideAccess(slot, offset) {
  if (!slot) return;
  slot.setAttribute("data-card-offset", String(offset));
  slot.setAttribute("aria-hidden", String(offset !== 0));
  if (offset === 0) slot.removeAttribute("inert");
  else slot.setAttribute("inert", "");
}

function hydrateBufferedMapSlide(slot, templateIndex, offset) {
  const template = mapTemplates[templateIndex];
  if (!slot || !template) return;
  slot.className = template.className;
  slot.dataset.homeMap = template.dataset.homeMap;
  slot.innerHTML = template.innerHTML;
  slot.setAttribute("aria-label", template.getAttribute("aria-label") || "");
  updateBufferedMapSlideAccess(slot, offset);
}

function advanceBufferedMapSlides(activeIndex, step) {
  bufferedMapSlides.forEach((slot) => {
    const previousOffset = Number(slot.dataset.cardOffset) || 0;
    const nextOffset = shiftBufferedCardOffset(previousOffset, step);
    const recycled = Math.abs(nextOffset - previousOffset) > 1;
    if (recycled) {
      hydrateBufferedMapSlide(
        slot,
        mapIndexAtOffset(activeIndex, nextOffset, mapTemplates.length),
        nextOffset,
      );
      return;
    }
    slot.classList.remove("is-opening", "is-closing");
    updateBufferedMapSlideAccess(slot, nextOffset);
  });
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

function readModeIndex() {
  try {
    return normalizeModeIndex(storage.getItem(HOME_MODE_KEY));
  } catch {
    return 0;
  }
}

function writeModeIndex(index) {
  try {
    storage.setItem(HOME_MODE_KEY, String(normalizeModeIndex(index)));
  } catch {
    // Mode switching stays available when storage is blocked.
  }
}

function readBusinessOpen() {
  try {
    return normalizeBusinessOpen(storage.getItem(HOME_BUSINESS_KEY));
  } catch {
    return false;
  }
}

function writeBusinessOpen(isOpen) {
  try {
    storage.setItem(HOME_BUSINESS_KEY, isOpen ? "open" : "closed");
  } catch {
    // The physical sign still toggles for this session.
  }
}

function renderWheel(progress = 0) {
  const dragProgress = Math.max(-1, Math.min(1, Number(progress) || 0));
  bufferedMapSlides.forEach((slide) => {
    const offset = Number(slide.dataset.cardOffset) || 0;
    const pose = streetShopPose(offset - dragProgress);
    const motion = `translate3d(${pose.translatePercent}%, ${pose.translateYPercent}%, 0) scale(${pose.scale})`;
    slide.style.transform = motion;
    slide.style.opacity = String(pose.opacity);
    slide.style.setProperty("--map-shade-opacity", String(pose.shadeOpacity));
    slide.style.zIndex = String(pose.zIndex);
  });
  const accessoryPose = activeCardAccessoryPose(dragProgress);
  modeIndicator?.style.setProperty("--mode-card-x", `${accessoryPose.translatePercent}%`);
  modeIndicator?.style.setProperty("--mode-card-scale", String(accessoryPose.scale));
  modeIndicator?.style.setProperty("--mode-card-opacity", String(accessoryPose.opacity));
}

function resetBufferedWheel({ step = 0 } = {}) {
  wheelFrameScheduler.cancel();
  mapViewport?.classList.add("is-wheel-jump");
  if (step) advanceBufferedMapSlides(mapIndex, step);
  else refreshBufferedMapSlides(mapIndex);
  renderWheel();
  afterNextPaint(
    (callback) => requestAnimationFrame(callback),
    () => mapViewport?.classList.remove("is-wheel-jump"),
  );
}

function playShopOpen() {
  if (wheelTransitioning || dragPointerId !== null) return;
  const slide = activeMapSlide();
  if (!slide) return;
  window.clearTimeout(openTimer);
  slide.classList.remove("is-closing", "is-opening");
  void slide.offsetWidth;
  slide.classList.add("is-opening");

  if (HOME_MAPS[mapIndex]?.available && !businessOpen) {
    businessOpen = true;
    writeBusinessOpen(true);
    renderBusiness();
    replayBusinessFlip();
  }

  openTimer = window.setTimeout(() => {
    slide.classList.remove("is-opening");
  }, reducedMotionQuery?.matches ? 0 : SHOP_OPEN_MS);
}

function finishWheelTransition({ playArrival = true } = {}) {
  wheelFrameScheduler.cancel();
  window.clearTimeout(wheelTimer);
  const arrived = pendingMapIndex !== null;
  if (pendingMapIndex !== null) {
    const arrivedStep = pendingMapStep;
    mapIndex = pendingMapIndex;
    pendingMapIndex = null;
    pendingMapStep = 0;
    renderMap();
    resetBufferedWheel({ step: arrivedStep });
  } else {
    renderWheel();
  }
  wheelTransitioning = false;
  lobbyStage?.classList.remove("is-switching-shop");
  mapViewport?.removeAttribute("aria-busy");
  if (arrived && playArrival) {
    afterNextPaint(
      (callback) => requestAnimationFrame(callback),
      playShopOpen,
    );
  }
}

function settleWheelForInteraction() {
  if (!wheelTransitioning) return false;
  finishWheelTransition();
  return true;
}

function queueWheelFinish() {
  window.clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(finishWheelTransition, WHEEL_TRANSITION_MS);
}

function renderMap() {
  if (!mapViewport || !HOME_MAPS.length) return;
  const map = HOME_MAPS[mapIndex];
  mapTitle.textContent = map.title;
  const nextModeIndex = modeIndexForMap(map.id, modeIndex);
  if (nextModeIndex !== modeIndex) {
    modeIndex = nextModeIndex;
    writeModeIndex(modeIndex);
  }

  renderMode();
  renderBusiness();
}

function resetModePreview() {
  modeIndicator?.style.setProperty("--mode-drag-y", "0px");
  modeIndicator?.style.setProperty("--mode-drag-rotate", "0deg");
}

function renderMode({ animate = false } = {}) {
  const mode = HOME_MODES[modeIndex];
  if (!mode) return;
  if (modeLabel) modeLabel.textContent = mode.label;
  if (modeHint) modeHint.textContent = mode.hint;
  resetModePreview();
  if (!animate || !modeIndicator) return;
  modeIndicator.classList.remove("is-switching");
  void modeIndicator.offsetWidth;
  modeIndicator.classList.add("is-switching");
}

function moveMode(direction, { persist = true, animate = true } = {}) {
  const step = Math.sign(Number(direction) || 0);
  const mapId = HOME_MAPS[mapIndex]?.id;
  if (!step || !mapId) return false;
  const nextModeIndex = changeModeIndexForMap(mapId, modeIndex, step);
  if (nextModeIndex === modeIndex) return false;
  modeIndex = nextModeIndex;
  if (persist) writeModeIndex(modeIndex);
  renderMode({ animate });
  return true;
}

function activateMode() {
  const action = HOME_MODES[modeIndex]?.action;
  if (action === "practice") window.location.href = "./cooking.html?mode=practice";
  if (action === "cookbook") showSheet("cookbook-sheet");
  if (action === "duel") window.location.href = "./replica-duel.html";
  if (action === "sushi") {
    selectMap(1);
    showToast("寿司店还在筹备，先看看新店招牌");
  }
}

function renderBusiness() {
  const map = HOME_MAPS[mapIndex];
  const available = Boolean(map?.available);
  businessToggle?.toggleAttribute("disabled", !available);
  businessToggle?.classList.toggle("is-disabled", !available);
  businessToggle?.setAttribute("aria-disabled", String(!available));
  businessToggle?.setAttribute("aria-pressed", String(available && businessOpen));
  lobbyStage?.classList.toggle("is-open", available && businessOpen);
  if (!available) {
    if (businessLabel) businessLabel.textContent = "新店筹备";
    if (mapStatus) mapStatus.textContent = "暂未营业";
    return;
  }
  if (businessLabel) businessLabel.textContent = businessOpen ? "点击关门打烊" : "点击开门营业";
  if (mapStatus) mapStatus.textContent = businessOpen ? "营业中" : "已打烊";
}

function replayBusinessFlip() {
  if (!businessToggle) return;
  businessToggle.classList.remove("is-flipping");
  void businessToggle.offsetWidth;
  businessToggle.classList.add("is-flipping");
}

function toggleBusiness() {
  const map = HOME_MAPS[mapIndex];
  if (!map?.available) {
    showToast("新店还在筹备，暂时不能开门营业");
    return;
  }
  businessOpen = !businessOpen;
  writeBusinessOpen(businessOpen);
  renderBusiness();
  replayBusinessFlip();
  showToast(businessOpen ? "挂牌翻到营业中，欢迎光临！" : "挂牌翻到已打烊，今天辛苦了");
}

function selectMap(nextIndex, { persist = true } = {}) {
  const normalized = normalizeMapIndex(nextIndex);
  if (normalized === mapIndex) return false;
  const direction = changeMapIndex(mapIndex, 1) === normalized ? 1 : -1;
  return moveMap(direction, { persist });
}

function activeMapSlide() {
  return bufferedMapSlides.find((slide) => Number(slide.dataset.cardOffset) === 0) || null;
}

function beginShopClose(step, nextIndex, { persist = true, fromProgress = 0 } = {}) {
  wheelFrameScheduler.cancel();
  wheelTransitioning = true;
  pendingMapIndex = nextIndex;
  pendingMapStep = step;
  if (persist) writeMapIndex(nextIndex);
  window.clearTimeout(openTimer);
  renderWheel(fromProgress);
  mapViewport?.classList.remove("is-dragging");
  mapViewport?.setAttribute("aria-busy", "true");

  if (HOME_MAPS[mapIndex]?.available && businessOpen) {
    businessOpen = false;
    writeBusinessOpen(false);
    renderBusiness();
  }
  replayBusinessFlip();
  const activeSlide = activeMapSlide();
  activeSlide?.classList.remove("is-opening");
  activeSlide?.classList.add("is-closing");
  lobbyStage?.classList.add("is-switching-shop");

  renderWheel(step);
  queueWheelFinish();
  return true;
}

function moveMap(direction, { persist = true, fromProgress = 0 } = {}) {
  const step = Math.sign(Number(direction) || 0);
  if (!step || HOME_MAPS.length < 2) return false;
  if (wheelTransitioning) settleWheelForInteraction();
  const nextIndex = changeMapIndex(mapIndex, step);
  return beginShopClose(step, nextIndex, { persist, fromProgress });
}

function snapWheelBack() {
  wheelFrameScheduler.cancel();
  wheelTransitioning = true;
  mapViewport?.classList.remove("is-dragging");
  mapViewport?.setAttribute("aria-busy", "true");
  renderWheel();
  queueWheelFinish();
}

function beginMapDrag(event) {
  wheelFrameScheduler.cancel();
  if (wheelTransitioning) settleWheelForInteraction();
  if (HOME_MAPS.length < 2) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  dragPointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartTime = performance.now();
  dragDeltaX = 0;
  dragDeltaY = 0;
  gestureAxis = null;
  gestureMoved = false;
  suppressMapClick = false;
  mapViewport.classList.add("is-dragging");
  mapViewport.setPointerCapture?.(event.pointerId);
}

function updateMapDrag(event) {
  if (event.pointerId !== dragPointerId) return;
  dragDeltaX = event.clientX - dragStartX;
  dragDeltaY = event.clientY - dragStartY;
  if (!gestureAxis) gestureAxis = lockGestureAxis({ deltaX: dragDeltaX, deltaY: dragDeltaY });
  if (!gestureAxis) return;
  gestureMoved = true;
  if (gestureAxis === "horizontal") {
    const progress = dragProgressFromDelta({
      deltaX: dragDeltaX,
      width: mapViewport.clientWidth,
    });
    wheelFrameScheduler.schedule(progress);
  } else {
    const height = Math.max(1, mapViewport.clientHeight);
    const progress = Math.max(-1, Math.min(1, dragDeltaY / (height * 0.42)));
    modeIndicator?.style.setProperty("--mode-drag-y", `${progress * 18}px`);
    modeIndicator?.style.setProperty("--mode-drag-rotate", `${progress * -10}deg`);
  }
  event.preventDefault();
}

function endMapDrag(event, cancelled = false) {
  if (event.pointerId !== dragPointerId) return;
  const elapsed = Math.max(1, performance.now() - dragStartTime);
  mapViewport.releasePointerCapture?.(event.pointerId);
  dragPointerId = null;
  suppressMapClick = gestureMoved;
  if (cancelled) {
    wheelFrameScheduler.cancel();
    mapViewport.classList.remove("is-dragging");
    renderWheel();
    resetModePreview();
    return;
  }
  if (gestureAxis === "horizontal") {
    const fromProgress = dragProgressFromDelta({
      deltaX: dragDeltaX,
      width: mapViewport.clientWidth,
    });
    wheelFrameScheduler.flush();
    const direction = resolveSwipe({
      deltaX: dragDeltaX,
      width: mapViewport.clientWidth,
      velocityX: dragDeltaX / elapsed,
    });
    if (direction) moveMap(direction, { fromProgress });
    else snapWheelBack();
    return;
  }
  wheelFrameScheduler.cancel();
  mapViewport.classList.remove("is-dragging");
  if (gestureAxis === "vertical") {
    const direction = resolveModeSwipe({
      deltaY: dragDeltaY,
      height: mapViewport.clientHeight,
      velocityY: dragDeltaY / elapsed,
    });
    if (direction) moveMode(direction);
    else resetModePreview();
    return;
  }
  renderWheel();
  resetModePreview();
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

businessToggle?.addEventListener("click", toggleBusiness);
businessToggle?.addEventListener("animationend", () => {
  businessToggle.classList.remove("is-flipping");
});

mapArrows.forEach((arrow) => {
  arrow.addEventListener("click", () => moveMap(Number(arrow.dataset.mapDirection)));
});

mapViewport?.addEventListener("pointerdown", beginMapDrag);
mapViewport?.addEventListener("pointermove", updateMapDrag);
mapViewport?.addEventListener("pointerup", (event) => endMapDrag(event));
mapViewport?.addEventListener("pointercancel", (event) => endMapDrag(event, true));
mapViewport?.addEventListener("click", (event) => {
  if (suppressMapClick) {
    suppressMapClick = false;
    event.preventDefault();
    return;
  }
  activateMode();
});
mapViewport?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveMap(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveMap(1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveMode(1);
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveMode(-1);
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
  refreshBufferedMapSlides();
  renderMap();
  renderWheel();
  renderMode();
  renderBusiness();
});
if (progress.lastClaimDay !== dayStamp()) {
  window.setTimeout(() => showSheet("daily-checkin"), 280);
}
