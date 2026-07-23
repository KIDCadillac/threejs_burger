import assert from "node:assert/strict";
import test from "node:test";

import {
  createReplicaDuelReveal,
  createReplicaFinalModel,
  createReplicaRevealModel,
} from "../app/static/replica-duel-reveal.mjs";

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, event = {}) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event);
  }
}

function element() {
  return {
    hidden: true,
    textContent: "",
    dataset: {},
  };
}

function snapshot(ids) {
  return {
    version: 1,
    modelVersion: "burger-model:test",
    food: "burger",
    layers: ids.map((ingredientId, index) => ({
      layerId: `layer-${index}`,
      ingredientId,
      x: 0,
      z: 0,
      yaw: 0,
    })),
    strokes: [],
  };
}

function comparison(overrides = {}) {
  return {
    original: snapshot(["bottom-bun", "patty", "cheese", "top-bun"]),
    replica: snapshot(["bottom-bun", "patty", "cheese", "top-bun"]),
    creatorFailed: false,
    score: {
      displayScore: 92.5,
      breakdown: {
        display: {
          ingredients: 25,
          order: 38,
          sauce: 12,
          placement: 9,
          speed: 8.5,
        },
      },
      alignment: {
        distance: 0,
        matches: [
          { targetIndex: 0, replicaIndex: 0, ingredientId: "bottom-bun" },
          { targetIndex: 1, replicaIndex: 1, ingredientId: "patty" },
          { targetIndex: 2, replicaIndex: 2, ingredientId: "cheese" },
          { targetIndex: 3, replicaIndex: 3, ingredientId: "top-bun" },
        ],
      },
    },
    ...overrides,
  };
}

function stage() {
  let cameraView = {
    yaw: 0,
    pitch: 0.7,
    distance: 12,
    target: { x: 0, y: 1, z: 0 },
  };
  return {
    readOnly: [],
    states: [],
    clearCalls: 0,
    disposeCalls: 0,
    setCompetitionReadOnly(value) { this.readOnly.push(value); },
    replaceCompetitionState(value) { this.states.push(value); return true; },
    clearCompetitionScene() { this.clearCalls += 1; return true; },
    controller: {
      getCameraView: () => cameraView,
      setCameraView(value) { cameraView = value; return true; },
    },
    dispose() { this.disposeCalls += 1; },
  };
}

test("reveal model exposes five score items and marks missing, extra, and wrong-order layers", () => {
  const original = snapshot(["bottom-bun", "patty", "cheese", "top-bun"]);
  const replica = snapshot(["bottom-bun", "cheese", "lettuce", "top-bun"]);
  const model = createReplicaRevealModel(comparison({
    original,
    replica,
    score: {
      ...comparison().score,
      alignment: {
        distance: 2,
        matches: [
          { targetIndex: 0, replicaIndex: 0, ingredientId: "bottom-bun" },
          { targetIndex: 2, replicaIndex: 1, ingredientId: "cheese" },
          { targetIndex: 3, replicaIndex: 3, ingredientId: "top-bun" },
        ],
      },
    },
  }));

  assert.equal(model.total, "92.5");
  assert.deepEqual(model.scores.map(({ key, value }) => [key, value]), [
    ["ingredients", "25.0"],
    ["order", "38.0"],
    ["sauce", "12.0"],
    ["placement", "9.0"],
    ["speed", "8.5"],
  ]);
  assert.deepEqual(model.issues, [
    { kind: "wrong-order", ingredientId: "cheese", originalIndex: 2, replicaIndex: 1 },
    { kind: "missing", ingredientId: "patty", originalIndex: 1 },
    { kind: "extra", ingredientId: "lettuce", replicaIndex: 2 },
  ]);
});

test("reveal presenter rebuilds two read-only stages and keeps their camera views synchronized", () => {
  const root = element();
  const total = element();
  const issues = element();
  const finalRoot = element();
  const finalWinner = element();
  const finalRounds = element();
  const scoreNodes = new Map(
    ["ingredients", "order", "sauce", "placement", "speed"]
      .map((key) => [key, element()]),
  );
  const originalCanvas = new Events();
  const replicaCanvas = new Events();
  const originalStage = stage();
  const replicaStage = stage();
  const scheduled = [];
  const presenter = createReplicaDuelReveal({
    root,
    originalCanvas,
    replicaCanvas,
    originalStage,
    createReplicaStage: () => replicaStage,
    total,
    issues,
    finalRoot,
    finalWinner,
    finalRounds,
    scoreNodes,
    snapshotToState: (value) => ({ source: value }),
    schedule: (callback) => scheduled.push(callback),
  });

  const result = presenter.applyView({
    phase: "reveal",
    comparison: comparison(),
  });
  assert.equal(result, true);
  assert.equal(root.hidden, false);
  assert.equal(total.textContent, "92.5");
  assert.equal(scoreNodes.get("order").textContent, "38.0");
  assert.equal(issues.textContent, "层序与材料一致");
  assert.equal(finalRoot.hidden, true);
  assert.deepEqual(originalStage.readOnly, [true]);
  assert.deepEqual(replicaStage.readOnly, [true]);
  assert.equal(originalStage.states[0].source.food, "burger");
  assert.equal(replicaStage.states[0].source.food, "burger");

  originalStage.controller.setCameraView({
    yaw: 1.1,
    pitch: 0.4,
    distance: 9,
    target: { x: 0, y: 2, z: 0 },
  });
  originalCanvas.emit("pointermove");
  scheduled.shift()();
  assert.equal(replicaStage.controller.getCameraView().yaw, 1.1);

  presenter.applyView({
    status: "finished",
    phase: "reveal",
    comparison: comparison(),
    winner: "B",
    rounds: [
      { round: 1, replicatorId: "B", score: { displayScore: 91.2 } },
      { round: 2, replicatorId: "A", score: { displayScore: 88.6 } },
    ],
  });
  assert.equal(finalRoot.hidden, false);
  assert.equal(finalWinner.textContent, "玩家 B 获胜");
  assert.equal(
    finalRounds.textContent,
    "第 1 轮：玩家 B 91.2 分 · 第 2 轮：玩家 A 88.6 分",
  );

  presenter.applyView({ phase: "creating", comparison: null });
  assert.equal(root.hidden, true);
  assert.equal(finalRoot.hidden, true);
  presenter.dispose();
  assert.equal(replicaStage.disposeCalls, 1);
});

test("creator failure uses an honest reveal model without inventing comparison geometry", () => {
  const model = createReplicaRevealModel(comparison({
    creatorFailed: true,
    original: null,
    replica: null,
    score: {
      displayScore: 100,
      breakdown: {
        display: { ingredients: 25, order: 40, sauce: 15, placement: 10, speed: 10 },
      },
      alignment: { distance: 0, matches: [] },
    },
  }));
  assert.equal(model.creatorFailed, true);
  assert.equal(model.issues[0].kind, "creator-failed");
});

test("final model declares the winner and both round scores from authoritative results", () => {
  assert.deepEqual(createReplicaFinalModel({
    status: "finished",
    winner: "B",
    rounds: [
      { round: 1, replicatorId: "B", score: { displayScore: 91.2 } },
      { round: 2, replicatorId: "A", score: { displayScore: 88.6 } },
    ],
  }), {
    winnerText: "玩家 B 获胜",
    roundsText: "第 1 轮：玩家 B 91.2 分 · 第 2 轮：玩家 A 88.6 分",
  });
});
