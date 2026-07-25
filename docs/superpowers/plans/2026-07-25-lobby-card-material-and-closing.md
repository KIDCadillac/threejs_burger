# Lobby Card Material and Closing Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the lobby carousel angle-aware card material and play a sign-flip then shutter-close sequence before changing shops.

**Architecture:** Keep the existing five-card buffered carousel. Extend the pure pose function with visual-material values, expose those as CSS variables, and add one shared shutter element to each shop template. A small transition coordinator in `home-lobby-app.mjs` owns the close-before-slide timing and interaction lock.

**Tech Stack:** Vanilla JavaScript ES modules, CSS 3D transforms/filters, Node test runner, Python pytest integration tests.

---

### Task 1: Card material pose

**Files:**
- Modify: `app/static/home-map-carousel-state.mjs`
- Modify: `tests/home-map-carousel-state.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions that the center pose is sharp and fully saturated, while side poses have positive blur, reduced saturation/brightness, and mirrored sheen positions:

```js
assert.equal(center.blurPx, 0);
assert.equal(center.saturation, 1);
assert.ok(right.blurPx > 0);
assert.ok(right.saturation < 1);
assert.equal(left.sheenPercent + right.sheenPercent, 100);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/home-map-carousel-state.test.mjs`
Expected: FAIL because the material fields do not exist.

- [ ] **Step 3: Implement pose fields**

Extend `cardWheelPose()`:

```js
blurPx: round(distance * 1.35),
saturation: round(Math.max(0.68, 1 - distance * 0.22)),
brightness: round(Math.max(0.74, 1 - distance * 0.14)),
sheenPercent: round(50 - offset * 24),
sheenOpacity: round(0.08 + Math.min(0.2, distance * 0.12)),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/home-map-carousel-state.test.mjs`
Expected: PASS.

### Task 2: Shop identity, shutter, and material styles

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write the failing structure test**

Assert that burger and sushi templates expose `data-store-emblem`, both windows contain `.shop-shutter`, and CSS defines side-card material variables plus the closing selector.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cooking-solo-page.test.mjs`
Expected: FAIL because the emblems and shutters are absent.

- [ ] **Step 3: Add the reusable scene pieces**

Add this inside both shop windows, after the character:

```html
<div class="shop-shutter" aria-hidden="true">
  <i></i><i></i><i></i><i></i><b></b>
</div>
```

Mark the burger and sushi visuals with `data-store-emblem`. Style the shutter above the shop character and make `.home-map-slide.is-closing .shop-shutter` translate down. Apply blur, saturation, brightness, edge shadow, and a moving gloss gradient through CSS variables.

- [ ] **Step 4: Run the structure test**

Run: `node --test tests/cooking-solo-page.test.mjs`
Expected: PASS.

### Task 3: Close-before-slide coordinator

**Files:**
- Modify: `app/static/home-lobby-app.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write the failing behavior test**

Assert that `renderWheel()` publishes all material variables and `moveMap()` calls a close sequence that applies `is-closing`, updates the business sign first, and starts the wheel after the close delay.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cooking-solo-page.test.mjs`
Expected: FAIL because the coordinator is absent.

- [ ] **Step 3: Implement the coordinator**

Create `beginShopClose(step, persist)` to lock interaction, set the current store to closed, replay the sign flip, add `is-closing` to the active slide, then call the existing wheel transition after the configured close delay. Respect `prefers-reduced-motion` by using a zero delay.

- [ ] **Step 4: Run targeted tests**

Run: `node --test tests/home-map-carousel-state.test.mjs tests/cooking-solo-page.test.mjs`
Expected: PASS.

### Task 4: Cache, full verification, and deployment

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home-lobby-app.mjs`

- [ ] **Step 1: Bump public cache tokens**

Replace the lobby asset token with `20260725-cardfilm1` in the stylesheet, entry module, and carousel-state import.

- [ ] **Step 2: Run full verification**

Run:

```powershell
& "C:\Program Files\nodejs\node.exe" --test tests/*.test.mjs
& "C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe" -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 3: Commit, deploy, and verify textually**

Commit source changes, cherry-pick them into `burger-public-deploy`, push `HEAD:main`, then use `Invoke-WebRequest` to confirm the new cache token and `.shop-shutter` are live.
