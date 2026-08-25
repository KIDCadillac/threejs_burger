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
  changeMapIndex,
  normalizeMapIndex,
  resolveSwipe,
} from "./home-map-carousel-state.mjs?v=20260822-stage2";
import {
  HOME_MODE_KEY,
  HOME_MODES,
  changeModeIndexForMap,
  lockGestureAxis,
  modeIndexForMap,
  normalizeModeIndex,
  resolveModeSwipe,
} from "./home-mode-switch-state.mjs?v=20260823-conveyor39";
import { createHomeFoodOrbit } from "./home-food-orbit-3d.mjs?v=20260822-stage2";

const storage = window.localStorage;
const layoutEditorMode = new URLSearchParams(window.location.search).get("layout") === "1";
const playableModeIds = Object.freeze(["practice", "swipe-stack", "duel", "duo"]);
const playableModes = Object.freeze(
  playableModeIds.map((id) => HOME_MODES.find((mode) => mode.id === id)).filter(Boolean),
);

const energyValue = document.querySelector("#energy-value");
const coinValue = document.querySelector("#coin-value");
const dailyDot = document.querySelector("#daily-dot");
const dailyStatus = document.querySelector("#daily-status");
const claimButton = document.querySelector("#claim-daily");
const rewardCards = [...document.querySelectorAll("[data-day]")];
const backdrop = document.querySelector("#sheet-backdrop");
const toast = document.querySelector("#home-toast");
const foodViewport = document.querySelector("#home-food-viewport");
const foodCanvas = document.querySelector("#home-food-canvas");
const mapTitle = document.querySelector("#lobby-title");
const mapKicker = document.querySelector("#home-theme-kicker");
const mapSubtitle = document.querySelector("#home-theme-subtitle");
const hudTitle = document.querySelector("#lobby-hud-title");
const modeLabel = document.querySelector("#home-mode-label");
const modeHint = document.querySelector("#home-mode-hint");
const modeCounter = document.querySelector("#home-mode-counter");
const modeActive = document.querySelector("#home-mode-active");
const modePrevious = document.querySelector("#home-mode-previous");
const modeNext = document.querySelector("#home-mode-next");
const startButton = document.querySelector("#home-start-button");
const themeButtons = [...document.querySelectorAll("[data-theme-id]")];
const themePeekButtons = [...document.querySelectorAll("[data-theme-step]")];
const modeStepButtons = [...document.querySelectorAll("[data-mode-step]")];

let openSheet = null;
let toastTimer = 0;
let mapIndex = readMapIndex();
let modeIndex = readModeIndex();
let dragPointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartedAt = 0;
let dragDeltaX = 0;
let dragDeltaY = 0;
let gestureAxis = null;
let gestureMoved = false;
let suppressViewportClick = false;
let progress = readProgress();
let foodOrbit = null;

function safeStorageGet(key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // The selector remains usable when storage is unavailable.
  }
}

function readMapIndex() {
  return normalizeMapIndex(safeStorageGet(HOME_MAP_KEY));
}

function writeMapIndex(value) {
  safeStorageSet(HOME_MAP_KEY, String(normalizeMapIndex(value)));
}

function readModeIndex() {
  const normalized = normalizeModeIndex(safeStorageGet(HOME_MODE_KEY));
  return modeIndexForMap("burger", normalized);
}

function writeModeIndex(value) {
  safeStorageSet(HOME_MODE_KEY, String(normalizeModeIndex(value)));
}

function readProgress() {
  try {
    return normalizeHomeProgress(JSON.parse(safeStorageGet(HOME_PROGRESS_KEY) || "null"));
  } catch {
    return createHomeProgress();
  }
}

