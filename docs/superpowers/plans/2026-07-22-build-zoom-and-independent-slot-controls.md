# Build Zoom and Independent Slot Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the whole cooking workbench visible by default, allow zoom-only pinch gestures while building, and show one independently switchable control for each of the ten physical ingredient slots on supported phones and desktops.

**Architecture:** The interaction controller gains a pinch-zoom flag that is separate from one-pointer orbit, so build mode can be `orbit=false, pinch=true` while focus mode remains fully orbitable. The stage owns the safe build-camera floor and only moves the camera outward when the workbench or a taller stack no longer fits. The slot layout keeps the existing three screen rails, but for viewports at least 360 CSS pixels wide it always lays out all ten stable `slotId` controls and treats missing/offscreen projections as line-display metadata rather than a reason to merge controls.

**Tech Stack:** JavaScript ES modules, Three.js, Node.js built-in test runner, Playwright browser validation, GitHub Pages.

---

### Task 1: Complete the wide build-camera baseline

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `docs/superpowers/plans/2026-07-22-wide-build-camera-framing.md`

- [x] **Step 1: Run the committed portrait regression and record the expected failure**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "restored seven-layer portrait build view keeps the complete workbench visible" tests/cooking-solo-stage.test.mjs
```

Expected before the stage fix: FAIL because at least one workbench corner projects outside the portrait safe range.

- [x] **Step 2: Finish the separate build and focus framing sources**

Keep the build source independent from the burger-only focus source:

```js
const focusFramingGeometry = () => {
  const bounds = authoritativeStackBounds();
  if (!bounds) return null;
  return {
    bounds,
    points: boundsCorners(bounds).map((point) => ({
      point,
      margin: STACK_CAMERA_SAFE_NDC_MARGIN,
    })),
  };
};

const buildFramingGeometry = () => {
  const workspaceBounds = workbench.getLayout().bounds;
  const bounds = new THREE.Box3(
    new THREE.Vector3(workspaceBounds.minX, WORKBENCH_CAMERA_MIN_Y, workspaceBounds.minZ),
    new THREE.Vector3(workspaceBounds.maxX, WORKBENCH_CAMERA_MAX_Y, workspaceBounds.maxZ),
  );
  const points = boundsCorners(bounds).map((point) => ({
    point,
    margin: STACK_CAMERA_SAFE_NDC_MARGIN,
  }));
  const stackBounds = authoritativeStackBounds();
  if (stackBounds) {
    bounds.union(stackBounds);
    points.push(...boundsCorners(stackBounds).map((point) => ({
      point,
      margin: STACK_CAMERA_SAFE_NDC_MARGIN,
    })));
  }
  return { bounds, points };
};
```

`adaptCameraToStack()` must select `focusFramingGeometry()` only while focused. In build mode the fitted distance is a floor:

```js
const distance = mode === "build" || preserveDistance
  ? Math.max(view.distance, fit.distance)
  : fit.distance;
```

Remove the old `SWITCHABLE_WORKBENCH_CAMERA_SCALE` multiplier and start from the authored workbench camera.

- [x] **Step 3: Run the portrait regression and the complete stage suite**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-solo-stage.test.mjs
```

Expected: all stage tests PASS, including the portrait workbench fit, useful prep-board size, focus fit, and 60-layer expansion.

- [x] **Step 4: Commit the baseline**

```powershell
git add -- tests/cooking-solo-stage.test.mjs app/static/cooking-solo-stage.mjs docs/superpowers/plans/2026-07-22-wide-build-camera-framing.md
git commit -m "fix: keep the build workbench in view"
```

### Task 2: Add zoom-only camera gestures

