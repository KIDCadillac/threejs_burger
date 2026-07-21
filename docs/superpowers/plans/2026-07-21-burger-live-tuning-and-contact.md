# Burger Live Tuning and Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the bottom-bun/plate air gap and add a mobile, real-time, per-ingredient 3D tuning panel whose values can be persisted and copied as stable JSON.

**Architecture:** A pure `burger-tuning.mjs` module owns defaults, validation, storage, resets, and serialization. The workbench exposes one plate-derived support plane. The solo stage is the only runtime layer that applies per-ingredient scale/contact values to bins, previews, animations, assembled layers, selection feedback, and camera fitting. A DOM-only panel edits the normalized model and the app wires it to the stage and `localStorage`.

**Tech Stack:** JavaScript ES modules, Three.js, native DOM/CSS, Node test runner, Python pytest, Playwright smoke checks.

---

## Task 1: Add a versioned, safe tuning domain model

**Files:**
- Create: `app/static/burger-tuning.mjs`
- Create: `tests/burger-tuning.test.mjs`

- [ ] Write RED tests for canonical defaults, deep freezing, range normalization, obsolete/corrupt data, stable serialization, one-ingredient reset, and storage failures.

```js
test("normalizes partial, non-finite, out-of-range, and obsolete tuning data", () => {
  const value = normalizeBurgerTuning({
    version: 1,
    global: { presentationScale: 9 },
    ingredients: { cheese: { scaleY: Infinity, sinkY: -1 } },
  });
  assert.equal(value.global.presentationScale, 0.9);
  assert.equal(value.ingredients.cheese.scaleY, 1.45);
  assert.equal(value.ingredients.cheese.sinkY, 0);
});
```

- [ ] Run the isolated test and confirm the expected module-not-found failure.

```powershell
$nodeExe='C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe --test tests\burger-tuning.test.mjs
```

- [ ] Implement and export `BURGER_TUNING_STORAGE_KEY`, `DEFAULT_BURGER_TUNING`, `normalizeBurgerTuning`, `loadBurgerTuning`, `saveBurgerTuning`, `serializeBurgerTuning`, and `resetBurgerIngredient`.

```js
export const BURGER_TUNING_STORAGE_KEY = "solo-cooking-burger-tuning:v1";

const LIMITS = Object.freeze({
  presentationScale: [0.55, 0.9],
  scaleX: [0.6, 1.6], scaleY: [0.4, 2.5], scaleZ: [0.6, 1.6],
  sinkY: [0, 0.18],
});

export function normalizeBurgerTuning(value) {
  const source = value?.version === 1 ? value : {};
  return deepFreeze(buildCanonicalTuning(source));
}
```

- [ ] Keep canonical ingredient order `bottom-bun`, `patty`, `cheese`, `tomato`, `lettuce`, `pickle`, `top-bun`; invalid individual fields fall back to that field's default before clamping.
- [ ] Catch failures from the global `localStorage` getter as well as `getItem`/`setItem`; storage failures must not block boot.
- [ ] Re-run the isolated test until GREEN.
- [ ] Commit.

```powershell
git add app/static/burger-tuning.mjs tests/burger-tuning.test.mjs
git commit -m "feat: add safe burger tuning configuration"
```

## Task 2: Derive the stack support plane from the plate geometry

**Files:**
- Modify: `app/static/cooking-workbench-3d.mjs`
- Modify: `tests/cooking-workbench-3d.test.mjs`

- [ ] Add a RED test that computes the real plate top from its bounding box and asserts that both `prep.supportY` and `prep.dropAnchor.position.y` equal it.

```js
plate.geometry.computeBoundingBox();
const expectedSupportY = plate.position.y
  + plate.geometry.boundingBox.max.y * plate.scale.y;
assert.equal(workbench.prep.supportY, expectedSupportY);
assert.equal(workbench.prep.dropAnchor.position.y, expectedSupportY);
```

