# Responsive Home Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the game lobby layout so the sign, title, map wheel, mode badge, and bottom navigation remain readable and correctly proportioned across phone and desktop viewport sizes.

**Architecture:** Replace fixed vertical offsets with a grid-based lobby stage and a flexible map height derived from dynamic viewport units. Keep the buffered carousel state model, but reverse neighbour card perspective and place the mode badge inside the map viewport so it inherits the active card pose.

**Tech Stack:** Static HTML, CSS, JavaScript ES modules, Node test runner, pytest/FastAPI.

---

### Task 1: Lock the corrected carousel geometry

**Files:**
- Modify: `tests/home-map-carousel-state.test.mjs`
- Modify: `app/static/home-map-carousel-state.mjs`

- [ ] Change the expected left neighbour rotation to `-45` and right neighbour rotation to `45`.
- [ ] Run `node --test tests/home-map-carousel-state.test.mjs` and confirm the rotation assertions fail.
- [ ] Reverse the `rotateY` calculation in `cardWheelPose`.
- [ ] Run the focused test again and confirm it passes.

### Task 2: Lock the responsive lobby structure

**Files:**
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `tests/test_app.py`
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Modify: `app/static/home-lobby-app.mjs`

- [ ] Add assertions that the mode indicator is inside the map viewport, the page counter is absent, the stage is grid-based, the carousel has no fixed `top`, and the sign assembly owns the flip animation.
- [ ] Run the focused Node and Python tests and confirm they fail for the missing structure.
- [ ] Move the mode indicator into the viewport and remove `home-map-meta`.
- [ ] Remove page-counter JavaScript and update asset cache versions.
- [ ] Convert the stage and carousel to responsive grid/flex sizing with safe-area-aware phone and short-screen breakpoints.
- [ ] Animate the complete hanging sign while preserving the board’s open/closed styling.
- [ ] Run focused tests and confirm they pass.

### Task 3: Verify and publish

**Files:**
- Modify: deployment copy under `C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy`

- [ ] Run the complete Node suite and complete pytest suite.
- [ ] Inspect `git diff --check` and confirm only intended files changed.
- [ ] Commit source changes.
- [ ] Copy the verified static assets to the public deployment worktree.
- [ ] Run deployment checks, commit, and push `deploy/focus-layer` to `burger-public/main`.
- [ ] Return the original GitHub Pages URL with a new cache-busting query string.
