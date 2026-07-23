export const HOME_PROGRESS_KEY = "burger-home-progress-v1";

export function createHomeProgress() {
  return {
    energy: 5,
    coins: 1740,
    streak: 0,
    lastClaimDay: "",
  };
}

function finiteInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeHomeProgress(value) {
  const fallback = createHomeProgress();
  const source = value && typeof value === "object" ? value : {};
  return {
    energy: finiteInteger(source.energy, fallback.energy, 0, 99),
    coins: finiteInteger(source.coins, fallback.coins, 0, 999999),
    streak: finiteInteger(source.streak, fallback.streak, 0, 7),
    lastClaimDay: typeof source.lastClaimDay === "string" ? source.lastClaimDay : "",
  };
}

export function dayStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function claimDailyReward(progress, date = new Date()) {
  const current = normalizeHomeProgress(progress);
  const today = dayStamp(date);
  if (current.lastClaimDay === today) {
    return { claimed: false, progress: current };
  }

  const nextStreak = current.streak >= 7 ? 1 : current.streak + 1;
  const coinRewards = [100, 0, 0, 200, 0, 300, 500];
  const energyRewards = [0, 1, 0, 0, 1, 0, 0];
  return {
    claimed: true,
    progress: {
      energy: Math.min(99, current.energy + energyRewards[nextStreak - 1]),
      coins: current.coins + coinRewards[nextStreak - 1],
      streak: nextStreak,
      lastClaimDay: today,
    },
  };
}