function writeProgress(nextProgress) {
  safeStorageSet(HOME_PROGRESS_KEY, JSON.stringify(normalizeHomeProgress(nextProgress)));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function activeMode() {
  return HOME_MODES[modeIndex] ?? playableModes[0];
}

function renderTheme({ direction = 0, announce = false } = {}) {
  const map = HOME_MAPS[mapIndex] ?? HOME_MAPS[0];
  document.body.dataset.homeTheme = map.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", map.id === "burger" ? "#f5a623" : "#3dbfa0");
  hudTitle.textContent = map.title;
  mapTitle.textContent = map.title;
  mapKicker.textContent = map.id === "burger" ? "今日主题 · 汉堡" : "下一主题 · 寿司";
  mapSubtitle.textContent = map.subtitle;
  foodCanvas?.setAttribute("aria-label", `${map.title}的旋转料理模型`);
  foodViewport?.setAttribute("aria-label", `${map.title}。左右滑动切换汉堡和寿司，上下滑动切换玩法`);
  themeButtons.forEach((button) => {
    const active = button.dataset.themeId === map.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  themePeekButtons.forEach((button) => {
    const nextMap = HOME_MAPS[(mapIndex + HOME_MAPS.length + Number(button.dataset.themeStep || 1)) % HOME_MAPS.length];
    button.querySelector("strong").textContent = nextMap.title.replace("小馆", "").replace("深夜", "").replace("店", "");
    button.setAttribute("aria-label", `切换到${nextMap.title}`);
  });
  startButton.textContent = map.available ? "开始游戏" : "寿司玩法筹备中";
  startButton.dataset.available = String(Boolean(map.available));
  foodOrbit?.setFood(map.id, direction || 1);
  if (announce) showToast(`${map.title} · 左右滑动可继续切换`);
}

function renderMode({ animate = false, announce = false } = {}) {
  const mode = activeMode();
  const position = Math.max(0, playableModeIds.indexOf(mode.id));
  const previousMode = playableModes[(position - 1 + playableModes.length) % playableModes.length];
  const nextMode = playableModes[(position + 1) % playableModes.length];
  modeLabel.textContent = mode.label;
  modeHint.textContent = mode.hint;
  modeCounter.textContent = String(position + 1).padStart(2, "0");
  modePrevious.textContent = previousMode.label;
  modeNext.textContent = nextMode.label;
  document.body.dataset.homeMode = mode.id;
  if (animate) {
    const panel = document.querySelector("#home-mode-panel");
    panel?.classList.remove("is-switching");
    void panel?.offsetWidth;
    panel?.classList.add("is-switching");
  }
  if (announce) showToast(`${mode.label} · ${mode.hint}`);
}

function moveTheme(direction, { persist = true, announce = true } = {}) {
  const step = Math.sign(Number(direction) || 0);
  if (!step) return false;
  mapIndex = changeMapIndex(mapIndex, step);
  if (persist) writeMapIndex(mapIndex);
  renderTheme({ direction: step, announce });
  return true;
}

function selectTheme(themeId, { persist = true, announce = false } = {}) {
  const nextIndex = HOME_MAPS.findIndex((map) => map.id === themeId);
  if (nextIndex < 0 || nextIndex === mapIndex) return false;
  const direction = changeMapIndex(mapIndex, 1) === nextIndex ? 1 : -1;
  mapIndex = nextIndex;
  if (persist) writeMapIndex(mapIndex);
  renderTheme({ direction, announce });
  return true;
}

function moveMode(direction, { persist = true, announce = true } = {}) {
  const nextIndex = changeModeIndexForMap("burger", modeIndex, direction);
  if (nextIndex === modeIndex) return false;
  modeIndex = nextIndex;
  if (persist) writeModeIndex(modeIndex);
  renderMode({ animate: true, announce });
  return true;
}

function activateCurrentMode() {
  const map = HOME_MAPS[mapIndex] ?? HOME_MAPS[0];
  const mode = activeMode();
  if (!map.available) {
    showToast("寿司玩法还在制作，先左右滑回汉堡体验完整流程");
    return;
  }
  if (mode.action === "practice") window.location.href = "./cooking.html?recipe=classic-beef";
  if (mode.action === "swipe-stack") window.location.href = "./swipe-stack.html?v=20260826-orderswipe49";
  if (mode.action === "duel") window.location.href = "./replica-duel.html";
  if (mode.action === "duo") window.location.href = "./cooking.html?mode=duo";
}

function resetGesturePreview() {
  foodViewport?.style.setProperty("--gesture-x", "0px");
  foodViewport?.style.setProperty("--gesture-y", "0px");
  foodViewport?.removeAttribute("data-gesture-axis");
  foodViewport?.classList.remove("is-dragging");
}

function beginGesture(event) {
  if (layoutEditorMode || document.documentElement.classList.contains("layout-editor-active")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  dragPointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartedAt = performance.now();
  dragDeltaX = 0;
  dragDeltaY = 0;
  gestureAxis = null;
  gestureMoved = false;
  suppressViewportClick = false;
  foodViewport.classList.add("is-dragging");
  foodViewport.setPointerCapture?.(event.pointerId);
}

function updateGesture(event) {
  if (event.pointerId !== dragPointerId) return;
  dragDeltaX = event.clientX - dragStartX;
  dragDeltaY = event.clientY - dragStartY;
  if (!gestureAxis) gestureAxis = lockGestureAxis({ deltaX: dragDeltaX, deltaY: dragDeltaY });
  if (!gestureAxis) return;
  gestureMoved = true;
  foodViewport.dataset.gestureAxis = gestureAxis;
  if (gestureAxis === "horizontal") {
    const preview = Math.max(-42, Math.min(42, dragDeltaX * 0.18));
    foodViewport.style.setProperty("--gesture-x", `${preview}px`);
  } else {
    const preview = Math.max(-28, Math.min(28, dragDeltaY * 0.16));
    foodViewport.style.setProperty("--gesture-y", `${preview}px`);
  }
  event.preventDefault();
}

function endGesture(event, cancelled = false) {
  if (event.pointerId !== dragPointerId) return;
  const elapsed = Math.max(1, performance.now() - dragStartedAt);
  foodViewport.releasePointerCapture?.(event.pointerId);
  dragPointerId = null;
  suppressViewportClick = gestureMoved;
  if (!cancelled && gestureAxis === "horizontal") {
    const direction = resolveSwipe({
      deltaX: dragDeltaX,
      width: foodViewport.clientWidth,
      velocityX: dragDeltaX / elapsed,
    });
    if (direction) moveTheme(direction);
  }
  if (!cancelled && gestureAxis === "vertical") {
    const direction = resolveModeSwipe({
      deltaY: dragDeltaY,
      height: foodViewport.clientHeight,
      velocityY: dragDeltaY / elapsed,
    });
    if (direction) moveMode(direction);
  }
  resetGesturePreview();
}

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
  if (event.target.closest("[data-close-sheet]") || event.target === backdrop) {
    closeCurrentSheet();
    return;
  }
  const action = event.target.closest("[data-home-action]")?.dataset.homeAction;
  if (!action) return;
  if (action === "daily-checkin") showSheet("daily-checkin");
  if (action === "cookbook") showSheet("cookbook-sheet");
  if (action === "settings") showSheet("settings-sheet");
  if (action === "ad-reward") showToast("广告奖励暂未接入，不会让你白看广告。");
  if (action === "reset-home") {
    progress = createHomeProgress();
    writeProgress(progress);
    mapIndex = 0;
    modeIndex = modeIndexForMap("burger", 0);
    writeMapIndex(mapIndex);
    writeModeIndex(modeIndex);
    renderProgress();
    renderTheme();
    renderMode();
    closeCurrentSheet();
    showToast("主页记录已经重置");
  }
});

themeButtons.forEach((button) => {
  button.addEventListener("click", () => selectTheme(button.dataset.themeId, { announce: true }));
});
themePeekButtons.forEach((button) => {
  button.addEventListener("click", () => moveTheme(Number(button.dataset.themeStep || 1)));
});
modeStepButtons.forEach((button) => {
  button.addEventListener("click", () => moveMode(Number(button.dataset.modeStep || 0)));
});
startButton?.addEventListener("click", activateCurrentMode);
modeActive?.addEventListener("click", activateCurrentMode);
foodViewport?.addEventListener("pointerdown", beginGesture);
foodViewport?.addEventListener("pointermove", updateGesture);
foodViewport?.addEventListener("pointerup", (event) => endGesture(event));
foodViewport?.addEventListener("pointercancel", (event) => endGesture(event, true));
foodViewport?.addEventListener("click", (event) => {
  if (suppressViewportClick) {
    suppressViewportClick = false;
    event.preventDefault();
    return;
  }
  if (event.target.closest("button")) return;
  activateCurrentMode();
});
foodViewport?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveTheme(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveTheme(1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveMode(1);
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveMode(-1);
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activateCurrentMode();
  }
});

window.addEventListener("burger:editor-select-map", (event) => {
  selectTheme(event.detail?.mapId, { persist: false });
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCurrentSheet();
});
claimButton?.addEventListener("click", () => {
  const result = claimDailyReward(progress);
  progress = result.progress;
  writeProgress(progress);
  renderProgress();
  if (result.claimed) showToast("签到成功，奖励已到账！");
});

try {
  foodOrbit = createHomeFoodOrbit(foodCanvas, {
    windowTarget: window,
    initialFood: HOME_MAPS[mapIndex]?.id,
  });
} catch (error) {
  document.body.classList.add("home-food-webgl-failed");
  showToast("旋转料理预览没有加载成功，请刷新页面重试");
}

renderProgress();
renderTheme();
renderMode();
