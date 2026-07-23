import { scoreReplicaDuelRound } from "./replica-duel-score.mjs";
import { validateReplicaOriginal } from "./replica-duel-rules.mjs";

export const REPLICA_DUEL_DURATIONS = Object.freeze({
  creating: 45_000,
  memorize: 3_000,
  replicating: 45_000,
  reveal: 8_000,
  minimumReveal: 3_000,
});

const PLAYER_IDS = Object.freeze(["A", "B"]);

const frozenPlayerResult = (value = {}) => Object.freeze({
  replicaRawScore: value.replicaRawScore ?? null,
  replicaDisplayScore: value.replicaDisplayScore ?? null,
  creatorFailed: Boolean(value.creatorFailed),
  replicaElapsedMs: value.replicaElapsedMs ?? null,
});

const freezeState = (state) => Object.freeze({
  ...state,
  ready: Object.freeze({ ...state.ready }),
  revealReady: Object.freeze({ ...state.revealReady }),
  playerResults: Object.freeze({
    A: frozenPlayerResult(state.playerResults.A),
    B: frozenPlayerResult(state.playerResults.B),
  }),
  rounds: Object.freeze(state.rounds.map((round) => Object.freeze({ ...round }))),
});

function requirePlayer(playerId) {
  if (!PLAYER_IDS.includes(playerId)) throw new TypeError(`Unknown player: ${String(playerId)}`);
  return playerId;
}

function otherPlayer(playerId) {
  return playerId === "A" ? "B" : "A";
}

function phaseDeadline(phase, startedAt) {
  const duration = REPLICA_DUEL_DURATIONS[phase];
  return Number.isFinite(duration) ? startedAt + duration : null;
}

function transitionPhase(state, phase, now, changes = {}) {
  return freezeState({
    ...state,
    ...changes,
    status: "active",
    phase,
    phaseRevision: state.phaseRevision + 1,
    phaseStartedAt: now,
    phaseDeadlineAt: phaseDeadline(phase, now),
    scoringError: null,
  });
}

function emptyReplicaSnapshot(original) {
  return Object.freeze({
    version: Number(original?.version) || 1,
    modelVersion: original?.modelVersion ?? "burger-model:2026-07-22",
    food: "burger",
    layers: Object.freeze([]),
    strokes: Object.freeze([]),
  });
}

function automaticWinScore() {
  return Object.freeze({
    rawScore: 100,
    displayScore: 100,
    breakdown: null,
    alignment: Object.freeze({ distance: 0, matches: Object.freeze([]) }),
  });
}

function recordRound(state, {
  score,
  replicaSnapshot,
  replicaElapsedMs,
  creatorFailed = false,
}) {
  const roundRecord = Object.freeze({
    round: state.round,
    creatorId: state.creatorId,
    replicatorId: state.replicatorId,
    creatorFailed,
    originalSnapshot: creatorFailed ? null : state.originalSnapshot,
    replicaSnapshot: creatorFailed ? null : replicaSnapshot,
    score,
    replicaElapsedMs: creatorFailed ? null : replicaElapsedMs,
  });
  const creatorResult = {
    ...state.playerResults[state.creatorId],
    creatorFailed: state.playerResults[state.creatorId].creatorFailed || creatorFailed,
  };
  const replicatorResult = {
    ...state.playerResults[state.replicatorId],
    replicaRawScore: score.rawScore,
    replicaDisplayScore: score.displayScore,
    replicaElapsedMs: creatorFailed ? null : replicaElapsedMs,
  };
  return {
    rounds: [...state.rounds.filter(({ round }) => round !== state.round), roundRecord],
    playerResults: {
      ...state.playerResults,
      [state.creatorId]: creatorResult,
      [state.replicatorId]: replicatorResult,
    },
  };
}

