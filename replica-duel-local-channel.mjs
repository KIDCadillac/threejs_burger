import {
  acceptReplicaAction,
  createReplicaActionEnvelope,
  createReplicaProtocolAuthority,
  projectReplicaView,
} from "./replica-duel-protocol.mjs";
import {
  applyReplicaDuelCommand,
  createReplicaDuelState,
} from "./replica-duel-state.mjs";

const PARTICIPANT_ID = "B";
const CHANNEL_PREFIX = "replica-duel-";
const ENDED_MESSAGE = "本地练习已结束";

function secureId() {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID().replaceAll("-", "").slice(0, 16);
  }
  if (typeof cryptoObject?.getRandomValues === "function") {
    const bytes = cryptoObject.getRandomValues(new Uint32Array(2));
    return [...bytes].map((value) => value.toString(36)).join("").slice(0, 16);
  }
  throw new Error("A secure random generator is required");
}

function defaultChannelFactory(name) {
  if (typeof globalThis.BroadcastChannel !== "function") {
    throw new Error("BroadcastChannel is not supported");
  }
  return new globalThis.BroadcastChannel(name);
}

function replaceAuthorityState(authority, state) {
  if (state === authority.state) return authority;
  return createReplicaProtocolAuthority(state, {
    serverRevision: authority.serverRevision + 1,
    expectedClientSeq: authority.expectedClientSeq,
    acceptedActions: authority.acceptedActions,
  });
}

function settleInternalState(authority, options) {
  let next = authority;
  if (next.state.phase === "scoring") {
    next = replaceAuthorityState(next, applyReplicaDuelCommand(
      next.state,
      { type: "score.resolve" },
      options,
    ));
  }
  return next;
}

function makeEnvelope(authority, actorId, clientSeq, kind, payload, makeActionId) {
  return createReplicaActionEnvelope({
    matchId: authority.state.matchId,
    round: authority.state.round,
    phaseRevision: authority.state.phaseRevision,
    actorId,
    clientActionId: makeActionId(),
    clientSeq,
    baseServerRevision: authority.serverRevision,
    kind,
    payload,
  });
}

function notify(listeners, event) {
  for (const listener of listeners) listener(event);
}

export function createReplicaDuelLocalHost({
  channelFactory = defaultChannelFactory,
  now = () => Date.now(),
  makeMatchId = () => `local-${secureId().slice(0, 8)}`,
  makeToken = secureId,
  makeActionId = secureId,
  setIntervalFn = (callback, delay) => globalThis.setInterval(callback, delay),
  clearIntervalFn = (id) => globalThis.clearInterval(id),
  scoreRound,
} = {}) {
  const matchId = makeMatchId();
  const channelToken = makeToken();
  const channelName = `${CHANNEL_PREFIX}${channelToken}`;
  const channel = channelFactory(channelName);
  const listeners = new Set();
  const commandOptions = { now, ...(scoreRound ? { scoreRound } : {}) };
  let authority = createReplicaProtocolAuthority(createReplicaDuelState({ matchId }));
  let localClientSeq = 1;
  let closed = false;

  const localViewEvent = () => Object.freeze({
    type: "view",
    serverRevision: authority.serverRevision,
    view: projectReplicaView(authority.state, "A"),
  });

  function sendParticipantView() {
    channel.postMessage({
      type: "view",
      matchId,
      playerId: PARTICIPANT_ID,
      serverRevision: authority.serverRevision,
      view: projectReplicaView(authority.state, PARTICIPANT_ID),
    });
  }

  function publishViews() {
    notify(listeners, localViewEvent());
    sendParticipantView();
  }

  function accept(action) {
    const result = acceptReplicaAction(authority, action, commandOptions);
    authority = settleInternalState(result.authority, commandOptions);
    return result.ack;
  }

  function onMessage({ data }) {
    if (closed || data?.matchId !== matchId || data?.playerId !== PARTICIPANT_ID) return;
    if (data.type === "join") {
      sendParticipantView();
      return;
    }
    if (data.type !== "action") return;
    const previousRevision = authority.serverRevision;
    const ack = accept(data.action);
    channel.postMessage({
      type: "ack",
      matchId,
      playerId: PARTICIPANT_ID,
      ack,
    });
    if (authority.serverRevision !== previousRevision) publishViews();
    else sendParticipantView();
  }

  channel.onmessage = onMessage;

  const timerId = setIntervalFn(() => {
    if (closed) return;
    const previousRevision = authority.serverRevision;
    authority = replaceAuthorityState(authority, applyReplicaDuelCommand(
      authority.state,
      { type: "clock.tick" },
      commandOptions,
    ));
    authority = settleInternalState(authority, commandOptions);
    if (authority.serverRevision !== previousRevision) publishViews();
  }, 100);

  return Object.freeze({
    matchId,
    channelToken,
    channelName,
    invite: Object.freeze({ matchId, channelToken, playerId: PARTICIPANT_ID }),
    getView: () => projectReplicaView(authority.state, "A"),
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      listener(localViewEvent());
      return () => listeners.delete(listener);
    },
    send(kind, payload = {}) {
      if (closed) throw new Error(ENDED_MESSAGE);
      const previousRevision = authority.serverRevision;
      const action = makeEnvelope(
        authority,
        "A",
        localClientSeq,
        kind,
        payload,
        makeActionId,
      );
      const ack = accept(action);
      if (ack.ok) localClientSeq += 1;
      if (authority.serverRevision !== previousRevision) publishViews();
      return ack;
    },
    close() {
      if (closed) return;
      closed = true;
      clearIntervalFn(timerId);
      channel.postMessage({
        type: "ended",
        matchId,
        playerId: PARTICIPANT_ID,
        reason: "host-closed",
        message: ENDED_MESSAGE,
      });
      channel.close();
      listeners.clear();
    },
  });
}

