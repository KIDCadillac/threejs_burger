import test from "node:test";
import assert from "node:assert/strict";

import {
  applyReplicaDuelCommand,
  createReplicaDuelState,
  rankReplicaWinner,
} from "../app/static/replica-duel-state.mjs";
import { createReplicaCompetitionSnapshot } from "../app/static/replica-duel-rules.mjs";

const order = ["b0", "p0", "c0", "t0", "l0", "p1", "o0", "b1"];
const instances = {
  b0: "bottom-bun", p0: "patty", c0: "cheese", t0: "tomato",
  l0: "lettuce", p1: "patty", o0: "onion", b1: "top-bun",
};

function snapshot({ valid = true, offset = 0 } = {}) {
  const assembledOrder = valid ? order : order.slice(0, 4);
  return createReplicaCompetitionSnapshot({
    assembledOrder,
    instances,
    offsets: Object.fromEntries(order.map((id, index) => [id, { x: offset + index / 50, z: 0 }])),
    rotations: Object.fromEntries(order.map((id) => [id, 0])),
    strokes: [{
      sauce: "ketchup",
      layerId: valid ? "t0" : "p0",
      amount: 0.5,
      points: [[-0.5, 0], [0.5, 0]],
    }],
  });
}

const command = (type, playerId, extra = {}) => ({ type, playerId, ...extra });
const applyAt = (state, now, nextCommand) => applyReplicaDuelCommand(
  state,
  nextCommand,
  { now: () => now },
);

function startMatch(now = 1_000) {
  let state = createReplicaDuelState({ matchId: "local-1", firstCreatorId: "A" });
  state = applyAt(state, now, command("player.ready", "A"));
  state = applyAt(state, now, command("player.ready", "B"));
  return state;
}

function reachReveal(state, startedAt, { target = snapshot(), replica = snapshot() } = {}) {
  state = applyAt(state, startedAt + 100, command("draft.update", state.creatorId, { snapshot: target }));
  state = applyAt(state, startedAt + 200, command("phase.finish", state.creatorId));
  state = applyAt(state, startedAt + 3_200, command("clock.tick", "system"));
  state = applyAt(state, startedAt + 4_000, command("draft.update", state.replicatorId, { snapshot: replica }));
  state = applyAt(state, startedAt + 15_000, command("phase.finish", state.replicatorId));
  assert.equal(state.phase, "scoring");
  state = applyAt(state, startedAt + 15_001, command("score.resolve", "system"));
  return state;
}

test("runs both rounds, swaps roles, and finishes with deterministic results", () => {
  let state = startMatch();
  assert.equal(state.status, "active");
  assert.equal(state.phase, "creating");
  assert.equal(state.round, 1);
  assert.equal(state.creatorId, "A");
  assert.equal(state.replicatorId, "B");
  assert.equal(state.phaseDeadlineAt, 46_000);

  state = reachReveal(state, 1_000);
  assert.equal(state.phase, "reveal");
  assert.equal(state.rounds[0].score.displayScore, 100);
  assert.equal(state.playerResults.B.replicaRawScore, 100);

  state = applyAt(state, state.phaseDeadlineAt, command("clock.tick", "system"));
  assert.equal(state.round, 2);
  assert.equal(state.phase, "creating");
  assert.equal(state.creatorId, "B");
  assert.equal(state.replicatorId, "A");

  const roundTwoStart = state.phaseStartedAt;
  state = reachReveal(state, roundTwoStart);
  state = applyAt(state, state.phaseDeadlineAt, command("clock.tick", "system"));

  assert.equal(state.status, "finished");
  assert.equal(state.phase, null);
  assert.equal(state.winner, "draw");
  assert.equal(state.rounds.length, 2);
});

test("an invalid original at the deadline awards 100 and skips replication", () => {
  let state = startMatch();
  state = applyAt(state, 2_000, command("draft.update", "A", { snapshot: snapshot({ valid: false }) }));
  state = applyAt(state, 46_000, command("clock.tick", "system"));

  assert.equal(state.phase, "reveal");
  assert.equal(state.rounds[0].creatorFailed, true);
  assert.equal(state.rounds[0].score.rawScore, 100);
  assert.equal(state.playerResults.A.creatorFailed, true);
  assert.equal(state.playerResults.B.replicaRawScore, 100);
});

