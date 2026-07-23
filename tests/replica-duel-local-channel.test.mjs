import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createReplicaDuelLocalHost,
  joinReplicaDuelLocalPractice,
} from "../app/static/replica-duel-local-channel.mjs";

function createChannelHub() {
  const members = new Map();
  const messages = [];

  class FakeChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      const group = members.get(name) ?? new Set();
      group.add(this);
      members.set(name, group);
    }

    postMessage(data) {
      messages.push(structuredClone(data));
      for (const peer of members.get(this.name) ?? []) {
        if (peer !== this && !peer.closed) peer.onmessage?.({ data: structuredClone(data) });
      }
    }

    close() {
      this.closed = true;
      members.get(this.name)?.delete(this);
    }
  }

  return {
    channelFactory: (name) => new FakeChannel(name),
    messages,
  };
}

function createQueuedChannelHub() {
  const members = new Map();
  const deliveries = [];

  class QueuedChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      const group = members.get(name) ?? new Set();
      group.add(this);
      members.set(name, group);
    }

    postMessage(data) {
      for (const peer of members.get(this.name) ?? []) {
        if (peer !== this && !peer.closed) {
          deliveries.push(() => peer.onmessage?.({ data: structuredClone(data) }));
        }
      }
    }

    close() {
      this.closed = true;
      members.get(this.name)?.delete(this);
    }
  }

  return {
    channelFactory: (name) => new QueuedChannel(name),
    flushAll() {
      while (deliveries.length) deliveries.shift()();
    },
  };
}

function createScheduler() {
  let callback = null;
  let delay = null;
  return {
    setIntervalFn(nextCallback, nextDelay) {
      callback = nextCallback;
      delay = nextDelay;
      return 41;
    },
    clearIntervalFn(id) {
      if (id === 41) callback = null;
    },
    fire() {
      callback?.();
    },
    get delay() {
      return delay;
    },
    get active() {
      return Boolean(callback);
    },
  };
}

function validOriginal() {
  const ids = [
    "bottom-bun",
    "beef-patty",
    "cheese",
    "tomato",
    "lettuce",
    "pickle",
    "onion",
    "top-bun",
  ];
  return {
    version: 1,
    modelVersion: "burger-model:test",
    food: "burger",
    layers: ids.map((ingredientId, index) => ({
      instanceId: `${ingredientId}-${index}`,
      ingredientId,
      x: index * 0.01,
      z: 0,
      yaw: 0,
      placementRadius: 1,
    })),
    strokes: [{ sauceId: "ketchup", targetInstanceId: "lettuce-4", amount: 1, cells: [1, 2] }],
  };
}

test("creates isolated A/B views and carries ready, draft, finish, ACK, and tick traffic", () => {
  let now = 1_000;
  let actionNumber = 0;
  const hub = createChannelHub();
  const scheduler = createScheduler();
  const host = createReplicaDuelLocalHost({
    channelFactory: hub.channelFactory,
    now: () => now,
    makeMatchId: () => "match-local-7",
    makeToken: () => "token-only-9",
    makeActionId: () => `host-${++actionNumber}`,
    setIntervalFn: scheduler.setIntervalFn,
    clearIntervalFn: scheduler.clearIntervalFn,
  });
  const guest = joinReplicaDuelLocalPractice({
    ...host.invite,
    channelFactory: hub.channelFactory,
    makeActionId: () => `guest-${++actionNumber}`,
  });

  assert.equal(host.channelName, "replica-duel-token-only-9");
  assert.equal(host.channelName.includes(host.matchId), false);
  assert.equal(scheduler.delay, 100);
  assert.equal(host.getView().playerId, "A");
  assert.equal(guest.getView().playerId, "B");

  const guestReady = guest.send("ready");
  assert.equal(guestReady.kind, "ready");
  assert.equal(guest.getLastAck().ok, true);
  assert.equal(host.send("ready").ok, true);
  assert.equal(host.getView().phase, "creating");
  assert.equal(host.getView().controlsEnabled, true);
  assert.equal(guest.getView().role, "observer");

  assert.equal(host.send("draft", { snapshot: validOriginal() }).ok, true);
  assert.equal(guest.getView().visibleSnapshot.layers.length, 8);
  assert.equal(host.send("finish").ok, true);
  assert.equal(guest.getView().phase, "memorize");

  now += 3_000;
  scheduler.fire();
  assert.equal(guest.getView().phase, "replicating");
  assert.equal(guest.getView().controlsEnabled, true);

  const emptyReplica = { ...validOriginal(), layers: [], strokes: [] };
  guest.send("draft", { snapshot: emptyReplica });
  assert.equal(guest.getLastAck().ok, true);
  assert.equal(host.getView().visibleSnapshot.layers.length, 0);

  guest.close();
  host.close();
});

