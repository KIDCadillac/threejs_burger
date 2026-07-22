# Child-Friendly Cooking and Focus Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing burger workbench understandable by an eight-year-old: every physical slot is independently selectable without covering food, placement feels tactile and predictable, sauce can only land on assembled layers, and focus mode can select, move, reorder, rotate, and delete individual layers without creating floating food.

**Architecture:** Keep the current authoritative immutable cooking state and Three.js stage. Add a persisted X/Z offset record beside rotations, let the stage remain the sole owner of Y and stack contact, and extend the existing interaction controller with a separate focus-layer drag gesture. Reuse the burger model's translucent selection shell and drop-preview clone. Slot controls become narrow edge handles with a slot-anchored capsule picker; they only emit content choices and never mutate Three.js directly. Sauce hit surfaces are rebuilt from `assembledOrder` after every visual state application.

**Tech Stack:** JavaScript ES modules, Three.js, HTML/CSS, Node.js built-in test runner, Python/pytest, existing GitHub Pages deployment.

---

### Task 1: Persist horizontal layer poses and expose safe focus-edit state operations

**Files:**
- Modify: `tests/cooking-solo-state.test.mjs`
- Modify: `tests/cooking-solo-save.test.mjs`
- Modify: `app/static/cooking-solo-state.mjs`
- Modify: `app/static/cooking-solo-save.mjs`

- [ ] **Step 1: Write failing state tests for bounded X/Z offsets and adjacent reordering**

Add tests that build four layers, move the second layer, move it one position up/down, and verify Y is not accepted as player state:

```js
state = moveSoloLayer(state, layerId, { x: 0.42, z: -0.18 });
assert.deepEqual(state.offsets[layerId], { x: 0.42, z: -0.18 });
assert.equal(Object.hasOwn(state.offsets[layerId], "y"), false);

state = reorderSoloLayer(state, layerId, 1);
assert.equal(state.assembledOrder.indexOf(layerId), originalIndex + 1);
state = reorderSoloLayer(state, layerId, -1);
assert.equal(state.assembledOrder.indexOf(layerId), originalIndex);
```

Also assert boundary moves are no-ops and offsets are pruned when an instance is consolidated away.

- [ ] **Step 2: Run the focused state tests and observe missing exports**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "horizontal offset|adjacent focus reorder" tests/cooking-solo-state.test.mjs
```

Expected: FAIL because `moveSoloLayer` and `reorderSoloLayer` do not exist.

- [ ] **Step 3: Add immutable offsets and edit operations**

Add a normalized record to every state snapshot:

```js
function freezeOffsets(offsets, instances) {
  return Object.freeze(Object.fromEntries(Object.keys(instances).map((id) => {
    const value = offsets?.[id] ?? { x: 0, z: 0 };
    return [id, Object.freeze({ x: finite(value.x), z: finite(value.z) })];
  })));
}

export function moveSoloLayer(state, layerId, offset, { maxRadius = 1.45 } = {}) {
  if (!state.assembledOrder.includes(layerId)) return state;
  const length = Math.hypot(offset.x, offset.z);
  const scale = length > maxRadius ? maxRadius / length : 1;
  return buildState(state, {
    offsets: { ...state.offsets, [layerId]: { x: offset.x * scale, z: offset.z * scale } },
  });
}