- [ ] Run the test and confirm it exposes the existing `0.38` anchor versus `0.32` plate-top gap.
- [ ] Compute the support height after creating the plate, use it for the drop anchor, and expose it on `prep` and frozen `layout.prep`. Delete the independent `0.38` magic number.
- [ ] Re-run the workbench tests until GREEN.
- [ ] Commit.

```powershell
git add app/static/cooking-workbench-3d.mjs tests/cooking-workbench-3d.test.mjs
git commit -m "fix: derive burger support height from plate geometry"
```

## Task 3: Apply tuning consistently throughout the solo stage

**Files:**
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`

- [ ] Add RED contact tests for the default bottom bun at rest and during every sampled insertion frame. The visible bottom may penetrate at most `0.03`, and any positive gap must be at most `0.005`.
- [ ] Add RED tuning tests covering independent XYZ/sink values, previews, cue radius, insertion/pick motion, repeated and replenished instances, sauce/selection children, transient cancellation, 20 maximum-thickness layers, normal view, and focused view.

```js
const tuning = normalizeBurgerTuning({
  ...DEFAULT_BURGER_TUNING,
  ingredients: {
    ...DEFAULT_BURGER_TUNING.ingredients,
    cheese: { scaleX: 1.2, scaleY: 1.8, scaleZ: 0.9, sinkY: 0.02 },
  },
});
stage.setTuning(tuning);
assert.deepEqual(readLayerTransform(stage, "cheese").scale, {
  x: 0.72 * 1.2, y: 0.72 * 1.8, z: 0.72 * 0.9,
});
```

- [ ] Run the stage/workbench tests and confirm RED failures for the old constant scale and support anchor.
- [ ] Import the tuning domain, accept `tuning` in the stage constructor, and keep `activeTuning` normalized.
- [ ] Add type-safe helpers that resolve an ingredient from `state.instances[instanceId]`; never infer repeated-instance types from the instance ID string.

```js
function tuningFor(instanceId) {
  return activeTuning.ingredients[state.instances[instanceId]];
}

