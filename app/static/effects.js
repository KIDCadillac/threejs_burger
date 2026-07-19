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

export function reactionFor(key) {
  return REACTIONS[key] ?? REACTIONS.chili;
}

export function recipeTitle(sauces) {
  if (!sauces?.length) return "神秘配方";
  const names = sauces.map((sauce) => reactionFor(sauce).shortLabel);
  return names[0] === names[1] ? `双倍${names[0]}` : names.join(" × ");
}
