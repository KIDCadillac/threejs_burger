# Mid-Stack Insertion and Live Sauce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow precise insertion into every burger gap, keep unrelated bin ingredients stationary, replace ambiguous selection rings, and render non-intersecting sauce continuously while the bottle is moving.

**Architecture:** Keep drop-index resolution as a pure coordinate function, make the stage the sole owner of affected-layer transforms, and generalize the existing insertion sampler to one `insert` motion. Move surface-stroke preview ownership into the burger model so live and committed sauce share projection geometry; the interaction controller emits gesture previews and a single atomic commit.

**Tech Stack:** JavaScript ES modules, Three.js, Node.js built-in test runner, Python `unittest`, browser smoke verification, GitHub Pages.

---

## File map

- `app/static/cooking-drop-intent.mjs`: map prep depth to one of `assembledCount + 1` insertion slots.
- `app/static/cooking-insertion-animation.mjs`: sample one generalized insertion choreography.
- `app/static/cooking-solo-stage.mjs`: calculate gap height, affected upper layers, authoritative poses, and wire live sauce callbacks.
- `app/static/cooking-workbench-3d.mjs`: display a narrow indexed gap cue instead of a top/bottom landing ring.
- `app/static/burger-model-3d.mjs`: provide close-fitting selection feedback and reusable live sauce preview meshes using the same surface projection as committed strokes.
- `app/static/cooking-interaction-controller.mjs`: emit live sauce segments during movement and commit them once on release.
- `tests/*.test.mjs`: deterministic regression coverage for every reported behavior.

### Task 1: Resolve every insertion slot

**Files:**
- Modify: `tests/cooking-drop-intent.test.mjs`
- Modify: `app/static/cooking-drop-intent.mjs`

- [ ] **Step 1: Write the failing slot tests**

Add tests that assert a two-layer stack produces all three indexes and clamps prep edges:

```js
test("two layers expose bottom, middle, and top insertion slots", () => {
  const input = { ...BASE, assembledCount: 2 };
  assert.equal(resolveSoloLayerDrop({ ...input, point: { x: 0, z: 1.45 } }).targetIndex, 0);
  assert.equal(resolveSoloLayerDrop({ ...input, point: { x: 0, z: 0 } }).targetIndex, 1);
  assert.equal(resolveSoloLayerDrop({ ...input, point: { x: 0, z: -1.45 } }).targetIndex, 2);
});

test("each prep depth maps monotonically to one of count plus one slots", () => {
  const indexes = [1.6, 0.8, 0, -0.8, -1.6].map((z) => (
    resolveSoloLayerDrop({ ...BASE, assembledCount: 4, point: { x: 0, z } }).targetIndex
  ));
  assert.deepEqual(indexes, [0, 1, 2, 3, 4]);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/cooking-drop-intent.test.mjs`

Expected: the middle-depth assertions fail because the current implementation only returns `0` or `assembledCount`.

- [ ] **Step 3: Implement normalized slot selection**

Replace the top/bottom threshold with a stable coordinate-to-index calculation:

```js
const depth = (prep.maxZ - point.z) / (prep.maxZ - prep.minZ);
const targetIndex = Math.max(
  0,
  Math.min(assembledCount, Math.floor(depth * (assembledCount + 1))),
);
return Object.freeze({
  kind: "prep",
  intent: "insert",
  targetIndex,
  slotCount: assembledCount + 1,
});
```

Update exact-key expectations so prep results expose `slotCount`; bin and invalid results remain unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/cooking-drop-intent.test.mjs`

Expected: all tests pass with indexes monotonic from front/bottom to back/top.

- [ ] **Step 5: Commit the slot resolver**

```powershell
git add app/static/cooking-drop-intent.mjs tests/cooking-drop-intent.test.mjs
git commit -m "feat: expose every burger insertion slot"
```

### Task 2: Animate only the selected layer and upper stack

**Files:**
- Modify: `tests/cooking-insertion-animation.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-insertion-animation.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing generalized-motion tests**

Replace top/bottom-only assertions with one `insert` motion contract:

