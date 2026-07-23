import { competitionSnapshotToSoloState } from "./replica-duel-stage-adapter.mjs";

const SCORE_KEYS = Object.freeze([
  "ingredients",
  "order",
  "sauce",
  "placement",
  "speed",
]);

const INGREDIENT_LABELS = Object.freeze({
  "bottom-bun": "下层面包",
  patty: "牛肉饼",
  cheese: "芝士",
  tomato: "番茄",
  lettuce: "生菜",
  pickle: "酸黄瓜",
  onion: "洋葱",
  "middle-bun": "中层面包",
  "top-bun": "上层面包",
});

function display(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "0.0";
}

function freezeIssue(issue) {
  return Object.freeze(issue);
}

function issueSummary(issues) {
  if (!issues.length) return "层序与材料一致";
  if (issues[0].kind === "creator-failed") return "原作未达到出题要求，本轮由复刻者直接得分";
  const counts = new Map();
  for (const issue of issues) counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1);
  return [
    counts.get("missing") ? `漏放 ${counts.get("missing")} 层` : "",
    counts.get("extra") ? `多放 ${counts.get("extra")} 层` : "",
    counts.get("wrong-order") ? `层序偏差 ${counts.get("wrong-order")} 处` : "",
  ].filter(Boolean).join(" · ");
}

export function createReplicaRevealModel(comparison) {
  if (!comparison?.score) throw new TypeError("reveal comparison must include a score");
  const scoreDisplay = comparison.score.breakdown?.display ?? {};
  const scores = SCORE_KEYS.map((key) => Object.freeze({
    key,
    value: display(scoreDisplay[key]),
  }));
  if (comparison.creatorFailed) {
    const issues = Object.freeze([freezeIssue({ kind: "creator-failed" })]);
    return Object.freeze({
      creatorFailed: true,
      total: display(comparison.score.displayScore),
      scores: Object.freeze(scores),
      issues,
      issueText: issueSummary(issues),
    });
  }

  const originalLayers = comparison.original?.layers ?? [];
  const replicaLayers = comparison.replica?.layers ?? [];
  const matches = comparison.score.alignment?.matches ?? [];
  const matchedOriginal = new Set(matches.map(({ targetIndex }) => targetIndex));
  const matchedReplica = new Set(matches.map(({ replicaIndex }) => replicaIndex));
  const issues = [];

  for (const match of matches) {
    if (match.targetIndex !== match.replicaIndex) {
      issues.push(freezeIssue({
        kind: "wrong-order",
        ingredientId: match.ingredientId,
        originalIndex: match.targetIndex,
        replicaIndex: match.replicaIndex,
      }));
    }
  }
  originalLayers.forEach((layer, originalIndex) => {
    if (!matchedOriginal.has(originalIndex)) {
      issues.push(freezeIssue({
        kind: "missing",
        ingredientId: layer.ingredientId,
        originalIndex,
      }));
    }
  });
  replicaLayers.forEach((layer, replicaIndex) => {
    if (!matchedReplica.has(replicaIndex)) {
      issues.push(freezeIssue({
        kind: "extra",
        ingredientId: layer.ingredientId,
        replicaIndex,
      }));
    }
  });

  return Object.freeze({
    creatorFailed: false,
    total: display(comparison.score.displayScore),
    scores: Object.freeze(scores),
    issues: Object.freeze(issues),
    issueText: issueSummary(issues),
  });
}

export function createReplicaFinalModel(view) {
  if (view?.status !== "finished" || !Array.isArray(view.rounds)) {
    throw new TypeError("final reveal requires finished round results");
  }
  const winnerText = view.winner === "A" || view.winner === "B"
    ? `玩家 ${view.winner} 获胜`
    : "本次练习平局";
  const roundsText = view.rounds.map((result, index) => {
    const round = Number.isInteger(result?.round) ? result.round : index + 1;
    const player = result?.replicatorId === "A" || result?.replicatorId === "B"
      ? result.replicatorId
      : "?";
    return `第 ${round} 轮：玩家 ${player} ${display(result?.score?.displayScore)} 分`;
  }).join(" · ");
  return Object.freeze({ winnerText, roundsText });
}

function requireStage(stage, name) {
  if (!stage?.setCompetitionReadOnly || !stage?.replaceCompetitionState
    || !stage?.clearCompetitionScene || !stage?.controller?.getCameraView
    || !stage?.controller?.setCameraView) {
    throw new TypeError(`${name} must expose a read-only competition stage`);
  }
  return stage;
}

