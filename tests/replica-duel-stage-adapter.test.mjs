import test from "node:test";
import assert from "node:assert/strict";

import {
  competitionSnapshotToSoloState,
  createReplicaDuelStageAdapter,
} from "../app/static/replica-duel-stage-adapter.mjs";
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
    offsets: Object.fromEntries(layerIds.map((id) => [id, { x: offset, z: 0.1 }])),
    rotations: Object.fromEntries(layerIds.map((id, index) => [id, index * 0.1])),
    strokes: [{
      sauce: "ketchup", layerId: "t0", amount: 0.5, points: [[-0.5, 0], [0.5, 0]],
    }],
  });
}

test("competition snapshots rebuild a detached solo state with poses and sauce targets", () => {
  const rebuilt = competitionSnapshotToSoloState(snapshot(0.2));
  assert.deepEqual(rebuilt.assembledOrder.map((id) => rebuilt.instances[id]), layerIds.map((id) => types[id]));
  assert.deepEqual(rebuilt.assembledOrder.map((id) => rebuilt.offsets[id]), layerIds.map(() => ({ x: 0.2, z: 0.1 })));
  assert.equal(rebuilt.strokes.length, 1);
  assert.equal(rebuilt.instances[rebuilt.strokes[0].layerId], "tomato");
  assert.equal(rebuilt.history.length, 0);
});

test("adapter applies safe views and only emits controlled local drafts", () => {
  const calls = [];
  const drafts = [];
  const finishes = [];
  let currentState = competitionSnapshotToSoloState(snapshot());
  const stage = {
    setCompetitionReadOnly(value) { calls.push(["readonly", value]); },
    replaceCompetitionState(value) { calls.push(["replace", value]); currentState = value; },
    clearCompetitionScene() { calls.push(["clear"]); },
    getState() { return currentState; },
  };
  const adapter = createReplicaDuelStageAdapter({
    stage,
    onDraft: (value) => drafts.push(value),
    onFinish: (value) => finishes.push(value),
  });

  adapter.applyView({ phaseRevision: 1, phase: "creating", controlsEnabled: false, visibleSnapshot: snapshot() });
  assert.deepEqual(calls.map(([kind]) => kind), ["readonly", "replace"]);
  adapter.handleStageChange({ reason: "drop-layer", state: currentState });
  assert.equal(drafts.length, 0);

  adapter.applyView({ phaseRevision: 2, phase: "replicating", controlsEnabled: true, visibleSnapshot: snapshot(0.1) });
  adapter.handleStageChange({ reason: "drop-layer", state: currentState });
  adapter.handleStageChange({ reason: "drop-layer", state: currentState });
  assert.equal(drafts.length, 1, "identical draft snapshots are deduplicated");
  assert.equal(drafts[0].layers.length, 8);
  assert.equal(adapter.requestFinish(), true);
  assert.equal(finishes.length, 1);

  adapter.applyView({ phaseRevision: 3, phase: "replicating", controlsEnabled: true, visibleSnapshot: null });
  assert.equal(calls.at(-1)[0], "clear");
  adapter.dispose();
});
