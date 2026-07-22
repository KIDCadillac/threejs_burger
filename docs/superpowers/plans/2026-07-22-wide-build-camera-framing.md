# Wide Build Camera Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the complete cooking workbench visible in build mode on phones while preserving the existing tight, freely orbitable burger-only focus mode.

**Architecture:** Split camera fitting into two explicit policies inside the solo stage. Focus mode continues to fit only authoritative burger-stack geometry, while build mode fits a stable workbench baseline plus the stack and is only allowed to preserve or increase that baseline distance. Resize, restore, reset, stack growth, and focus return all route through the correct policy.

**Tech Stack:** JavaScript ES modules, Three.js, Node `node:test`, Playwright CLI, FastAPI static serving, GitHub Pages.

---

## File Map

- Modify `tests/cooking-solo-stage.test.mjs`: add camera-projection helpers and regressions for seven-layer portrait build framing, focus round-trips, resize, and tall stacks.
- Modify `app/static/cooking-solo-stage.mjs`: define workbench baseline geometry, separate build/focus fitting, and route every camera adaptation through the active mode.
- Modify `docs/superpowers/plans/2026-07-22-wide-build-camera-framing.md`: check off the completed plan steps as evidence is produced.

### Task 1: Reproduce the Narrow Seven-Layer Phone Camera

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Test: `tests/cooking-solo-stage.test.mjs`

- [x] **Step 1: Add a workbench projection assertion**

Add a helper that projects the four authored workbench corners at counter height and a representative upper station height. It must fail if any point leaves a conservative NDC safe area:

```js
function assertWorkbenchFitsCamera(stage, label, { margin = 0.94 } = {}) {
  stage.host.scene.updateMatrixWorld(true);
  stage.host.camera.updateProjectionMatrix();
  stage.host.camera.updateMatrixWorld(true);
  const { bounds } = stage.workbench.getLayout();
  for (const y of [-0.48, 2.9]) {
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const ndc = new THREE.Vector3(x, y, z).project(stage.host.camera);
        assert.ok(Math.abs(ndc.x) <= margin, `${label} clips workbench x=${ndc.x}`);
        assert.ok(Math.abs(ndc.y) <= margin, `${label} clips workbench y=${ndc.y}`);
      }
    }
  }
}
```

- [x] **Step 2: Add the seven-layer restored-save regression**

Create a portrait `390 / 844` stage containing seven layers, then assert both the full workbench and burger fit immediately after construction:

```js
test("restored seven-layer portrait build view keeps the complete workbench visible", () => {
  let saved = createSoloCookingState({ loadout: createDefaultWorkbenchLoadout() });
  for (let index = 0; index < 7; index += 1) {
    saved = placeSoloLayer(saved, saved.stationSources["filling-back-1"], index, {
      replenish: true,
    });
  }
  const canvas = new FakeCanvas();
  const host = createHostHarness();
  host.camera.aspect = 390 / 844;
  const stage = createSoloCookingStage({
    THREE,
    canvas,
    storage: null,
    initialState: hydrateSoloCookingState(saved),
    reducedMotion: true,
    hostFactory: () => host,
  });
  assertWorkbenchFitsCamera(stage, "restored seven-layer portrait");
  assertStackFitsCamera(stage, "restored seven-layer portrait stack", { requireTight: false });
  stage.dispose();
});
```

- [x] **Step 3: Run the new test and verify the bug is reproduced**

Run:

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-name-pattern "restored seven-layer portrait" tests/cooking-solo-stage.test.mjs
```

Expected: FAIL because the current `initial-state-fit` tightly frames only the burger and clips at least one workbench corner.

- [x] **Step 4: Commit the failing regression**

```powershell
git add tests/cooking-solo-stage.test.mjs docs/superpowers/plans/2026-07-22-wide-build-camera-framing.md
git commit -m "test: reproduce narrow build camera framing"
```

### Task 2: Separate Build and Focus Camera Policies

**Files:**
- Modify: `app/static/cooking-solo-stage.mjs`
- Test: `tests/cooking-solo-stage.test.mjs`

- [x] **Step 1: Add stable workbench baseline geometry**

Replace the single stack-only framing source with two sources. Build geometry includes the full authored workspace at counter and station heights; focus geometry contains only authoritative stack bounds:

```js
const WORKBENCH_CAMERA_MIN_Y = -0.5;
const WORKBENCH_CAMERA_MAX_Y = 2.9;