**Files:**
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`

- [x] **Step 1: Write the failing zoom-only gesture test**

Add a test that locks one-pointer orbit but explicitly enables pinch zoom:

```js
test("zoom-only mode pinches without changing build yaw or pitch", () => {
  const canvas = createCanvas();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controller = createCookingInteractionController({
    THREE,
    canvas,
    camera,
    raycast: () => null,
    orbitLimits: {
      minYaw: -1, maxYaw: 1,
      minPitch: 0.2, maxPitch: 1.2,
      minDistance: 5, maxDistance: 30,
    },
  });
  controller.setOrbitEnabled(false);
  controller.setPinchZoomEnabled(true);
  const before = controller.getCameraView();

  canvas.dispatch("pointerdown", pointer(71, 120, 220));
  canvas.dispatch("pointermove", pointer(71, 180, 260));
  assert.deepEqual(controller.getCameraView(), before);

  canvas.dispatch("pointerdown", pointer(72, 240, 220));
  canvas.dispatch("pointermove", pointer(71, 80, 220));
  canvas.dispatch("pointermove", pointer(72, 280, 220));
  const zoomed = controller.getCameraView();

  assert.equal(zoomed.yaw, before.yaw);
  assert.equal(zoomed.pitch, before.pitch);
  assert.ok(zoomed.distance < before.distance);
  controller.dispose();
});
```

Also assert that `setOrbitEnabled(false)` alone retains its old fully locked behavior until `setPinchZoomEnabled(true)` is called.

- [x] **Step 2: Run the controller test and verify the missing API failure**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "zoom-only mode" tests/cooking-interaction-controller.test.mjs
```

Expected: FAIL because `setPinchZoomEnabled` does not exist.

- [x] **Step 3: Implement the independent pinch flag**

Add controller state and preserve the legacy lock semantics:

```js
let orbitEnabled = true;
let pinchZoomEnabled = true;
```

When `setOrbitEnabled(value)` is called, also set `pinchZoomEnabled = value` so the legacy API still means fully enabled or fully locked. Build mode immediately uses the explicit override after locking orbit. Add that override:

```js
setPinchZoomEnabled(value) {
  if (disposed) return pinchZoomEnabled;
  const next = Boolean(value);
  if (pinchZoomEnabled === next) return pinchZoomEnabled;
  cancelGesture("pinch-zoom-enabled-changed");
  pinchZoomEnabled = next;
  return pinchZoomEnabled;
},
isPinchZoomEnabled() {
  return pinchZoomEnabled;
},
```

Start and apply a two-pointer pinch when camera zoom or selected-layer twist is available:

```js
if (activePointers.size === 2) {
  if (pinchZoomEnabled || dragSession) beginPinch();
  else state = "camera-locked";
  return;
}

if (pinchZoomEnabled) {
  applyCameraState({
    yaw: pinchSession.camera.yaw,
    pitch: pinchSession.camera.pitch,
    distance: pinchSession.camera.distance * (pinchSession.pointerDistance / distance),
  }, "pinch");
}
```

One-pointer orbit remains guarded only by `orbitEnabled`.

- [x] **Step 4: Run all controller tests**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-interaction-controller.test.mjs
```

Expected: PASS, including existing orbit, locked-camera, selected-layer twist, and new zoom-only tests.

- [x] **Step 5: Commit the controller behavior**

```powershell
git add -- tests/cooking-interaction-controller.test.mjs app/static/cooking-interaction-controller.mjs
git commit -m "feat: support zoom-only build gestures"
```

### Task 3: Wire build, focus, reset, and tall-stack camera policies

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing stage gesture-policy tests**

Extend the existing build/focus test to assert the controller modes:

```js
assert.equal(stage.controller.isOrbitEnabled(), false);
assert.equal(stage.controller.isPinchZoomEnabled(), true);

stage.toggleBurgerFocus();
assert.equal(stage.controller.isOrbitEnabled(), true);
assert.equal(stage.controller.isPinchZoomEnabled(), true);

