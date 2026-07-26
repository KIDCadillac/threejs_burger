import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { bootBurgerShopPage } from "../app/static/burger-shop-app.mjs";
import {
  applyBurgerShopEvent,
  createBurgerShopRun,
} from "../app/static/burger-shop-run-state.mjs";

const appPath = new URL("../app/static/burger-shop-app.mjs", import.meta.url);

test("shop completion follows the configured eight-order run boundary", async () => {
  const source = await readFile(appPath, "utf8");

  assert.match(source, /BURGER_SHOP_ORDER_COUNT/);
  assert.doesNotMatch(source, /orderNumber\s*>=\s*3/);
  assert.doesNotMatch(source, /三单营业完成/);
});

class Events {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }
  emit(type, event = {}) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event);
  }
}

class Element extends Events {
  constructor() {
    super();
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function pageHarness() {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const selectors = new Map();
  const add = (selector) => {
    const element = new Element();
    selectors.set(selector, element);
    return element;
  };
  const elements = {
    body: add("body"),
    ui: add("#burger-shop-ui"),
    customer: add("#shop-customer"),
    ticketButton: add("#shop-order-ticket"),
    timer: add("#shop-order-timer"),
    ticketPanel: add("#shop-ticket-panel"),
    tasting: add("#shop-tasting"),
    orderResult: add("#shop-order-result"),
    runResult: add("#shop-run-result"),
    serveButton: add("#shop-serve-button"),
    orderNumber: add("[data-shop-order-number]"),
    customerName: add("[data-shop-customer-name]"),
    ticketNumber: add("[data-shop-ticket-number]"),
    ticketName: add("[data-shop-ticket-name]"),
    ticketLayers: add("[data-shop-ticket-layers]"),
    ticketSauces: add("[data-shop-ticket-sauces]"),
    undoButton: add('[data-shop-action="undo"]'),
    focusButton: add('[data-shop-action="focus"]'),
  };
  documentTarget.querySelector = (selector) => selectors.get(selector) ?? null;
  documentTarget.visibilityState = "visible";
  windowTarget.setInterval = () => 1;
  windowTarget.clearInterval = () => {};
  windowTarget.setTimeout = () => 1;
  windowTarget.clearTimeout = () => {};
  windowTarget.matchMedia = () => ({ matches: false });
  windowTarget.localStorage = null;
  windowTarget.location = { href: "https://example.test/cooking.html?mode=orders" };
  return { documentTarget, windowTarget, elements };
}

function legalOrder(orderNumber = 1) {
  return Object.freeze({
    id: `order-${orderNumber}`,
    orderNumber,
    publicName: `测试汉堡 ${orderNumber}`,
    customerId: `customer-${orderNumber}`,
    layers: Object.freeze([
      Object.freeze({ slotId: "layer-1", ingredientId: "bottom-bun" }),
      Object.freeze({ slotId: "layer-2", ingredientId: "patty" }),
      Object.freeze({ slotId: "layer-3", ingredientId: "cheese" }),
      Object.freeze({ slotId: "layer-4", ingredientId: "top-bun" }),
    ]),
    sauces: Object.freeze([]),
  });
}

function cookingSnapshot(layerCount = 4) {
  const assembledOrder = Array.from({ length: layerCount }, (_, index) => `piece-${index}`);
  return {
    assembledOrder,
    instances: Object.fromEntries(assembledOrder.map((id, index) => [
      id,
      ["bottom-bun", "patty", "cheese", "top-bun"][index] ?? "patty",
    ])),
    offsets: Object.fromEntries(assembledOrder.map((id) => [id, { x: 0, z: 0 }])),
    strokes: [],
    locations: {},
    inventory: {},
    history: [],
    stationContents: {},
  };
}

function controllerHarness({ restored = null } = {}) {
  const page = pageHarness();
  const scheduled = [];
  const intervals = [];
  const clearedIntervals = [];
  const stageCalls = [];
  const audioCalls = [];
  const customerCalls = [];
  const saves = [];
  const scores = [];
  let nowValue = 1_000;
  let snapshot = cookingSnapshot();

  const adapter = {
    startOrder: ({ restoredState = null } = {}) => {
      stageCalls.push(["start", restoredState]);
      if (restoredState) snapshot = restoredState;
      return snapshot;
    },
    setCooking: (active) => stageCalls.push(["cooking", active]),
    serve: () => {
      stageCalls.push(["serve"]);
      return snapshot;
    },
    getCookingState: () => snapshot,
    focus: (active) => stageCalls.push(["focus", active]),
    resetCamera: () => stageCalls.push(["camera"]),
    undo: () => stageCalls.push(["undo"]),
  };
  const customer = {
    enter: (value) => customerCalls.push(["enter", value.id]),
    wait: () => customerCalls.push(["wait"]),
    taste: (reaction) => {
      customerCalls.push(["taste", reaction]);
      return Promise.resolve(reaction);
    },
    leave: () => customerCalls.push(["leave"]),
    dispose: () => customerCalls.push(["dispose"]),
  };
  const audio = {
    play: (name) => audioCalls.push(name),
    pause: () => audioCalls.push("pause"),
    resume: () => audioCalls.push("resume"),
    dispose: () => audioCalls.push("dispose"),
  };
  const save = {
    load: () => restored,
    save: (payload) => {
      saves.push(payload);
      return true;
    },
    clear: () => true,
  };

  const controller = bootBurgerShopPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stage: {},
    now: () => nowValue,
    random: () => 0,
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    cancelSchedule: () => {},
    setIntervalFn: (callback) => {
      intervals.push(callback);
      return intervals.length;
    },
    clearIntervalFn: (id) => clearedIntervals.push(id),
    stageAdapterFactory: () => adapter,
    customerFactory: () => customer,
    audioFactory: () => audio,
    saveFactory: () => save,
    orderFactory: ({ orderNumber }) => legalOrder(orderNumber),
    scoreFactory: (_order, servedSnapshot, options) => {
      scores.push({ servedSnapshot, options });
      return {
        total: 800,
        reaction: "medium",
        parts: {
          ingredients: 300,
          order: 200,
          sauce: 100,
          placement: 100,
          speed: 100,
        },
      };
    },
    summaryFactory: () => ({ totalScore: 2_400, stars: 2, coins: 34 }),
  });

