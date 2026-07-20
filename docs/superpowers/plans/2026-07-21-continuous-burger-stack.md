# Continuous Burger Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support 999-count replenishing ingredient bins, duplicate ingredient instances, a 20-layer burger, contact-correct stacking, full vertical inspection, pure-food focus, and live surface-following sauce.

**Architecture:** Introduce instance IDs while retaining the seven existing layer definitions as immutable templates. Dynamically register each replenished or assembled instance with the interaction controller, centralize layout around real geometry bounds, and keep camera fitting plus sauce projection derived from live world-space bounds and ray hits.

**Tech Stack:** JavaScript ES modules, Three.js, Node test runner, Python unittest, responsive HTML/CSS, GitHub Pages.

---

### Task 1: Geometry-bound stack contact

**Files:**
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/burger-model-3d.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Add failing asymmetric-bound contact tests**

Assert that every layer exposes finite `boundsMinY` and `boundsMaxY`, and that target transforms place each next layer's actual scaled minimum at the preceding layer's actual scaled maximum minus the defined compression. Include the asymmetric top bun and all seven settled layers.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/burger-model-3d.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: FAIL because layout currently assumes every geometry is centered around Y=0.

- [ ] **Step 3: Implement bound-derived layout**

Store cloned surface bounds on each layer's `userData`. Replace `cursor + halfHeight` placement with `cursor - boundsMinY * scale`; advance by `(boundsMaxY - boundsMinY) * scale - overlap`. Reuse this formula in model and stage layout paths.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused tests, then commit as `fix: stack burger layers by real geometry bounds`.

### Task 2: Full vertical orbit and visible pure-food focus

**Files:**
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/mobile-layout-css.test.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Add failing camera and focus tests**

Require stage orbit limits to allow pitch below `-0.8`, focus to hide the workbench and every unassembled item, and a stage-overlay focus button to remain visible without scrolling.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/cooking-solo-stage.test.mjs tests/cooking-solo-app.test.mjs tests/mobile-layout-css.test.mjs`.

- [ ] **Step 3: Implement orbit/focus UI**

Set the normal and focus minimum pitch to approximately `-1.18`. Move or mirror the focus action into `.cooking-stage` as an absolutely positioned 48px control; update its text/pressed state from the existing focus state and retain keyboard accessibility.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused tests, then commit as `feat: inspect the burger from every angle`.

### Task 3: Live sauce hit projection

**Files:**
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`
- Modify: `app/static/burger-model-3d.mjs`

- [ ] **Step 1: Add failing per-sample hit tests**

Move a bottle across a dome and a second layer, return different ray hits per pointer sample, and assert emitted points/segments use the hit surface's local coordinates and layer ID. Require preview and committed paths to share the same surface-clearance positions.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/cooking-interaction-controller.test.mjs tests/burger-model-3d.test.mjs`.

- [ ] **Step 3: Implement current-hit sampling**

Re-raycast edible surfaces for every bottle move, convert each hit point through the hit mesh's owning layer into normalized local X/Z, split segments when the instance changes, and preserve per-point projection/normal clearance during preview promotion.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused tests, then commit as `fix: draw sauce on the live food surface`.

### Task 4: Ingredient instances and 20-layer state

**Files:**
- Modify: `tests/cooking-solo-state.test.mjs`
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-state.mjs`
- Modify: `app/static/burger-model-3d.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Add failing instance-state tests**

Define stack entries with unique `instanceId` plus `ingredientId`, allow duplicate ingredient IDs, preserve independent rotations/strokes, and reject insertion when `assembledOrder.length === 20` without mutating state.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/cooking-solo-state.test.mjs tests/burger-model-3d.test.mjs tests/cooking-solo-stage.test.mjs`.

- [ ] **Step 3: Implement dynamic instances**

Keep seven definition/template groups hidden from the assembled order. Add model APIs to create/remove instances by cloning template geometry/material references, attach per-instance metadata, and expose selectable surfaces. Register/unregister each instance with controller `registerDraggable`/`unregisterDraggable`; after a bin source is placed, create and register its replacement immediately.

- [ ] **Step 4: Verify GREEN and commit**

Run focused tests, then commit as `feat: support duplicate ingredients up to twenty layers`.

### Task 5: Inventory UI and adaptive camera framing

**Files:**
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Add failing inventory and framing tests**

Require all seven ingredient counts to render as `999`, progress to show `n/20`, a 20-layer stack to remain within camera-safe bounds, and a 21st valid-looking drop to emit the max-layer message without state change.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/cooking-solo-app.test.mjs tests/cooking-solo-stage.test.mjs`.

- [ ] **Step 3: Implement counts and fit-to-stack**

Render compact count badges anchored to ingredient bins. After every authoritative stack change, compute assembled bounds, move camera target to the stack center, and increase distance only when required by height; preserve yaw and clamp distance. Apply the same bounds fit on focus entry.

- [ ] **Step 4: Verify GREEN and commit**

Run focused tests, then commit as `feat: replenish ingredients and frame tall burgers`.

### Task 6: Full verification and deployment

**Files:**
- Sync changed public assets to `C:/Users/KID/AppData/Local/Temp/threejs_burger_deploy_20260720_175442`

- [ ] **Step 1: Run all tests**

Run `node --test tests/*.test.mjs` and `python -m unittest discover -s tests -p "test_*.py"`; all tests must pass.

- [ ] **Step 2: Browser QA at 390×844 and desktop**

Verify 20 repeated layers, `999` badges, bottom-view orbit, pure-food focus, contact, local insertion pop/ghost preview, sauce across a bun dome, max-layer rejection, and zero console errors.

- [ ] **Step 3: Deploy and verify public Pages**

Sync only changed web assets, commit and push `main`, wait for Pages, then repeat the mobile smoke test at `https://kidcadillac.github.io/threejs_burger/`.