```js
test("insert opens a gap, places the selected layer, and settles", () => {
  const motion = createCookingMotion({ kind: "insert", startedAt: 0, thickness: 0.6 });
  const opening = sampleCookingMotion(motion, 70);
  const insertion = sampleCookingMotion(motion, 190);
  const settle = sampleCookingMotion(motion, 380);
  assert.ok(opening.upperOffsetY > 0);
  assert.ok(insertion.arrival > opening.arrival);
  assert.equal(settle.done, true);
  assert.equal(settle.upperOffsetY, 0);
});
```

Add a stage regression that records all seven layer transforms, previews insertion at index `1`, advances the animation, and asserts:

```js
assert.equal(stage.burger.getLayer("bottom-bun").position.y, bottomBefore);
assert.ok(stage.burger.getLayer("patty").position.y > pattyBefore);
for (const id of unassembledIds) {
  assert.deepEqual(readTransform(stage.burger.getLayer(id)), homes.get(id));
}
```

Also cover pointer cancellation and starting a new pick during an active insertion.

- [ ] **Step 2: Run the two focused files and verify RED**

Run: `node --test tests/cooking-insertion-animation.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: `insert` is rejected and middle insertion does not limit movement to the upper subset.

- [ ] **Step 3: Generalize the motion sampler**

Change `DURATIONS` to include `insert`, retain `pick` and `home`, and expose these normalized outputs:

```js
{
  phase,
  progress,
  arrival,
  selectedOffsetY,
  upperOffsetY,
  selectedScaleXz,
  selectedScaleY,
  impact,
  done,
}
```

The insert timeline opens the upper group, advances the selected ingredient to its authoritative target, closes the upper group, then applies a small rebound. Remove `top` and `bottom` choreography after all callers use `insert`.

- [ ] **Step 4: Restrict stage preview and animation ownership**

In `cooking-solo-stage.mjs`, derive the order without the selected layer, then compute:

```js
const lowerIds = previewOrder.slice(0, targetIndex);
const upperIds = previewOrder.slice(targetIndex);
const affectedIds = new Set([selectedLayerId, ...upperIds]);
```

Calculate authoritative final transforms from the new order. During preview, shift only `upperIds`; during animation, mutate only `affectedIds`. At every frame and on cancellation, call the existing authoritative layout path for all IDs outside `affectedIds` so bin ingredients cannot inherit stale transforms. Store `targetIndex` and `upperIds` in the motion record instead of deriving a `top`/`bottom` kind.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/cooking-insertion-animation.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: generalized insert motion passes; middle insertion preserves lower and bin ingredients exactly.

- [ ] **Step 6: Commit insertion motion**

```powershell
git add app/static/cooking-insertion-animation.mjs app/static/cooking-solo-stage.mjs tests/cooking-insertion-animation.test.mjs tests/cooking-solo-stage.test.mjs
git commit -m "fix: animate only the selected burger gap"
```

### Task 3: Replace oversized rings with close-fitting feedback

**Files:**
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `tests/cooking-workbench-3d.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/burger-model-3d.mjs`
- Modify: `app/static/cooking-workbench-3d.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing feedback tests**

Assert selection feedback is attached to the selected layer and bounded by its footprint:

```js
burger.setLayerHighlighted("patty", true);
const feedback = burger.selectionFeedback;
assert.equal(feedback.parent, burger.getLayer("patty"));
assert.ok(feedback.scale.x <= burger.getLayer("patty").userData.surfaceRadius * 1.08);
assert.equal(feedback.userData.kind, "selection-outline");
```

Assert the workbench cue accepts any non-negative slot index and records exact height:

