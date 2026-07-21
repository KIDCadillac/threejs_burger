import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { createThreeSceneHost } from "../app/static/three-scene-host.mjs";

class FakeEventTarget {
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

  dispatch(type, event = {}) {
    for (const callback of this.listeners.get(type) ?? []) callback(event);
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createCanvas(width = 390, height = 520) {
  const canvas = new FakeEventTarget();
  canvas.width = width;
  canvas.height = height;
  canvas.getBoundingClientRect = () => ({ width, height });
  return canvas;
}

function createRendererHarness(canvas) {
  const calls = [];
  let animationLoop = null;
  let options;
  const renderer = {
    domElement: canvas,
    setPixelRatio: (value) => calls.push(["ratio", value]),
    setSize: (...args) => calls.push(["size", ...args]),
    render: (...args) => calls.push(["render", ...args]),
    setAnimationLoop: (callback) => {
      animationLoop = callback;
      calls.push(["loop", callback]);
    },
    dispose: () => calls.push(["dispose"]),
  };

  return {
    calls,
    renderer,
    rendererFactory: (receivedOptions) => {
      options = receivedOptions;
      return renderer;
    },
    get animationLoop() {
      return animationLoop;
    },
    get options() {
      return options;
    },
  };
}

function useFakeDocument(run) {
  const previousDocument = globalThis.document;
  const fakeDocument = new FakeEventTarget();
  fakeDocument.hidden = false;
  globalThis.document = fakeDocument;
  try {
    return run(fakeDocument);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test("constructs a transparent antialiased Three scene with a camera and warm lights", () => {
  useFakeDocument(() => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    const host = createThreeSceneHost({
      canvas,
      rendererFactory: harness.rendererFactory,
      viewport: () => ({ width: 390, height: 520, pixelRatio: 3 }),
    });

    assert.deepEqual(harness.options, { canvas, alpha: true, antialias: true });
    assert.ok(host.scene instanceof THREE.Scene);
    assert.ok(host.camera instanceof THREE.PerspectiveCamera);
    assert.equal(host.scene.children.filter((child) => child instanceof THREE.HemisphereLight).length, 1);
    assert.equal(host.scene.children.filter((child) => child instanceof THREE.DirectionalLight).length, 1);
    assert.deepEqual(
      harness.calls.filter(([name]) => name === "ratio"),
      [["ratio", 2]],
    );

    host.dispose();
  });
});

test("rejects renderers without render or disposal support", () => {
  useFakeDocument(() => {
    for (const missingMethod of ["render", "dispose"]) {
      const canvas = createCanvas();
      const harness = createRendererHarness(canvas);
      delete harness.renderer[missingMethod];

      assert.throws(
        () => createThreeSceneHost({ canvas, rendererFactory: harness.rendererFactory }),
        /compatible WebGL renderer/,
        `renderer without ${missingMethod} should be rejected`,
      );
    }
  });
});

test("starts once, renders registered frames, and pauses and resumes explicitly", () => {
  useFakeDocument(() => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    const host = createThreeSceneHost({
      canvas,
      rendererFactory: harness.rendererFactory,
      viewport: () => ({ width: 390, height: 520, pixelRatio: 1 }),
    });
    const frameTimes = [];
    const order = [];
    host.onFrame((time) => {
      frameTimes.push(time);
      order.push("before-render");
    });
    host.onAfterFrame(() => order.push("after-render"));
    harness.renderer.render = (...args) => {
      harness.calls.push(["render", ...args]);
      order.push("render");
    };

    host.start();
    const firstLoop = harness.animationLoop;
    host.start();
    assert.equal(typeof firstLoop, "function");
    assert.equal(harness.calls.filter(([name, loop]) => name === "loop" && loop).length, 1);

    firstLoop(123);
    assert.deepEqual(frameTimes, [123]);
    assert.deepEqual(order, ["before-render", "render", "after-render"]);
    assert.equal(harness.calls.filter(([name]) => name === "render").length, 1);

    host.setVisible(false);
    assert.equal(harness.animationLoop, null);
    host.setVisible(true);
    assert.equal(harness.animationLoop, firstLoop);
    host.dispose();
  });
});

test("does not render after a frame callback disposes the host", () => {
  useFakeDocument(() => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    const host = createThreeSceneHost({
      canvas,
      rendererFactory: harness.rendererFactory,
      viewport: () => ({ width: 390, height: 520, pixelRatio: 1 }),
    });
    host.onFrame(() => host.dispose());
    host.start();

    harness.animationLoop(123);

    assert.equal(harness.calls.filter(([name]) => name === "dispose").length, 1);
    assert.equal(harness.calls.filter(([name]) => name === "render").length, 0);
  });
});

test("reads the live WebGL frame into a reusable pixel buffer for feedback capture", () => {
  useFakeDocument(() => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    const readCalls = [];
    const targetCalls = [];
    harness.renderer.getRenderTarget = () => null;
    harness.renderer.setRenderTarget = (target) => targetCalls.push(target);
    harness.renderer.readRenderTargetPixels = (...args) => {
      readCalls.push(args.slice(1, -1));
      args.at(-1).set([1, 2, 3, 4, 5, 6, 7, 8]);
    };
    const host = createThreeSceneHost({ canvas, rendererFactory: harness.rendererFactory });

    const first = host.readFramePixels({ width: 2, height: 1 });
    const second = host.readFramePixels({ width: 2, height: 1 });

    assert.equal(harness.calls.filter(([name]) => name === "render").length, 2);
    assert.deepEqual(readCalls, [
      [0, 0, 2, 1],
      [0, 0, 2, 1],
    ]);
    assert.equal(targetCalls.length, 4);
    assert.equal(targetCalls[1], null);
    assert.equal(targetCalls[3], null);
    assert.equal(first.rgba, second.rgba);
    assert.deepEqual([...second.rgba], [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(
      { width: second.width, height: second.height, flippedY: second.flippedY },
      { width: 2, height: 1, flippedY: true },
    );
    host.dispose();
    assert.equal(host.readFramePixels(), null);
  });
});

test("pauses for document visibility and does not override an explicit pause", () => {
  useFakeDocument((fakeDocument) => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    const host = createThreeSceneHost({
      canvas,
      rendererFactory: harness.rendererFactory,
      viewport: () => ({ width: 390, height: 520, pixelRatio: 1 }),
    });
    host.start();
    const loop = harness.animationLoop;

    fakeDocument.hidden = true;
    fakeDocument.dispatch("visibilitychange");
    assert.equal(harness.animationLoop, null);

    fakeDocument.hidden = false;
    fakeDocument.dispatch("visibilitychange");
    assert.equal(harness.animationLoop, loop);

    host.setVisible(false);
    fakeDocument.hidden = true;
    fakeDocument.dispatch("visibilitychange");
    fakeDocument.hidden = false;
    fakeDocument.dispatch("visibilitychange");
    assert.equal(harness.animationLoop, null);
    host.dispose();
  });
});

test("resizes from the viewport and updates the camera aspect", () => {
  useFakeDocument(() => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    let dimensions = { width: 390, height: 520, pixelRatio: 1.5 };
    const host = createThreeSceneHost({
      canvas,
      rendererFactory: harness.rendererFactory,
      viewport: () => dimensions,
    });
    let projectionUpdates = 0;
    host.camera.updateProjectionMatrix = () => { projectionUpdates += 1; };
    dimensions = { width: 844, height: 390, pixelRatio: 2.5 };

    host.resize();

    assert.equal(host.camera.aspect, 844 / 390);
    assert.equal(projectionUpdates, 1);
    assert.deepEqual(harness.calls.at(-2), ["ratio", 2]);
    assert.deepEqual(harness.calls.at(-1), ["size", 844, 390, false]);
    host.dispose();
  });
});