const buildFramingGeometry = () => {
  const { bounds: workspaceBounds } = workbench.getLayout();
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

const focusFramingGeometry = () => {
  const bounds = authoritativeStackBounds();
  return bounds ? {
    bounds,
    points: boundsCorners(bounds).map((point) => ({
      point,
      margin: STACK_CAMERA_SAFE_NDC_MARGIN,
    })),
  } : null;
};
```

- [x] **Step 2: Route adaptation through the active framing mode**

Give `adaptCameraToStack` an explicit `mode` defaulting to current stage state. Build mode must fit the workbench plus stack; focus mode must tightly fit only the stack:

```js
const adaptCameraToStack = ({
  preserveDistance = true,
  reason = "stack-growth",
  mode = focused ? "focus" : "build",
} = {}) => {
  const view = controller?.getCameraView?.();
  if (!view) return false;
  const framing = mode === "focus" ? focusFramingGeometry() : buildFramingGeometry();
  if (!framing) return false;
  const fit = fittedStackCameraView(framing, view);
  const distance = preserveDistance ? Math.max(view.distance, fit.distance) : fit.distance;
  // Keep the existing far-plane extension and setCameraView behavior.
};
```

Entering focus must pass `mode: "focus"`; leaving focus must pass `mode: "build"`. Initial restore, resize, expansion, tuning, deletion, reset, undo, and reset-cooking calls use build policy whenever `focused` is false.

- [x] **Step 3: Remove the close-range workbench scale**

Delete `SWITCHABLE_WORKBENCH_CAMERA_SCALE` and initialize the camera from the authored workbench view without multiplying its position. The subsequent build fit may move farther for narrow aspect ratios or tall stacks, but never nearer than the full workbench fit:

```js
host.camera.position.set(
  cameraView.position.x,
  cameraView.position.y,
  cameraView.position.z,
);
```

- [x] **Step 4: Run the focused stage tests**

Run:

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/cooking-solo-stage.test.mjs
```

Expected: PASS, including the new seven-layer portrait regression and existing focus/delete/60-layer tests.

- [x] **Step 5: Commit the implementation**

```powershell
git add app/static/cooking-solo-stage.mjs tests/cooking-solo-stage.test.mjs docs/superpowers/plans/2026-07-22-wide-build-camera-framing.md
git commit -m "fix: keep complete workbench visible while building"
```

### Task 3: Prove Round-Trip and Resize Behavior

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Test: `tests/cooking-solo-stage.test.mjs`

- [ ] **Step 1: Add build/focus round-trip coverage**

Extend the focus test so that focus remains tighter than build, and returning from focus once again satisfies the complete-workbench projection assertion:

```js
const buildDistance = before.distance;
assert.equal(stage.setBurgerFocus(true), true);
assert.ok(stage.controller.getCameraView().distance < buildDistance);
assert.equal(stage.setBurgerFocus(false), false);
assertWorkbenchFitsCamera(stage, "focus return build view");
```

- [ ] **Step 2: Add portrait resize coverage**

Start in landscape, resize the camera to `390 / 844`, call `stage.resize()`, and assert that the complete workbench remains within the safe area and the build distance does not collapse to a burger-only close-up:

```js
const landscapeDistance = stage.controller.getCameraView().distance;
stage.host.camera.aspect = 390 / 844;
stage.host.camera.updateProjectionMatrix();
assert.equal(stage.resize(), true);
assert.ok(stage.controller.getCameraView().distance >= landscapeDistance);
assertWorkbenchFitsCamera(stage, "portrait resize build view");
```

- [ ] **Step 3: Run complete automated tests**

Run:

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
& '.\.venv\Scripts\python.exe' -m pytest -q
```

Expected: all Node and Python tests pass with no regressions.

- [ ] **Step 4: Commit the regression coverage**

```powershell
git add tests/cooking-solo-stage.test.mjs docs/superpowers/plans/2026-07-22-wide-build-camera-framing.md
git commit -m "test: cover build camera mode round trips"
```

### Task 4: Mobile Browser Validation and Publication

**Files:**
- Modify: public deployment worktree files mirrored from `app/static/`
- Verify: `https://kidcadillac.github.io/threejs_burger/cooking.html`

- [ ] **Step 1: Start the local application**

Run:

```powershell
& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --host 127.0.0.1 --port 8019
```

Expected: Uvicorn reports `http://127.0.0.1:8019` and serves `.mjs` modules as JavaScript.

- [ ] **Step 2: Validate the 390×844 build and focus flows**

Use Playwright with a `390×844` viewport. Verify:

1. Empty and seven-layer build views show plate, back stations, left bread station, and right sauce station.
2. Adding layers does not move the camera closer.
3. Focus hides the workbench and allows orbit/zoom.
4. Returning from focus restores the wide build view.
5. The browser console contains no uncaught errors.

Capture local screenshots for build mode and focus mode under `output/`; do not stage that directory.

- [ ] **Step 3: Publish the static files to the existing Pages repository**

Update the isolated public deployment worktree from `burger-public/main`, mirror `app/static/` into the public repository root, stage only intended static changes, commit, and push:

```powershell
git -C 'C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy' add cooking-solo-stage.mjs
git -C 'C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy' commit -m "fix: publish wide build camera framing"
git -C 'C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy' push burger-public HEAD:main
```

- [ ] **Step 4: Verify GitHub Pages and the public phone flow**

Wait for the Pages workflow to report success, then load:

```text
https://kidcadillac.github.io/threejs_burger/cooking.html
```

Repeat the `390×844` build/focus checks against the public URL and confirm the deployed module contains the new build-framing policy.

- [ ] **Step 5: Record final evidence**

Run `git status --short`, record the source and public commit hashes, and leave only the pre-existing untracked `output/`, `server-selfplay-error.log`, and `server-selfplay.log` artifacts in the source worktree.