export function joinReplicaDuelLocalPractice({
  matchId,
  channelToken,
  playerId = PARTICIPANT_ID,
  channelFactory = defaultChannelFactory,
  makeActionId = secureId,
} = {}) {
  if (typeof matchId !== "string" || !matchId) throw new TypeError("matchId is required");
  if (typeof channelToken !== "string" || !channelToken) {
    throw new TypeError("channelToken is required");
  }
  if (playerId !== PARTICIPANT_ID) throw new TypeError("Only player B can join this local practice");

  const channelName = `${CHANNEL_PREFIX}${channelToken}`;
  const channel = channelFactory(channelName);
  const listeners = new Set();
  const acknowledged = new Set();
  let view = null;
  let serverRevision = 0;
  let clientSeq = 1;
  let lastAck = null;
  let ended = null;
  let closed = false;
  let pendingAction = null;
  let awaitingServerRevision = null;
  const queuedActions = [];

  function flushNextAction() {
    if (closed || ended || !view || pendingAction || awaitingServerRevision !== null) return;
    const request = queuedActions.shift();
    if (!request) return;
    const action = createReplicaActionEnvelope({
      matchId,
      round: view.round,
      phaseRevision: view.phaseRevision,
      actorId: playerId,
      clientActionId: makeActionId(),
      clientSeq,
      baseServerRevision: serverRevision,
      kind: request.kind,
      payload: request.payload,
    });
    pendingAction = action;
    channel.postMessage({ type: "action", matchId, playerId, action });
  }

  channel.onmessage = ({ data }) => {
    if (data?.matchId !== matchId || data?.playerId !== playerId) return;
    if (data.type === "view") {
      view = data.view;
      serverRevision = data.serverRevision;
      notify(listeners, Object.freeze({ type: "view", serverRevision, view }));
      if (awaitingServerRevision !== null && serverRevision >= awaitingServerRevision) {
        awaitingServerRevision = null;
      }
      flushNextAction();
      return;
    }
    if (data.type === "ack") {
      lastAck = Object.freeze({ ...data.ack });
      const ownsAck = pendingAction?.clientActionId === lastAck.clientActionId;
      if (ownsAck && lastAck.ok && !acknowledged.has(lastAck.clientActionId)) {
        acknowledged.add(lastAck.clientActionId);
        clientSeq += 1;
      }
      if (ownsAck) {
        pendingAction = null;
        awaitingServerRevision = lastAck.serverRevision;
      }
      notify(listeners, Object.freeze({ type: "ack", ack: lastAck }));
      return;
    }
    if (data.type === "ended") {
      ended = Object.freeze({ reason: data.reason, message: data.message });
      notify(listeners, Object.freeze({ type: "ended", ...ended }));
    }
  };

  channel.postMessage({ type: "join", matchId, playerId });

  return Object.freeze({
    matchId,
    playerId,
    channelName,
    getView: () => view,
    getLastAck: () => lastAck,
    getEnded: () => ended,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      if (ended) listener(Object.freeze({ type: "ended", ...ended }));
      else if (view) listener(Object.freeze({ type: "view", serverRevision, view }));
      return () => listeners.delete(listener);
    },
    send(kind, payload = {}) {
      if (closed || ended) throw new Error(ENDED_MESSAGE);
      const request = Object.freeze({ kind, payload: Object.freeze({ ...payload }) });
      queuedActions.push(request);
      flushNextAction();
      return request;
    },
    close() {
      if (closed) return;
      closed = true;
      queuedActions.length = 0;
      pendingAction = null;
      channel.close();
      listeners.clear();
    },
  });
}