function ingredientLabel(ingredientId) {
  return INGREDIENT_LABELS[ingredientId] ?? String(ingredientId || "未知材料");
}

function detailedIssueText(model) {
  if (!model.issues.length || model.issues[0].kind === "creator-failed") {
    return model.issueText;
  }
  return model.issues.map((issue) => {
    const label = ingredientLabel(issue.ingredientId);
    if (issue.kind === "missing") return `漏放：${label}`;
    if (issue.kind === "extra") return `多放：${label}`;
    return `层序：${label} 应在第 ${issue.originalIndex + 1} 层`;
  }).join(" · ");
}

export function createReplicaDuelReveal({
  root,
  originalCanvas,
  replicaCanvas,
  originalStage,
  createReplicaStage,
  total,
  issues,
  finalRoot,
  finalWinner,
  finalRounds,
  scoreNodes,
  snapshotToState = competitionSnapshotToSoloState,
  schedule = (callback) => queueMicrotask(callback),
} = {}) {
  if (!root || !originalCanvas?.addEventListener || !replicaCanvas?.addEventListener
    || !total || !issues || !finalRoot || !finalWinner || !finalRounds
    || !(scoreNodes instanceof Map)
    || typeof createReplicaStage !== "function" || typeof snapshotToState !== "function"
    || typeof schedule !== "function") {
    throw new TypeError("reveal presenter requires its stage and score elements");
  }
  requireStage(originalStage, "originalStage");
  for (const key of SCORE_KEYS) {
    if (!scoreNodes.get(key)) throw new TypeError(`missing reveal score node: ${key}`);
  }

  let replicaStage = null;
  let disposed = false;
  let syncPending = false;

  const ensureReplicaStage = () => {
    if (!replicaStage) replicaStage = requireStage(
      createReplicaStage({ canvas: replicaCanvas }),
      "replicaStage",
    );
    return replicaStage;
  };

  const syncFrom = (source) => {
    if (disposed || syncPending || !replicaStage) return;
    syncPending = true;
    schedule(() => {
      syncPending = false;
      if (disposed || !replicaStage) return;
      const from = source === "replica" ? replicaStage : originalStage;
      const to = source === "replica" ? originalStage : replicaStage;
      to.controller.setCameraView(from.controller.getCameraView(), "replica-reveal-sync");
    });
  };

  const onOriginalCamera = () => syncFrom("original");
  const onReplicaCamera = () => syncFrom("replica");
  for (const type of ["pointermove", "pointerup", "wheel"]) {
    originalCanvas.addEventListener(type, onOriginalCamera, { passive: true });
    replicaCanvas.addEventListener(type, onReplicaCamera, { passive: true });
  }

  const applyView = (view) => {
    if (disposed) return false;
    const active = (view?.phase === "reveal" || view?.status === "finished")
      && Boolean(view?.comparison);
    root.hidden = !active;
    finalRoot.hidden = true;
    if (!active) {
      replicaStage?.clearCompetitionScene();
      return false;
    }

    const model = createReplicaRevealModel(view.comparison);
    total.textContent = model.total;
    issues.textContent = detailedIssueText(model);
    for (const { key, value } of model.scores) scoreNodes.get(key).textContent = value;
    if (view.status === "finished") {
      const finalModel = createReplicaFinalModel(view);
      finalWinner.textContent = finalModel.winnerText;
      finalRounds.textContent = finalModel.roundsText;
      finalRoot.hidden = false;
    }

    originalStage.setCompetitionReadOnly(true);
    const secondStage = ensureReplicaStage();
    secondStage.setCompetitionReadOnly(true);
    originalStage.resize?.();
    secondStage.resize?.();
    if (model.creatorFailed) {
      originalStage.clearCompetitionScene();
      secondStage.clearCompetitionScene();
      return true;
    }
    originalStage.replaceCompetitionState(snapshotToState(view.comparison.original));
    secondStage.replaceCompetitionState(snapshotToState(view.comparison.replica));
    secondStage.controller.setCameraView(
      originalStage.controller.getCameraView(),
      "replica-reveal-initial-sync",
    );
    return true;
  };

  return Object.freeze({
    applyView,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const type of ["pointermove", "pointerup", "wheel"]) {
        originalCanvas.removeEventListener(type, onOriginalCamera);
        replicaCanvas.removeEventListener(type, onReplicaCamera);
      }
      replicaStage?.dispose?.();
      replicaStage = null;
    },
  });
}