export function rankReplicaWinner(playerResults) {
  const first = playerResults?.A ?? {};
  const second = playerResults?.B ?? {};
  const firstScore = Number(first.replicaRawScore);
  const secondScore = Number(second.replicaRawScore);
  if (Number.isFinite(firstScore) && Number.isFinite(secondScore) && firstScore !== secondScore) {
    return firstScore > secondScore ? "A" : "B";
  }
  if (Boolean(first.creatorFailed) !== Boolean(second.creatorFailed)) {
    return first.creatorFailed ? "B" : "A";
  }
  if (first.creatorFailed && second.creatorFailed) return "draw";
  const firstTime = Number(first.replicaElapsedMs);
  const secondTime = Number(second.replicaElapsedMs);
  if (Number.isFinite(firstTime) && Number.isFinite(secondTime) && firstTime !== secondTime) {
    return firstTime < secondTime ? "A" : "B";
  }
  return "draw";
}

export function createReplicaDuelState({
  matchId,
  firstCreatorId = "A",
} = {}) {
  if (typeof matchId !== "string" || !matchId) throw new TypeError("matchId is required");
  requirePlayer(firstCreatorId);
  return freezeState({
    matchId,
    status: "lobby",
    ready: { A: false, B: false },
    round: 0,
    creatorId: firstCreatorId,
    replicatorId: otherPlayer(firstCreatorId),
    phase: null,
    phaseRevision: 0,
    phaseStartedAt: null,
    phaseDeadlineAt: null,
    originalDraft: null,
    originalSnapshot: null,
    replicaDraft: null,
    pendingReplicaSnapshot: null,
    pendingReplicaElapsedMs: null,
    scoringError: null,
    revealReady: { A: false, B: false },
    rounds: [],
    playerResults: { A: {}, B: {} },
    winner: null,
  });
}

function startCreating(state, now, round, creatorId) {
  return transitionPhase(state, "creating", now, {
    round,
    creatorId,
    replicatorId: otherPlayer(creatorId),
    originalDraft: null,
    originalSnapshot: null,
    replicaDraft: null,
    pendingReplicaSnapshot: null,
    pendingReplicaElapsedMs: null,
    revealReady: { A: false, B: false },
  });
}

function finishOriginal(state, now, snapshot = state.originalDraft) {
  if (!validateReplicaOriginal(snapshot).valid) return state;
  return transitionPhase(state, "memorize", now, {
    originalDraft: null,
    originalSnapshot: snapshot,
    replicaDraft: null,
  });
}

function failOriginal(state, now) {
  const score = automaticWinScore();
  const recorded = recordRound(state, {
    score,
    replicaSnapshot: null,
    replicaElapsedMs: null,
    creatorFailed: true,
  });
  return transitionPhase(state, "reveal", now, {
    ...recorded,
    originalDraft: null,
    originalSnapshot: null,
    replicaDraft: null,
    pendingReplicaSnapshot: null,
    pendingReplicaElapsedMs: null,
    revealReady: { A: false, B: false },
  });
}

function finishReplica(state, now) {
  const replicaSnapshot = state.replicaDraft ?? emptyReplicaSnapshot(state.originalSnapshot);
  return transitionPhase(state, "scoring", now, {
    pendingReplicaSnapshot: replicaSnapshot,
    pendingReplicaElapsedMs: Math.max(0, Math.min(
      REPLICA_DUEL_DURATIONS.replicating,
      now - state.phaseStartedAt,
    )),
  });
}

function resolveScore(state, now, scoreRound) {
  try {
    const score = scoreRound({
      target: state.originalSnapshot,
      replica: state.pendingReplicaSnapshot,
      elapsedMs: state.pendingReplicaElapsedMs,
      placementRadii: Object.fromEntries(
        state.originalSnapshot.layers.map(({ ingredientId, placementRadius }) => (
          [ingredientId, placementRadius]
        )),
      ),
    });
    const recorded = recordRound(state, {
      score,
      replicaSnapshot: state.pendingReplicaSnapshot,
      replicaElapsedMs: state.pendingReplicaElapsedMs,
    });
    return transitionPhase(state, "reveal", now, {
      ...recorded,
      revealReady: { A: false, B: false },
    });
  } catch (error) {
    return freezeState({
      ...state,
      scoringError: String(error?.message ?? error),
    });
  }
}

