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
    elapsed: add("#cooking-loading-elapsed"),
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

test("shows staged percent and elapsed time until the first cooked frame", async () => {
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
  assert.equal(elements.elapsed.textContent, "已等待 0.0 秒");
  assert.equal(elements.loading.hidden, false);

  now = 2_500;
  intervals[0]();
  assert.equal(elements.elapsed.textContent, "已等待 1.5 秒");
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
