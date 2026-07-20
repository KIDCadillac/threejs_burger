# Physical Burger Insertion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the constrained, text-explained burger drop flow with free orbiting, contact-correct stacking, visible grab highlighting, and distinct top/bottom/home spring insertion animations.

**Architecture:** Keep `cooking-solo-state.mjs` as the sole authority for layer order and history. Add a DOM-free motion sampler that produces deterministic animation coefficients, then let `cooking-solo-stage.mjs` map those coefficients onto reusable Three.js meshes and temporary transforms; every animation ends by resynchronizing exact authoritative targets.

**Tech Stack:** JavaScript ES modules, Three.js r185, Node built-in test runner, FastAPI static serving, GitHub Pages.

---

## File map

- Create `app/static/cooking-insertion-animation.mjs`: validate and sample pick/top/bottom/home motion timelines without Three.js or DOM dependencies.
- Create `tests/cooking-insertion-animation.test.mjs`: phase boundaries, overshoot, reduced-motion and validation tests for the sampler.
- Modify `app/static/cooking-solo-stage.mjs`: scaled contact heights, drop previews, timeline ownership, cancellation, haptics and exact final resync.
- Modify `app/static/cooking-interaction-controller.mjs`: optional cyclic yaw instead of clamped yaw.
- Modify `app/static/burger-model-3d.mjs`: one reusable non-raycast selection halo and its public highlight method.
- Modify `app/static/cooking-workbench-3d.mjs`: one reusable top/bottom landing cue on the prep station.
- Modify `app/static/cooking-solo-app.mjs`, `app/static/cooking.html`, and `app/static/cooking.css`: remove the old text drop-intent pill.
- Modify the corresponding Node tests and `tests/test_app.py` so the new module is served with a JavaScript MIME type.

### Task 1: Make every visible burger layer touch

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write the failing contact test**

Add a helper and test that measure the visible top and bottom of each scaled layer, rather than only comparing layer center positions:

```js
function visibleLayerInterval(layer) {
  const scaledHalfHeight = layer.userData.halfHeight * layer.scale.y;
  return {
    bottom: layer.position.y - scaledHalfHeight,
    top: layer.position.y + scaledHalfHeight,
  };
}

test("stacks all seven scaled layers in visible contact without cumulative air gaps", () => {
  const { stage } = harness({ reducedMotion: true });
  BURGER_LAYER_IDS.forEach((id) => stage.dropLayer(id, { kind: "prep" }));

  const intervals = stage.getState().assembledOrder.map((id) => (
    visibleLayerInterval(stage.burger.getLayer(id))
  ));
  for (let index = 1; index < intervals.length; index += 1) {
    const gap = intervals[index].bottom - intervals[index - 1].top;
    assert.ok(gap <= 1e-9, `layer ${index} must not float by ${gap}`);
    assert.ok(gap >= -0.04, `layer ${index} must not sink excessively by ${gap}`);
  }
  stage.dispose();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cooking-solo-stage.test.mjs
```

Expected: FAIL because `targetTransforms()` advances `cursorY` with unscaled `halfHeight` and positive `STACK_GAP`.

- [ ] **Step 3: Calculate centers from visible scaled thickness**

Replace the positive-gap algorithm with scaled thickness and a small overlap:

```js
const STACK_OVERLAP = 0.025;

const targetTransforms = (assembledOrder = state.assembledOrder) => {
  const result = new Map();
  let cursorY = workbench.prep.dropAnchor.position.y;
  assembledOrder.forEach((layerId, index) => {
    const layer = burger.getLayer(layerId);
    const scaledHalfHeight = layer.userData.halfHeight * LAYER_PRESENTATION_SCALE;
    const y = cursorY + scaledHalfHeight + (expanded ? index * EXPLODED_GAP : 0);
    result.set(layerId, {
      position: new THREE.Vector3(0, y, 0),
      scale: new THREE.Vector3(
        LAYER_PRESENTATION_SCALE,
        LAYER_PRESENTATION_SCALE,
        LAYER_PRESENTATION_SCALE,
      ),
      yaw: state.rotations[layerId],
    });
    cursorY += scaledHalfHeight * 2 - STACK_OVERLAP;
  });
  for (const layerId of BURGER_LAYER_IDS) {
    if (result.has(layerId)) continue;
    const station = workbench.getStation("ingredient", layerId);
    const world = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
    result.set(layerId, {
      position: burger.root.worldToLocal(world.clone()),
      scale: new THREE.Vector3(
        LAYER_PRESENTATION_SCALE,
        LAYER_PRESENTATION_SCALE,
        LAYER_PRESENTATION_SCALE,
      ),
      yaw: state.rotations[layerId],
    });
  }
  return result;
};
```

Delete `STACK_GAP` so there is one spacing rule.

- [ ] **Step 4: Run the contact and scale tests and verify GREEN**

Run the same test command. Expected: the new contact test and the existing “keeps one food scale” test pass.

- [ ] **Step 5: Commit**

```powershell
git add app/static/cooking-solo-stage.mjs tests/cooking-solo-stage.test.mjs
git commit -m "fix: stack burger layers in contact"
```

### Task 2: Restore free camera orbit

**Files:**
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing cyclic-yaw and stage-range tests**

Add a separate controller test whose 1000px drag exceeds π radians:

```js
test("wraps cooking yaw through a full orbit instead of stopping at the side", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const changes = [];
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    raycast: () => null,
    cameraTarget: { x: 0, y: 0, z: 0 },
    orbitSensitivity: 0.0042,
    orbitLimits: {
      minYaw: -Math.PI, maxYaw: Math.PI,
      minPitch: 0.12, maxPitch: 1.45,
      minDistance: 5, maxDistance: 45,
      wrapYaw: true,
    },
    onCameraChange: (detail) => changes.push(detail),
  });
  canvas.dispatch("pointerdown", pointer(90, 0, 0));
  canvas.dispatch("pointermove", pointer(90, 1000, 0));
  const expected = ((-4.2 + Math.PI) % (Math.PI * 2) + Math.PI * 2)
    % (Math.PI * 2) - Math.PI;
  assert.ok(Math.abs(changes.at(-1).yaw - expected) < 1e-9);
  assert.notEqual(Math.abs(changes.at(-1).yaw), Math.PI);
  controller.dispose();
});
```