function targetScale(instanceId) {
  const item = tuningFor(instanceId);
  const p = activeTuning.global.presentationScale;
  return new THREE.Vector3(p * item.scaleX, p * item.scaleY, p * item.scaleZ);
}
```

- [ ] Rewrite `targetTransforms()` to start from `workbench.prep.supportY` and use scaled contact planes plus `sinkY`.

```js
let supportCursor = workbench.prep.supportY;
for (const instanceId of assembledOrder) {
  const layer = layers.get(instanceId);
  const scale = targetScale(instanceId);
  const config = tuningFor(instanceId);
  const y = supportCursor - layer.userData.stackMinY * scale.y - config.sinkY;
  targets.set(instanceId, { position: new THREE.Vector3(x, y, z), scale });
  supportCursor = y + layer.userData.stackMaxY * scale.y - STACK_OVERLAP;
}
```

- [ ] Replace every geometric use of `LAYER_PRESENTATION_SCALE`: bin targets, assembled min/max, drop preview thickness, lower-layer top, cue radius, ghost scale, insertion thickness, pick thickness, and public presentation-scale fields. Cue radius uses `Math.max(scale.x, scale.z)`.
- [ ] Keep insertion pop anchored to the selected layer's visible underside using its tuned `scale.y`; do not animate from the bottom of the whole stack.
- [ ] Add `getTuning()` and `setTuning(next)`. A tuning update must cancel drag/sauce/preview/insertion transients, restore authoritative transforms, adapt the camera, emit once, and never alter cooking order, inventory, history, sauce strokes, completion, or instance identity.
- [ ] Update old tests whose expected geometry hard-coded `0.72` to derive expectations from actual layer scale or `stage.getTuning()`.
- [ ] Run focused tests until GREEN.

```powershell
& $nodeExe --test tests\cooking-workbench-3d.test.mjs tests\cooking-solo-stage.test.mjs tests\burger-model-3d.test.mjs
```

- [ ] Commit.

```powershell
git add app/static/cooking-solo-stage.mjs tests/cooking-solo-stage.test.mjs
git commit -m "feat: apply live tuning to every burger transform"
```

## Task 4: Build the mobile tuning panel

**Files:**
- Create: `app/static/cooking-tuning-panel.mjs`
- Create: `tests/cooking-tuning-panel.test.mjs`

- [ ] Add RED tests for open/close, all seven ingredient tabs, range/number synchronization, immediate normalized change events, global scale, current/all reset, stable JSON copy, clipboard rejection fallback, and disposal.
- [ ] Implement a DOM-only controller so its behavior can be tested without Three.js.

```js
export function createCookingTuningPanel({
  root, documentTarget, navigatorTarget, initialTuning, onChange,
}) {
  let tuning = normalizeBurgerTuning(initialTuning);
  let selectedIngredient = "bottom-bun";
  // Event delegation reads data-tuning-key and data-ingredient-id.
  return { open, close, getTuning, setTuning, dispose };
}
```

- [ ] Normalize every typed number before reflecting it into both controls and before calling `onChange`.
- [ ] On clipboard failure, reveal a readonly textarea containing the same stable JSON, then focus and select it; do not discard the active configuration.
- [ ] Re-run the isolated panel tests until GREEN.
- [ ] Commit.

```powershell
git add app/static/cooking-tuning-panel.mjs tests/cooking-tuning-panel.test.mjs
git commit -m "feat: add mobile burger tuning panel"
```

## Task 5: Wire persistence and accessible mobile UI

**Files:**
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] Add RED app tests proving tuning loads before stage construction, every panel change applies and persists, localStorage getter failures fall back to defaults, actions open/close the panel, and remount/dispose leaves no duplicate listeners.
- [ ] Add RED static-page tests for the header `参数` entry, accessible bottom sheet, seven tabs, paired range/number inputs, copy/reset actions, readonly fallback JSON, safe-area padding, scrollable landscape layout, and minimum 44px targets.
- [ ] Add the panel markup and responsive CSS. Keep it a bottom sheet on mobile and a constrained side/bottom panel on wide screens.
- [ ] Load tuning before creating the stage, pass it to the stage factory, then create the panel from `stage.getTuning()`.

```js
const initialTuning = loadBurgerTuning({ globalTarget: windowTarget });
const stage = stageFactory({ ...stageOptions, tuning: initialTuning });
const tuningPanel = tuningPanelFactory({
  ...panelElements,
  initialTuning: stage.getTuning(),
  onChange(next) {
    const applied = stage.setTuning(next);
    saveBurgerTuning(applied, { globalTarget: windowTarget });
  },
});
```

- [ ] Dispose the panel with the existing app lifecycle and pause game interactions while the modal sheet is open.
- [ ] Run the focused UI/app suite until GREEN.

```powershell
& $nodeExe --test tests\burger-tuning.test.mjs tests\cooking-tuning-panel.test.mjs tests\cooking-solo-app.test.mjs tests\cooking-solo-page.test.mjs tests\cooking-solo-stage.test.mjs tests\cooking-workbench-3d.test.mjs
```

- [ ] Commit.

```powershell
git add app/static/cooking-solo-app.mjs app/static/cooking.html app/static/cooking.css tests/cooking-solo-app.test.mjs tests/cooking-solo-page.test.mjs
git commit -m "feat: persist and expose burger tuning controls"
```

## Task 6: Verify the complete feature

- [ ] Run every Node test, every Python test, and whitespace validation.

```powershell
$nodeTests = Get-ChildItem tests -Filter *.test.mjs | ForEach-Object FullName
& $nodeExe --test @nodeTests
C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe -m pytest -q
git diff --check
```

- [ ] Use Playwright at `390x844` and landscape size to verify panel scrolling, real-time response, copy/fallback, refresh persistence, a supported first bun, 20-layer camera fitting, and focused view.
- [ ] Capture comparison screenshots and record the final copied JSON used for acceptance.
- [ ] Do not deploy until all automated and visual checks pass.
