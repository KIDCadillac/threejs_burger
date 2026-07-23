import test from "node:test";
import assert from "node:assert/strict";

import {
  HOME_PROGRESS_KEY,
  claimDailyReward,
  createHomeProgress,
  dayStamp,
  normalizeHomeProgress,
} from "../app/static/home-lobby-state.mjs";

test("home progress starts with a full energy bar and visible currency", () => {
  assert.equal(HOME_PROGRESS_KEY, "burger-home-progress-v1");
  assert.deepEqual(createHomeProgress(), {
    energy: 5,
    coins: 1740,
    streak: 0,
    lastClaimDay: "",
  });
});

test("daily reward can only be claimed once per local day", () => {
  const now = new Date(2026, 6, 24, 9, 30);
  const first = claimDailyReward(createHomeProgress(), now);

  assert.equal(first.claimed, true);
  assert.equal(first.progress.coins, 1840);
  assert.equal(first.progress.streak, 1);
  assert.equal(first.progress.lastClaimDay, dayStamp(now));

  const second = claimDailyReward(first.progress, new Date(2026, 6, 24, 22, 0));
  assert.equal(second.claimed, false);
  assert.deepEqual(second.progress, first.progress);
});

test("normalization keeps corrupt browser storage from breaking the lobby", () => {
  assert.deepEqual(normalizeHomeProgress({
    energy: -20,
    coins: "oops",
    streak: 99,
    lastClaimDay: 42,
  }), {
    energy: 0,
    coins: 1740,
    streak: 7,
    lastClaimDay: "",
  });
});
