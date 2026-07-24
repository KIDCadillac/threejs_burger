# Home Map Infinite Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two-page lobby map carousel loop endlessly in both directions without losing native touch inertia.

**Architecture:** Keep native horizontal scrolling and add one inert clone at each track boundary. Convert between logical map indices and physical slide indices with pure tested helpers; when scrolling settles on a clone, jump without animation to the matching real slide.

**Tech Stack:** Browser ES modules, HTML/CSS scroll snap, Node test runner.

---

### Task 1: Circular index mapping

**Files:**
- Modify: `tests/home-map-carousel-state.test.mjs`
- Modify: `app/static/home-map-carousel-state.mjs`

- [ ] **Step 1: Write the failing tests**

Test that `changeMapIndex(0, -1)` returns `1`, `changeMapIndex(1, 1)` returns `0`, logical indices map to physical slides `1` and `2`, and boundary clones `0` and `3` map back to logical indices `1` and `0`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/home-map-carousel-state.test.mjs`
Expected: FAIL because navigation still clamps and physical mapping helpers are missing.

- [ ] **Step 3: Implement the minimal pure helpers**

Make `changeMapIndex` wrap with modulo. Export `mapIndexToPhysicalSlide()` and `physicalSlideToMapIndex()` for the two boundary clones.

- [ ] **Step 4: Run the state test**

Run: `node --test tests/home-map-carousel-state.test.mjs`
Expected: PASS.

### Task 2: Clone-boundary carousel

**Files:**
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `app/static/home-lobby-app.mjs`
- Modify: `app/static/index.html`

- [ ] **Step 1: Write the failing static integration test**

Require runtime `cloneNode`, `data-map-clone`, a scroll-settle handler, and absence of edge arrow disabling.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/cooking-solo-page.test.mjs`
Expected: FAIL because the current carousel has no clones and disables arrows.

- [ ] **Step 3: Implement clone setup and boundary correction**

Clone the first and last real slides, mark them inert, and insert them around the real slides. Scroll real maps at physical index `logical + 1`; map boundary positions to real map state and jump to the matching real slide after `scrollend` or a short debounce.

- [ ] **Step 4: Keep all controls circular**

Make arrows scroll toward the adjacent physical slide, make dots target real slides, remove the initial HTML `disabled`, and bump the module cache query.

- [ ] **Step 5: Run focused tests and syntax checks**

Run:
`node --test tests/home-map-carousel-state.test.mjs tests/cooking-solo-page.test.mjs`
`node --check app/static/home-lobby-app.mjs`
Expected: PASS and exit code 0.

### Task 3: Regression, deployment, and online marker check

**Files:**
- Copy changed runtime files into the existing deploy worktree.

- [ ] **Step 1: Run full Node and Python tests**

Run the repository’s complete Node test command and `python -m pytest -q`.
Expected: all tests pass.

- [ ] **Step 2: Commit source changes**

Stage only the spec, plan, tests, and runtime files. Do not stage local server logs.

- [ ] **Step 3: Sync the deploy worktree and push**

Copy the changed static files, commit them on `deploy/focus-layer`, and push `HEAD:main` to `burger-public`.

- [ ] **Step 4: Verify public files without screenshots**

Fetch the live HTML and JavaScript with a cache-busting query and confirm the new cache token, clone setup, and circular mapping helpers are present.