stage.toggleBurgerFocus();
assert.equal(stage.controller.isOrbitEnabled(), false);
assert.equal(stage.controller.isPinchZoomEnabled(), true);
```

Add a separate test that records a player-selected build distance, adds a layer that still fits, and asserts that the distance is preserved; then build beyond the safe height and assert that only distance increases while yaw and pitch remain unchanged.

- [ ] **Step 2: Run the stage tests and verify failure**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "build mode|player-selected build distance" tests/cooking-solo-stage.test.mjs
```

Expected: FAIL because the stage currently disables pinch zoom with orbit.

- [ ] **Step 3: Enable zoom-only build mode and preserve player distance**

Immediately after creating the controller and whenever returning from focus:

```js
controller.setOrbitEnabled?.(false);
controller.setPinchZoomEnabled?.(true);
```

Entering focus uses:

```js
controller.setOrbitEnabled?.(true);
controller.setPinchZoomEnabled?.(true);
```

Build-mode automatic adaptation keeps `Math.max(currentDistance, requiredFitDistance)`. `resetCamera()` is the only build action that deliberately returns to the current full-workbench baseline by calling `adaptCameraToStack({ preserveDistance: false, mode: "build", reason: "camera-reset-fit" })` after the controller reset.

- [ ] **Step 4: Run stage and controller suites**

```powershell
$tests = @('tests/cooking-interaction-controller.test.mjs','tests/cooking-solo-stage.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

Expected: PASS.

- [ ] **Step 5: Commit stage wiring**

```powershell
git add -- tests/cooking-solo-stage.test.mjs app/static/cooking-solo-stage.mjs
git commit -m "feat: enable pinch zoom while building"
```

### Task 4: Keep ten independent slot controls on supported viewports

**Files:**
- Modify: `tests/workbench-slot-control-layout.test.mjs`
- Modify: `app/static/workbench-slot-control-layout.mjs`

- [ ] **Step 1: Replace old region-fallback expectations with failing per-slot expectations**

For a 390×844 viewport, an offscreen anchor must still produce its independent slot control:

```js
test("keeps ten independent controls when projected anchors are hidden or distant", () => {
  const anchors = BASE_ANCHORS.map((anchor, index) => Object.freeze({
    ...anchor,
    x: index % 2 === 0 ? -400 : 900,
    y: index % 3 === 0 ? -300 : 1200,
    visible: false,
  }));
  const result = layoutWorkbenchSlotControls({ viewport: VIEWPORT, anchors });

  assert.equal(result.individual.length, 10);
  assert.equal(result.regionFallbacks.length, 0);
  assert.deepEqual(
    result.individual.map(({ slotId }) => slotId),
    WORKBENCH_SLOTS.map(({ slotId }) => slotId),
  );
  assertNoOverlap(result);
  assertWithinViewport(result, VIEWPORT);
});
```

Update the 8-yaw × 3-pitch test to assert `individual.length === 10` and `regionFallbacks.length === 0` for every sample. Keep the width-359 compact test expecting three region entry points.

- [ ] **Step 2: Run the layout test and verify the old fallback failure**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/workbench-slot-control-layout.test.mjs
```

Expected: FAIL because hidden and distant anchors currently become region fallbacks.

- [ ] **Step 3: Lay out every stable slot on its region rail**

For widths at least `SLOT_CONTROL_COMPACT_WIDTH`, build each region from all declared slots. Use the real anchor when finite and a deterministic rail seed when absent:

```js
const regionItems = regionSlots.map((slot, order) => ({
  slot,
  order,
  anchor: anchorBySlot.get(slot.slotId) ?? fallbackAnchor(region, order, { width, height }, safeInset),
}));
const placed = tryRegionLayout(region, regionItems, { width, height }, safeInset);
```

Remove the `SLOT_CONTROL_MAX_ANCHOR_DISTANCE` rejection from `tryRegionLayout`. Each individual result retains `anchorX`, `anchorY`, and adds `anchorVisible` so the renderer can omit a misleading long line without hiding the button:

```js
individualBySlot.set(slot.slotId, {
  slotId: slot.slotId,
  region,
  x,
  y,
  anchorX: anchor.x,
  anchorY: anchor.y,
  anchorVisible: anchor.visible === true,
});
```

Only the existing width-below-360 branch returns `regionFallbacks`.

- [ ] **Step 4: Run layout and DOM control suites**

```powershell
$tests = @('tests/workbench-slot-control-layout.test.mjs','tests/workbench-slot-controls.test.mjs','tests/cooking-solo-app.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

Expected: PASS; the 390×844 layout always exposes 10 independent buttons, while 359px compact mode still exposes three region menus containing all ten `slotId` values.

- [ ] **Step 5: Commit independent layout behavior**

```powershell
git add -- tests/workbench-slot-control-layout.test.mjs app/static/workbench-slot-control-layout.mjs
git commit -m "fix: keep ingredient selectors independent"
```

### Task 5: Full regression, browser validation, and publication

**Files:**
- Modify: `docs/handoff/witch-fries-prototype.md`

- [ ] **Step 1: Run all Node tests**

```powershell
$testFiles = Get-ChildItem -LiteralPath tests -Filter *.test.mjs | ForEach-Object { $_.FullName }
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $testFiles
```

Expected: all tests PASS with no unhandled rejection or warning.

- [ ] **Step 2: Run Python tests and repository checks**

```powershell
& .\.venv\Scripts\python.exe -m pytest -q
git diff --check
git status --short
```

Expected: Python tests PASS, `git diff --check` prints nothing, and only intentionally untracked `output/` plus server log files remain outside commits.

- [ ] **Step 3: Validate the real browser at desktop and phone sizes**

At 1440×900 and 390×844, verify:

1. Initial build view contains the plate, back fillings, left bread rail, and right sauce rail.
2. Build single-finger drag does not rotate; pinch changes distance in the natural direction.
3. Focus mode freely rotates and zooms; returning restores the build angle and previous build distance.
4. Exactly 10 independent slot controls are visible on 390px width; tapping one changes only that physical slot and long-press opens only that slot's candidate list.
5. At 359px width, three compact region entries remain usable and expose ten separate slot rows.
6. Browser console contains no exception and no failed static asset request.

- [ ] **Step 4: Record the accepted controls in the handoff**

Add these exact user-facing rules to `docs/handoff/witch-fries-prototype.md`:

```text
搭建：固定角度，单指不转镜头，双指缩放；镜头复位显示完整料理台。
聚焦：可自由旋转、缩放并按层删除。
材料：左侧 3 个面包格、后侧 4 个夹料格、右侧 3 个酱料格均独立切换；轻触循环，长按直选。
```

- [ ] **Step 5: Publish tracked files to the existing GitHub Pages repository**

Copy only tracked project files to `C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy`, commit on `main`, and push `burger-public main`. Do not copy `output/`, `server-selfplay-error.log`, or `server-selfplay.log`.

- [ ] **Step 6: Verify the unchanged public URL**

Open:

```text
https://kidcadillac.github.io/threejs_burger/cooking.html
```

Expected: the deployed page shows the new wide default framing, build pinch zoom, and ten independent slot controls after a hard refresh.

- [ ] **Step 7: Commit handoff documentation**

```powershell
git add -- docs/handoff/witch-fries-prototype.md
git commit -m "docs: document build zoom and slot controls"
```

## Final Consistency Review

- [ ] Confirm every new behavior was first observed as a failing test.
- [ ] Confirm build mode locks yaw and pitch while pinch changes only distance.
- [ ] Confirm automatic fitting never moves closer, but deliberate player pinch may move closer within controller limits.
- [ ] Confirm 390×844 always renders 10 independent controls and 0 region total buttons.
- [ ] Confirm width below 360 remains the only normal compact fallback.
- [ ] Confirm future raw ingredient production remains documented as a lifecycle extension and is not partially implemented in this release.
