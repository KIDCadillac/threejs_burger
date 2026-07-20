# 3D Cooking Touch and Layout Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public mobile cooking prototype load clearly, fill more of the phone, rotate naturally, preserve food scale, return ingredients reliably, and obey explicit top/bottom stacking intent.

**Architecture:** Add a small loader state machine in front of the existing page boot, keep pointer mechanics in the interaction controller, and move deterministic drop decisions into a pure `cooking-drop-intent.mjs` module. The stage owns game-facing intent and scale, while the DOM app only renders progress and feedback.

**Tech Stack:** Browser ES modules, Three.js, HTML/CSS, Node.js built-in test runner, Python pytest, Playwright CLI, GitHub Pages.

---

## File map

- Create `app/static/cooking-loader.mjs`: loading phase, percentage, elapsed-time and first-frame lifecycle.
- Create `app/static/cooking-drop-intent.mjs`: pure top/bottom/bin/invalid drop resolver.
- Create `tests/cooking-loader.test.mjs`: deterministic loader lifecycle tests.
- Create `tests/cooking-drop-intent.test.mjs`: deterministic placement and magnetic-return tests.
- Modify `app/static/cooking-interaction-controller.mjs`: natural vertical orbit direction and slower default sensitivity.
- Modify `app/static/cooking-solo-stage.mjs`: unified scale, closer camera, preview intent and resolver integration.
- Modify `app/static/cooking-workbench-3d.mjs`: compact station layout and larger ingredient bins.
- Modify `app/static/cooking-solo-app.mjs`: externally managed loading and visible drop-intent feedback.
- Modify `app/static/cooking.html`: structured loading UI, drop-intent badge and loader entry point.
- Modify `app/static/cooking.css`: larger viewport-relative stage, loading animation and intent badge.
- Modify focused tests under `tests/` before each production change.
- Modify `deploy/github-pages/README.md` only if the new entry-point file changes the publish manifest documentation.

### Task 1: Loading progress lifecycle

**Files:**
- Create: `tests/cooking-loader.test.mjs`
- Create: `app/static/cooking-loader.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking-solo-app.mjs`
- Test: `tests/cooking-loader.test.mjs`
- Test: `tests/cooking-solo-page.test.mjs`
- Test: `tests/cooking-solo-app.test.mjs`

- [ ] **Step 1: Write the failing loader tests**

Create a DOM harness with `#cooking-loading`, `#cooking-loading-phase`, `#cooking-loading-percent`, `#cooking-loading-elapsed`, `#cooking-loading-bar`, and `#cooking-error`. Assert that the exported loader:

```js
const promise = startSoloCookingLoader(documentTarget, {
  windowTarget,
  importApp: async () => ({ bootSoloCookingPage: () => stage }),
  requestFrame: (callback) => frames.push(callback),
  setIntervalFn: (callback) => intervals.push(callback),
  clearIntervalFn: (id) => cleared.push(id),
  now: () => now,
});

assert.equal(elements.phase.textContent, "正在连接料理台");
assert.equal(elements.percent.textContent, "8%");
await Promise.resolve();
assert.equal(elements.phase.textContent, "正在摆放 3D 食材和工具");
frames.shift()(16);
assert.equal(await promise, stage);
assert.equal(elements.percent.textContent, "100%");
assert.equal(elements.loading.hidden, true);
assert.deepEqual(cleared, [intervalId]);
```

Add separate tests that advance `now` past 8 seconds and expect “网络较慢，仍在继续加载”, and that reject `importApp` and expect the loading loop to stop while the error layer remains visible.

- [ ] **Step 2: Run the loader tests and verify RED**