test("uses the canvas rectangle when no viewport adapter is supplied", () => {
  useFakeDocument(() => {
    const canvas = createCanvas(412, 732);
    const harness = createRendererHarness(canvas);
    const host = createThreeSceneHost({ canvas, rendererFactory: harness.rendererFactory });

    assert.equal(host.camera.aspect, 412 / 732);
    assert.ok(harness.calls.some((call) => (
      call[0] === "size" && call[1] === 412 && call[2] === 732 && call[3] === false
    )));
    host.dispose();
  });
});

test("pauses on context loss, reports the error, and resumes after restoration", () => {
  useFakeDocument(() => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    const host = createThreeSceneHost({
      canvas,
      rendererFactory: harness.rendererFactory,
      viewport: () => ({ width: 390, height: 520, pixelRatio: 1 }),
    });
    const errors = [];
    host.onContextError((error) => errors.push(error));
    host.start();
    const loop = harness.animationLoop;
    let prevented = false;

    canvas.dispatch("webglcontextlost", { preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(harness.animationLoop, null);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /WebGL context lost/i);

    canvas.dispatch("webglcontextrestored");
    assert.equal(harness.animationLoop, loop);
    assert.equal(harness.calls.filter(([name]) => name === "size").length, 2);
    host.dispose();
  });
});

test("disposes shared geometries and scalar or array materials exactly once", () => {
  useFakeDocument((fakeDocument) => {
    const canvas = createCanvas();
    const harness = createRendererHarness(canvas);
    const host = createThreeSceneHost({
      canvas,
      rendererFactory: harness.rendererFactory,
      viewport: () => ({ width: 390, height: 520, pixelRatio: 1 }),
    });
    const disposeCounts = { geometry: 0, first: 0, second: 0 };
    const geometry = { dispose: () => { disposeCounts.geometry += 1; } };
    const firstMaterial = { dispose: () => { disposeCounts.first += 1; } };
    const secondMaterial = { dispose: () => { disposeCounts.second += 1; } };
    const first = new THREE.Object3D();
    first.geometry = geometry;
    first.material = [firstMaterial, secondMaterial, firstMaterial];
    const second = new THREE.Object3D();
    second.geometry = geometry;
    second.material = secondMaterial;
    host.scene.add(first, second);
    host.start();

    host.dispose();
    host.dispose();

    assert.deepEqual(disposeCounts, { geometry: 1, first: 1, second: 1 });
    assert.equal(harness.calls.filter(([name]) => name === "dispose").length, 1);
    assert.equal(canvas.listenerCount("webglcontextlost"), 0);
    assert.equal(canvas.listenerCount("webglcontextrestored"), 0);
    assert.equal(fakeDocument.listenerCount("visibilitychange"), 0);
  });
});

test("short landscape screens override the portrait stage minimum height", () => {
  const css = readFileSync(new URL("../app/static/styles.css", import.meta.url), "utf8");
  const shortLandscapeRule = /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:[^)]+\)\s*{[\s\S]*?\.three-stage(?:,\s*\.three-stage__canvas)?\s*{[^}]*min-height:\s*min\(/;
  assert.match(css, shortLandscapeRule);
});
