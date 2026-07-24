# Homepage Vertical Mode Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cyclic vertical mode switching to the homepage map while turning the large shop button into a persisted open/closed toggle.

**Architecture:** A new pure state module owns mode metadata, mode cycling, vertical swipe resolution, and business-state normalization. The existing lobby controller locks each pointer gesture to one axis: horizontal gestures feed the 3D map wheel, vertical gestures feed the mode selector. Markup and CSS expose current mode and shop status without duplicating navigation logic.

**Tech Stack:** Browser JavaScript modules, HTML/CSS, Node built-in test runner, pytest, GitHub Pages.

---

### Task 1: Mode and business state

**Files:**
- Create: `app/static/home-mode-switch-state.mjs`
- Create: `tests/home-mode-switch-state.test.mjs`

- [ ] **Step 1: Write failing state tests**

Test that mode indices normalize and cycle, upward/downward swipes resolve by distance or velocity, ambiguous movement stays neutral, and stored business values normalize:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  HOME_MODES,
  changeModeIndex,
  lockGestureAxis,
  normalizeBusinessOpen,
  normalizeModeIndex,
  resolveModeSwipe,
} from "../app/static/home-mode-switch-state.mjs";

test("home modes cycle in both directions", () => {
  assert.equal(HOME_MODES.length, 4);
  assert.equal(changeModeIndex(3, 1), 0);
  assert.equal(changeModeIndex(0, -1), 3);
});

test("gesture axis locks only after a dominant movement", () => {
  assert.equal(lockGestureAxis({ deltaX: 5, deltaY: 8 }), null);
  assert.equal(lockGestureAxis({ deltaX: 30, deltaY: 8 }), "horizontal");
  assert.equal(lockGestureAxis({ deltaX: 8, deltaY: 30 }), "vertical");
  assert.equal(lockGestureAxis({ deltaX: 20, deltaY: 18 }), null);
});

test("vertical swipe cycles with distance or velocity", () => {
  assert.equal(resolveModeSwipe({ deltaY: -90, height: 400, velocityY: -0.2 }), 1);
  assert.equal(resolveModeSwipe({ deltaY: 90, height: 400, velocityY: 0.2 }), -1);
  assert.equal(resolveModeSwipe({ deltaY: -20, height: 400, velocityY: -0.8 }), 1);
  assert.equal(resolveModeSwipe({ deltaY: 12, height: 400, velocityY: 0.1 }), 0);
});

