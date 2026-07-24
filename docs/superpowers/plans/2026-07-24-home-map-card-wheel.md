# Home Map Card Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat scrolling lobby map carousel with a touch-driven, infinitely looping 3D card wheel.

**Architecture:** Keep map identity and circular index rules in `home-map-carousel-state.mjs`, and add pure card-pose math there so it can be unit tested. Replace native horizontal scrolling in `home-lobby-app.mjs` with pointer-driven wheel progress and one-card snap transitions. CSS renders the current, previous, and next physical slides from per-card custom properties.

**Tech Stack:** Vanilla JavaScript ES modules, CSS transforms and custom properties, Node test runner, static GitHub Pages deployment.

---

### Task 1: Card pose math

**Files:**
- Modify: `app/static/home-map-carousel-state.mjs`
- Test: `tests/home-map-carousel-state.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add tests for a pure `cardWheelPose(offset)` function:

```js
assert.deepEqual(cardWheelPose(0), {
  translatePercent: 0,
  rotateY: 0,
  scale: 1,
  opacity: 1,
  zIndex: 30,
});
assert.deepEqual(cardWheelPose(-1), {
  translatePercent: -72,
  rotateY: 52,
  scale: 0.84,
  opacity: 0.72,
  zIndex: 19,
});
assert.deepEqual(cardWheelPose(1), {
  translatePercent: 72,
  rotateY: -52,
  scale: 0.84,
  opacity: 0.72,
  zIndex: 19,
});
assert.equal(cardWheelPose(2).opacity, 0);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/home-map-carousel-state.test.mjs
```

Expected: FAIL because `cardWheelPose` is not exported.

- [ ] **Step 3: Implement the pose function**

Export a deterministic function that rounds values and hides cards beyond the adjacent positions:

```js
export function cardWheelPose(rawOffset) {
  const offset = Math.max(-2, Math.min(2, Number(rawOffset) || 0));
  const distance = Math.abs(offset);
  return {
    translatePercent: Math.round(offset * 72 * 1000) / 1000,
    rotateY: Math.round(offset * -52 * 1000) / 1000,
    scale: Math.round(Math.max(0.72, 1 - distance * 0.16) * 1000) / 1000,
    opacity: distance >= 1.6 ? 0 : Math.round(Math.max(0, 1 - distance * 0.28) * 1000) / 1000,
    zIndex: Math.round(30 - distance * 11),
  };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 1 command. Expected: all carousel-state tests pass.

### Task 2: Wheel markup and CSS

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Test: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write the failing structure test**

Require:

```js
assert.match(html, /class="map-carousel"[^>]*data-card-wheel/);
assert.doesNotMatch(html, /id="home-map-dots"/);
assert.doesNotMatch(html, /左右滑动切换地图/);
assert.match(css, /\.home-map-viewport\s*\{[^}]*perspective:\s*900px/s);
assert.match(css, /\.home-map-slide\s*\{[^}]*position:\s*absolute/s);
assert.match(css, /rotateY\(var\(--map-rotate-y\)\)/);
assert.match(css, /\.home-map-viewport\.is-dragging \.home-map-slide\s*\{[^}]*transition:\s*none/s);
```

- [ ] **Step 2: Run the focused page test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-name-pattern "home page.*map|home page presents replica duel" tests/cooking-solo-page.test.mjs
```

Expected: FAIL because the native scroll markup and CSS still exist.

- [ ] **Step 3: Implement semantic markup and 3D styles**

Add `data-card-wheel` to `.map-carousel`, remove the dot buttons and hint text, and leave only `#home-map-count` in `.home-map-meta`.

Change the viewport and cards to a 3D stage:

```css
.home-map-viewport {
  overflow: hidden;
  perspective: 900px;
  touch-action: pan-y;
  user-select: none;
}
.home-map-track {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}
.home-map-slide {
  position: absolute;
  inset: 0 2.7rem .2rem;
  transform:
    translateX(var(--map-translate-x))
    rotateY(var(--map-rotate-y))
    scale(var(--map-scale));
  opacity: var(--map-opacity);
  transition: transform 380ms cubic-bezier(.2,.8,.2,1), opacity 260ms ease;
}
.home-map-viewport.is-dragging .home-map-slide { transition: none; }
```

Keep the arrows over the left and right edges with a larger touch target, and simplify the meta grid to a right-aligned page count.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 2 command. Expected: focused homepage tests pass.

### Task 3: Pointer-driven infinite wheel

**Files:**
- Modify: `app/static/home-lobby-app.mjs`
- Test: `tests/cooking-solo-page.test.mjs`
- Test: `tests/home-map-carousel-state.test.mjs`

- [ ] **Step 1: Write the failing interaction markers test**

Require the real controller to use pointer capture, pose math, drag progress, and the shared move operation:

```js
assert.match(app, /cardWheelPose/);
assert.match(app, /addEventListener\("pointerdown"/);
assert.match(app, /setPointerCapture/);
assert.match(app, /addEventListener\("pointermove"/);
assert.match(app, /resolveSwipe\(\{/);
assert.match(app, /renderWheel/);
assert.doesNotMatch(app, /addEventListener\("scroll"/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the Task 2 command. Expected: FAIL because the app still listens for native scrolling.

- [ ] **Step 3: Implement wheel rendering and gestures**

Import `cardWheelPose` and `resolveSwipe`. Track:

```js
let wheelPhysicalIndex = mapIndexToPhysicalSlide(mapIndex);
let wheelTransitioning = false;
let dragPointerId = null;
let dragStartX = 0;
let dragStartTime = 0;
let dragDeltaX = 0;
```

`renderWheel(progress = 0)` computes each physical slide’s offset from `wheelPhysicalIndex + progress`, calls `cardWheelPose`, and writes `--map-translate-x`, `--map-rotate-y`, `--map-scale`, `--map-opacity`, and `zIndex`.

On pointer move, use `progress = -dragDeltaX / (viewportWidth * .72)` clamped to `[-1, 1]`. On release, call `resolveSwipe` with distance and velocity. If the result is zero, animate back; otherwise update the logical and physical indices, animate one card, then normalize clone endpoints after 400ms without transition.

Arrow clicks and keyboard arrows call the same `moveMap` function. Ignore additional map moves while the 400ms snap is active.

- [ ] **Step 4: Run focused state and page tests**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/home-map-carousel-state.test.mjs tests/cooking-solo-page.test.mjs
```

Expected: all focused tests pass.

### Task 4: Regression verification and deployment

**Files:**
- Modify: `app/static/index.html` cache tags
- Mirror: `app/static/index.html` to deploy `index.html`
- Mirror: `app/static/home.css` to deploy `home.css`
- Mirror: `app/static/home-lobby-app.mjs` to deploy `home-lobby-app.mjs`
- Mirror: `app/static/home-map-carousel-state.mjs` to deploy `home-map-carousel-state.mjs`

- [ ] **Step 1: Run complete verification**

Run:

```powershell
git diff --check
$nodeTests = (Get-ChildItem tests -Filter *.test.mjs -File).FullName
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=dot $nodeTests
& 'C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe' -m pytest -q
```

Expected: zero Node failures and 140 Python passes.

- [ ] **Step 2: Commit source changes**

Stage only the four application files, two tests, design, and plan; do not stage server logs.

- [ ] **Step 3: Mirror with `apply_patch`, compare SHA-256, commit, and push**

Push deploy worktree `deploy/focus-layer` to `burger-public/main`.

- [ ] **Step 4: Verify the live files without screenshots**

Use cache-busted text requests and confirm the live HTML, CSS, and module files contain `data-card-wheel`, `perspective: 900px`, `cardWheelPose`, and pointer listeners, and no longer contain `home-map-dots`.
