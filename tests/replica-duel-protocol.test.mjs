import test from "node:test";
import assert from "node:assert/strict";

import {
  acceptReplicaAction,
  createReplicaActionEnvelope,
  createReplicaProtocolAuthority,
  projectReplicaView,
} from "../app/static/replica-duel-protocol.mjs";
import { createReplicaDuelState, applyReplicaDuelCommand } from "../app/static/replica-duel-state.mjs";
import { createReplicaCompetitionSnapshot } from "../app/static/replica-duel-rules.mjs";

const layerIds = ["b0", "p0", "c0", "t0", "l0", "p1", "o0", "b1"];
const types = {
  b0: "bottom-bun", p0: "patty", c0: "cheese", t0: "tomato",
  l0: "lettuce", p1: "patty", o0: "onion", b1: "top-bun",
};

function snapshot(offset = 0) {
  return createReplicaCompetitionSnapshot({
    assembledOrder: layerIds,
    instances: types,
    offsets: Object.fromEntries(layerIds.map((id) => [id, { x: offset, z: 0 }])),
    rotations: Object.fromEntries(layerIds.map((id) => [id, 0])),
    strokes: [{
      sauce: "ketchup", layerId: "t0", amount: 0.5, points: [[-0.5, 0], [0.5, 0]],
    }],
  });
}

function envelope(authority, actorId, kind, payload = {}, overrides = {}) {
  return createReplicaActionEnvelope({
    matchId: authority.state.matchId,
    round: authority.state.round,
    phaseRevision: authority.state.phaseRevision,
    actorId,
    clientActionId: `${actorId}-${authority.expectedClientSeq[actorId]}`,
    clientSeq: authority.expectedClientSeq[actorId],
    baseServerRevision: authority.serverRevision,
    kind,
    payload,
    ...overrides,
  });
}

function startedAuthority() {
  let authority = createReplicaProtocolAuthority(createReplicaDuelState({ matchId: "m1" }));
  let result = acceptReplicaAction(authority, envelope(authority, "A", "ready"), { now: () => 1_000 });
  authority = result.authority;
  result = acceptReplicaAction(authority, envelope(authority, "B", "ready"), { now: () => 1_000 });
  return result.authority;
}

test("creates the fixed replica action envelope", () => {
  const value = createReplicaActionEnvelope({
    matchId: "m1",
    round: 1,
    phaseRevision: 2,
    actorId: "A",
    clientActionId: "A-1",
    clientSeq: 1,
    baseServerRevision: 0,
    kind: "draft",
    payload: { snapshot: null },
  });

  assert.deepEqual(Object.keys(value), [
    "matchId", "round", "phaseRevision", "actorId", "clientActionId",
    "clientSeq", "baseServerRevision", "kind", "payload",
  ]);
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.payload));
});

test("accepts ordered actions, ACKs duplicates, and rejects gaps without mutation", () => {
  let authority = startedAuthority();
  const action = envelope(authority, "A", "draft", { snapshot: snapshot() });
  const accepted = acceptReplicaAction(authority, action, { now: () => 2_000 });
  assert.equal(accepted.ack.ok, true);
  assert.equal(accepted.authority.serverRevision, authority.serverRevision + 1);
  assert.equal(accepted.authority.expectedClientSeq.A, 3);

  const duplicate = acceptReplicaAction(accepted.authority, action, { now: () => 2_100 });
  assert.equal(duplicate.ack.duplicate, true);
  assert.strictEqual(duplicate.authority, accepted.authority);

  authority = accepted.authority;
  const gap = envelope(authority, "A", "finish", {}, {
    clientActionId: "A-gap",
    clientSeq: authority.expectedClientSeq.A + 1,
  });
  const rejected = acceptReplicaAction(authority, gap, { now: () => 2_200 });
  assert.equal(rejected.ack.ok, false);
  assert.equal(rejected.ack.reason, "client-seq-gap");
  assert.strictEqual(rejected.authority, authority);
});

