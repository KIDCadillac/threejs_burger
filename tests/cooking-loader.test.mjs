import test from "node:test";
import assert from "node:assert/strict";

import { startSoloCookingLoader } from "../app/static/cooking-loader.mjs";

class Element {
  constructor({ hidden = false } = {}) {
    this.hidden = hidden;
    this.textContent = "";
    this.dataset = {};
    this.style = { width: "" };
  }
}

function loaderHarness() {
  const selectors = new Map();
  const add = (selector, options) => {
    const element = new Element(options);
    selectors.set(selector, element);
    return element;
  };
  const elements = {
    loading: add("#cooking-loading"),
    phase: add("#cooking-loading-phase"),
    percent: add("#cooking-loading-percent"),
    note: add("#cooking-loading-note"),
    bar: add("#cooking-loading-bar"),
    error: add("#cooking-error", { hidden: true }),
    status: add("#cooking-status"),
  };
  const documentTarget = {
    querySelector: (selector) => selectors.get(selector) ?? null,
  };
  return { documentTarget, elements };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("shows staged progress without exposing elapsed seconds until the first cooked frame", async () => {
  const { documentTarget, elements } = loaderHarness();
  const stage = { id: "stage" };
  const frames = [];
  const intervals = [];
  const cleared = [];
  let now = 1_000;

  const loading = startSoloCookingLoader(documentTarget, {
    windowTarget: {},
    importApp: async () => ({
      bootSoloCookingPage: (_document, options) => {
        assert.equal(options.manageLoading, false);
        return stage;
      },
    }),
    requestFrame: (callback) => { frames.push(callback); return 44; },
    setIntervalFn: (callback) => { intervals.push(callback); return 71; },
    clearIntervalFn: (id) => cleared.push(id),
    now: () => now,
  });

  assert.equal(elements.phase.textContent, "正在连接料理台");
  assert.equal(elements.percent.textContent, "8%");
  assert.equal(elements.loading.hidden, false);

  now = 2_500;
  intervals[0]();
  assert.equal(elements.percent.textContent, "20%");

  await flushMicrotasks();
  assert.equal(elements.phase.textContent, "正在完成第一帧");
  assert.equal(elements.percent.textContent, "94%");
  assert.equal(elements.loading.hidden, false, "the overlay remains until a rendered frame");
  assert.equal(frames.length, 1);

  frames[0](16);
  assert.equal(await loading, stage);
  assert.equal(elements.phase.textContent, "料理台准备完成");
  assert.equal(elements.percent.textContent, "100%");
  assert.equal(elements.bar.style.width, "100%");
  assert.equal(elements.loading.hidden, true);
  assert.deepEqual(cleared, [71]);
});

test("falls back when a background page does not receive an animation frame", async () => {
  const { documentTarget, elements } = loaderHarness();
  documentTarget.visibilityState = "visible";
  const stage = { id: "background-stage" };
  const frames = [];
  const timeouts = [];
  const clearedTimeouts = [];

  const loading = startSoloCookingLoader(documentTarget, {
    windowTarget: {},
    importApp: async () => ({ bootSoloCookingPage: () => stage }),
    requestFrame: (callback) => { frames.push(callback); return 72; },
    setTimeoutFn: (callback) => { timeouts.push(callback); return 74; },
    clearTimeoutFn: (id) => clearedTimeouts.push(id),
    setIntervalFn: () => 73,
    clearIntervalFn() {},
    now: () => 0,
  });

  await flushMicrotasks();
  assert.equal(frames.length, 1);
  assert.equal(timeouts.length, 1);
  assert.equal(elements.loading.hidden, false);
  timeouts[0]();

  const result = await loading;
  assert.equal(result, stage);
  assert.equal(elements.percent.textContent, "100%");
  assert.equal(elements.loading.hidden, true);
  assert.equal(elements.error.hidden, true);
  assert.deepEqual(clearedTimeouts, [74]);
});

test("explains a slow connection while continuing to load", async () => {
  const { documentTarget, elements } = loaderHarness();
  const moduleLoad = deferred();
  const frames = [];
  const intervals = [];
  let now = 0;
  const loading = startSoloCookingLoader(documentTarget, {
    windowTarget: {},
    importApp: () => moduleLoad.promise,
    requestFrame: (callback) => { frames.push(callback); return 1; },
    setIntervalFn: (callback) => { intervals.push(callback); return 2; },
    clearIntervalFn() {},
    now: () => now,
  });

  now = 8_400;
  intervals[0]();
  assert.equal(elements.note.textContent, "网络较慢，仍在继续加载");
  assert.ok(Number.parseInt(elements.percent.textContent, 10) <= 68);

  moduleLoad.resolve({ bootSoloCookingPage: () => ({ id: "slow-stage" }) });
  await flushMicrotasks();
  frames[0](16);
  assert.deepEqual(await loading, { id: "slow-stage" });
});

test("stops progress and exposes the existing error layer when module loading fails", async () => {
  const { documentTarget, elements } = loaderHarness();
  const cleared = [];
  const result = await startSoloCookingLoader(documentTarget, {
    windowTarget: {},
    importApp: async () => { throw new Error("offline"); },
    requestFrame: () => { throw new Error("must not request a frame"); },
    setIntervalFn: () => 19,
    clearIntervalFn: (id) => cleared.push(id),
    now: () => 0,
  });

  assert.equal(result, null);
  assert.deepEqual(cleared, [19]);
  assert.equal(elements.loading.hidden, true);
  assert.equal(elements.error.hidden, false);
  assert.match(elements.status.textContent, /offline/);
});

test("order mode boots the solo stage without practice overlays and mounts the shop controller", async () => {
  const { documentTarget } = loaderHarness();
  const stage = { id: "order-stage" };
  const frames = [];
  const soloCalls = [];
  const shopCalls = [];
  const resultPromise = startSoloCookingLoader(documentTarget, {
    windowTarget: {
      location: { href: "https://example.test/cooking.html?mode=orders" },
    },
    importApp: async () => ({
      bootSoloCookingPage: (_document, options) => {
        soloCalls.push(options);
        return stage;
      },
    }),
    importShopApp: async () => ({
      bootBurgerShopPage: (_document, options) => {
        shopCalls.push(options);
        return { handleStageChange() {} };
      },
    }),
    requestFrame: (callback) => {
      frames.push(callback);
      return 1;
    },
    setIntervalFn: () => 2,
    clearIntervalFn() {},
    now: () => 0,
  });

  await flushMicrotasks();
  frames[0]();
  assert.equal(await resultPromise, stage);
  assert.equal(soloCalls[0].openRecipePicker, false);
  assert.equal(soloCalls[0].mountDefaultActions, false);
  assert.equal(typeof soloCalls[0].onStageChange, "function");
  assert.equal(shopCalls[0].stage, stage);
});