```js
workbench.setDropCue({ targetIndex: 1, y: 1.25, radius: 0.92 });
assert.equal(workbench.dropCue.userData.targetIndex, 1);
assert.equal(workbench.dropCue.position.y, 1.25);
assert.ok(workbench.dropCue.scale.x < 1.1);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/burger-model-3d.test.mjs tests/cooking-workbench-3d.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: current `selection-halo` and top/bottom-only `setDropCue` violate the new contracts.

- [ ] **Step 3: Implement close-fitting selection feedback**

Rename the public object to `selectionFeedback`. Use the selected layer radius plus at most eight percent padding, raise it just above the real surface, and combine a translucent footprint disk with a thin perimeter. Preserve `NO_RAYCAST`, no depth write, and resource disposal. The stage keeps the existing pick pulse for the short `1.04`-scale feedback.

- [ ] **Step 4: Implement indexed gap cue**

Change the workbench method to:

```js
setDropCue({ targetIndex, y, radius })
```

Validate `targetIndex` as a non-negative integer and `y`/`radius` as positive finite values. Store `targetIndex`, place the cue at the exact gap height, and scale its thin disk/perimeter from `radius`; remove the old top/bottom scale branch.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/burger-model-3d.test.mjs tests/cooking-workbench-3d.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: selection and gap feedback use different, bounded geometry and exact insertion metadata.

- [ ] **Step 6: Commit feedback changes**

```powershell
git add app/static/burger-model-3d.mjs app/static/cooking-workbench-3d.mjs app/static/cooking-solo-stage.mjs tests/burger-model-3d.test.mjs tests/cooking-workbench-3d.test.mjs tests/cooking-solo-stage.test.mjs
git commit -m "fix: clarify ingredient and gap selection feedback"
```

### Task 4: Render attached sauce during the gesture without intersection

**Files:**
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/burger-model-3d.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing burger-preview tests**

Define the desired API around gesture-local preview segments:

```js
const preview = burger.previewSauceStroke("gesture-1:0", {
  sauce: "mustard",
  layerId: "patty",
  amount: 0.5,
  points: [[-0.3, 0], [0.3, 0]],
});
assert.equal(preview.parent, burger.getLayer("patty"));
assert.equal(preview.userData.preview, true);
assert.ok(preview.userData.surfaceOffset >= preview.userData.tubeRadius + 0.008);

const committed = burger.commitSaucePreviews("gesture-1");
assert.equal(committed.length, 1);
assert.equal(committed[0], preview);
assert.equal(committed[0].userData.preview, false);
```

Add cancellation and cross-layer segment tests. Raycast from each tube centerline to the owning food surface and assert the offset is at least `tubeRadius + clearance` across the full path.

- [ ] **Step 2: Run burger tests and verify RED**

Run: `node --test tests/burger-model-3d.test.mjs`

Expected: live preview methods and safe offset metadata do not exist.

- [ ] **Step 3: Share committed and preview geometry construction**

Refactor `createSauceEntry` to accept `{ previewKey = null }`. Set:

```js
const clearance = 0.008;
const surfaceOffset = tubeRadius + clearance;
mesh.userData.tubeRadius = tubeRadius;
mesh.userData.surfaceOffset = surfaceOffset;
mesh.userData.preview = previewKey !== null;
```

Maintain `previewEntriesByKey`. `previewSauceStroke(key, stroke)` replaces only the old geometry for that key while reusing its mesh material and parent layer when possible. `commitSaucePreviews(gestureId)` promotes matching entries into `sauceEntries` without deleting and reconstructing their meshes. `cancelSaucePreviews(gestureId)` disposes only matching previews. All paths remain children of their owning layer.

- [ ] **Step 4: Run burger tests and verify GREEN**

Run: `node --test tests/burger-model-3d.test.mjs`

Expected: preview, promotion, cancellation, surface clearance, bite deformation, and disposal tests pass.

- [ ] **Step 5: Write failing controller live-update tests**

Configure the controller with `onSaucePreview`, `onSauceCommit`, and `onSauceCancel`. Dispatch pointer-down and two pointer-moves without pointer-up, then assert:

```js
assert.ok(previews.length >= 1);
assert.equal(commits.length, 0);
assert.equal(tools.get("mustard").object.position.equals(tools.get("mustard").dock.position), false);
```

After pointer-up, assert one atomic commit occurs, previews are not replayed as duplicate strokes, and bottle docking occurs after the commit callback. On pointer cancel, assert cancellation occurs and no commit is emitted. Add a two-food hit sequence that yields separate segment keys.

- [ ] **Step 6: Run controller tests and verify RED**

Run: `node --test tests/cooking-interaction-controller.test.mjs`

Expected: callbacks do not exist and the current controller only emits persistent strokes after docking.

- [ ] **Step 7: Emit live surface segments from the controller**

Remove the current single TubeGeometry preview that joins nozzle to surface. Assign a monotonic gesture ID at bottle pointer-down. On every valid sampled point, emit a frozen snapshot:

```js
onSaucePreview(Object.freeze({
  gestureId,
  segmentIndex,
  stroke: detachedFrozenStroke(bottle.sauce, layerId, amount, points),
  nozzle: Object.freeze({ x, y, z }),
}));
```

Keep a separate short nozzle stream object in `condimentTools.previewRoot`; it spans only nozzle to the latest surface hit and never becomes part of committed geometry. On pointer-up, call `onSauceCommit({ gestureId, strokes })` before docking. On cancellation, call `onSauceCancel({ gestureId })` and remove the short stream.

- [ ] **Step 8: Wire stage promotion and atomic state update**

The stage forwards each preview to `burger.previewSauceStroke`, then on commit adds all valid strokes to solo state once and calls `burger.commitSaucePreviews(gestureId)`. If state validation fails, call `burger.cancelSaucePreviews(gestureId)` and preserve the prior state. Keep the existing programmatic `applySauceStroke` API for tests, tutorial, and loaded compositions.

- [ ] **Step 9: Run sauce integration tests and verify GREEN**

Run: `node --test tests/burger-model-3d.test.mjs tests/cooking-interaction-controller.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: a visible layer-attached stroke exists before pointer-up, release promotes without duplication, cancellation leaves state unchanged, and all tube vertices clear the food surface.

