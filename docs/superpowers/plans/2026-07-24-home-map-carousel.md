# Home Map Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a touch-first horizontal map carousel to the game lobby, with the playable burger shop and a locked sushi-shop preview.

**Architecture:** A pure state module owns map definitions, index normalization, direction changes, and swipe decisions. The existing lobby controller owns persistence and DOM events, while HTML/CSS provide a two-slide track whose title, status, indicators, arrows, and primary action stay synchronized.

**Tech Stack:** Static HTML/CSS, browser ES modules, Pointer Events, localStorage, Node.js built-in test runner, pytest.

---

### Task 1: Pure map carousel state

**Files:**
- Create: `app/static/home-map-carousel-state.mjs`
- Create: `tests/home-map-carousel-state.test.mjs`

- [ ] **Step 1: Write the failing state tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  HOME_MAP_KEY,
  HOME_MAPS,
  changeMapIndex,
  normalizeMapIndex,
  resolveSwipe,
} from "../app/static/home-map-carousel-state.mjs";

test("map catalog exposes burger first and locked sushi second", () => {
  assert.equal(HOME_MAP_KEY, "burger-home-map-v1");
  assert.deepEqual(HOME_MAPS.map(({ id, available }) => [id, available]), [
    ["burger", true],
    ["sushi", false],
  ]);
});

test("map navigation stops at both edges", () => {
  assert.equal(changeMapIndex(0, -1), 0);
  assert.equal(changeMapIndex(0, 1), 1);
  assert.equal(changeMapIndex(1, 1), 1);
});

test("swipe resolves by distance or velocity and otherwise returns", () => {
  assert.equal(resolveSwipe({ deltaX: -90, width: 400, velocityX: 0 }), 1);
  assert.equal(resolveSwipe({ deltaX: 20, width: 400, velocityX: 0 }), 0);
  assert.equal(resolveSwipe({ deltaX: 18, width: 400, velocityX: 0.8 }), -1);
});

test("invalid stored map indexes fall back to burger", () => {
  assert.equal(normalizeMapIndex("1"), 1);
  assert.equal(normalizeMapIndex("bad"), 0);
  assert.equal(normalizeMapIndex(9), 0);
});
```

- [ ] **Step 2: Run the state test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/home-map-carousel-state.test.mjs
```

Expected: FAIL because `home-map-carousel-state.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure state**

```js
export const HOME_MAP_KEY = "burger-home-map-v1";
export const HOME_MAPS = Object.freeze([
  { id: "burger", title: "汉堡小馆", available: true },
  { id: "sushi", title: "深夜寿司店", available: false },
]);

export function normalizeMapIndex(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < HOME_MAPS.length ? parsed : 0;
}

export function changeMapIndex(index, direction) {
  return Math.max(0, Math.min(HOME_MAPS.length - 1, normalizeMapIndex(index) + Math.sign(direction)));
}

export function resolveSwipe({ deltaX, width, velocityX }) {
  if (Math.abs(deltaX) >= Math.max(48, width * 0.18)) return deltaX < 0 ? 1 : -1;
  if (Math.abs(velocityX) >= 0.65) return velocityX < 0 ? 1 : -1;
  return 0;
}
```

- [ ] **Step 4: Run the state test and verify GREEN**

Run the command from Step 2. Expected: 4 tests pass.

- [ ] **Step 5: Commit the state unit**

```powershell
git add app/static/home-map-carousel-state.mjs tests/home-map-carousel-state.test.mjs
git commit -m "feat: add home map carousel state"
```

### Task 2: Two-map lobby markup and visuals

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write failing page-contract assertions**

Extend the homepage test to require:

```js
for (const marker of [
  'id="home-map-viewport"',
  'id="home-map-track"',
  'data-home-map="burger"',
  'data-home-map="sushi"',
  'data-map-direction="-1"',
  'data-map-direction="1"',
  'id="home-map-dots"',
  'id="home-map-count"',
  'id="map-primary-action"',
  'aria-disabled="true"',
  "深夜寿司店",
  "左右滑动切换地图",
]) assert.ok(html.includes(marker), marker);

assert.match(css, /\.home-map-track\s*\{[^}]*display:\s*flex/s);
assert.match(css, /\.home-map-viewport\s*\{[^}]*touch-action:\s*pan-y/s);
```

- [ ] **Step 2: Run the page test and verify RED**

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/cooking-solo-page.test.mjs
```

Expected: FAIL on the first missing carousel marker.

- [ ] **Step 3: Replace the fixed diner scene with a two-slide track**

In `index.html`, wrap the central scene in `#home-map-viewport`, add burger and sushi slides inside `#home-map-track`, add left/right arrow buttons, map dots, count, and a primary action whose initial burger href is `./cooking.html?mode=orders`.