test("broadcasts only the participant projection and never sends private solo-storage fields", () => {
  const hub = createChannelHub();
  const scheduler = createScheduler();
  const host = createReplicaDuelLocalHost({
    channelFactory: hub.channelFactory,
    now: () => 50,
    makeMatchId: () => "match-secret",
    makeToken: () => "channel-secret",
    makeActionId: () => "host-action",
    setIntervalFn: scheduler.setIntervalFn,
    clearIntervalFn: scheduler.clearIntervalFn,
  });
  const guest = joinReplicaDuelLocalPractice({
    ...host.invite,
    channelFactory: hub.channelFactory,
    makeActionId: () => "guest-action",
  });

  guest.send("ready");
  host.send("ready");
  host.send("draft", { snapshot: validOriginal() });

  const viewMessages = hub.messages.filter(({ type }) => type === "view");
  assert.ok(viewMessages.length >= 2);
  assert.ok(viewMessages.every(({ playerId, view }) => playerId === "B" && view.playerId === "B"));
  const wireText = JSON.stringify(hub.messages);
  for (const forbidden of [
    '"originalSnapshot"',
    '"originalEvents"',
    '"replayUrl"',
    '"localStorage"',
    '"sessionStorage"',
    '"indexedDB"',
  ]) {
    assert.equal(wireText.includes(forbidden), false, forbidden);
  }

  guest.close();
  host.close();
});

test("queues rapid participant actions until each ACK view revision arrives", () => {
  let now = 100;
  let id = 0;
  const hub = createQueuedChannelHub();
  const scheduler = createScheduler();
  const host = createReplicaDuelLocalHost({
    channelFactory: hub.channelFactory,
    now: () => now,
    makeMatchId: () => "match-queue",
    makeToken: () => "token-queue",
    makeActionId: () => `host-${++id}`,
    setIntervalFn: scheduler.setIntervalFn,
    clearIntervalFn: scheduler.clearIntervalFn,
  });
  const guest = joinReplicaDuelLocalPractice({
    ...host.invite,
    channelFactory: hub.channelFactory,
    makeActionId: () => `guest-${++id}`,
  });
  hub.flushAll();

  guest.send("ready");
  hub.flushAll();
  host.send("ready");
  host.send("draft", { snapshot: validOriginal() });
  host.send("finish");
  hub.flushAll();
  now += 3_000;
  scheduler.fire();
  hub.flushAll();

  guest.send("draft", { snapshot: { ...validOriginal(), layers: [], strokes: [] } });
  guest.send("finish");
  hub.flushAll();

  assert.equal(guest.getLastAck().ok, true);
  assert.equal(host.getView().phase, "reveal");
  guest.close();
  host.close();
});

test("host close ends local practice without reconnect behavior", () => {
  const hub = createChannelHub();
  const scheduler = createScheduler();
  const host = createReplicaDuelLocalHost({
    channelFactory: hub.channelFactory,
    now: () => 10,
    makeMatchId: () => "match-close",
    makeToken: () => "token-close",
    setIntervalFn: scheduler.setIntervalFn,
    clearIntervalFn: scheduler.clearIntervalFn,
  });
  const guest = joinReplicaDuelLocalPractice({
    ...host.invite,
    channelFactory: hub.channelFactory,
  });

  host.close();

  assert.equal(scheduler.active, false);
  assert.deepEqual(guest.getEnded(), {
    reason: "host-closed",
    message: "本地练习已结束",
  });
  assert.throws(() => guest.send("ready"), /本地练习已结束/);
  assert.equal(hub.messages.some(({ type }) => type === "reconnect"), false);
  guest.close();
});

test("local channel source never persists the original in browser storage", async () => {
  const source = await readFile(new URL(
    "../app/static/replica-duel-local-channel.mjs",
    import.meta.url,
  ), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|indexedDB/i);
});
