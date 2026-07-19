export const REACTIONS = Object.freeze({
  chili: {
    label: "烈焰辣椒酱",
    shortLabel: "辣椒",
    emoji: "🌶️",
    className: "reaction--chili",
    particles: ["🔥", "💦", "🔥"],
  },
  mustard: {
    label: "冲鼻芥末酱",
    shortLabel: "芥末",
    emoji: "🟡",
    className: "reaction--mustard",
    particles: ["💧", "⚡", "💧"],
  },
  sour: {
    label: "皱脸酸味汁",
    shortLabel: "酸汁",
    emoji: "🍋",
    className: "reaction--sour",
    particles: ["✦", "🍋", "✦"],
  },
  sticky: {
    label: "拉丝黏黏酱",
    shortLabel: "黏酱",
    emoji: "🍯",
    className: "reaction--sticky",
    particles: ["◌", "✧", "◌"],
  },
});

export const SNACKS = Object.freeze({
  "fry": { label: "薯条", emoji: "🍟" },
  "nugget": { label: "鸡块", emoji: "🍗" },
  "donut": { label: "甜甜圈", emoji: "🍩" },
  "cookie": { label: "曲奇", emoji: "🍪" },
  "onion-ring": { label: "洋葱圈", emoji: "🧅" },
  "mochi": { label: "糯米团", emoji: "🍡" },
});

export function reactionFor(key) {
  return REACTIONS[key] ?? REACTIONS.chili;
}

export function snackFor(key) {
  return SNACKS[key] ?? SNACKS.fry;
}

export function recipeTitle(sauces) {
  if (!sauces?.length) return "神秘配方";
  const names = sauces.map((sauce) => reactionFor(sauce).shortLabel);
  return names[0] === names[1] ? `双倍${names[0]}` : names.join(" × ");
}