Update the stage configuration assertion to:

```js
assert.deepEqual(configuration.orbitLimits, {
  minYaw: -Math.PI,
  maxYaw: Math.PI,
  minPitch: 0.12,
  maxPitch: 1.45,
  minDistance: 5,
  maxDistance: 45,
  wrapYaw: true,
});
```

- [ ] **Step 2: Run both tests and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cooking-interaction-controller.test.mjs tests\cooking-solo-stage.test.mjs
```

Expected: FAIL because `wrapYaw` is not preserved and yaw still clamps.

- [ ] **Step 3: Add validated cyclic yaw**

In `copyOrbitLimits`, return the Boolean option:

```js
return Object.freeze({
  minYaw: finiteNumber(value.minYaw, -1.15, "orbitLimits.minYaw"),
  maxYaw: finiteNumber(value.maxYaw, 1.15, "orbitLimits.maxYaw"),
  minPitch: finiteNumber(value.minPitch, 0.25, "orbitLimits.minPitch"),
  maxPitch: finiteNumber(value.maxPitch, 1.25, "orbitLimits.maxPitch"),
  minDistance: finiteNumber(value.minDistance, 5, "orbitLimits.minDistance"),
  maxDistance: finiteNumber(value.maxDistance, 45, "orbitLimits.maxDistance"),
  wrapYaw: value.wrapYaw === true,
});
```

Normalize cyclic yaw in `applyCameraState`:

```js
const cyclicYaw = (angle) => {
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
};

const nextYaw = normalizedOrbitLimits.wrapYaw
  ? cyclicYaw(yaw)
  : clamp(yaw, normalizedOrbitLimits.minYaw, normalizedOrbitLimits.maxYaw);
```

Pass the exact stage limits asserted above. Keep `orbitSensitivity: 0.0042` unchanged.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the Task 2 command. Expected: cyclic yaw, vertical direction, pinch limits and reset tests all pass.

- [ ] **Step 5: Commit**

```powershell
git add app/static/cooking-interaction-controller.mjs app/static/cooking-solo-stage.mjs tests/cooking-interaction-controller.test.mjs tests/cooking-solo-stage.test.mjs
git commit -m "feat: allow free cooking camera orbit"
```

### Task 3: Build a deterministic motion sampler

**Files:**
- Create: `tests/cooking-insertion-animation.test.mjs`
- Create: `app/static/cooking-insertion-animation.mjs`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Write failing timeline tests**

Create tests for the public API:

```js
import {
  createCookingMotion,
  sampleCookingMotion,
} from "../app/static/cooking-insertion-animation.mjs";

test("top insertion anticipates, impacts, overshoots, and settles", () => {
  const motion = createCookingMotion({ kind: "top", startedAt: 100, thickness: 0.5 });
  assert.equal(sampleCookingMotion(motion, 100).phase, "anticipate");
  assert.equal(sampleCookingMotion(motion, 220).phase, "impact");
  assert.ok(sampleCookingMotion(motion, 280).selectedOffsetY > 0);
  assert.deepEqual(sampleCookingMotion(motion, 400), {
    phase: "settled",
    progress: 1,
    arrival: 1,
    selectedOffsetY: 0,
    stackOffsetY: 0,
    stackCompression: 0,
    selectedScaleXz: 1,
    selectedScaleY: 1,
    impact: false,
    done: true,
  });
});

test("bottom insertion lifts the old stack before the new layer exits below", () => {
  const motion = createCookingMotion({ kind: "bottom", startedAt: 0, thickness: 0.6 });
  const opening = sampleCookingMotion(motion, 70);
  const exit = sampleCookingMotion(motion, 250);
  assert.equal(opening.phase, "open");
  assert.ok(opening.stackOffsetY > 0);
  assert.equal(exit.phase, "exit");
  assert.ok(exit.selectedOffsetY < 0);
  assert.equal(sampleCookingMotion(motion, 380).done, true);
});

test("pick and home motions return to identity while reduced motion settles immediately", () => {
  const pick = createCookingMotion({ kind: "pick", startedAt: 0, thickness: 0.4 });
  assert.ok(sampleCookingMotion(pick, 30).selectedScaleXz > 1);
  assert.ok(sampleCookingMotion(pick, 30).selectedScaleY < 1);
  assert.equal(sampleCookingMotion(pick, 90).done, true);

  const reduced = createCookingMotion({
    kind: "bottom", startedAt: 0, thickness: 0.4, reducedMotion: true,
  });
  assert.equal(sampleCookingMotion(reduced, 0).done, true);
});

test("motion creation rejects unknown kinds and non-finite inputs", () => {
  assert.throws(() => createCookingMotion({ kind: "physics", startedAt: 0, thickness: 1 }));
  assert.throws(() => createCookingMotion({ kind: "top", startedAt: NaN, thickness: 1 }));
  assert.throws(() => createCookingMotion({ kind: "top", startedAt: 0, thickness: 0 }));
});
```

In `test_standalone_solo_cooking_page_and_modules_are_served`, add the new static module to the existing response loop before the file exists:

```python
animation = client.get("/static/cooking-insertion-animation.mjs")
for response in (loader, stage, state, tutorial, drop_intent, animation):
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        ("text/javascript", "application/javascript")
    )
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cooking-insertion-animation.test.mjs
py -m pytest tests/test_app.py::test_standalone_solo_cooking_page_and_modules_are_served -q
```

Expected: both commands FAIL because the module does not exist and the static route returns 404.

- [ ] **Step 3: Implement the pure sampler**

Implement fixed durations and phase sampling with no Three.js imports:

```js
const DURATIONS = Object.freeze({ pick: 90, top: 300, bottom: 380, home: 240 });
const KINDS = new Set(Object.keys(DURATIONS));
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value) => 1 - (1 - clamp01(value)) ** 3;
const easeInOut = (value) => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
};