function advanceReveal(state, now) {
  if (state.round === 1) return startCreating(state, now, 2, state.replicatorId);
  return freezeState({
    ...state,
    status: "finished",
    phase: null,
    phaseRevision: state.phaseRevision + 1,
    phaseStartedAt: null,
    phaseDeadlineAt: null,
    originalDraft: null,
    originalSnapshot: null,
    replicaDraft: null,
    pendingReplicaSnapshot: null,
    pendingReplicaElapsedMs: null,
    winner: rankReplicaWinner(state.playerResults),
  });
}

function tick(state, now) {
  if (state.status !== "active" || !Number.isFinite(state.phaseDeadlineAt)
    || now < state.phaseDeadlineAt) return state;
  if (state.phase === "creating") {
    return validateReplicaOriginal(state.originalDraft).valid
      ? finishOriginal(state, now)
      : failOriginal(state, now);
  }
  if (state.phase === "memorize") {
    return transitionPhase(state, "replicating", now, {
      replicaDraft: emptyReplicaSnapshot(state.originalSnapshot),
    });
  }
  if (state.phase === "replicating") return finishReplica(state, now);
  if (state.phase === "reveal") return advanceReveal(state, now);
  return state;
}

export function applyReplicaDuelCommand(state, command, {
  now = () => Date.now(),
  scoreRound = scoreReplicaDuelRound,
} = {}) {
  if (!Object.isFrozen(state) || typeof command?.type !== "string") {
    throw new TypeError("A frozen state and command.type are required");
  }
  const timestamp = now();
  if (!Number.isFinite(timestamp)) throw new TypeError("now() must return a finite number");

  // Exact-deadline finish is accepted. Commands received later observe the deadline first.
  if (command.type !== "clock.tick" && state.status === "active"
    && Number.isFinite(state.phaseDeadlineAt) && timestamp > state.phaseDeadlineAt) {
    return tick(state, timestamp);
  }

  if (command.type === "clock.tick") return tick(state, timestamp);
  if (command.type === "player.ready") {
    if (state.status !== "lobby") return state;
    const playerId = requirePlayer(command.playerId);
    if (state.ready[playerId]) return state;
    const ready = { ...state.ready, [playerId]: true };
    const updated = freezeState({ ...state, ready });
    return ready.A && ready.B
      ? startCreating(updated, timestamp, 1, state.creatorId)
      : updated;
  }
  if (state.status !== "active") return state;

  if (command.type === "draft.update") {
    const playerId = requirePlayer(command.playerId);
    if (state.phase === "creating" && playerId === state.creatorId) {
      return freezeState({ ...state, originalDraft: command.snapshot });
    }
    if (state.phase === "replicating" && playerId === state.replicatorId) {
      return freezeState({ ...state, replicaDraft: command.snapshot });
    }
    return state;
  }

  if (command.type === "phase.finish") {
    const playerId = requirePlayer(command.playerId);
    if (state.phase === "creating" && playerId === state.creatorId) {
      return finishOriginal(state, timestamp);
    }
    if (state.phase === "replicating" && playerId === state.replicatorId) {
      return finishReplica(state, timestamp);
    }
    return state;
  }

  if (command.type === "score.resolve") {
    return state.phase === "scoring" ? resolveScore(state, timestamp, scoreRound) : state;
  }

  if (command.type === "reveal.ready") {
    if (state.phase !== "reveal") return state;
    const playerId = requirePlayer(command.playerId);
    if (state.revealReady[playerId]) return state;
    const updated = freezeState({
      ...state,
      revealReady: { ...state.revealReady, [playerId]: true },
    });
    const minimumShown = timestamp - state.phaseStartedAt >= REPLICA_DUEL_DURATIONS.minimumReveal;
    return minimumShown && updated.revealReady.A && updated.revealReady.B
      ? advanceReveal(updated, timestamp)
      : updated;
  }

  return state;
}