- [ ] **Step 10: Commit live sauce changes**

```powershell
git add app/static/burger-model-3d.mjs app/static/cooking-interaction-controller.mjs app/static/cooking-solo-stage.mjs tests/burger-model-3d.test.mjs tests/cooking-interaction-controller.test.mjs tests/cooking-solo-stage.test.mjs
git commit -m "fix: draw sauce live on ingredient surfaces"
```

### Task 5: Full regression, mobile verification, and deployment

**Files:**
- Modify only if a regression requires a tested correction in files already listed above.

- [ ] **Step 1: Run the complete JavaScript suite**

Run: `node --test tests/*.test.mjs`

Expected: zero failures, zero uncaught warnings.

- [ ] **Step 2: Run the complete Python suite**

Run: `python -m unittest discover -s tests -p "test_*.py"`

Expected: zero failures and zero errors.

- [ ] **Step 3: Start a local static server and inspect a phone viewport**

Run from the repository root:

```powershell
python -m http.server 4173 --directory app
```

Use a 390×844 mobile viewport. Verify in the real browser:

1. build two layers and insert a third into the middle gap;
2. rotate during and after insertion;
3. confirm every bin ingredient remains seated;
4. draw sauce and observe the surface stroke before releasing;
5. inspect from a low angle for intersection;
6. release and confirm no flash, duplicate, or shape jump;
7. cancel a sauce gesture and confirm it disappears;
8. confirm the browser console has zero errors.

- [ ] **Step 4: Compare screenshots at normal and low camera angles**

Capture the middle-slot open state, active sauce state, and released sauce state. Confirm the indexed gap cue is legible without covering the food and that no transient food appears outside its bin.

- [ ] **Step 5: Update the public deployment clone**

Copy the verified application files into `C:/Users/KID/AppData/Local/Temp/threejs_burger_deploy_20260720_175442`, commit the deployment repository, and push its `main` branch. Do not change the Pages source or URL.

- [ ] **Step 6: Verify the public site**

Open `https://kidcadillac.github.io/threejs_burger/` with a cache-busting query. Verify HTTP 200 for the page and changed modules, repeat the mobile interaction smoke test, and confirm zero console errors.

- [ ] **Step 7: Record completion**

Update this plan checkboxes, record exact JavaScript/Python counts and the public deployment commit, then commit the plan status:

```powershell
git add docs/superpowers/plans/2026-07-20-mid-stack-live-sauce.md
git commit -m "docs: record mid-stack and live sauce verification"
```
