const TECHNIQUES = {
  "scale-fish": {
    label: "逆鳞刮鳞",
    tool: "deba-knife",
    gesture: { axis: "x", direction: -1, minDistance: 58, dominance: 1.22 },
    demo: "看刀背：从尾巴往鱼头，逆着鳞一气刮过去。",
    error: [
      "顺着鳞摸什么呢？从尾巴往鱼头！",
      "手上加点行程，刮半截是给鱼挠痒痒。",
    ],
    success: "这一下干净。还有鳞就照这个方向来。",
  },
  "reserve-head-collar": {
    label: "分离鱼头鱼领",
    tool: "deba-knife",
    gesture: { axis: "y", direction: 1, minDistance: 52, dominance: 1.18 },
    demo: "落刀在鳃后，顺着鱼领外侧切；鱼头鱼领留着做汤和盐烤。",
    error: [
      "鳃后！不是鱼肚子中间！好鱼领差点让你削没了。",
      "刀往下落稳，别拿着刀在鱼脸上画圈。",
    ],
    success: "鱼头鱼领完整，放进汤料托盘。",
  },
  "fillet-fish": {
    label: "贴骨开片",
    tool: "deba-knife",
    gesture: { axis: "x", direction: 1, minDistance: 82, dominance: 1.3 },
    demo: "刀贴住中骨，从头端拉到尾端；听见骨头轻响就对了。",
    error: [
      "贴着中骨走！刀飘起来，肉全留在鱼架上了。",
      "一口气拉到尾，半路停车是切不下整片鱼柳的。",
    ],
    success: "鱼柳完整，鱼架也留好熬高汤。",
  },
  "remove-pinbones": {
    label: "拔针骨",
    tool: "bone-tweezers",
    gesture: { axis: "y", direction: -1, minDistance: 38, dominance: 1.08 },
    demo: "夹稳针骨，顺着骨头方向往上拔，别横着撕鱼肉。",
    error: [
      "先夹住再拔！你这样只会把鱼肉薅开花。",
      "往上、顺骨走。别拿镊子在鱼柳上散步。",
    ],
    success: "针骨完整出来了，再摸一遍别漏。",
  },
  "skin-fillet": {
    label: "压皮取肉",
    tool: "deba-knife",
    gesture: { axis: "x", direction: 1, minDistance: 76, dominance: 1.24 },
    demo: "压紧尾端鱼皮，刀身放平，贴着皮向前推。",
    error: [
      "刀身放平！你是取皮，不是劈木头。",
      "压住鱼皮再往前推，皮跑了肉当然跟着跑。",
    ],
    success: "肉皮分得干净，鱼皮放去炙烤托盘。",
  },
  "slice-fillet": {
    label: "拉切寿司片",
    tool: "deba-knife",
    gesture: { axis: "y", direction: 1, minDistance: 48, dominance: 1.12 },
    demo: "刀跟鱼柳斜一点，一刀拉切到底，别前后锯。",
    error: [
      "一刀拉到底！锯来锯去，鱼片都毛了。",
      "行程太短，这厚度拿去做鱼排，不是握寿司。",
    ],
    success: "厚薄合适，放进转运盘。",
  },
};

export const SUSHI_FISH_TECHNIQUES = Object.freeze(Object.fromEntries(
  Object.entries(TECHNIQUES).map(([id, technique]) => [id, Object.freeze({
    ...technique,
    gesture: Object.freeze({ ...technique.gesture }),
    error: Object.freeze([...technique.error]),
  })]),
));

export function sushiFishTechnique(taskId) {
  return SUSHI_FISH_TECHNIQUES[taskId] ?? null;
}

export function evaluateSushiFishGesture(taskId, { dx = 0, dy = 0 } = {}) {
  const technique = sushiFishTechnique(taskId);
  if (!technique) return Object.freeze({ accepted: false, reason: "unknown-technique" });
  const primary = technique.gesture.axis === "x" ? dx : dy;
  const secondary = technique.gesture.axis === "x" ? dy : dx;
  const directional = primary * technique.gesture.direction;
  if (directional <= 0) {
    return Object.freeze({ accepted: false, reason: "wrong-direction", technique });
  }
  if (directional < technique.gesture.minDistance) {
    return Object.freeze({ accepted: false, reason: "too-short", technique });
  }
  if (directional < Math.abs(secondary) * technique.gesture.dominance) {
    return Object.freeze({ accepted: false, reason: "wrong-angle", technique });
  }
  return Object.freeze({ accepted: true, reason: "correct", technique });
}

export function sushiMentorCue(taskId, kind, attempt = 1) {
  const technique = sushiFishTechnique(taskId);
  if (!technique) return null;
  if (kind === "demo") return Object.freeze({ kind, taskId, message: technique.demo, slowReplay: false });
  if (kind === "success") return Object.freeze({ kind, taskId, message: technique.success, slowReplay: false });
  const index = Math.max(0, Math.min(technique.error.length - 1, Math.trunc(attempt) - 1));
  return Object.freeze({
    kind: "error",
    taskId,
    message: technique.error[index],
    slowReplay: attempt >= 2,
  });
}