test("rejects old phase, stale revision, and wrong-role actions", () => {
  const authority = startedAuthority();
  const wrongRole = acceptReplicaAction(
    authority,
    envelope(authority, "B", "draft", { snapshot: snapshot() }),
    { now: () => 2_000 },
  );
  assert.equal(wrongRole.ack.reason, "actor-not-authorized");

  const oldPhase = acceptReplicaAction(
    authority,
    envelope(authority, "A", "draft", { snapshot: snapshot() }, {
      phaseRevision: authority.state.phaseRevision - 1,
    }),
    { now: () => 2_000 },
  );
  assert.equal(oldPhase.ack.reason, "stale-phase");

  const staleServer = acceptReplicaAction(
    authority,
    envelope(authority, "A", "draft", { snapshot: snapshot() }, {
      baseServerRevision: authority.serverRevision - 1,
    }),
    { now: () => 2_000 },
  );
  assert.equal(staleServer.ack.reason, "stale-server-revision");
});

test("creating projects a live visual snapshot without answer labels", () => {
  let authority = startedAuthority();
  authority = acceptReplicaAction(
    authority,
    envelope(authority, "A", "draft", { snapshot: snapshot() }),
    { now: () => 2_000 },
  ).authority;

  const creator = projectReplicaView(authority.state, "A");
  const observer = projectReplicaView(authority.state, "B");
  assert.equal(creator.role, "creator");
  assert.equal(creator.controlsEnabled, true);
  assert.equal(observer.role, "observer");
  assert.equal(observer.controlsEnabled, false);
  assert.equal(observer.showIngredientLabels, false);
  assert.equal(observer.visibleSnapshot.layers.length, 8);
  assert.doesNotMatch(JSON.stringify(observer), /originalSnapshot|originalDraft|referenceRecipeId/);
});

test("replicating projections contain no original, replay URL, feedback, or solo storage key", () => {
  let authority = startedAuthority();
  authority = acceptReplicaAction(
    authority,
    envelope(authority, "A", "draft", { snapshot: snapshot() }),
    { now: () => 2_000 },
  ).authority;
  authority = acceptReplicaAction(
    authority,
    envelope(authority, "A", "finish"),
    { now: () => 3_000 },
  ).authority;
  authority = createReplicaProtocolAuthority(applyReplicaDuelCommand(
    authority.state,
    { type: "clock.tick", playerId: "system" },
    { now: () => 6_000 },
  ), {
    serverRevision: authority.serverRevision,
    expectedClientSeq: authority.expectedClientSeq,
    acceptedActions: authority.acceptedActions,
  });

  for (const playerId of ["A", "B"]) {
    const view = projectReplicaView(authority.state, playerId);
    const serialized = JSON.stringify(view);
    assert.equal(view.phase, "replicating");
    assert.doesNotMatch(serialized, /originalSnapshot|originalDraft|originalEvents/);
    assert.doesNotMatch(serialized, /ObjectURL|replay|feedback|solo-cooking/);
  }
  assert.equal(projectReplicaView(authority.state, "B").controlsEnabled, true);
  assert.equal(projectReplicaView(authority.state, "A").controlsEnabled, false);
});

test("reveal is the first projection that publishes comparison snapshots", () => {
  let state = startedAuthority().state;
  state = applyReplicaDuelCommand(state, { type: "draft.update", playerId: "A", snapshot: snapshot() }, { now: () => 2_000 });
  state = applyReplicaDuelCommand(state, { type: "phase.finish", playerId: "A" }, { now: () => 3_000 });
  state = applyReplicaDuelCommand(state, { type: "clock.tick", playerId: "system" }, { now: () => 6_000 });
  state = applyReplicaDuelCommand(state, { type: "draft.update", playerId: "B", snapshot: snapshot(0.1) }, { now: () => 7_000 });
  state = applyReplicaDuelCommand(state, { type: "phase.finish", playerId: "B" }, { now: () => 8_000 });
  state = applyReplicaDuelCommand(state, { type: "score.resolve", playerId: "system" }, { now: () => 8_001 });

  const view = projectReplicaView(state, "A");
  assert.equal(view.phase, "reveal");
  assert.equal(view.comparison.original.layers.length, 8);
  assert.equal(view.comparison.replica.layers.length, 8);
  assert.equal(typeof view.comparison.score.displayScore, "number");
});