test("a valid original at the deadline is accepted automatically", () => {
  let state = startMatch();
  state = applyAt(state, 45_999, command("draft.update", "A", { snapshot: snapshot() }));
  state = applyAt(state, 46_000, command("clock.tick", "system"));

  assert.equal(state.phase, "memorize");
  assert.equal(state.originalSnapshot.layers.length, 8);
});

test("finish received at the exact deadline wins over timeout and transitions only once", () => {
  let state = startMatch();
  state = applyAt(state, 45_000, command("draft.update", "A", { snapshot: snapshot() }));
  const finished = applyAt(state, 46_000, command("phase.finish", "A"));
  const duplicate = applyAt(finished, 46_000, command("phase.finish", "A"));
  const ticked = applyAt(duplicate, 46_000, command("clock.tick", "system"));

  assert.equal(finished.phase, "memorize");
  assert.strictEqual(duplicate, finished);
  assert.strictEqual(ticked, finished);
  assert.equal(finished.phaseRevision, 2);
});

test("wrong-role commands and invalid early originals do not mutate state", () => {
  const state = startMatch();
  const wrongRole = applyAt(state, 2_000, command("draft.update", "B", { snapshot: snapshot() }));
  const invalidDraft = applyAt(state, 2_000, command("draft.update", "A", {
    snapshot: snapshot({ valid: false }),
  }));
  const invalidFinish = applyAt(invalidDraft, 3_000, command("phase.finish", "A"));

  assert.strictEqual(wrongRole, state);
  assert.equal(invalidDraft.originalDraft.layers.length, 4);
  assert.strictEqual(invalidFinish, invalidDraft);
});

test("score failures stay in scoring and can be retried", () => {
  let state = startMatch();
  state = applyAt(state, 2_000, command("draft.update", "A", { snapshot: snapshot() }));
  state = applyAt(state, 3_000, command("phase.finish", "A"));
  state = applyAt(state, 6_000, command("clock.tick", "system"));
  state = applyAt(state, 7_000, command("draft.update", "B", { snapshot: snapshot() }));
  state = applyAt(state, 8_000, command("phase.finish", "B"));

  const failed = applyReplicaDuelCommand(state, command("score.resolve", "system"), {
    now: () => 8_001,
    scoreRound() { throw new Error("temporary score failure"); },
  });
  assert.equal(failed.phase, "scoring");
  assert.equal(failed.scoringError, "temporary score failure");

  const recovered = applyAt(failed, 8_100, command("score.resolve", "system"));
  assert.equal(recovered.phase, "reveal");
  assert.equal(recovered.scoringError, null);
});

test("winner uses raw score, creator failure, then actual replica time", () => {
  assert.equal(rankReplicaWinner({
    A: { replicaRawScore: 90.04, creatorFailed: false, replicaElapsedMs: 30_000 },
    B: { replicaRawScore: 90.03, creatorFailed: false, replicaElapsedMs: 10_000 },
  }), "A");
  assert.equal(rankReplicaWinner({
    A: { replicaRawScore: 90, creatorFailed: true, replicaElapsedMs: 10_000 },
    B: { replicaRawScore: 90, creatorFailed: false, replicaElapsedMs: 30_000 },
  }), "B");
  assert.equal(rankReplicaWinner({
    A: { replicaRawScore: 90, creatorFailed: false, replicaElapsedMs: 30_000 },
    B: { replicaRawScore: 90, creatorFailed: false, replicaElapsedMs: 20_000 },
  }), "B");
  assert.equal(rankReplicaWinner({
    A: { replicaRawScore: 100, creatorFailed: true, replicaElapsedMs: null },
    B: { replicaRawScore: 100, creatorFailed: true, replicaElapsedMs: null },
  }), "draw");
});
