import { applyReplicaDuelCommand } from "./replica-duel-state.mjs";

const PLAYER_IDS = Object.freeze(["A", "B"]);
const ENVELOPE_KEYS = Object.freeze([
  "matchId",
  "round",
  "phaseRevision",
  "actorId",
  "clientActionId",
  "clientSeq",
  "baseServerRevision",
  "kind",
  "payload",
]);

const freezeRecord = (value = {}) => Object.freeze({ ...value });

function requirePlayer(playerId) {
  if (!PLAYER_IDS.includes(playerId)) throw new TypeError(`Unknown player: ${String(playerId)}`);
  return playerId;
}

function frozenAcceptedActions(value = {}) {
  return Object.freeze({
    A: freezeRecord(value.A),
    B: freezeRecord(value.B),
  });
}

function frozenExpectedClientSeq(value = {}) {
  return Object.freeze({
    A: Number.isInteger(value.A) ? value.A : 1,
    B: Number.isInteger(value.B) ? value.B : 1,
  });
}

export function createReplicaActionEnvelope(input = {}) {
  const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? freezeRecord(input.payload)
    : Object.freeze({});
  return Object.freeze(Object.fromEntries(
    ENVELOPE_KEYS.map((key) => [key, key === "payload" ? payload : input[key]]),
  ));
}

export function createReplicaProtocolAuthority(state, {
  serverRevision = 0,
  expectedClientSeq = {},
  acceptedActions = {},
} = {}) {
  if (!Object.isFrozen(state)) throw new TypeError("state must be frozen");
  if (!Number.isInteger(serverRevision) || serverRevision < 0) {
    throw new TypeError("serverRevision must be a non-negative integer");
  }
  return Object.freeze({
    state,
    serverRevision,
    expectedClientSeq: frozenExpectedClientSeq(expectedClientSeq),
    acceptedActions: frozenAcceptedActions(acceptedActions),
  });
}

function rejected(authority, action, reason) {
  return Object.freeze({
    authority,
    ack: Object.freeze({
      ok: false,
      duplicate: false,
      reason,
      clientActionId: action?.clientActionId ?? null,
      serverRevision: authority.serverRevision,
    }),
  });
}

function commandForAction(action) {
  if (action.kind === "ready") {
    return { type: "player.ready", playerId: action.actorId };
  }
  if (action.kind === "draft") {
    return { type: "draft.update", playerId: action.actorId, snapshot: action.payload.snapshot };
  }
  if (action.kind === "finish") {
    return { type: "phase.finish", playerId: action.actorId };
  }
  if (action.kind === "reveal-ready") {
    return { type: "reveal.ready", playerId: action.actorId };
  }
  return null;
}

function isAuthorized(state, action) {
  if (action.kind === "ready") return state.status === "lobby";
  if (action.kind === "draft" || action.kind === "finish") {
    if (state.phase === "creating") return action.actorId === state.creatorId;
    if (state.phase === "replicating") return action.actorId === state.replicatorId;
    return false;
  }
  if (action.kind === "reveal-ready") return state.phase === "reveal";
  return false;
}

export function acceptReplicaAction(authority, action, options = {}) {
  const actorId = action?.actorId;
  if (!PLAYER_IDS.includes(actorId)) return rejected(authority, action, "actor-invalid");
  const priorAck = authority.acceptedActions[actorId][action.clientActionId];
  if (priorAck) {
    return Object.freeze({
      authority,
      ack: Object.freeze({ ...priorAck, duplicate: true }),
    });
  }
  if (action.matchId !== authority.state.matchId) return rejected(authority, action, "match-mismatch");
  if (action.round !== authority.state.round || action.phaseRevision !== authority.state.phaseRevision) {
    return rejected(authority, action, "stale-phase");
  }
  if (action.baseServerRevision !== authority.serverRevision) {
    return rejected(authority, action, "stale-server-revision");
  }
  if (action.clientSeq !== authority.expectedClientSeq[actorId]) {
    return rejected(authority, action, "client-seq-gap");
  }
  if (!isAuthorized(authority.state, action)) {
    return rejected(authority, action, "actor-not-authorized");
  }
  const command = commandForAction(action);
  if (!command) return rejected(authority, action, "action-unsupported");

  const state = applyReplicaDuelCommand(authority.state, command, options);
  if (state === authority.state) return rejected(authority, action, "action-not-applied");

  const serverRevision = authority.serverRevision + 1;
  const ack = Object.freeze({
    ok: true,
    duplicate: false,
    reason: null,
    clientActionId: action.clientActionId,
    serverRevision,
  });
  const acceptedForActor = freezeRecord({
    ...authority.acceptedActions[actorId],
    [action.clientActionId]: ack,
  });
  const nextAuthority = Object.freeze({
    state,
    serverRevision,
    expectedClientSeq: Object.freeze({
      ...authority.expectedClientSeq,
      [actorId]: authority.expectedClientSeq[actorId] + 1,
    }),
    acceptedActions: Object.freeze({
      ...authority.acceptedActions,
      [actorId]: acceptedForActor,
    }),
  });
  return Object.freeze({ authority: nextAuthority, ack });
}

function roleFor(state, playerId) {
  if (state.status === "lobby") return "waiting";
  if (state.phase === "creating" || state.phase === "memorize") {
    return playerId === state.creatorId ? "creator" : "observer";
  }
  if (state.phase === "replicating" || state.phase === "scoring") {
    return playerId === state.replicatorId ? "replicator" : "observer";
  }
  return "observer";
}

function visibleSnapshotFor(state) {
  if (state.phase === "creating") return state.originalDraft;
  if (state.phase === "memorize") return state.originalSnapshot;
  if (state.phase === "replicating") return state.replicaDraft;
  if (state.phase === "scoring") return state.pendingReplicaSnapshot;
  return null;
}

function roundComparison(state) {
  const record = [...state.rounds].reverse().find(({ round }) => round === state.round)
    ?? state.rounds.at(-1);
  if (!record) return null;
  return Object.freeze({
    original: record.originalSnapshot,
    replica: record.replicaSnapshot,
    score: record.score,
    creatorFailed: record.creatorFailed,
  });
}

export function projectReplicaView(state, playerId) {
  requirePlayer(playerId);
  const role = roleFor(state, playerId);
  const controlsEnabled = (state.phase === "creating" && playerId === state.creatorId)
    || (state.phase === "replicating" && playerId === state.replicatorId);
  const view = {
    matchId: state.matchId,
    status: state.status,
    round: state.round,
    phase: state.phase,
    phaseRevision: state.phaseRevision,
    phaseStartedAt: state.phaseStartedAt,
    phaseDeadlineAt: state.phaseDeadlineAt,
    playerId,
    role,
    controlsEnabled,
    showIngredientLabels: false,
    ready: freezeRecord(state.ready),
    revealReady: freezeRecord(state.revealReady),
    creatorId: state.creatorId,
    replicatorId: state.replicatorId,
    visibleSnapshot: visibleSnapshotFor(state),
    playerResults: state.playerResults,
    winner: state.winner,
    scoringError: state.scoringError,
  };
  if (state.phase === "reveal" || state.status === "finished") {
    view.comparison = roundComparison(state);
  }
  if (state.status === "finished") {
    view.rounds = Object.freeze(state.rounds.map((round) => Object.freeze({
      round: round.round,
      creatorId: round.creatorId,
      replicatorId: round.replicatorId,
      creatorFailed: round.creatorFailed,
      original: round.originalSnapshot,
      replica: round.replicaSnapshot,
      score: round.score,
      replicaElapsedMs: round.replicaElapsedMs,
    })));
  }
  return Object.freeze(view);
}