test("business state accepts only the persisted open value", () => {
  assert.equal(normalizeBusinessOpen("open"), true);
  assert.equal(normalizeBusinessOpen(true), true);
  assert.equal(normalizeBusinessOpen("closed"), false);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/home-mode-switch-state.test.mjs
```

Expected: FAIL because `home-mode-switch-state.mjs` does not exist.

- [ ] **Step 3: Implement the pure state module**

Define:

```js
export const HOME_MODE_KEY = "burger-home-mode-v1";
export const HOME_BUSINESS_KEY = "burger-home-business-v1";
export const HOME_MODES = Object.freeze([
  Object.freeze({ id: "practice", label: "自由练习", hint: "不限时间", action: "practice" }),
  Object.freeze({ id: "cookbook", label: "汉堡图鉴", hint: "配方收藏", action: "cookbook" }),
  Object.freeze({ id: "duel", label: "复刻对决", hint: "双人轮换", action: "duel" }),
  Object.freeze({ id: "sushi", label: "寿司店", hint: "筹备中", action: "sushi" }),
]);
```

Implement `normalizeModeIndex`, `changeModeIndex`, `lockGestureAxis`, `resolveModeSwipe`, and `normalizeBusinessOpen`. Use a 12-pixel axis threshold, 1.25 dominance ratio, 18% distance threshold, and 0.65 px/ms velocity threshold.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/home-mode-switch-state.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/static/home-mode-switch-state.mjs tests/home-mode-switch-state.test.mjs
git commit -m "feat: define lobby mode switching state"
```

### Task 2: Homepage semantics and visual state

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write failing page-contract tests**

Require these production markers:

```js
assert.match(homeHtml, /id="home-mode-indicator"/);
assert.match(homeHtml, /data-home-mode-index="0"/);
assert.match(homeHtml, /data-home-mode-index="3"/);
assert.match(homeHtml, /id="map-primary-action"[^>]*data-business-toggle/);
assert.doesNotMatch(homeHtml, /id="map-primary-action"[^>]*href=/);
assert.match(homeCss, /\.lobby-action\.is-active/);
assert.match(homeCss, /\.lobby-stage\.is-open/);
assert.match(homeCss, /\.home-mode-indicator/);
assert.match(homeCss, /touch-action:\s*none/);
```

- [ ] **Step 2: Run the focused contract test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=dot tests/cooking-solo-page.test.mjs
```

Expected: FAIL because the mode indicator and business toggle markers are absent.

- [ ] **Step 3: Update homepage markup**

Add an inert overlay inside `.map-carousel`:

```html
<div class="home-mode-indicator" id="home-mode-indicator" aria-live="polite">
  <small>当前玩法</small>
  <strong id="home-mode-label">自由练习</strong>
  <span id="home-mode-hint">不限时间</span>
</div>
```

Change the primary link to:

```html
<button class="open-shop-button" id="map-primary-action" type="button" data-business-toggle aria-pressed="false">
  <span><small id="business-hint">店铺当前已打烊</small><strong id="business-label">开门营业</strong></span>
  <b aria-hidden="true">›</b>
</button>
```

Add `data-home-mode-index="0"` through `data-home-mode-index="3"` to the four mode entries.

- [ ] **Step 4: Add visual feedback**

Add CSS for:

- `.home-mode-indicator` as a compact, non-blocking map overlay.
- `.lobby-action.is-active` with a clear gold outline and raised state.
- `.lobby-stage.is-open` with an illuminated sign and “营业中” color.
- `.home-mode-indicator.is-switching` with a short vertical card-flip animation.
- `.home-map-viewport { touch-action: none; }`.
- `prefers-reduced-motion` fallback with transitions disabled.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=dot tests/cooking-solo-page.test.mjs
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add app/static/index.html app/static/home.css tests/cooking-solo-page.test.mjs
git commit -m "feat: expose lobby mode and business controls"
```

### Task 3: Axis-locked gestures and persisted UI

**Files:**
- Modify: `app/static/home-lobby-app.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write failing controller-contract tests**

Require imports and event-flow markers:

```js
assert.match(homeApp, /HOME_MODE_KEY/);
assert.match(homeApp, /HOME_BUSINESS_KEY/);
assert.match(homeApp, /lockGestureAxis/);
assert.match(homeApp, /resolveModeSwipe/);
assert.match(homeApp, /dragStartY/);
assert.match(homeApp, /gestureAxis/);
assert.match(homeApp, /moveMode/);
assert.match(homeApp, /renderMode/);
assert.match(homeApp, /renderBusiness/);
assert.match(homeApp, /ArrowUp/);
assert.match(homeApp, /ArrowDown/);
assert.match(homeApp, /data-business-toggle/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=dot tests/cooking-solo-page.test.mjs
```

Expected: FAIL because the controller has only horizontal drag state.

- [ ] **Step 3: Add persisted mode and business state**

Import the new state module with a cache tag. Read/write mode and business values from local storage. Implement:

```js
function renderMode({ animate = false } = {}) { /* label, hint, active card, aria-current */ }
function moveMode(direction) { /* cyclic index, persist, render */ }
function activateMode() { /* practice URL, cookbook sheet, duel URL, sushi map */ }
function renderBusiness() { /* aria-pressed, labels, lobby class, map status */ }
function toggleBusiness() { /* flip, persist, render */ }
```

- [ ] **Step 4: Replace single-axis drag tracking**

Track `dragStartX`, `dragStartY`, `dragDeltaX`, `dragDeltaY`, and `gestureAxis`.

- On pointer move, call `lockGestureAxis`.
- For horizontal gestures, call the existing `renderWheel`.
- For vertical gestures, update the mode-indicator preview transform.
- On pointer up, call `resolveSwipe` for horizontal gestures or `resolveModeSwipe` for vertical gestures.
- Suppress the map click after a real drag; a tap activates the selected mode.
- Handle pointer cancel by restoring both previews without switching.
- Add ArrowUp/ArrowDown mode cycling while preserving ArrowLeft/ArrowRight map cycling.

- [ ] **Step 5: Connect mode cards and business toggle**

Clicking a mode card first persists that index and then performs its existing action. Clicking `[data-business-toggle]` calls `toggleBusiness` only and never navigates.

- [ ] **Step 6: Run focused tests and syntax check**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --check app/static/home-lobby-app.mjs
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=dot tests/home-mode-switch-state.test.mjs tests/cooking-solo-page.test.mjs
```

Expected: syntax check and tests pass.

- [ ] **Step 7: Commit**

```powershell
git add app/static/home-lobby-app.mjs tests/cooking-solo-page.test.mjs
git commit -m "feat: switch lobby modes with vertical gestures"
```

### Task 4: Regression, deployment, and online verification

**Files:**
- Modify: `app/static/index.html` cache tags
- Modify matching root files in `C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy`

- [ ] **Step 1: Update cache tags**

Set `home.css`, `home-lobby-app.mjs`, and the new state-module import to `v=20260724-mode1`.

- [ ] **Step 2: Run all source tests**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=dot tests/*.test.mjs
& 'C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe' -m pytest -q
git diff --check
```

Expected: all Node and Python tests pass with no whitespace errors.

- [ ] **Step 3: Commit cache update**

```powershell
git add app/static/index.html app/static/home-lobby-app.mjs tests/cooking-solo-page.test.mjs
git commit -m "chore: refresh lobby mode assets"
```

- [ ] **Step 4: Apply matching production changes**

Use `apply_patch` to update these deployment-root files:

- `index.html`
- `home.css`
- `home-lobby-app.mjs`
- `home-mode-switch-state.mjs`

Confirm SHA-256 equality with the corresponding source static files.

- [ ] **Step 5: Commit and push GitHub Pages**

```powershell
git add index.html home.css home-lobby-app.mjs home-mode-switch-state.mjs
git commit -m "feat: deploy vertical lobby mode switching"
git push burger-public HEAD:main
```

- [ ] **Step 6: Verify online text markers**

Fetch `https://kidcadillac.github.io/threejs_burger/?v=20260724-mode1` and confirm:

- `data-business-toggle`
- `home-mode-indicator`
- `home-lobby-app.mjs?v=20260724-mode1`
- controller contains `resolveModeSwipe`
- stylesheet contains `.lobby-action.is-active`

Do not generate screenshots, Base64, or image files.