Run:

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/cooking-loader.test.mjs tests/cooking-solo-page.test.mjs tests/cooking-solo-app.test.mjs
```

Expected: FAIL because `cooking-loader.mjs` and the structured loading elements do not exist.

- [ ] **Step 3: Implement the minimal loader state machine**

Expose this stable entry point:

```js
export async function startSoloCookingLoader(documentTarget = globalThis.document, {
  windowTarget = globalThis,
  importApp = () => import("./cooking-solo-app.mjs"),
  requestFrame = windowTarget.requestAnimationFrame.bind(windowTarget),
  setIntervalFn = windowTarget.setInterval.bind(windowTarget),
  clearIntervalFn = windowTarget.clearInterval.bind(windowTarget),
  now = () => Date.now(),
} = {}) { /* phase updates, boot, first-frame completion, cleanup */ }
```

Start at 8%, advance no higher than 68% while importing, set 82% before boot, 94% after stage creation, and 100% on the next animation frame. Modify `bootSoloCookingPage` to accept `manageLoading = true`; the loader calls it with `manageLoading: false`, so only the loader hides the successful loading layer. Keep boot failure behavior visible.

Replace the page entry point with:

```html
<script type="module" src="./cooking-loader.mjs"></script>
```

- [ ] **Step 4: Run the loader tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests PASS with zero failures.

- [ ] **Step 5: Commit the loading lifecycle**

```powershell
git add app/static/cooking-loader.mjs app/static/cooking-solo-app.mjs app/static/cooking.html tests/cooking-loader.test.mjs tests/cooking-solo-app.test.mjs tests/cooking-solo-page.test.mjs
git commit -m "feat: show cooking load progress"
```

### Task 2: Natural camera orbit

**Files:**
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`

- [ ] **Step 1: Write a failing orbit-direction test**

Use a blank-space orbit with an unclamped starting pitch. After a 100px downward move, assert pitch increases by `0.42`; after a 100px rightward move, assert yaw still decreases by `0.42`:

```js
canvas.dispatch("pointerdown", pointer(9, 100, 100));
canvas.dispatch("pointermove", pointer(9, 100, 200));
assert.ok(changes.at(-1).pitch > initialPitch);
assert.ok(Math.abs((changes.at(-1).pitch - initialPitch) - 0.42) < 1e-9);
canvas.dispatch("pointermove", pointer(9, 200, 200));
assert.ok(changes.at(-1).yaw < previousYaw);
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-name-pattern "orbits blank" tests/cooking-interaction-controller.test.mjs
```

Expected: FAIL because downward movement currently subtracts pitch and the default sensitivity is `0.006`.

- [ ] **Step 3: Implement the minimal orbit correction**

Change the default to:

```js
orbitSensitivity = 0.0042
```

and update only vertical orbit math:

```js
pitch: current.pitch + dy * normalizedOrbitSensitivity
```

Keep horizontal yaw subtraction unchanged.

- [ ] **Step 4: Run all interaction-controller tests**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/cooking-interaction-controller.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the orbit correction**

```powershell
git add app/static/cooking-interaction-controller.mjs tests/cooking-interaction-controller.test.mjs
git commit -m "fix: make cooking orbit follow touch"
```

### Task 3: Deterministic drop intent and magnetic return

**Files:**
- Create: `tests/cooking-drop-intent.test.mjs`
- Create: `app/static/cooking-drop-intent.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing pure resolver tests**

Define the desired API through tests:

```js
const input = {
  prepBounds: { minX: -2.55, maxX: 2.55, minZ: -1.65, maxZ: 1.65 },
  homeBounds: { minX: 3.5, maxX: 4.7, minZ: -2.2, maxZ: -1.0 },
  assembledCount: 3,
  magnetPadding: 0.36,
};

assert.deepEqual(resolveSoloLayerDrop({ ...input, point: { x: -2, z: -1 } }), {
  kind: "prep", intent: "top", targetIndex: 3,
});
assert.deepEqual(resolveSoloLayerDrop({ ...input, point: { x: 2, z: -1 } }), {
  kind: "prep", intent: "top", targetIndex: 3,
});
assert.deepEqual(resolveSoloLayerDrop({ ...input, point: { x: 0, z: 1.2 } }), {
  kind: "prep", intent: "bottom", targetIndex: 0,
});
assert.equal(resolveSoloLayerDrop({ ...input, point: { x: 4.95, z: -1.4 } }).kind, "bin");
```

Also assert the center buffer defaults to `top`, points outside both regions are `invalid`, inputs are validated, and returned objects are frozen.

- [ ] **Step 2: Run resolver tests and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/cooking-drop-intent.test.mjs
```

Expected: FAIL because the resolver module does not exist.

- [ ] **Step 3: Implement the pure resolver**

Use prep depth rather than horizontal X:

```js
const bottomThreshold = prepBounds.minZ
  + (prepBounds.maxZ - prepBounds.minZ) * 0.62;
if (contains(prepBounds, point)) {
  const intent = point.z > bottomThreshold ? "bottom" : "top";
  return Object.freeze({
    kind: "prep",
    intent,
    targetIndex: intent === "bottom" ? 0 : assembledCount,
  });
}
if (contains(expand(homeBounds, magnetPadding), point)) {
  return Object.freeze({ kind: "bin", intent: "home", targetIndex: null });
}
return Object.freeze({ kind: "invalid", intent: "invalid", targetIndex: null });
```

- [ ] **Step 4: Write failing stage integration tests**

Capture `controllerFactory` options and call `resolveDrop` at left/right top-zone points, a bottom-zone point, and a padded home-bin point. Assert left/right yield the same top index, the near point yields index 0, and the padded home point returns the correct ingredient anchor. Call `onMove` and assert `onChange` emits a changed `dropIntent` only when the intent changes; assert `onDrop` and `onInvalid` clear it.

- [ ] **Step 5: Run stage tests and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/cooking-solo-stage.test.mjs tests/cooking-drop-intent.test.mjs
```

Expected: FAIL because the stage still computes `targetIndex` from X and emits no preview intent.

- [ ] **Step 6: Integrate the resolver in the stage**

Store `dropIntent = null`, include it in `emit`, and use the pure result to return the existing controller contract:

```js
const result = resolveSoloLayerDrop({
  point,
  prepBounds: layout.prep.bounds,
  homeBounds: layout.ingredients.find((entry) => entry.id === id).bounds,
  assembledCount: state.assembledOrder.length,
  magnetPadding: 0.36,
});
```

Map `prep` to `workbench.prep.dropAnchor`, `bin` to the matching station drop anchor, and `invalid` to a Chinese reason. During plain drag moves, resolve and emit only when `{kind,intent,id}` changes.

- [ ] **Step 7: Run resolver and stage tests and verify GREEN**

Run the Step 5 command. Expected: all focused tests PASS.

- [ ] **Step 8: Commit deterministic drop behavior**

```powershell
git add app/static/cooking-drop-intent.mjs app/static/cooking-solo-stage.mjs tests/cooking-drop-intent.test.mjs tests/cooking-solo-stage.test.mjs
git commit -m "fix: make burger stacking intentional"
```

### Task 4: Consistent food scale and larger workbench

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `tests/cooking-workbench-3d.test.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `app/static/cooking-workbench-3d.mjs`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Write failing scale and framing tests**

Assert every layer starts at `stage.layerPresentationScale`, stays at exactly that scale during `onPick`, after `onMove`, throughout a half-complete snap transition, and after the final snap. Assert `binLayerScale` and `prepLayerScale` are both aliases of the same value for compatibility.

For a 390×608 portrait camera, project the prep-board left/right edges and assert at least 210px width. Project every ingredient and tool station center plus its declared half extents and assert all interactive regions remain within NDC X `[-1, 1]` and Y `[-1, 1]`.

Assert CSS contains:

```css
height: clamp(38rem, 72dvh, 48rem);
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/cooking-solo-stage.test.mjs tests/cooking-workbench-3d.test.mjs tests/cooking-solo-page.test.mjs
```

Expected: FAIL because bin and prep scales differ, the board is below 210px, and the canvas is fixed at 34rem.

- [ ] **Step 3: Implement unified scale and compact station layout**

Replace the two scale constants with:

```js
const LAYER_PRESENTATION_SCALE = 0.72;
```

Use it for both bin and prep transforms, expose `layerPresentationScale`, `binLayerScale`, and `prepLayerScale`, and remove scale interpolation from snap transitions because every target has the same scale.

Compact the interactive layout without shrinking the central board:

```js
const INGREDIENT_HALF_EXTENT = Object.freeze({ x: 0.78, z: 0.78 });
// Top row remains 1.7 apart; side stations move from ±4.1 to ±3.55.
// Tool row stays centered and moves from z=4.05 to z=3.55.
```

Increase ingredient bin base/rims to visually contain a 0.72-scale layer. Pull the stage camera closer with an exact position multiplier of `0.52`. At 390×608 this produces a projected board width of about 212px while the proposed station extents remain within approximately ±0.94 NDC X.

Update portrait CSS:

```css
.cooking-stage { min-height: clamp(38rem, 72dvh, 48rem); }
#cooking-canvas { height: clamp(38rem, 72dvh, 48rem); }
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests PASS.

- [ ] **Step 5: Commit layout and scale**

```powershell
git add app/static/cooking-solo-stage.mjs app/static/cooking-workbench-3d.mjs app/static/cooking.css tests/cooking-solo-stage.test.mjs tests/cooking-workbench-3d.test.mjs tests/cooking-solo-page.test.mjs
git commit -m "fix: enlarge mobile cooking workbench"
```

### Task 5: Visible drop-intent feedback

**Files:**
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Write failing DOM rendering tests**

Add `#cooking-drop-intent` to the page harness. Render details with:

```js
dropIntent: { kind: "prep", intent: "top", id: "patty" }
dropIntent: { kind: "prep", intent: "bottom", id: "patty" }
dropIntent: { kind: "bin", intent: "home", id: "patty" }
dropIntent: null
```

Assert the visible text is respectively “放在最上层”, “塞到最下层”, “放回原料格”, and hidden. Assert the matching ingredient station is highlighted for `home` after tutorial highlighting runs.

- [ ] **Step 2: Run app/page tests and verify RED**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/cooking-solo-app.test.mjs tests/cooking-solo-page.test.mjs
```

Expected: FAIL because the drop-intent element and rendering logic do not exist.

- [ ] **Step 3: Implement intent badge and loading visuals**

Add this overlay inside `.cooking-stage`:

```html
<div class="cooking-drop-intent" id="cooking-drop-intent" role="status" hidden></div>
```

Render it from `detail.dropIntent`. Give top/bottom/home distinct colors, keep `pointer-events: none`, and position it above the tutorial card. Add the loader spinner, bar, percentage and elapsed-time styles from Task 1, including a reduced-motion fallback.

- [ ] **Step 4: Run app/page tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests PASS.

- [ ] **Step 5: Commit feedback UI**

```powershell
git add app/static/cooking-solo-app.mjs app/static/cooking.html app/static/cooking.css tests/cooking-solo-app.test.mjs tests/cooking-solo-page.test.mjs
git commit -m "feat: preview cooking drop intent"
```

### Task 6: Full regression, mobile QA, publish and public verification

**Files:**
- Copy into deployment repository: `index.html`, `cooking.html`, `cooking.css`, `cooking-loader.mjs`, `cooking-drop-intent.mjs`, and all existing `.mjs`/vendor dependencies used by the page.

- [ ] **Step 1: Run the full automated suite**

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.mjs
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest -q
git diff --check
```

Expected: every Node test passes, every Python test passes, and `git diff --check` exits 0.

- [ ] **Step 2: Run local 390×844 browser QA**

Start a local static server and use Playwright at 390×844. Verify:

1. Loading overlay visibly advances and reports elapsed time before hiding.
2. Prep board is at least 210 screen pixels wide.
3. Downward blank-space drag increases pitch; rightward drag keeps existing yaw direction.
4. A layer has identical bounding-box scale before, during and after a plate drop.
5. Padded home-zone drop returns the layer and displays “放回原料格”.
6. Two left/right top-zone drops both append; a bottom-zone drop inserts at index 0.
7. Sauce pouring, undo, reset and finish still work.
8. Browser console has zero errors and zero warnings.

- [ ] **Step 3: Commit any QA-only correction and verify again**

If Step 2 exposes a defect, add a failing automated regression test first, implement the minimal correction, repeat Steps 1 and 2, then commit only the tested correction.

- [ ] **Step 4: Publish to the existing GitHub Pages repository**

Copy the verified static package to the root of `https://github.com/KIDCadillac/threejs_burger.git`, preserving `real_3d_burger.html`, `.nojekyll`, and `.github/workflows/pages.yml`. Commit and push to `main`:

```powershell
git add --all
git commit -m "feat: refine mobile cooking controls"
git push origin main
```

- [ ] **Step 5: Verify the public URL**

Open `https://kidcadillac.github.io/threejs_burger/` at 390×844 after GitHub Actions completes. Repeat the loading, top/bottom stacking, bin return, scale, camera and console checks against the actual public assets.

- [ ] **Step 6: Record completion evidence**

Report the unchanged public URL, GitHub Pages workflow result, exact Node/Python pass counts, browser viewport, completed interaction checks, and whether a forced refresh is needed for cached phones.
