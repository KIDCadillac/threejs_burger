# Lobby Card Mode Coupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Couple each shop card to its supported game modes, move the business toggle into the header as a hanging sign, and shorten the carousel.

**Architecture:** Add pure map-mode selection helpers to the existing mode state module, then let the lobby controller normalize the active mode whenever the map changes. Keep the buffered carousel architecture and make the active mode plaque inherit the current card’s horizontal pose.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Node test runner, pytest.

---

### Task 1: Map-aware mode state

**Files:**
- Modify: `app/static/home-mode-switch-state.mjs`
- Test: `tests/home-mode-switch-state.test.mjs`

- [ ] Add failing tests proving burger cycles through `practice`, `cookbook`, and `duel`, while sushi resolves to only `sushi`.
- [ ] Run `node --test tests/home-mode-switch-state.test.mjs` and confirm the new assertions fail because map-aware helpers are absent.
- [ ] Add `HOME_MAP_MODE_IDS`, `modeIndexForMap`, and `changeModeIndexForMap`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Couple the mode plaque to the active card

**Files:**
- Modify: `app/static/home-lobby-app.mjs`
- Test: `tests/home-map-carousel-state.test.mjs`

- [ ] Add a failing pose assertion for a draggable accessory that shares the active card’s offset.
- [ ] Run the focused test and confirm failure.
- [ ] Reuse `cardWheelPose` during horizontal drag to update the mode plaque’s X position, Y rotation, scale, and opacity.
- [ ] Normalize the active mode in `renderMap()` and use map-aware mode cycling for vertical swipes.
- [ ] Run focused tests.

### Task 3: Header hanging sign and shorter card

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Test: `tests/cooking-solo-page.test.mjs`
- Test: `tests/test_app.py`

- [ ] Add failing structural assertions: no `map-subtitle`, business toggle is inside `diner-sign`, no `open-shop-button`, and map height is the new shorter clamp.
- [ ] Run focused Node and Python tests and confirm failure.
- [ ] Move the toggle above the title, remove the subtitle paragraph and old bottom button, and add hanging-sign styling.
- [ ] Change map height to `clamp(22rem, 50vh, 28rem)` and update compact-height overrides.
- [ ] Run focused tests.

### Task 4: Verify and deploy

**Files:**
- Mirror: `app/static/home-mode-switch-state.mjs` → deploy root
- Mirror: `app/static/home-lobby-app.mjs` → deploy root
- Mirror: `app/static/index.html` → deploy root
- Mirror: `app/static/home.css` → deploy root

- [ ] Run all Node tests and expect zero failures.
- [ ] Run all Python tests and expect zero failures.
- [ ] Run `node --check` and `git diff --check`.
- [ ] Commit source changes, mirror exact files to the deploy worktree, commit, and push `HEAD:main`.
- [ ] Fetch the public HTML and JS without screenshots and verify the new cache tag and structural markers.