  return {
    ...page,
    controller,
    scheduled,
    intervals,
    clearedIntervals,
    stageCalls,
    audioCalls,
    customerCalls,
    saves,
    scores,
    setNow(value) { nowValue = value; },
    flushNextSchedule() {
      const task = scheduled.shift();
      assert.ok(task, "expected a scheduled phase transition");
      task.callback();
      return task.delay;
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("runs customer arrival, preview, cooking, and one guarded manual settlement", async () => {
  const harness = controllerHarness();

  assert.equal(harness.controller.getState().phase, "customer-arrival");
  assert.equal(harness.elements.ui.hidden, false);
  assert.deepEqual(harness.customerCalls[0], ["enter", "customer-1"]);
  assert.equal(harness.flushNextSchedule(), 520);
  assert.equal(harness.controller.getState().phase, "order-preview");
  assert.equal(harness.flushNextSchedule(), 1_000);
  assert.equal(harness.controller.getState().phase, "cooking");
  assert.equal(harness.elements.timer.textContent, "45");

  harness.setNow(11_000);
  assert.equal(harness.controller.serve(), true);
  assert.equal(harness.controller.serve(), false);
  assert.equal(harness.scores.length, 1);
  assert.equal(harness.scores[0].options.remainingMs, 35_000);
  assert.equal(harness.controller.getState().phase, "tasting");

  await flushMicrotasks();
  assert.equal(harness.controller.getState().phase, "order-result");
  assert.equal(harness.elements.orderResult.hidden, false);
  assert.match(harness.elements.orderResult.innerHTML, /800/);
});

test("timeout settles an empty order once even if the timer callback repeats", () => {
  const harness = controllerHarness();
  harness.flushNextSchedule();
  harness.flushNextSchedule();
  harness.setNow(46_000);

  harness.intervals[0]();
  harness.intervals[0]();

  assert.equal(harness.scores.length, 1);
  assert.deepEqual(harness.scores[0].servedSnapshot.assembledOrder, []);
  assert.equal(harness.scores[0].options.remainingMs, 0);
});

test("backgrounding pauses local work while the absolute deadline keeps running", () => {
  const harness = controllerHarness();
  harness.flushNextSchedule();
  harness.flushNextSchedule();
  harness.setNow(21_000);

  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");
  assert.ok(harness.clearedIntervals.length >= 1);
  assert.ok(harness.audioCalls.includes("pause"));

  harness.setNow(31_000);
  harness.documentTarget.visibilityState = "visible";
  harness.documentTarget.emit("visibilitychange");
  assert.ok(harness.audioCalls.includes("resume"));
  assert.equal(harness.elements.timer.textContent, "15");
});

test("restores the same cooking order without granting extra time", () => {
  let nowValue = 1_000;
  let run = createBurgerShopRun({ runId: "restored", now: () => nowValue });
  run = applyBurgerShopEvent(run, { type: "customer.arrived" }, { now: () => nowValue });
  nowValue = 2_000;
  run = applyBurgerShopEvent(run, { type: "order.previewed" }, { now: () => nowValue });
  const restored = {
    version: 1,
    run: { ...run, deadlineAt: 21_000 },
    order: legalOrder(1),
    cookingState: cookingSnapshot(3),
    settings: { muted: false, haptics: true, reducedMotion: false },
  };
  const harness = controllerHarness({ restored });
  harness.setNow(11_000);
  harness.intervals[0]();

  assert.equal(harness.controller.getState().phase, "cooking");
  assert.equal(harness.elements.timer.textContent, "10");
  assert.deepEqual(harness.stageCalls[0], ["start", restored.cookingState]);
});
