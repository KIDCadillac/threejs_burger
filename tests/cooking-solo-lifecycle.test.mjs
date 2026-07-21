import test from "node:test";
import assert from "node:assert/strict";

import {
  mountSoloCookingLifecycle,
  disposeActiveSoloCookingPage,
} from "../app/static/cooking-solo-lifecycle.mjs";

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, detail = {}) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(detail);
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
}

function stageSpy() {
  return {
    disposed: 0,
    visible: [],
    resized: 0,
    resizeCalls: 0,
    host: {
      setVisible(value) { this.owner.visible.push(value); },
      resize() { this.owner.resized += 1; },
      owner: null,
    },
    resize() {
      this.resizeCalls += 1;
      this.host.resize();
    },
    dispose() { this.disposed += 1; },
  };
}

test("window resize routes through the stage so the fitted camera can be recomputed", () => {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const stage = stageSpy();
  stage.host.owner = stage;
  const lifecycle = mountSoloCookingLifecycle({
    documentTarget, windowTarget, stage, onClick() {},
  });

  windowTarget.emit("resize");
  assert.equal(stage.resizeCalls, 1);
  assert.equal(stage.resized, 1);
  lifecycle.dispose();
});

test("removes document/window listeners and disposes an ordinary unload exactly once", () => {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const stage = stageSpy();
  stage.host.owner = stage;
  const lifecycle = mountSoloCookingLifecycle({
    documentTarget, windowTarget, stage, onClick() {},
  });
  assert.equal(documentTarget.count("click"), 1);
  assert.equal(windowTarget.count("resize"), 1);
  assert.equal(windowTarget.count("pagehide"), 1);
  assert.equal(windowTarget.count("pageshow"), 1);

  windowTarget.emit("pagehide", { persisted: false });
  lifecycle.dispose();
  assert.equal(stage.disposed, 1);
  assert.equal(documentTarget.count("click"), 0);
  assert.equal(windowTarget.count("resize"), 0);
  assert.equal(windowTarget.count("pagehide"), 0);
  assert.equal(windowTarget.count("pageshow"), 0);
});

test("BFCache pagehide pauses without disposing and pageshow restores and resizes", () => {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const stage = stageSpy();
  stage.host.owner = stage;
  const lifecycle = mountSoloCookingLifecycle({
    documentTarget, windowTarget, stage, onClick() {},
  });

  windowTarget.emit("pagehide", { persisted: true });
  assert.equal(stage.disposed, 0);
  assert.deepEqual(stage.visible, [false]);
  windowTarget.emit("pageshow", { persisted: true });
  assert.deepEqual(stage.visible, [false, true]);
  assert.equal(stage.resizeCalls, 1);
  assert.equal(stage.resized, 1);
  lifecycle.dispose();
});

test("mounting twice on one document disposes the previous boot without listener residue", () => {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const first = stageSpy();
  const second = stageSpy();
  first.host.owner = first;
  second.host.owner = second;
  mountSoloCookingLifecycle({ documentTarget, windowTarget, stage: first, onClick() {} });
  const active = mountSoloCookingLifecycle({
    documentTarget, windowTarget, stage: second, onClick() {},
  });

  assert.equal(first.disposed, 1);
  assert.equal(documentTarget.count("click"), 1);
  assert.equal(windowTarget.count("resize"), 1);
  assert.equal(disposeActiveSoloCookingPage(documentTarget), true);
  assert.equal(second.disposed, 1);
  assert.equal(disposeActiveSoloCookingPage(documentTarget), false);
  active.dispose();
});

test("partial listener registration rolls back every listener already attached", () => {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const add = windowTarget.addEventListener.bind(windowTarget);
  windowTarget.addEventListener = (type, callback) => {
    if (type === "pagehide") throw new Error("listener failed");
    add(type, callback);
  };
  const stage = stageSpy();
  stage.host.owner = stage;

  assert.throws(() => mountSoloCookingLifecycle({
    documentTarget, windowTarget, stage, onClick() {},
  }), /listener failed/);
  assert.equal(documentTarget.count("click"), 0);
  assert.equal(windowTarget.count("resize"), 0);
  assert.equal(windowTarget.count("pagehide"), 0);
  assert.equal(windowTarget.count("pageshow"), 0);
});

test("dispose attempts every listener removal and stage cleanup when one removal throws", () => {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const remove = documentTarget.removeEventListener.bind(documentTarget);
  documentTarget.removeEventListener = (type, callback) => {
    remove(type, callback);
    throw new Error("remove failed");
  };
  const stage = stageSpy();
  stage.host.owner = stage;
  const lifecycle = mountSoloCookingLifecycle({
    documentTarget, windowTarget, stage, onClick() {},
  });

  assert.throws(() => lifecycle.dispose(), /remove failed/);
  assert.equal(stage.disposed, 1);
  assert.equal(documentTarget.count("click"), 0);
  assert.equal(windowTarget.count("resize"), 0);
  assert.equal(windowTarget.count("pagehide"), 0);
  assert.equal(windowTarget.count("pageshow"), 0);
  assert.doesNotThrow(() => lifecycle.dispose());
  assert.equal(stage.disposed, 1);
});
