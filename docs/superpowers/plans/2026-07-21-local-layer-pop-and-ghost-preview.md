# Local Layer Pop and Ghost Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every burger ingredient appear by scaling at its actual insertion layer, with a close-fitting held shell and a translucent target-layer preview.

**Architecture:** Keep motion sampling pure in `cooking-insertion-animation.mjs`, keep reusable ingredient-shaped feedback inside `burger-model-3d.mjs`, and let `cooking-solo-stage.mjs` translate drag intent into stack gaps plus preview poses. The authoritative recipe state remains unchanged; all new objects are temporary, non-raycast visual feedback.

**Tech Stack:** JavaScript ES modules, Three.js, Node's built-in test runner, Python unittest, GitHub Pages.

---

### Task 1: Replace bottom-travel insertion with a local scale pop

**Files:**
- Modify: `tests/cooking-insertion-animation.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-insertion-animation.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write the failing motion tests**

Assert that an insert frame changes `selectedScaleXz` and `selectedScaleY`, never produces a negative `selectedOffsetY`, and still settles at identity. Replace the old bottom-insertion assertion with checks that the selected layer stays at its final target Y while its scale starts below the presentation scale and overshoots before settling.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/cooking-insertion-animation.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: FAIL because the current insert sampler moves the selected layer below its target and the stage interpolates it from the dragged/bottom pose.

- [ ] **Step 3: Implement the minimal local-pop motion**

For `kind === "insert"`, sample a uniform scale curve with key stages approximately `0.64 → 1.08 → 0.97 → 1`, keep `selectedOffsetY >= 0`, and advance `arrival` for upper-layer settling. In `applyActiveMotion`, apply the selected insert layer directly from `selectedTarget` rather than interpolating from `selectedFrom`; continue interpolating only the affected upper layers.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/cooking-insertion-animation.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the animation contract**

```powershell
git add tests/cooking-insertion-animation.test.mjs tests/cooking-solo-stage.test.mjs app/static/cooking-insertion-animation.mjs app/static/cooking-solo-stage.mjs
git commit -m "fix: pop ingredients at their insertion layer"
```

### Task 2: Add ingredient-shaped held and target feedback

**Files:**
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `app/static/burger-model-3d.mjs`

- [ ] **Step 1: Write failing model feedback tests**

Require the held feedback to reuse the selected layer's surface geometry and remain non-raycast. Define `setLayerDropPreview(layerId, pose)` and `clearLayerDropPreview()` through tests that check exact geometry reuse, target pose, translucent material, target-index metadata, and clearing/disposal behavior.

- [ ] **Step 2: Run the focused model test and verify RED**

Run: `node --test tests/burger-model-3d.test.mjs`

Expected: FAIL because the current feedback is a flat circle and the preview API does not exist.

- [ ] **Step 3: Implement reusable geometry feedback**

Replace the flat held disc with two non-raycast meshes that reuse the active layer surface geometry under shared translucent materials. Add a separate preview group under the burger root whose mesh geometry, position, scale, rotation and `targetIndex` are updated for each valid drop intent. Hide and detach both feedback systems without disposing ingredient geometry.

- [ ] **Step 4: Run the focused model test and verify GREEN**

Run: `node --test tests/burger-model-3d.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the model feedback**

```powershell
git add tests/burger-model-3d.test.mjs app/static/burger-model-3d.mjs
git commit -m "feat: preview burger insertion with ingredient ghosts"
```

### Task 3: Wire drag intent to the target-layer ghost

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `tests/cooking-workbench-3d.test.mjs`
- Modify: `app/static/cooking-workbench-3d.mjs`

- [ ] **Step 1: Write the failing stage integration tests**

During a valid middle insertion, assert that the ghost is visible at the final inserted transform and uses the dragged ingredient geometry. Assert that changing index updates its position, and that invalid intent, drop, page hide and dispose clear it. Lower layers and all bin ingredients must remain still.

- [ ] **Step 2: Run integration tests and verify RED**

Run: `node --test tests/cooking-solo-stage.test.mjs tests/cooking-workbench-3d.test.mjs`

Expected: FAIL because only the ring cue is currently updated.

- [ ] **Step 3: Implement stage wiring and soften the old ring**

Build the final preview order by inserting `intent.id` at `targetIndex`, read the selected target transform, and call `burger.setLayerDropPreview(...)`. Clear the preview from every existing transient-visual cleanup path. Reduce the ring cue opacity and scale so it remains a secondary ground reference.

- [ ] **Step 4: Run integration tests and verify GREEN**

Run: `node --test tests/cooking-solo-stage.test.mjs tests/cooking-workbench-3d.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit stage integration**

```powershell
git add tests/cooking-solo-stage.test.mjs app/static/cooking-solo-stage.mjs tests/cooking-workbench-3d.test.mjs app/static/cooking-workbench-3d.mjs
git commit -m "feat: show insertion-layer ghost previews"
```

### Task 4: Regression, browser QA, and deployment

**Files:**
- Modify if required by real-device findings: `app/static/cooking.css`
- Sync changed runtime files to: `C:/Users/KID/AppData/Local/Temp/threejs_burger_deploy_20260720_175442`

- [ ] **Step 1: Run the full automated suites**

Run: `node --test tests/*.test.mjs`

Run: `python -m unittest discover -s tests -p "test_*.py"`

Expected: all tests PASS with no unexpected warnings.

- [ ] **Step 2: Perform browser visual QA**

At a 390×844 viewport, verify held shell, bottom/middle/top target ghosts, local scale pop, cancellation cleanup, free camera orbit, and no console errors. Record screenshots of at least the middle-layer ghost and the dropped local pop result.

- [ ] **Step 3: Sync and deploy**

Copy only the changed web assets into the deployment clone, commit them on `main`, and run `git push origin main`.

- [ ] **Step 4: Verify GitHub Pages**

Open `https://kidcadillac.github.io/threejs_burger/` after Actions completes and repeat the 390×844 smoke test against public assets.

