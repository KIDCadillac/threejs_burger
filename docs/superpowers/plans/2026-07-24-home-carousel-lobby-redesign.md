# Home Carousel and Lobby Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable infinitely looping map wheel with three visible cards, larger shop covers, no four-button mode grid, and one clear business action.

**Architecture:** Replace boundary-clone navigation with a five-slot internal buffer that always renders three visible cards and keeps two offscreen cards ready for the next animation. Map selection, card-window mapping, and poses remain pure functions; the lobby controller only owns pointer lifecycle, animation phase, DOM content recycling, persistence, and actions.

**Tech Stack:** HTML, CSS, browser JavaScript modules, Node `node:test`, Python `pytest`, GitHub Pages.

---

### Task 1: Buffered carousel state

**Files:**
- Modify: `app/static/home-map-carousel-state.mjs`
- Modify: `tests/home-map-carousel-state.test.mjs`

- [ ] **Step 1: Write failing tests for the five-slot buffer and 45-degree neighbours**

```js
test("buffered wheel always supplies two cards on both sides", () => {
  assert.deepEqual(createMapCardWindow(0, 2), [
    { offset: -2, mapIndex: 0 },
    { offset: -1, mapIndex: 1 },
    { offset: 0, mapIndex: 0 },
    { offset: 1, mapIndex: 1 },
    { offset: 2, mapIndex: 0 },
  ]);
});

test("neighbour cards turn 45 degrees while preserving readable content", () => {
  assert.equal(cardWheelPose(-1).rotateY, 45);
  assert.equal(cardWheelPose(1).rotateY, -45);
  assert.ok(cardWheelPose(1).opacity >= 0.84);
  assert.equal(cardWheelPose(2).opacity, 0);
});
```

- [ ] **Step 2: Run the state test and confirm it fails because `createMapCardWindow` is missing and the old pose is 52 degrees**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=spec tests/home-map-carousel-state.test.mjs
```

Expected: FAIL for the missing buffered-window behavior and old neighbour pose.

- [ ] **Step 3: Implement the pure buffered-window mapping and new card pose**

```js
export function mapIndexAtOffset(index, offset, count = HOME_MAPS.length) {
  const size = Math.max(1, Math.trunc(Number(count) || 0));
  const current = ((Math.trunc(Number(index) || 0) % size) + size) % size;
  return ((current + Math.trunc(Number(offset) || 0)) % size + size) % size;
}

export function createMapCardWindow(index, count = HOME_MAPS.length) {
  return [-2, -1, 0, 1, 2].map((offset) => ({
    offset,
    mapIndex: mapIndexAtOffset(index, offset, count),
  }));
}
```

Update `cardWheelPose()` so offsets `-1` and `1` use `45deg`, readable opacity and scale, while offsets `-2` and `2` remain invisible buffers.

- [ ] **Step 4: Run the focused state test and confirm it passes**

- [ ] **Step 5: Commit the state layer**

```powershell
git add -- app/static/home-map-carousel-state.mjs tests/home-map-carousel-state.test.mjs
git commit -m "refactor: add buffered map wheel state"
```

### Task 2: Lobby structure without the four-button grid

**Files:**
- Modify: `app/static/index.html`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write a failing page-contract test**

The test must require `data-map-template`, the in-card sushi preview badge, the current-mode indicator and business button, while rejecting `.lobby-actions`, `data-home-mode-index`, “自由练习”, “汉堡图鉴”, “复刻对决”, and the old sushi action button.

- [ ] **Step 2: Run only the lobby page-contract tests and confirm they fail against the old grid**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=spec tests/cooking-solo-page.test.mjs
```

- [ ] **Step 3: Simplify the HTML**

- Keep the two shop articles as hidden reusable templates.
- Keep the map viewport, current-mode indicator, map count, business sign and bottom navigation.
- Remove the four `.lobby-action` elements.
- Change the sushi in-card badge to `新店预告 · 寿司店筹备中`.
- Add richer sushi cover copy inside the shop window without adding another external action.
- Bump page module and stylesheet cache versions.

- [ ] **Step 4: Run the page-contract tests and confirm they pass**

- [ ] **Step 5: Commit the lobby structure**

