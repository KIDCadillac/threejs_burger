export const REACTION_DURATION_MS = 4000;

export const REACTION_PHASES = Object.freeze([
  Object.freeze({ name: "notice", at: 0, caption: "看起来还挺正常……" }),
  Object.freeze({ name: "reach", at: 180, caption: "拿起来尝一口" }),
  Object.freeze({ name: "lift", at: 520, caption: "送到嘴边" }),
  Object.freeze({ name: "bite", at: 1100, caption: "咔嚓！" }),
  Object.freeze({ name: "chew", at: 1350, caption: "嚼一嚼……" }),
  Object.freeze({ name: "brace", at: 1800, caption: "等一下，好像不对劲" }),
  Object.freeze({ name: "burst", at: 2050, caption: "辣到喷火！" }),
  Object.freeze({ name: "recover", at: 2750, caption: "快给嘴巴降降温" }),
  Object.freeze({ name: "settle", at: 3600, caption: "强装镇定失败" }),
]);

export function phaseAt(milliseconds) {
  return REACTION_PHASES.reduce(
    (current, phase) => (milliseconds >= phase.at ? phase : current),
    REACTION_PHASES[0],
  );
}

export function resolveReactionPlan(sauces = []) {
  if (!sauces.length) return null;

  const counts = new Map();
  sauces.forEach((key, index) => {
    const current = counts.get(key) ?? { key, count: 0, first: index };
    current.count += 1;
    counts.set(key, current);
  });

  const ranked = [...counts.values()].sort(
    (left, right) => right.count - left.count || left.first - right.first,
  );

  return {
    primary: ranked[0].key,
    primaryIntensity: ranked[0].count,
    secondary: ranked[1]?.key ?? null,
    secondaryIntensity: ranked[1]?.count ?? 0,
  };
}
