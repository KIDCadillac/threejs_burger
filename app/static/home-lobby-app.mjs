import {
  HOME_PROGRESS_KEY,
  claimDailyReward,
  createHomeProgress,
  dayStamp,
  normalizeHomeProgress,
} from "./home-lobby-state.mjs";

const storage = window.localStorage;
const energyValue = document.querySelector("#energy-value");
const coinValue = document.querySelector("#coin-value");
const dailyDot = document.querySelector("#daily-dot");
const dailyStatus = document.querySelector("#daily-status");
const claimButton = document.querySelector("#claim-daily");
const rewardCards = [...document.querySelectorAll("[data-day]")];
const backdrop = document.querySelector("#sheet-backdrop");
const toast = document.querySelector("#home-toast");
let openSheet = null;
let toastTimer = 0;

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
  if (action === "sushi") showToast("寿司店正在装修，下一张地图见！");
  if (action === "ad-reward") showToast("广告奖励暂未接入，不会让你白看广告。");
  if (action === "reset-home") {
    storage.removeItem(HOME_PROGRESS_KEY);
    progress = createHomeProgress();
    renderProgress();
    closeCurrentSheet();
    showToast("主页记录已经重置");
  }
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
if (progress.lastClaimDay !== dayStamp()) {
  window.setTimeout(() => showSheet("daily-checkin"), 280);
}