export function createCookingMotion({ kind, startedAt, thickness, reducedMotion = false } = {}) {
  if (!KINDS.has(kind)) throw new TypeError("kind must be pick, top, bottom, or home");
  if (!Number.isFinite(startedAt)) throw new TypeError("startedAt must be finite");
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new TypeError("thickness must be a positive finite number");
  }
  return Object.freeze({ kind, startedAt, thickness, reducedMotion: Boolean(reducedMotion) });
}

const settled = Object.freeze({
  phase: "settled", progress: 1, arrival: 1,
  selectedOffsetY: 0, stackOffsetY: 0, stackCompression: 0,
  selectedScaleXz: 1, selectedScaleY: 1, impact: false, done: true,
});

export function sampleCookingMotion(motion, now) {
  if (!motion || !KINDS.has(motion.kind) || !Number.isFinite(now)) {
    throw new TypeError("motion and now must be valid");
  }
  if (motion.reducedMotion) return settled;
  const duration = DURATIONS[motion.kind];
  const progress = clamp01((now - motion.startedAt) / duration);
  if (progress >= 1) return settled;

  const result = {
    phase: motion.kind,
    progress,
    arrival: 0,
    selectedOffsetY: 0,
    stackOffsetY: 0,
    stackCompression: 0,
    selectedScaleXz: 1,
    selectedScaleY: 1,
    impact: false,
    done: false,
  };
  if (motion.kind === "pick") {
    const pulse = Math.sin(Math.PI * progress);
    result.phase = progress < 0.45 ? "squash" : "release";
    result.selectedScaleXz = 1 + pulse * 0.055;
    result.selectedScaleY = 1 - pulse * 0.07;
    return Object.freeze(result);
  }
  if (motion.kind === "top") {
    if (progress < 0.22) {
      const q = progress / 0.22;
      result.phase = "anticipate";
      result.arrival = easeInOut(q) * 0.25;
      result.stackCompression = easeOutCubic(q);
    } else if (progress < 0.56) {
      const q = (progress - 0.22) / 0.34;
      result.phase = "impact";
      result.arrival = 0.25 + easeInOut(q) * 0.75;
      result.selectedOffsetY = -motion.thickness * 0.06 * easeOutCubic(q);
      result.stackCompression = 1 - q * 0.35;
      result.impact = q >= 0.72;
    } else if (progress < 0.82) {
      const q = (progress - 0.56) / 0.26;
      result.phase = "rebound";
      result.arrival = 1;
      result.selectedOffsetY = motion.thickness * 0.12 * Math.sin(Math.PI * q);
      result.stackCompression = (1 - q) * 0.65;
    } else {
      const q = (progress - 0.82) / 0.18;
      result.phase = "settle";
      result.arrival = 1;
      result.selectedOffsetY = motion.thickness * 0.025 * Math.sin(Math.PI * q);
      result.stackCompression = 0;
    }
    return Object.freeze(result);
  }
  if (motion.kind === "bottom") {
    if (progress < 0.24) {
      const q = progress / 0.24;
      result.phase = "open";
      result.arrival = easeInOut(q) * 0.18;
      result.stackOffsetY = (motion.thickness + 0.08) * easeOutCubic(q);
    } else if (progress < 0.58) {
      const q = (progress - 0.24) / 0.34;
      result.phase = "insert";
      result.arrival = 0.18 + easeInOut(q) * 0.65;
      result.stackOffsetY = motion.thickness + 0.08;
      result.selectedOffsetY = motion.thickness * (0.45 - q * 0.9);
    } else if (progress < 0.82) {
      const q = (progress - 0.58) / 0.24;
      result.phase = "exit";
      result.arrival = 0.83 + easeInOut(q) * 0.17;
      result.stackOffsetY = (motion.thickness + 0.08) * (1 - easeOutCubic(q));
      result.selectedOffsetY = -motion.thickness * 0.12 * Math.sin(Math.PI * (0.5 + q * 0.5));
      result.impact = q >= 0.55;
    } else {
      const q = (progress - 0.82) / 0.18;
      result.phase = "rebound";
      result.arrival = 1;
      result.selectedOffsetY = motion.thickness * 0.055 * Math.sin(Math.PI * q);
    }
    return Object.freeze(result);
  }
  if (progress < 0.55) {
    result.phase = "travel";
    result.arrival = easeInOut(progress / 0.55);
  } else if (progress < 0.82) {
    const q = (progress - 0.55) / 0.27;
    result.phase = "impact";
    result.arrival = 1;
    result.selectedOffsetY = -motion.thickness * 0.09 * Math.sin(Math.PI * q);
    result.impact = q >= 0.5;
  } else {
    const q = (progress - 0.82) / 0.18;
    result.phase = "rebound";
    result.arrival = 1;
    result.selectedOffsetY = motion.thickness * 0.04 * Math.sin(Math.PI * q);
  }
  return Object.freeze(result);
}
```

- [ ] **Step 4: Run the sampler tests and verify GREEN**

Run both Task 3 commands. Expected: all sampler tests pass, and FastAPI serves the module with a JavaScript MIME type.

- [ ] **Step 5: Commit**

```powershell
git add app/static/cooking-insertion-animation.mjs tests/cooking-insertion-animation.test.mjs tests/test_app.py
git commit -m "feat: add cooking insertion motion sampler"
```

### Task 4: Add reusable in-world highlight and landing cues

**Files:**
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `tests/cooking-workbench-3d.test.mjs`
- Modify: `app/static/burger-model-3d.mjs`
- Modify: `app/static/cooking-workbench-3d.mjs`

- [ ] **Step 1: Write failing visual-state tests**

Add a burger test:

```js
test("reuses one non-raycast halo for the currently held layer", () => {
  const burger = createBurgerModel3D(THREE);
  assert.equal(burger.selectionHalo.visible, false);
  assert.equal(burger.setLayerHighlighted("patty", true), true);
  assert.equal(burger.selectionHalo.visible, true);
  assert.equal(burger.selectionHalo.parent, burger.getLayer("patty"));
  assert.notEqual(burger.selectionHalo.raycast, THREE.Mesh.prototype.raycast);
  burger.setLayerHighlighted("patty", false);
  assert.equal(burger.selectionHalo.visible, false);
  burger.dispose();
});
```

Add a workbench test:

```js
test("reuses one prep landing cue for top and bottom intent", () => {
  const workbench = createCookingWorkbench3D(THREE);
  assert.equal(workbench.dropCue.visible, false);
  workbench.setDropCue("top", { y: 1.6 });
  assert.equal(workbench.dropCue.visible, true);
  assert.equal(workbench.dropCue.userData.intent, "top");
  assert.equal(workbench.dropCue.position.y, 1.6);
  workbench.setDropCue("bottom", { y: 0.4 });
  assert.equal(workbench.dropCue.userData.intent, "bottom");
  workbench.clearDropCue();
  assert.equal(workbench.dropCue.visible, false);
  workbench.dispose();
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\burger-model-3d.test.mjs tests\cooking-workbench-3d.test.mjs
```

Expected: FAIL because the halo and drop-cue APIs do not exist.

- [ ] **Step 3: Create one reusable burger halo**

After layer construction, create one unit ring and keep it hidden:

```js
const selectionHaloGeometry = new THREE.RingGeometry(0.9, 1.08, 32);
const selectionHaloMaterial = new THREE.MeshBasicMaterial({
  color: 0xffc84d,
  transparent: true,
  opacity: 0.88,
  side: THREE.DoubleSide,
  depthWrite: false,
  depthTest: false,
});
const selectionHalo = new THREE.Mesh(selectionHaloGeometry, selectionHaloMaterial);
selectionHalo.name = "food-layer:selection-halo";
selectionHalo.rotation.x = -Math.PI / 2;
selectionHalo.visible = false;
selectionHalo.renderOrder = 20;
selectionHalo.raycast = NO_RAYCAST;
ownedGeometries.add(selectionHaloGeometry);
ownedMaterials.add(selectionHaloMaterial);
```

Expose `selectionHalo` and:

```js
setLayerHighlighted(layerId, highlighted = true) {
  assertActive(disposed);
  assertLayerId(layerId);
  if (!highlighted) {
    selectionHalo.visible = false;
    selectionHalo.removeFromParent();
    return false;
  }
  const layer = layers.get(layerId);
  const radius = layer.userData.surfaceRadius;
  layer.add(selectionHalo);
  selectionHalo.position.set(0, 0, 0);
  selectionHalo.scale.set(radius, radius, 1);
  selectionHalo.visible = true;
  return true;
},
```

- [ ] **Step 4: Create one reusable prep drop cue**

Add a gold ring mesh to the workbench prep group, hidden by default:

```js
const dropCueGeometry = new THREE.RingGeometry(0.74, 0.92, 32);
const dropCueMaterial = new THREE.MeshBasicMaterial({
  color: 0xffc84d,
  transparent: true,
  opacity: 0.82,
  side: THREE.DoubleSide,
  depthWrite: false,
  depthTest: false,
});
const dropCue = new THREE.Mesh(dropCueGeometry, dropCueMaterial);
dropCue.name = "prep:drop-cue";
dropCue.rotation.x = -Math.PI / 2;
dropCue.visible = false;
dropCue.renderOrder = 18;
dropCue.raycast = NO_RAYCAST;
prepAnchor.add(dropCue);
ownedGeometries.add(dropCueGeometry);
ownedMaterials.add(dropCueMaterial);
```

Expose the mesh and exact state methods:

```js
dropCue,
setDropCue(intent, { y } = {}) {
  if (disposed) return false;
  if (intent !== "top" && intent !== "bottom") {
    throw new TypeError("drop cue intent must be top or bottom");
  }
  if (!Number.isFinite(y)) throw new TypeError("drop cue y must be finite");
  dropCue.userData.intent = intent;
  dropCue.position.set(0, y, 0);
  const scale = intent === "bottom" ? 1.12 : 1;
  dropCue.scale.set(scale, scale, 1);
  dropCue.visible = true;
  return true;
},
clearDropCue() {
  if (disposed) return;
  dropCue.visible = false;
  delete dropCue.userData.intent;
},
```

- [ ] **Step 5: Run and verify GREEN**

Run the Task 4 command. Expected: highlight, cue, raycast, and disposal tests pass.

- [ ] **Step 6: Commit**

```powershell
git add app/static/burger-model-3d.mjs app/static/cooking-workbench-3d.mjs tests/burger-model-3d.test.mjs tests/cooking-workbench-3d.test.mjs
git commit -m "feat: add in-world cooking highlights"
```

### Task 5: Integrate preview, pick pulse and three drop choreographies

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing stage choreography tests**

Add tests that use an injected `vibrate` spy and call `configuration.onPick`, `onMove`, and `onDrop`:

```js
class FakeVisibilityDocument {
  constructor() {
    this.visibilityState = "visible";
    this.listeners = new Map();
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type, callback) {
    if (this.listeners.get(type) === callback) this.listeners.delete(type);
  }
  hide() {
    this.visibilityState = "hidden";
    this.listeners.get("visibilitychange")?.();
  }
}

function stageHarnessWithConfiguration(options = {}) {
  let configuration;
  const vibrations = [];
  const documentTarget = options.documentTarget ?? new FakeVisibilityDocument();
  const controller = {
    resetCamera: () => true,
    pause() {}, resume() {}, dispose() {},
  };
  const stage = createSoloCookingStage({
    THREE,
    canvas: new FakeCanvas(),
    storage: null,
    documentTarget,
    hostFactory: createHostHarness,
    controllerFactory: (value) => { configuration = value; return controller; },
    vibrate: (pattern) => vibrations.push(pattern),
    ...options,
  });
  return { stage, configuration, vibrations, documentTarget };
}

function prepIntentPoints(stage) {
  const bounds = stage.workbench.getLayout().prep.bounds;
  const depth = bounds.maxZ - bounds.minZ;
  return {
    top: { x: 0, y: 0, z: bounds.minZ + depth * 0.25 },
    bottom: { x: 0, y: 0, z: bounds.minZ + depth * 0.82 },
  };
}

test("held food highlights while top and bottom previews move the real stack", () => {
  const { stage, configuration } = stageHarnessWithConfiguration();
  stage.dropLayer("bottom-bun", { kind: "prep" });
  stage.tick(1000);
  const bun = stage.burger.getLayer("bottom-bun");
  const baseY = bun.position.y;

  configuration.onPick({ id: "patty" });
  assert.equal(stage.burger.selectionHalo.parent, stage.burger.getLayer("patty"));
  const points = prepIntentPoints(stage);
  configuration.onMove({ id: "patty", reason: "drag", point: points.top });
  assert.equal(stage.workbench.dropCue.userData.intent, "top");
  assert.ok(bun.position.y < baseY);

  configuration.onMove({ id: "patty", reason: "drag", point: points.bottom });
  assert.equal(stage.workbench.dropCue.userData.intent, "bottom");
  assert.ok(bun.position.y > baseY);
  stage.dispose();
});

test("top insertion impacts above, rebounds, and finishes at exact contact targets", () => {
  const { stage, configuration, vibrations } = stageHarnessWithConfiguration();
  const patty = stage.burger.getLayer("patty");
  const finalY = stage.workbench.prep.dropAnchor.position.y
    + patty.userData.halfHeight * stage.layerPresentationScale;
  configuration.onPick({ id: "patty" });
  configuration.onDrop({ id: "patty", anchor: stage.workbench.prep.dropAnchor, targetIndex: 0 });
  stage.tick(150);
  stage.tick(190);
  assert.ok(patty.position.y > finalY, "top layer rebounds above its contact target");
  stage.tick(300);
  assert.ok(Math.abs(patty.position.y - finalY) < 1e-9);
  assert.deepEqual(vibrations, [12]);
  stage.dispose();
});

test("bottom insertion lifts old layers while the new food exits beneath them", () => {
  const { stage, configuration } = stageHarnessWithConfiguration();
  stage.dropLayer("patty", { kind: "prep" });
  stage.tick(1000);
  const oldPattyY = stage.burger.getLayer("patty").position.y;
  configuration.onPick({ id: "bottom-bun" });
  configuration.onDrop({ id: "bottom-bun", anchor: stage.workbench.prep.dropAnchor, targetIndex: 0 });
  stage.tick(1070);
  assert.ok(stage.burger.getLayer("patty").position.y > oldPattyY);
  const bottomBun = stage.burger.getLayer("bottom-bun");
  const finalBottomY = stage.workbench.prep.dropAnchor.position.y
    + bottomBun.userData.halfHeight * stage.layerPresentationScale;
  stage.tick(1250);
  assert.ok(bottomBun.position.y < finalBottomY);
  stage.tick(1380);
  assert.deepEqual(stage.getState().assembledOrder, ["bottom-bun", "patty"]);
  assert.ok(Math.abs(bottomBun.position.y - finalBottomY) < 1e-9);
  stage.dispose();
});

test("home return bounces once and all cancellation paths clear temporary visuals", () => {
  const { stage, configuration, documentTarget } = stageHarnessWithConfiguration();
  stage.dropLayer("patty", { kind: "prep" });
  stage.tick(1000);
  configuration.onPick({ id: "patty" });
  const station = stage.workbench.getStation("ingredient", "patty");
  configuration.onDrop({ id: "patty", anchor: station.dropAnchor, targetIndex: null });
  stage.tick(1168);
  const target = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
  const bouncing = stage.burger.getLayer("patty").getWorldPosition(new THREE.Vector3());
  assert.notEqual(bouncing.y, target.y, "home motion visibly compresses before settling");
  documentTarget.hide();
  assert.equal(stage.burger.selectionHalo.visible, false);
  assert.equal(stage.workbench.dropCue.visible, false);
  stage.reset();
  const expected = station.pickupAnchor.getWorldPosition(new THREE.Vector3());
  const actual = stage.burger.getLayer("patty").getWorldPosition(new THREE.Vector3());
  assert.ok(actual.distanceTo(expected) < 1e-9);
  stage.dispose();
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cooking-solo-stage.test.mjs
```

Expected: FAIL because pick highlighting, cues and insertion motion ownership are not integrated.

- [ ] **Step 3: Add authoritative preview reset helpers**

Import `createCookingMotion` and `sampleCookingMotion`. Keep the existing transition map only for undo/invalid rollback, and add these motion/pose helpers beside it:

```js
let activeMotion = null;
let pickMotion = null;
let highlightedLayerId = null;

const captureLayerTransforms = () => new Map(BURGER_LAYER_IDS.map((id) => {
  const layer = burger.getLayer(id);
  return [id, {
    position: layer.position.clone(),
    scale: layer.scale.clone(),
    yaw: layer.rotation.y,
  }];
}));

const clearGrabVisuals = () => {
  if (highlightedLayerId) burger.setLayerHighlighted(highlightedLayerId, false);
  highlightedLayerId = null;
  workbench.clearDropCue();
};

const clearTransientVisuals = ({ resync = true } = {}) => {
  activeMotion = null;
  pickMotion = null;
  transitions.clear();
  clearGrabVisuals();
  if (resync) restoreAuthoritativeTransforms();
};

const restoreAuthoritativeTransforms = () => {
  const targets = targetTransforms();
  for (const [id, target] of targets) {
    const layer = burger.getLayer(id);
    layer.position.copy(target.position);
    layer.rotation.set(0, target.yaw, 0);
    layer.scale.copy(target.scale);
  }
  return targets;
};
```

Add an exact preview that rebuilds the authoritative stack without the dragged layer, restores the dragged pose, then moves only the old stack and reusable cue:

```js
const applyDropPreview = (intent) => {
  if (!intent?.id || intent.kind !== "prep") {
    workbench.clearDropCue();
    return false;
  }
  const selected = burger.getLayer(intent.id);
  const draggedPose = {
    position: selected.position.clone(),
    scale: selected.scale.clone(),
    yaw: selected.rotation.y,
  };
  const previewOrder = state.assembledOrder.filter((id) => id !== intent.id);
  const targets = targetTransforms(previewOrder);
  const thickness = selected.userData.halfHeight * LAYER_PRESENTATION_SCALE * 2;
  const shiftY = intent.intent === "bottom" ? thickness + 0.08 : -0.045;
  for (const id of previewOrder) {
    const layer = burger.getLayer(id);
    const target = targets.get(id);
    layer.position.copy(target.position);
    layer.position.y += shiftY;
    layer.rotation.set(0, target.yaw, 0);
    layer.scale.copy(target.scale);
  }
  selected.position.copy(draggedPose.position);
  selected.rotation.set(0, draggedPose.yaw, 0);
  selected.scale.copy(draggedPose.scale);

  const baseY = workbench.prep.dropAnchor.position.y;
  const topY = previewOrder.reduce((highest, id) => {
    const layer = burger.getLayer(id);
    return Math.max(
      highest,
      layer.position.y + layer.userData.halfHeight * LAYER_PRESENTATION_SCALE - baseY,
    );
  }, 0);
  workbench.setDropCue(intent.intent, {
    y: intent.intent === "bottom" ? 0.015 : topY + 0.015,
  });
  return true;
};
```

Call `applyDropPreview(nextIntent)` only for prep. For home, invalid, rotate and twist, call `workbench.clearDropCue()`; for home retain the ingredient-bin highlight inside the stage rather than the DOM renderer.

- [ ] **Step 4: Start and sample exact motion kinds**

Factor the order-only part of `applyVisualState` into `reorderLayers()`. Replace `dropLayer` with one state mutation followed by one motion start:

```js
const reorderLayers = () => {
  const fullOrder = [
    ...state.assembledOrder,
    ...BURGER_LAYER_IDS.filter((id) => !state.assembledOrder.includes(id)),
  ];
  fullOrder.forEach((id, index) => burger.reorderLayer(id, index));
};

const startLayerMotion = ({ id, kind, previousOrder, from }) => {
  const layer = burger.getLayer(id);
  activeMotion = {
    motion: createCookingMotion({
      kind,
      startedAt: lastFrameTime,
      thickness: layer.userData.halfHeight * LAYER_PRESENTATION_SCALE * 2,
      reducedMotion,
    }),
    selectedId: id,
    previousOrder,
    from,
    targets: targetTransforms(),
    impacted: false,
  };
};

const dropLayer = (id, destination = {}) => {
  if (disposed) return false;
  const previousOrder = [...state.assembledOrder];
  const from = captureLayerTransforms();
  clearGrabVisuals();
  if (destination.kind === "prep") {
    const targetIndex = destination.targetIndex ?? previousOrder.length;
    state = placeSoloLayer(state, id, targetIndex);
    reorderLayers();
    startLayerMotion({
      id,
      kind: targetIndex === 0 && previousOrder.length ? "bottom" : "top",
      previousOrder,
      from,
    });
    advanceTutorial("dropped-on-prep");
    if (state.complete) advanceTutorial("assembled-all");
    emit("drop-layer");
    return true;
  }
  if (destination.kind === "bin") {
    state = removeSoloLayer(state, id);
    reorderLayers();
    startLayerMotion({ id, kind: "home", previousOrder, from });
    emit("remove-layer");
    return true;
  }
  throw new TypeError("destination.kind must be prep or bin");
};
```

On pick, cancel stale motion, show the reusable halo and start the pick pulse:

```js
const selectLayer = (id) => {
  if (disposed) return false;
  if (!BURGER_LAYER_IDS.includes(id)) throw new TypeError(`Unknown burger layer: ${id}`);
  clearTransientVisuals();
  selectedLayerId = id;
  highlightedLayerId = id;
  burger.setLayerHighlighted(id, true);
  const layer = burger.getLayer(id);
  pickMotion = {
    selectedId: id,
    motion: createCookingMotion({
      kind: "pick",
      startedAt: lastFrameTime,
      thickness: layer.userData.halfHeight * LAYER_PRESENTATION_SCALE * 2,
      reducedMotion,
    }),
  };
  advanceTutorial("picked-layer");
  emit("selection");
  return true;
};
```

Add these frame helpers. `applyPose` handles base interpolation; `applyActiveMotion` adds choreography offsets and exactly resynchronizes at completion:

```js
const applyPose = (layer, from, target, amount) => {
  layer.position.lerpVectors(from.position, target.position, amount);
  layer.rotation.y = from.yaw + (target.yaw - from.yaw) * amount;
  layer.scale.lerpVectors(from.scale, target.scale, amount);
};

const fireImpactHaptic = (record, frame) => {
  if (!frame.impact || record.impacted) return;
  record.impacted = true;
  try {
    const haptic = vibrate ?? globalThis.navigator?.vibrate?.bind(globalThis.navigator);
    haptic?.(12);
  } catch {
    // Haptics are optional; animation remains authoritative.
  }
};

const applyActiveMotion = (now) => {
  if (!activeMotion) return;
  const record = activeMotion;
  const frame = sampleCookingMotion(record.motion, now);
  const numericKeys = [
    "progress", "arrival", "selectedOffsetY", "stackOffsetY",
    "stackCompression", "selectedScaleXz", "selectedScaleY",
  ];
  if (numericKeys.some((key) => !Number.isFinite(frame[key]))) {
    activeMotion = null;
    restoreAuthoritativeTransforms();
    return;
  }
  const selected = burger.getLayer(record.selectedId);
  const selectedFrom = record.from.get(record.selectedId);
  const selectedTarget = record.targets.get(record.selectedId);

  for (const id of record.previousOrder.filter((value) => value !== record.selectedId)) {
    const layer = burger.getLayer(id);
    applyPose(layer, record.from.get(id), record.targets.get(id), frame.arrival);
    if (record.motion.kind === "top") layer.position.y -= frame.stackCompression * 0.045;
    if (record.motion.kind === "bottom") layer.position.y += frame.stackOffsetY;
  }

  applyPose(selected, selectedFrom, selectedTarget, frame.arrival);
  if (record.motion.kind === "bottom") {
    const belowY = selectedTarget.position.y - record.motion.thickness * 0.45;
    if (frame.phase === "open" || frame.phase === "insert") {
      const entry = Math.min(1, frame.arrival / 0.83);
      selected.position.y = selectedFrom.position.y
        + (belowY - selectedFrom.position.y) * entry;
    } else {
      const exit = Math.min(1, Math.max(0, (frame.arrival - 0.83) / 0.17));
      selected.position.y = belowY
        + (selectedTarget.position.y - belowY) * exit
        + frame.selectedOffsetY;
    }
  } else {
    selected.position.y += frame.selectedOffsetY;
  }
  selected.scale.x *= frame.selectedScaleXz;
  selected.scale.z *= frame.selectedScaleXz;
  selected.scale.y *= frame.selectedScaleY;
  fireImpactHaptic(record, frame);
  if (frame.done) {
    activeMotion = null;
    restoreAuthoritativeTransforms();
  }
};
```

At the start of `tick`, sample the pick pulse before the active drop motion, then retain the existing generic rollback transition loop:

```js
if (pickMotion) {
  const frame = sampleCookingMotion(pickMotion.motion, lastFrameTime);
  const layer = burger.getLayer(pickMotion.selectedId);
  layer.scale.set(
    LAYER_PRESENTATION_SCALE * frame.selectedScaleXz,
    LAYER_PRESENTATION_SCALE * frame.selectedScaleY,
    LAYER_PRESENTATION_SCALE * frame.selectedScaleXz,
  );
  if (frame.done) pickMotion = null;
}
applyActiveMotion(lastFrameTime);
```

If `reducedMotion` is true, call `applyActiveMotion(lastFrameTime)` immediately after `startLayerMotion`; the sampler returns `done: true`, so no temporary pose survives.

- [ ] **Step 5: Wire every cancellation path with one helper**

Use this wrapper before drag restart, invalid drop, toolbar rotation, undo, reset, finish, continue, page pause and dispose:

```js
const cancelTransientMotion = () => {
  dropIntent = null;
  clearTransientVisuals({ resync: true });
};
```

For invalid drop only, call `syncTransforms({ animate: true })` after cancellation so the dragged item visibly returns. For undo/finish, mutate state first and call `applyVisualState({ animate: true })`; for reset/dispose, use exact authoritative resync without animation. Stage-owned home preview replaces the deleted DOM behavior with:

```js
if (nextIntent.kind === "bin") {
  workbench.clearDropCue();
  workbench.setHighlighted("ingredient", id, true);
} else {
  workbench.clearHighlights();
}
```

Replace direct context-error forwarding and add a visibility cleanup listener so hidden pages and WebGL failures cannot leave a halo or temporary offset:

```js
const handleContextError = (error) => {
  cancelTransientMotion();
  onError(error);
};
const removeContextError = host.onContextError?.(handleContextError) ?? (() => {});
cleanupTasks.push(removeContextError);

const handleVisibilityChange = () => {
  if (documentTarget?.visibilityState === "hidden") cancelTransientMotion();
};
documentTarget?.addEventListener?.("visibilitychange", handleVisibilityChange);
cleanupTasks.push(() => (
  documentTarget?.removeEventListener?.("visibilitychange", handleVisibilityChange)
));
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cooking-insertion-animation.test.mjs tests\cooking-solo-stage.test.mjs tests\cooking-interaction-controller.test.mjs tests\burger-model-3d.test.mjs tests\cooking-workbench-3d.test.mjs
```

Expected: all contact, motion, cancellation, camera and resource tests pass.

- [ ] **Step 7: Commit**

```powershell
git add app/static/cooking-solo-stage.mjs tests/cooking-solo-stage.test.mjs
git commit -m "feat: animate physical burger insertion"
```

### Task 6: Remove the text drop-intent controls

**Files:**
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Replace old pill tests with absence tests**

Delete the test that expects “放在最上层 / 塞到最下层 / 放回原料格”. Add:

```js
test("renders cooking state without a text drop-intent control", () => {
  const page = pageHarness();
  const stages = stageFactoryHarness();
  const stage = bootSoloCookingPage(page.documentTarget, {
    windowTarget: page.windowTarget,
    stageFactory: stages.factory,
  });
  stage.emit({ dropIntent: { kind: "prep", intent: "top", id: "patty", targetIndex: 0 } });
  assert.equal(page.documentTarget.querySelector("#cooking-drop-intent"), null);
});
```

In the page-source test, assert the three old phrases, ID, and CSS class are absent:

```js
assert.doesNotMatch(html, /cooking-drop-intent|放在最上层|塞到最下层|放回原料格/);
assert.doesNotMatch(css, /cooking-drop-intent|data-intent=/);
```

- [ ] **Step 2: Run and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cooking-solo-app.test.mjs tests\cooking-solo-page.test.mjs
```

Expected: FAIL because the element, copy map and CSS still exist.

- [ ] **Step 3: Remove the DOM control and renderer**

Apply these exact source removals; the stage’s internal `dropIntent` remains because it drives Three.js previews, but it no longer reaches the DOM:

```diff
-const DROP_INTENT_COPY = Object.freeze({
-  top: "放在最上层",
-  bottom: "塞到最下层",
-  home: "放回原料格",
-  invalid: "这里放不下",
-});
 ...
-dropIntent: documentTarget.querySelector("#cooking-drop-intent"),
 ...
-const { state, tutorial, expanded, progress, dropIntent = null } = detail;
+const { state, tutorial, expanded, progress } = detail;
 ...
-const dropIntentText = DROP_INTENT_COPY[dropIntent?.intent];
-if (dropIntentText) {
-  elements.dropIntent.hidden = false;
-  elements.dropIntent.textContent = dropIntentText;
-  elements.dropIntent.dataset.intent = dropIntent.intent;
-  if (dropIntent.kind === "bin" && dropIntent.id) {
-    stage.workbench.setHighlighted("ingredient", dropIntent.id, true);
-  }
-} else {
-  elements.dropIntent.hidden = true;
-  elements.dropIntent.textContent = "";
-  delete elements.dropIntent.dataset.intent;
-}
```

Delete this complete HTML node:

```html
<div class="cooking-drop-intent" id="cooking-drop-intent" role="status" aria-live="polite" hidden></div>
```

Delete the complete CSS block from `.cooking-drop-intent {` through the final `.cooking-drop-intent[data-intent="invalid"]` rule. In `pageHarness`, remove `dropIntent: add("#cooking-drop-intent")` and its `hidden` initialization so the absence test reflects the real page.

- [ ] **Step 4: Run and verify GREEN**

Run the Task 6 command. Expected: page and app tests pass, and no old phrase remains in `app/static`.

- [ ] **Step 5: Commit**

```powershell
git add app/static/cooking-solo-app.mjs app/static/cooking.html app/static/cooking.css tests/cooking-solo-app.test.mjs tests/cooking-solo-page.test.mjs
git commit -m "refactor: replace drop text with 3d feedback"
```

### Task 7: Serve, regress and inspect the complete local build

**Files:**
- Verify only; `tests/test_app.py` was changed test-first in Task 3.

- [ ] **Step 1: Run all automated verification**

```powershell
$nodeTests = Get-ChildItem tests -Filter *.test.mjs | ForEach-Object { $_.FullName }
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test $nodeTests
py -m pytest -q
git diff --check
```

Expected: zero Node failures, zero Python failures and no whitespace errors.

- [ ] **Step 2: Perform 390×844 real-browser QA**

Start the FastAPI app on an unused local port so `.mjs` files receive a JavaScript MIME type. In a browser viewport of 390×844 verify:

1. Drag the camera repeatedly through front, side and rear angles; it must not stop at the previous narrow boundary.
2. Reset camera; the default composition returns exactly.
3. Assemble all seven layers; adjacent layers touch with no cumulative air gap.
4. Hold a layer; the in-world halo follows only that layer.
5. Hover top and bottom regions; the stack previews down/up with no text pill.
6. Drop once on top, once on bottom and once home; the three animations are visually distinct and settle exactly.
7. Trigger undo/reset during motion; no halo, cue or temporary offset remains.
8. Inspect console warnings and errors; both counts must be zero.

### Task 8: Publish and verify the unchanged GitHub Pages URL

**Files:**
- Update the static deployment clone at `C:\Users\KID\AppData\Local\Temp\threejs_burger_deploy_20260720_175442`

- [ ] **Step 1: Confirm clean deployment target and pull safely**

```powershell
git -C 'C:\Users\KID\AppData\Local\Temp\threejs_burger_deploy_20260720_175442' status --short
git -C 'C:\Users\KID\AppData\Local\Temp\threejs_burger_deploy_20260720_175442' pull --ff-only
```

Expected: clean status and “Already up to date” or a clean fast-forward.

- [ ] **Step 2: Copy the verified static dependency closure**

Run this explicit allow-list so `real_3d_burger.html`, `.nojekyll`, workflow files and README remain untouched:

```powershell
$sourceRoot = (Resolve-Path 'app/static').Path
$deployRoot = (Resolve-Path 'C:\Users\KID\AppData\Local\Temp\threejs_burger_deploy_20260720_175442').Path
$deployFiles = @(
  'burger-model-3d.mjs',
  'condiment-tools-3d.mjs',
  'cooking.css',
  'cooking-drop-intent.mjs',
  'cooking-insertion-animation.mjs',
  'cooking-interaction-controller.mjs',
  'cooking-loader.mjs',
  'cooking-solo-app.mjs',
  'cooking-solo-focus.mjs',
  'cooking-solo-lifecycle.mjs',
  'cooking-solo-stage.mjs',
  'cooking-solo-state.mjs',
  'cooking-state.mjs',
  'cooking-tutorial-state.mjs',
  'cooking-workbench-3d.mjs',
  'three-scene-host.mjs'
)
foreach ($file in $deployFiles) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $deployRoot $file)
}
Copy-Item -LiteralPath (Join-Path $sourceRoot 'cooking.html') -Destination (Join-Path $deployRoot 'cooking.html')
Copy-Item -LiteralPath (Join-Path $sourceRoot 'cooking.html') -Destination (Join-Path $deployRoot 'index.html')
```

- [ ] **Step 3: Verify package identity and syntax**

Compare SHA-256, parse every module and inspect the deployment diff:

```powershell
$expectedFiles = $deployFiles + @('cooking.html')
foreach ($file in $expectedFiles) {
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $sourceRoot $file)).Hash
  $deployHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $deployRoot $file)).Hash
  if ($sourceHash -ne $deployHash) { throw "Hash mismatch: $file" }
}
$indexHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $deployRoot 'index.html')).Hash
$htmlHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $sourceRoot 'cooking.html')).Hash
if ($indexHash -ne $htmlHash) { throw 'Hash mismatch: index.html' }
$node = 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Get-ChildItem -LiteralPath $deployRoot -Filter *.mjs | ForEach-Object { & $node --check $_.FullName }
git -C $deployRoot diff --check
git -C $deployRoot status --short
```

Expected: no hash or syntax error; status lists only the allow-listed cooking files plus `index.html`.

- [ ] **Step 4: Commit and push main**

```powershell
git add cooking*.mjs cooking.css cooking.html index.html burger-model-3d.mjs condiment-tools-3d.mjs three-scene-host.mjs
git commit -m "Add physical burger insertion feedback"
git push origin main
```

- [ ] **Step 5: Verify the public assets and interaction**

Open `https://kidcadillac.github.io/threejs_burger/` with a cache-busting query at 390×844. Confirm loading reaches 100%, `cooking-insertion-animation.mjs` returns HTTP 200, all seven layers touch, one top and one bottom insertion complete, free orbit remains available, and browser warnings/errors are zero.

- [ ] **Step 6: Run final post-publish verification**

Re-run the complete Node and Python suites, confirm both source and deployment repositories are clean, and record the deployment commit hash for the handoff.
