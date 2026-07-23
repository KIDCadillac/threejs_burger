import assert from "node:assert/strict";
import test from "node:test";

import {
  bootReplicaDuelPage,
  formatReplicaDuelCountdown,
  parseReplicaDuelRoute,
} from "../app/static/replica-duel-app.mjs";

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

class Element extends Events {
  constructor(action = null, dataset = {}) {
    super();
    this.dataset = action ? { action, ...dataset } : { ...dataset };
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.attributes = new Map();
  }
  closest(selector) {
    return selector === "[data-action]" && this.dataset.action ? this : null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function createPageHarness(href = "https://example.test/replica-duel.html") {
  const documentTarget = new Events();
  const selectors = new Map();
  const add = (selector, action = null, dataset = {}) => {
    const element = new Element(action, dataset);
    selectors.set(selector, element);
    return element;
  };
  const elements = {
    canvas: add("#replica-duel-canvas"),
    player: add("#duel-player"),
    role: add("#duel-role"),
    phase: add("#duel-phase"),
    countdown: add("#duel-countdown"),
    status: add("#duel-status"),
    revealRoot: add("#duel-reveal"),
    replicaCanvas: add("#replica-duel-replica-canvas"),
    scoreTotal: add("#duel-score-total"),
    scoreIssues: add("#duel-score-issues"),
    finalRoot: add("#duel-final-result"),
    finalWinner: add("#duel-final-winner"),
    finalRounds: add("#duel-final-rounds"),
    ready: add('[data-action="ready"]', "ready"),
    finish: add('[data-action="finish"]', "finish"),
    revealReady: add('[data-action="reveal-ready"]', "reveal-ready"),
    openSecond: add('[data-action="open-second-view"]', "open-second-view"),
    exit: add('[data-action="exit"]', "exit"),
  };
  const scoreNodes = ["ingredients", "order", "sauce", "placement", "speed"]
    .map((score) => new Element(null, { score }));
  const panels = ["creating", "observer", "memorize", "replicating", "reveal"]
    .map((phasePanel) => new Element(null, { phasePanel }));
  const steps = ["setup", "create", "replicate", "reveal"]
    .map((duelStep) => new Element(null, { duelStep }));
  documentTarget.querySelector = (selector) => selectors.get(selector) ?? null;
  documentTarget.querySelectorAll = (selector) => (
    selector === "[data-phase-panel]" ? panels
      : selector === "[data-score]" ? scoreNodes
        : selector === "[data-duel-step]" ? steps
        : []
  );

  const windowTarget = new Events();
  windowTarget.location = {
    href,
    assignCalls: [],
    assign(value) { this.assignCalls.push(value); },
  };
  windowTarget.openCalls = [];
  windowTarget.open = (...args) => windowTarget.openCalls.push(args);
  windowTarget.interval = null;
  windowTarget.setInterval = (callback, delay) => {
    windowTarget.interval = { callback, delay };
    return 72;
  };
  windowTarget.clearInterval = () => { windowTarget.interval = null; };
  return { documentTarget, windowTarget, elements, panels, steps, scoreNodes };
}

function view(overrides = {}) {
  return {
    matchId: "match-1",
    status: "lobby",
    round: 0,
    phase: null,
    phaseRevision: 0,
    phaseDeadlineAt: null,
    playerId: "A",
    role: "waiting",
    controlsEnabled: false,
    ready: { A: false, B: false },
    revealReady: { A: false, B: false },
    creatorId: "A",
    replicatorId: "B",
    visibleSnapshot: null,
    ...overrides,
  };
}

function connectionHarness(initialView, { invite = null } = {}) {
  let listener = null;
  return {
    matchId: initialView.matchId,
    invite,
    sent: [],
    closeCalls: 0,
    getView: () => initialView,
    subscribe(callback) {
      listener = callback;
      callback({ type: "view", view: initialView, serverRevision: 0 });
      return () => { listener = null; };
    },
    send(kind, payload) {
      this.sent.push([kind, payload]);
      return { ok: true, kind };
    },
    close() { this.closeCalls += 1; },
    emit(event) { listener?.(event); },
  };
}

function appFactories(initialView, options = {}) {
  const host = connectionHarness(initialView, {
    invite: { matchId: "match-1", channelToken: "token-1", playerId: "B" },
  });
  const guest = connectionHarness({ ...initialView, playerId: "B" });
  const stageCalls = [];
  const adapters = [];
  const reveals = [];
  return {
    host,
    guest,
    stageCalls,
    adapters,
    stageFactory(configuration) {
      stageCalls.push(configuration);
      return {
        disposeCalls: 0,
        dispose() { this.disposeCalls += 1; },
      };
    },
    hostFactory: () => host,
    guestFactory: (configuration) => {
      guest.joinConfiguration = configuration;
      return guest;
    },
    adapterFactory(configuration) {
      const adapter = {
        configuration,
        views: [],
        finishCalls: 0,
        disposeCalls: 0,
        applyView(nextView) { this.views.push(nextView); },
        handleStageChange() { return true; },
        requestFinish() {
          this.finishCalls += 1;
          configuration.onFinish();
          return true;
        },
        dispose() { this.disposeCalls += 1; },
      };
      adapters.push(adapter);
      return adapter;
    },
    revealFactory(configuration) {
      const reveal = {
        configuration,
        views: [],
        disposeCalls: 0,
        applyView(nextView) { this.views.push(nextView); return true; },
        dispose() { this.disposeCalls += 1; },
      };
      reveals.push(reveal);
      return reveal;
    },
    reveals,
    ...options,
  };
}

test("parses only a complete locked B route and formats an authoritative countdown", () => {
  assert.deepEqual(parseReplicaDuelRoute({
    href: "https://example.test/replica-duel.html?match=m1&token=t1&player=B",
  }), { mode: "guest", matchId: "m1", channelToken: "t1", playerId: "B" });
  assert.deepEqual(parseReplicaDuelRoute({
    href: "https://example.test/replica-duel.html?match=m1&token=t1&player=A",
  }), { mode: "host", playerId: "A" });
  assert.equal(formatReplicaDuelCountdown(view({ phaseDeadlineAt: 15_100 }), 10_000), "06");
  assert.equal(formatReplicaDuelCountdown(view({ phaseDeadlineAt: 9_000 }), 10_000), "00");
  assert.equal(formatReplicaDuelCountdown(view(), 10_000), "--");
});

test("host page locks player A, opens a B tab, renders phases, and routes controls", () => {
  const page = createPageHarness();
  const factories = appFactories(view());
  const app = bootReplicaDuelPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    now: () => 1_000,
    ...factories,
  });

  assert.equal(factories.stageCalls[0].competitionMode, true);
  assert.equal(factories.stageCalls[0].competitionReadOnly, true);
  assert.equal(page.elements.player.textContent, "玩家 A");
  assert.equal(page.elements.ready.disabled, false);
  assert.equal(page.elements.finish.disabled, true);
  assert.equal(page.elements.revealReady.disabled, true);
  assert.equal(page.windowTarget.interval.delay, 250);
  assert.equal(
    page.steps.find(({ dataset }) => dataset.duelStep === "setup").getAttribute("data-state"),
    "active",
  );

  page.documentTarget.emit("click", { target: page.elements.openSecond });
  assert.match(page.windowTarget.openCalls[0][0], /match=match-1/);
  assert.match(page.windowTarget.openCalls[0][0], /token=token-1/);
  assert.match(page.windowTarget.openCalls[0][0], /player=B/);

  page.documentTarget.emit("click", { target: page.elements.ready });
  assert.deepEqual(factories.host.sent[0], ["ready", undefined]);

  const creating = view({
    status: "active",
    round: 1,
    phase: "creating",
    phaseRevision: 1,
    phaseDeadlineAt: 46_000,
    role: "creator",
    controlsEnabled: true,
  });
  factories.host.emit({ type: "view", view: creating, serverRevision: 2 });
  assert.equal(page.elements.phase.textContent, "制作原作");
  assert.equal(page.elements.role.textContent, "制作人");
  assert.equal(page.elements.finish.disabled, false);
  assert.equal(page.panels.find(({ dataset }) => dataset.phasePanel === "creating").hidden, false);
  assert.equal(
    page.steps.find(({ dataset }) => dataset.duelStep === "create").getAttribute("data-state"),
    "active",
  );

  page.documentTarget.emit("click", { target: page.elements.finish });
  assert.equal(factories.adapters[0].finishCalls, 1);
  assert.deepEqual(factories.host.sent.at(-1), ["finish", undefined]);

  const reveal = view({
    status: "active",
    round: 1,
    phase: "reveal",
    phaseRevision: 5,
    phaseDeadlineAt: 54_000,
    role: "observer",
    revealReady: { A: false, B: false },
    comparison: {
      original: { food: "burger", layers: [], strokes: [] },
      replica: { food: "burger", layers: [], strokes: [] },
      score: { displayScore: 88, breakdown: { display: {} }, alignment: { matches: [] } },
    },
  });
  factories.host.emit({ type: "view", view: reveal, serverRevision: 5 });
  assert.equal(page.elements.revealReady.disabled, false);
  assert.strictEqual(factories.reveals[0].views.at(-1), reveal);
  assert.equal(
    page.steps.find(({ dataset }) => dataset.duelStep === "reveal").getAttribute("data-state"),
    "active",
  );
  page.documentTarget.emit("click", { target: page.elements.revealReady });
  assert.deepEqual(factories.host.sent.at(-1), ["reveal-ready", undefined]);

  page.documentTarget.emit("click", { target: page.elements.exit });
  assert.equal(factories.host.closeCalls, 1);
  assert.deepEqual(page.windowTarget.location.assignCalls, ["./index.html"]);
  app.dispose();
});