```powershell
git add -- app/static/index.html tests/cooking-solo-page.test.mjs
git commit -m "refactor: simplify lobby action hierarchy"
```

### Task 3: Recycle the buffered card slots after every swipe

**Files:**
- Modify: `app/static/home-lobby-app.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Add failing controller-contract assertions**

Require these controller markers:

```js
"createMapCardWindow"
"setupBufferedMapSlides"
"refreshBufferedMapSlides"
"pendingMapIndex"
"data-card-offset"
```

Reject the old markers:

```js
"setupMapLoopSlides"
"data-map-clone"
"wheelPhysicalIndex"
"normalizeWheelLoop"
```

- [ ] **Step 2: Run the page tests and confirm the old clone controller fails the new contract**

- [ ] **Step 3: Implement the buffered controller**

- Capture the two source articles as templates.
- Replace the track with five fixed slot articles for offsets `-2` through `2`.
- Fill every slot from `createMapCardWindow(mapIndex)`.
- Render drag progress as `cardWheelPose(slotOffset - progress)`.
- On a committed swipe, animate progress to `1` or `-1`.
- At transition completion, assign `pendingMapIndex`, refresh all five slots, reset progress to zero under `is-wheel-jump`, then restore transitions after the next paint.
- On cancellation or insufficient distance, animate back to zero without changing map content.
- Keep arrows, keyboard input and direct map selection on the same `moveMap()` path.

- [ ] **Step 4: Run state and page tests and confirm they pass**

- [ ] **Step 5: Commit the controller**

```powershell
git add -- app/static/home-lobby-app.mjs tests/cooking-solo-page.test.mjs
git commit -m "refactor: recycle buffered lobby cards"
```

### Task 4: Larger covers and game-like visual hierarchy

**Files:**
- Modify: `app/static/home.css`
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Add failing CSS-contract assertions**

Require:

- `--home-map-height` with a larger responsive range.
- current cards with `pointer-events: auto` and template nodes hidden.
- no `.lobby-actions` rules.
- a larger in-card sushi preview badge and sushi cover copy.
- one business button placed directly below the map.
- narrow-screen overrides that keep the button and bottom navigation visible.

- [ ] **Step 2: Run the page tests and confirm the old size and button-grid CSS fail**

- [ ] **Step 3: Implement the visual redesign**

- Increase the responsive map height while preserving small-phone safe areas.
- Show about one third of each side card with `45deg` perspective.
- Keep the active card crisp and neighbours readable.
- Expand the sushi storefront, lanterns, bar, chef and preview copy to fill the active card.
- Remove all old four-button grid styles.
- Position the business sign directly under the map; keep the bottom navigation unchanged.
- Add reduced-motion behavior for both card recycling and vertical mode flips.

- [ ] **Step 4: Run the page tests and confirm they pass**

- [ ] **Step 5: Commit the lobby visuals**

```powershell
git add -- app/static/home.css tests/cooking-solo-page.test.mjs
git commit -m "style: enlarge shop covers and simplify lobby"
```

### Task 5: Full verification and public deployment

**Files:**
- Mirror: `app/static/index.html` to deploy `index.html`
- Mirror: `app/static/home.css` to deploy `home.css`
- Mirror: `app/static/home-lobby-app.mjs` to deploy `home-lobby-app.mjs`
- Mirror: `app/static/home-map-carousel-state.mjs` to deploy `home-map-carousel-state.mjs`

- [ ] **Step 1: Run all Node tests**

```powershell
$nodeTests = @(rg --files tests -g '*.test.mjs')
& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=dot @nodeTests
```

Expected: exit code `0`.

- [ ] **Step 2: Run all Python tests**

```powershell
& 'C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe' -m pytest -q
```

Expected: `140 passed`.

- [ ] **Step 3: Run whitespace and worktree checks**

```powershell
git diff --check
git status --short
```

Only the two existing untracked self-play logs may remain.

- [ ] **Step 4: Mirror changed static files with `apply_patch`, compare SHA-256 hashes, commit and push**

```powershell
git push burger-public HEAD:main
```

- [ ] **Step 5: Verify the public HTML and modules by text request**

Confirm the deployed cache tag, buffered-window helper, absence of the old action grid and the updated sushi preview text at:

`https://kidcadillac.github.io/threejs_burger/`