export function reorderSoloLayer(state, layerId, direction) {
  const from = state.assembledOrder.indexOf(layerId);
  const to = Math.max(0, Math.min(state.assembledOrder.length - 1, from + Math.sign(direction)));
  return from < 0 || from === to ? state : placeSoloLayer(state, layerId, to);
}
```

Preserve offsets through undo snapshots, replenishment, station changes, deletion, and finish operations. New instances start at `{x: 0, z: 0}`.

- [ ] **Step 4: Add save round-trip and legacy migration tests**

Update `PERSISTED_FIELDS` with `offsets`, rename the current wire format to version 2, and add assertions that:

1. X/Z offsets round-trip exactly.
2. A handwritten version-1 save loads with zero offsets.
3. NaN, infinity, unknown instance keys, and offsets outside the accepted radius are rejected.
4. Layer renaming in corruption tests also renames its offset entry.

- [ ] **Step 5: Implement version-2 save encoding with version-1 migration**

Encode `{ offsets: { [instanceId]: { x, z } } }`. `decodeSoloSave` accepts versions 1 and 2, supplies zero offsets for version 1, validates exact instance keys for version 2, and returns the current decoded version. `hydrateSoloCookingState` includes the frozen offsets record.

- [ ] **Step 6: Run state and save suites**

```powershell
$tests = @('tests/cooking-solo-state.test.mjs','tests/cooking-solo-save.test.mjs','tests/cooking-solo-autosave.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

Expected: PASS, including legacy save restoration.

- [ ] **Step 7: Commit state persistence**

```powershell
git add -- tests/cooking-solo-state.test.mjs tests/cooking-solo-save.test.mjs app/static/cooking-solo-state.mjs app/static/cooking-solo-save.mjs
git commit -m "feat: persist editable burger layer poses"
```

### Task 2: Replace food-covering selectors with ten independent edge handles and anchored capsules

**Files:**
- Modify: `tests/workbench-slot-control-layout.test.mjs`
- Modify: `tests/workbench-slot-controls.test.mjs`
- Modify: `app/static/workbench-slot-control-layout.mjs`
- Modify: `app/static/workbench-slot-controls.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Write failing layout tests for ten narrow edge handles**

At 390x844 and 1440x900 assert exactly ten independent controls, no region fallback, no overlap with the projected ingredient bounds, and the existing physical rails: bread left, fillings top, sauces right. Each handle keeps at least a 44 CSS-pixel hit area while its visible tab is no wider than 34 pixels.

- [ ] **Step 2: Write failing DOM tests for a slot-local capsule**

Long-press `filling-back-2` and assert:

```js
assert.equal(capsule.dataset.slotId, "filling-back-2");
assert.deepEqual(capsuleButtons.map((button) => button.dataset.contentId), fillingOptions);
assert.equal(capsuleButtons.filter((button) => button.ariaPressed === "true").length, 1);
```

Choosing one option closes the capsule and calls `onChoose({slotId, contentId})` once. Arrow keys move inside the same capsule; Escape closes it and restores focus to its handle.

- [ ] **Step 3: Run the two control suites and observe failures**

```powershell
$tests = @('tests/workbench-slot-control-layout.test.mjs','tests/workbench-slot-controls.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

Expected: FAIL because controls are circular overlays and long press opens the old workbench picker.

- [ ] **Step 4: Implement slot rails and capsule selection**

Keep stable slot order and place each handle outside the projected food bounds. Add one DOM container:

```html
<div class="workbench-slot-controls__capsule" data-slot-capsule hidden></div>
```

Extend `createWorkbenchSlotControls` with `getOptions(slotId)` and `onChoose`. A light tap still calls `onCycle`; a completed long press opens the capsule and suppresses the following click. Render real text labels from the existing workbench option metadata, not emoji-only buttons.

- [ ] **Step 5: Style readable handles without covering ingredients**

Use narrow rounded tabs connected to their rail, a high-contrast current-material swatch, and a horizontal capsule that opens away from the center plate. Respect `prefers-reduced-motion`, safe-area insets, and 44px hit targets. Do not introduce a new global picker or merge the ten slots into three controls.

- [ ] **Step 6: Run control and app DOM suites**

```powershell
$tests = @('tests/workbench-slot-control-layout.test.mjs','tests/workbench-slot-controls.test.mjs','tests/cooking-solo-app.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

Expected: PASS.

- [ ] **Step 7: Commit the slot selector**

```powershell
git add -- tests/workbench-slot-control-layout.test.mjs tests/workbench-slot-controls.test.mjs app/static/workbench-slot-control-layout.mjs app/static/workbench-slot-controls.mjs app/static/cooking.html app/static/cooking.css
git commit -m "feat: add child-friendly slot capsules"
```

### Task 3: Restrict sauce to currently assembled burger surfaces

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write a failing assembled-surface regression**

Build one layer and assert the controller edible set contains only that layer's visible surfaces. Aim a sauce gesture at a bin source and assert no preview, no stroke, and no inventory consumption. Add a second assembled layer, refresh visual state, and assert both assembled layers become eligible.

- [ ] **Step 2: Run the focused regression**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "assembled sauce surfaces" tests/cooking-solo-stage.test.mjs
```

Expected: FAIL because the controller starts with all ingredient surfaces, including prep bins.

- [ ] **Step 3: Synchronize edible surfaces from `assembledOrder`**

Add a stage helper and call it after every `applyVisualState`, reorder, delete, placement, undo, and hydration:

```js
function syncAssembledEdibleSurfaces() {
  controller.setEdibleSurfaces(state.assembledOrder.flatMap((layerId) => (
    burger.getLayerSelectableSurfaces(layerId)
  )));
}
```

Keep the controller's existing local-coordinate stroke storage and invalid-hit segment splitting.

- [ ] **Step 4: Run controller and stage sauce tests**

```powershell
$tests = @('tests/cooking-interaction-controller.test.mjs','tests/cooking-solo-stage.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

Expected: PASS; prep ingredients never receive sauce.

- [ ] **Step 5: Commit sauce filtering**

```powershell
git add -- tests/cooking-solo-stage.test.mjs tests/cooking-interaction-controller.test.mjs app/static/cooking-solo-stage.mjs
git commit -m "fix: keep sauce on assembled food"
```

### Task 4: Separate focus-layer dragging from background camera orbit

**Files:**
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`

- [ ] **Step 1: Write failing gesture-state tests**

Cover four focus-mode paths:

1. Tap a layer calls `onInspectionSelection` and does not orbit.
2. Drag starting on a layer calls `onInspectionMove` and `onInspectionDrop`, not camera orbit.
3. Drag starting on empty background orbits and does not move a layer.
4. Pointer cancel, lost capture, second-pointer pinch, and document hide call `onInspectionCancel` once and do not commit.

- [ ] **Step 2: Run the focus gesture tests**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "focus layer drag|focus background orbit" tests/cooking-interaction-controller.test.mjs
```

Expected: FAIL because inspection hits currently enter camera orbit immediately.

- [ ] **Step 3: Add an inspection pending/drag state**

Add callbacks `onInspectionMove`, `onInspectionDrop`, and `onInspectionCancel`. On pointerdown over a valid assembled layer, store a pending layer session. Before the movement slop it remains a tap; beyond slop it becomes a layer drag. Empty-background pointerdown uses the current orbit path. A two-pointer gesture cancels the layer draft before pinch zoom begins.

Emit normalized screen coordinates and the raycast hit, leaving world-plane mapping and clamping to the stage:

```js
onInspectionMove?.({ layerId, pointer, startPointer, hit });
onInspectionDrop?.({ layerId, pointer, startPointer, hit });
```

- [ ] **Step 4: Run the full controller suite**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-interaction-controller.test.mjs
```

Expected: PASS with legacy build drag, sauce, orbit, pinch, and visibility-cancel behavior unchanged.

- [ ] **Step 5: Commit focus gestures**

```powershell
git add -- tests/cooking-interaction-controller.test.mjs app/static/cooking-interaction-controller.mjs
git commit -m "feat: separate focus editing gestures"
```

### Task 5: Wire focus-layer movement, reordering, rotation, deletion, and selection feedback

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `app/static/burger-model-3d.mjs`

- [ ] **Step 1: Write failing stage tests for draft movement and authoritative Y**

Enter focus, select a middle layer, drag it horizontally, and assert:

```js
assert.deepEqual(stage.getState().offsets[layerId], { x: committedX, z: committedZ });
assert.equal(stage.getLayerPose(layerId).position.y, expectedStackY);
assert.equal(stage.getFocusDraft(), null);
```

During drag assert a translucent preview exists at the clamped plate position; on cancel it disappears and persisted state is unchanged. Add up/down, rotate, delete-last-layer, and 60-layer camera adaptation tests.

- [ ] **Step 2: Run focused stage tests and observe failures**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "focus draft|focus toolbar|authoritative focus Y" tests/cooking-solo-stage.test.mjs
```

Expected: FAIL because focus currently supports selection and delete only.

- [ ] **Step 3: Apply persisted offsets only to assembled target transforms**

In `targetTransforms`, add each assembled layer's X/Z offset to the stack anchor while keeping `position.y` entirely from the contact solver. Bin sources continue using authored station positions. Apply offsets before sauce meshes are updated so saved sauce follows its layer.

- [ ] **Step 4: Reuse the existing translucent shell and preview clone**

Keep `burger.setLayerHighlighted(layerId, true)` as the fitted translucent enclosure. During a focus draft call `burger.setLayerDropPreview` with the target X/Z and authoritative Y; on commit/cancel call `burger.clearLayerDropPreview`. If model tests reveal the shell is too opaque, reduce only the feedback material opacity without changing ingredient materials.

- [ ] **Step 5: Expose stage focus-edit APIs**

Add:

```js
moveFocusedLayerDraft(pointerInfo)
commitFocusedLayerDraft(pointerInfo)
cancelFocusedLayerDraft(reason)
reorderFocusedLayer(direction)
rotateFocusedLayer(deltaYaw = Math.PI / 12)
deleteFocusedLayer()
getFocusedLayerCapabilities()
```

Every successful edit reapplies visual state, reselects the same layer when it still exists, runs local drop/compression motion at its final layer position, adapts the focus camera, and emits a state-change reason. Deleting the final assembled layer exits focus mode.

- [ ] **Step 6: Run stage and burger model suites**

```powershell
$tests = @('tests/cooking-solo-stage.test.mjs','tests/burger-model-3d.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

Expected: PASS, including contact tolerances and 60-layer framing.

- [ ] **Step 7: Commit focus-stage editing**

```powershell
git add -- tests/cooking-solo-stage.test.mjs tests/burger-model-3d.test.mjs app/static/cooking-solo-stage.mjs app/static/burger-model-3d.mjs
git commit -m "feat: edit burger layers in focus mode"
```

### Task 6: Add the bottom focus capsule and child-readable guidance

**Files:**
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/test_app.py`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`
- Modify: `app/static/cooking-solo-app.mjs`

- [ ] **Step 1: Write failing DOM/render tests**

Assert focus mode with no selected layer hides the toolbar and shows the short hint `点一下汉堡的一层`. Selecting a middle layer reveals four named controls: `上移`, `下移`, `旋转`, `删除`. At stack boundaries the corresponding move button is disabled. Build mode hides the entire focus toolbar.

- [ ] **Step 2: Run app tests and observe the missing toolbar**

```powershell
$tests = @('tests/cooking-solo-app.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
& .\.venv\Scripts\python.exe -m pytest -q tests/test_app.py
```

Expected: FAIL because only the standalone delete button exists.

- [ ] **Step 3: Replace standalone delete with an anchored capsule toolbar**

Add semantic buttons with `data-focus-layer-action` values `up`, `down`, `rotate`, and `delete`. Keep the capsule below the canvas safe area, never over the burger. `render()` reads `stage.getFocusedLayerCapabilities()` and sets `hidden`, `disabled`, labels, and `aria-live` status. Button handlers call the stage methods and preserve selection.

- [ ] **Step 4: Add short visual instructions and reduced-motion behavior**

Use action-first labels and one-line hints; no paragraph is required to understand the flow. Keep selected-layer enclosure visible while the capsule is open. On supported devices, successful placement/edit may call a short `navigator.vibrate(10)` behind capability and reduced-motion checks; failure never blocks gameplay if vibration is unavailable.

- [ ] **Step 5: Run app, HTML, and stage integration tests**

```powershell
$tests = @('tests/cooking-solo-app.test.mjs','tests/cooking-solo-stage.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
& .\.venv\Scripts\python.exe -m pytest -q tests/test_app.py
```

Expected: PASS.

- [ ] **Step 6: Commit focus UI**

```powershell
git add -- tests/cooking-solo-app.test.mjs tests/test_app.py app/static/cooking.html app/static/cooking.css app/static/cooking-solo-app.mjs
git commit -m "feat: add focus layer action capsule"
```

### Task 7: Verify tactile placement and prevent local pop-through regressions

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Add motion assertions for top, middle, bottom, and invalid drops**

For each valid insertion, assert the drop animation starts at the final target layer Y with a local scale overshoot and never passes through the bottom layer. Middle insertion must create a temporary gap only in layers above the target. Invalid release must animate back to its exact slot anchor and leave state unchanged.

- [ ] **Step 2: Run focused placement tests**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test --test-name-pattern "local drop|invalid return|middle insertion" tests/cooking-solo-stage.test.mjs
```

Expected: any legacy bottom-origin motion test fails until aligned with the accepted local-scale behavior.

- [ ] **Step 3: Keep placement animation local to its solved pose**

On successful drop, set the layer immediately to the solved position, animate scale from `0.86 -> 1.08 -> 0.97 -> 1`, and apply a small compression allowance based on ingredient type. Never derive an animation origin from stack bottom. Preserve the existing translucent drop intent while hovering.

- [ ] **Step 4: Run stage suite**

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-solo-stage.test.mjs
```

Expected: PASS with no bread-to-bread positive gap beyond contact tolerance.

- [ ] **Step 5: Commit tactile drop behavior**

```powershell
git add -- tests/cooking-solo-stage.test.mjs app/static/cooking-solo-stage.mjs app/static/cooking.css
git commit -m "fix: keep burger drops local and tactile"
```

### Task 8: Full regression, visual validation, and GitHub Pages publication

**Files:**
- Modify: `docs/handoff/witch-fries-prototype.md`

- [ ] **Step 1: Run all Node tests**

```powershell
$testFiles = Get-ChildItem -LiteralPath tests -Filter *.test.mjs | ForEach-Object { $_.FullName }
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $testFiles
```

Expected: all tests PASS with no unhandled rejection.

- [ ] **Step 2: Run Python and repository checks**

```powershell
& .\.venv\Scripts\python.exe -m pytest -q
git diff --check
git status --short
```

Expected: pytest PASS, `git diff --check` prints nothing, and only the pre-existing untracked `output/`, `server-selfplay-error.log`, and `server-selfplay.log` remain outside commits.

- [ ] **Step 3: Validate the real UI at desktop and phone sizes**

At 1440x900 and 390x844, visually verify:

1. All ten slot handles remain visible without covering food; long press opens a capsule beside the selected slot.
2. Build mode locks one-finger camera orbit but pinch zoom works.
3. A top, middle, and bottom placement shows lift, ghost, gap, local bounce, and no bottom-origin pop-through.
4. Sauce cannot mark bin food and follows an assembled layer after move/rotate/reorder.
5. Focus mode background drag orbits; layer drag moves only that layer; pinch zoom works.
6. The focus capsule reorders, rotates, and deletes the selected layer, with correct disabled boundaries.
7. A 60-layer burger remains fully reachable and automatically expands camera distance.
8. Refresh restores the saved layer order, rotations, and X/Z offsets.

- [ ] **Step 4: Update the handoff**

Document the final gestures, save migration, current public URL, and known deferred items (sushi map, raw ingredient production, multiplayer modes). Do not claim those deferred modes are implemented.

- [ ] **Step 5: Publish only tracked project files**

Copy tracked files to `C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy`, commit on its deployment branch, and push to the existing GitHub Pages remote. Do not copy untracked output or server logs.

- [ ] **Step 6: Verify the unchanged public URL**

Open and hard-refresh:

```text
https://kidcadillac.github.io/threejs_burger/cooking.html
```

Expected: the public page exposes the new slot capsules and focus-layer editing with no console exception or failed static asset request.

- [ ] **Step 7: Commit handoff documentation**

```powershell
git add -- docs/handoff/witch-fries-prototype.md
git commit -m "docs: record child-friendly cooking controls"
```

## Final Consistency Review

- [ ] Every behavior was first represented by a failing automated test.
- [ ] Exactly ten physical slots remain independently configurable.
- [ ] No selection control covers a source ingredient or the assembled burger.
- [ ] Sauce surfaces are derived only from current `assembledOrder` layers.
- [ ] Focus layer drag writes X/Z only; stack order and geometry remain authoritative for Y.
- [ ] Focus background drag orbits, selected-layer drag edits, and two fingers zoom.
- [ ] Bread contact has no visible positive gap; thin ingredients may overlap slightly.
- [ ] Save v2 preserves offsets and still loads version-1 saves.
- [ ] The 60-layer camera regression, autosave, undo, feedback capture, and highlights remain passing.
- [ ] Deferred sushi, raw-production, and multiplayer ideas remain documented rather than half-built.