test("guest page joins B, shows observer/replicator UI, and degrades honestly on host close", () => {
  const page = createPageHarness(
    "https://example.test/replica-duel.html?match=match-1&token=token-1&player=B",
  );
  const guestView = view({ playerId: "B" });
  const factories = appFactories(guestView);
  bootReplicaDuelPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    now: () => 2_000,
    ...factories,
  });

  assert.deepEqual(factories.guest.joinConfiguration, {
    matchId: "match-1",
    channelToken: "token-1",
    playerId: "B",
  });
  assert.equal(page.elements.player.textContent, "玩家 B");
  assert.equal(page.elements.openSecond.hidden, true);

  factories.guest.emit({
    type: "view",
    serverRevision: 3,
    view: view({
      playerId: "B",
      status: "active",
      round: 1,
      phase: "creating",
      role: "observer",
      creatorId: "A",
      controlsEnabled: false,
    }),
  });
  assert.equal(page.elements.phase.textContent, "观察对手");
  assert.equal(page.panels.find(({ dataset }) => dataset.phasePanel === "observer").hidden, false);

  factories.guest.emit({ type: "ended", reason: "host-closed", message: "本地练习已结束" });
  assert.equal(page.elements.status.textContent, "本地练习已结束");
  assert.equal(page.elements.ready.disabled, true);
  assert.equal(page.elements.finish.disabled, true);
  assert.equal(page.elements.revealReady.disabled, true);
});

test("boot failure reports unsupported local practice without inventing reconnect", () => {
  const page = createPageHarness();
  const factories = appFactories(view(), {
    hostFactory: () => { throw new Error("BroadcastChannel is not supported"); },
  });

  const app = bootReplicaDuelPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    ...factories,
  });

  assert.match(page.elements.status.textContent, /暂不支持本地双视角练习/);
  assert.doesNotMatch(page.elements.status.textContent, /重连/);
  assert.equal(page.elements.ready.disabled, true);
  assert.equal(page.elements.finish.disabled, true);
  app.dispose();
});
