export const REACTION_DURATION_MS = 4000;

export const REACTION_PHASES = Object.freeze([
  Object.freeze({ name: "notice", at: 0, caption: "看起来还挺正常……" }),
  Object.freeze({ name: "reach", at: 180, caption: "拿起来尝一口" }),
  Object.freeze({ name: "lift", at: 520, caption: "送到嘴边" }),
  Object.freeze({ name: "bite", at: 1100, caption: "咔嚓！" }),
  Object.freeze({ name: "chew", at: 1350, caption: "嚼一嚼……" }),
  Object.freeze({ name: "brace", at: 1800, caption: "等一下，好像不对劲" }),
  Object.freeze({ name: "burst", at: 2050, caption: "配料反应爆发！" }),
  Object.freeze({ name: "recover", at: 2750, caption: "缓一缓，马上恢复" }),
  Object.freeze({ name: "settle", at: 3600, caption: "强装镇定失败" }),
]);

const REACTION_COPY = Object.freeze({
  chili: Object.freeze({
    burst: "辣味爆发，真的喷火了！",
    recover: "快扇扇嘴，给辣味降温",
    label: "辣椒",
  }),
  mustard: Object.freeze({
    burst: "芥末冲到鼻子，喷嚏来了！",
    recover: "捂住鼻子，喷嚏还没停",
    label: "芥末",
  }),
  sour: Object.freeze({
    burst: "酸得整张脸都缩起来了！",
    recover: "肩膀还在抖，先缓一缓",
    label: "酸汁",
  }),
  sticky: Object.freeze({
    burst: "嘴巴被黏酱粘住了！",
    recover: "拉开黏丝，努力挣脱",
    label: "黏酱",
  }),
});

export function captionForPhase(phaseName, plan) {
  const base = REACTION_PHASES.find(({ name }) => name === phaseName)?.caption ?? "";
  if (!plan) return base;
  const primaryCopy = REACTION_COPY[plan.primary];
  if (phaseName === "burst") return primaryCopy?.burst ?? base;
  if (phaseName === "recover") {
    const secondaryCopy = REACTION_COPY[plan.secondary];
    if (secondaryCopy) return `还混了${secondaryCopy.label}，又来一下！`;
    return primaryCopy?.recover ?? base;
  }
  return base;
}

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