The sushi slide must contain a dark night window, sushi counter, lanterns, and sushi pieces using the existing original visual language. Its action state is represented by `aria-disabled="true"` and text “寿司店筹备中”.

- [ ] **Step 4: Add carousel CSS**

Add:

```css
.home-map-viewport { overflow: hidden; touch-action: pan-y; }
.home-map-track { display: flex; width: 200%; transform: translate3d(0,0,0); }
.home-map-slide { flex: 0 0 50%; }
.home-map-arrow { min-width: 48px; min-height: 48px; }
.home-map-dot { width: .62rem; height: .62rem; border-radius: 50%; }
```

Keep HUD, quick actions, and bottom navigation outside the track. Add a distinct night palette for the sushi slide and reduced-motion overrides.

- [ ] **Step 5: Run the page test and verify GREEN**

Run the command from Step 2. Expected: all page tests pass.

- [ ] **Step 6: Commit the structural unit**

```powershell
git add app/static/index.html app/static/home.css tests/cooking-solo-page.test.mjs
git commit -m "feat: add swipeable lobby map slides"
```

### Task 3: Pointer, keyboard, persistence, and synchronized CTA

**Files:**
- Modify: `app/static/home-lobby-app.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Add a failing controller contract test**

```js
test("home lobby controller binds swipe, arrows, keyboard, and persisted map state", async () => {
  const app = await readFile(
    new URL("../app/static/home-lobby-app.mjs", import.meta.url),
    "utf8",
  );
  for (const marker of [
    'from "./home-map-carousel-state.mjs"',
    '"pointerdown"',
    '"pointermove"',
    '"pointerup"',
    '"pointercancel"',
    '"ArrowLeft"',
    '"ArrowRight"',
    "HOME_MAP_KEY",
    "resolveSwipe",
  ]) assert.ok(app.includes(marker), marker);
});
```

- [ ] **Step 2: Run the page test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/cooking-solo-page.test.mjs
```

Expected: FAIL because the lobby controller has no carousel-state import or pointer bindings.

- [ ] **Step 3: Bind the carousel controller**

In `home-lobby-app.mjs`:

```js
import {
  HOME_MAP_KEY,
  HOME_MAPS,
  changeMapIndex,
  normalizeMapIndex,
  resolveSwipe,
} from "./home-map-carousel-state.mjs";
```

Read the saved index safely, render the track transform, update title/subtitle/count/dots/arrows, and change the primary action:

- burger: live link, “开门营业”
- sushi: remove `href`, set `aria-disabled="true"`, “寿司店筹备中”

Use Pointer Events on the viewport. Ignore starts inside `button`, `a`, or `[role="dialog"]`. Capture one primary pointer, update the temporary transform with edge resistance, resolve the gesture on release/cancel, and save the final index. Add left/right keyboard handling and arrow-button click handling.

- [ ] **Step 4: Run focused tests**

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/home-map-carousel-state.test.mjs tests/home-lobby-state.test.mjs tests/cooking-solo-page.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the interaction unit**

```powershell
git add app/static/home-lobby-app.mjs app/static/home-map-carousel-state.mjs tests/home-map-carousel-state.test.mjs
git commit -m "feat: control lobby maps with swipe and keyboard"
```

### Task 4: Full verification and public deployment

**Files:**
- Copy to deploy worktree: `index.html`, `home.css`, `home-lobby-app.mjs`, `home-lobby-state.mjs`, `home-map-carousel-state.mjs`

- [ ] **Step 1: Run all Node tests**

```powershell
$nodeTests = Get-ChildItem tests -Filter *.test.mjs | ForEach-Object { $_.FullName }
& 'C:\Program Files\nodejs\node.exe' --test @nodeTests
```

Expected: zero failures.

- [ ] **Step 2: Run all Python tests**

```powershell
& 'C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe' -m pytest -q
```

Expected: 140 tests pass.

- [ ] **Step 3: Check syntax and whitespace**

```powershell
git diff --check
& 'C:\Program Files\nodejs\node.exe' --check app/static/home-lobby-app.mjs
& 'C:\Program Files\nodejs\node.exe' --check app/static/home-map-carousel-state.mjs
```

Expected: exit code 0.

- [ ] **Step 4: Sync and publish**

Copy the five static files to `C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy`, commit them on `deploy/focus-layer`, and push `HEAD:main` to `burger-public`.

- [ ] **Step 5: Verify public resources**

Use `Invoke-WebRequest` with a commit cache-buster and confirm status 200 for the home page, CSS, lobby controller, carousel state module, and order-mode cooking page. Confirm the live HTML contains “左右滑动切换地图” and `home-map-carousel-state.mjs`.
