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
  mapIndexToPhysicalSlide,
  normalizeMapIndex,
  physicalSlideToMapIndex,
} from "./home-map-carousel-state.mjs";

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
const mapDots = [...document.querySelectorAll("[data-map-index]")];
const mapCount = document.querySelector("#home-map-count");
const mapStatus = document.querySelector("#map-status");
const mapTitle = document.querySelector("#lobby-title");
const mapSubtitle = document.querySelector("#map-subtitle");
const mapPrimaryAction = document.querySelector("#map-primary-action");
let openSheet = null;
let toastTimer = 0;
let mapIndex = readMapIndex();
let mapScrollFrame = 0;
let mapSettleTimer = 0;

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

function mapStep() {
  const measured = mapLoopSlides[1]?.offsetLeft - mapLoopSlides[0]?.offsetLeft;
  return measured > 0 ? measured : Math.max(1, mapViewport?.clientWidth || 1);
}

function physicalMapSlide() {
  return Math.round((mapViewport?.scrollLeft || 0) / mapStep());
}

function scrollToPhysicalSlide(physicalSlide, animated) {
  mapViewport?.scrollTo({
    left: physicalSlide * mapStep(),
    behavior: animated ? "smooth" : "auto",
  });
}

function scrollMapIntoView(animated) {
  scrollToPhysicalSlide(mapIndexToPhysicalSlide(mapIndex), animated);
}

function jumpToPhysicalSlide(physicalSlide) {
  if (!mapViewport) return;
  const previousBehavior = mapViewport.style.scrollBehavior;
  const previousSnapType = mapViewport.style.scrollSnapType;
  mapViewport.style.scrollBehavior = "auto";
  mapViewport.style.scrollSnapType = "none";
  mapViewport.scrollLeft = physicalSlide * mapStep();
  requestAnimationFrame(() => {
    mapViewport.style.scrollBehavior = previousBehavior;
    mapViewport.style.scrollSnapType = previousSnapType;
  });
}

function settleLoopPosition() {
  window.clearTimeout(mapSettleTimer);
  const physical = physicalMapSlide();
  if (physical <= 0) {
    jumpToPhysicalSlide(HOME_MAPS.length);
  } else if (physical >= HOME_MAPS.length + 1) {
    jumpToPhysicalSlide(1);
  }
}

function renderMap(animated = true, moveViewport = true) {
  if (!mapViewport || !HOME_MAPS.length) return;
  const map = HOME_MAPS[mapIndex];
  if (moveViewport) scrollMapIntoView(animated);
  mapTitle.textContent = map.title;
  mapSubtitle.textContent = map.subtitle;
  mapStatus.textContent = map.available ? "今日营业" : "新店预告";
  mapCount.textContent = `${mapIndex + 1}/${HOME_MAPS.length}`;

  mapSlides.forEach((slide, index) => {
    slide.setAttribute("aria-hidden", String(index !== mapIndex));
  });
  mapDots.forEach((dot, index) => {
    const active = index === mapIndex;
    dot.classList.toggle("is-active", active);
    if (active) dot.setAttribute("aria-current", "true");
    else dot.removeAttribute("aria-current");
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

function selectMap(nextIndex, { animated = true, persist = true } = {}) {
  const normalized = normalizeMapIndex(nextIndex);
  const changed = normalized !== mapIndex;
  mapIndex = normalized;
  if (persist) writeMapIndex(mapIndex);
  renderMap(animated);
  return changed;
}

function moveMap(direction) {
  const step = Math.sign(Number(direction) || 0);
  if (!step) return false;
  const previousIndex = mapIndex;
  const nextIndex = changeMapIndex(previousIndex, step);
  let physicalTarget = mapIndexToPhysicalSlide(nextIndex);
  if (step < 0 && previousIndex === 0) physicalTarget = 0;
  if (step > 0 && previousIndex === HOME_MAPS.length - 1) {
    physicalTarget = HOME_MAPS.length + 1;
  }
  mapIndex = nextIndex;
  writeMapIndex(mapIndex);
  renderMap(false, false);
  scrollToPhysicalSlide(physicalTarget, true);
  return true;
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

mapDots.forEach((dot) => {
  dot.addEventListener("click", () => selectMap(Number(dot.dataset.mapIndex)));
});

mapViewport?.addEventListener("scroll", () => {
  window.clearTimeout(mapSettleTimer);
  mapSettleTimer = window.setTimeout(settleLoopPosition, 120);
  if (mapScrollFrame) return;
  mapScrollFrame = requestAnimationFrame(() => {
    mapScrollFrame = 0;
    const nextIndex = physicalSlideToMapIndex(physicalMapSlide());
    if (nextIndex === mapIndex) return;
    mapIndex = nextIndex;
    writeMapIndex(mapIndex);
    renderMap(false, false);
  });
}, { passive: true });
mapViewport?.addEventListener("scrollend", settleLoopPosition, { passive: true });
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

window.addEventListener("resize", () => renderMap(false));

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
requestAnimationFrame(() => renderMap(false));
if (progress.lastClaimDay !== dayStamp()) {
  window.setTimeout(() => showSheet("daily-checkin"), 280);
}
