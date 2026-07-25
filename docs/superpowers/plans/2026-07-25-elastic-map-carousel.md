# Elastic Map Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inactive map cards visibly smaller and recessed while the incoming card grows continuously with drag progress and settles into the center with a light pop.

**Architecture:** Extend the pure `cardWheelPose()` result with vertical and depth values, then pass those values through the existing render loop as CSS custom properties. Keep gesture resolution and circular indexing unchanged so the feature only changes presentation and feel.

**Tech Stack:** JavaScript ES modules, CSS transforms, Node.js built-in test runner, Python unittest.

---

### Task 1: Define the continuous card pose

**Files:**
- Modify: `tests/home-map-carousel-state.test.mjs`
- Modify: `app/static/home-map-carousel-state.mjs`

- [ ] **Step 1: Write the failing pose tests**

Extend the existing pose assertions with `translateYPercent` and `translateZPx`. Assert that the adjacent card is no larger than `0.8`, moves down and back, and that `cardWheelPose(0.5).scale` lies strictly between the center and adjacent values.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests\home-map-carousel-state.test.mjs
```

Expected: FAIL because the current pose has no depth or vertical fields and still returns `scale: 0.9` for adjacent cards.

- [ ] **Step 3: Implement the minimal continuous pose**

Return these fields from `cardWheelPose()`:

```js
translateYPercent: round(distance * 4.5),
translateZPx: round(distance * -72),
scale: round(Math.max(0.68, 1 - distance * 0.22)),
```

Keep translation, rotation, opacity, and z-index continuous functions of the same clamped offset.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Node command. Expected: all tests in `home-map-carousel-state.test.mjs` pass.

### Task 2: Render depth and landing feedback

**Files:**
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `app/static/home-lobby-app.mjs`
- Modify: `app/static/home.css`

- [ ] **Step 1: Write the failing integration assertions**

Assert that the app writes `--map-translate-y` and `--map-translate-z`, and that the CSS transform consumes both variables before `rotateY` and `scale`. Assert the settled transition uses an overshooting cubic Bézier curve while `.is-dragging` still disables transitions.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests\cooking-solo-page.test.mjs tests\home-map-carousel-state.test.mjs
```

Expected: FAIL because the render loop and CSS do not yet expose or consume the new pose values.

- [ ] **Step 3: Wire the pose into CSS variables**

In `renderWheel()` set:

```js
slide.style.setProperty("--map-translate-y", `${pose.translateYPercent}%`);
slide.style.setProperty("--map-translate-z", `${pose.translateZPx}px`);
```

In `.home-map-slide`, define defaults and compose:

```css
transform:
  translateX(var(--map-translate-x))
  translateY(var(--map-translate-y))
  translateZ(var(--map-translate-z))
  rotateY(var(--map-rotate-y))
  scale(var(--map-scale));
```

Use a short overshooting curve for settled transforms and retain `transition: none` during dragging and buffer resets.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the focused Node command again. Expected: all focused tests pass.

### Task 3: Verify, commit, and deploy

**Files:**
- Verify: all test files
- Deploy: `index.html`, `home.css`, `home-lobby-app.mjs`, `home-map-carousel-state.mjs`

- [ ] **Step 1: Run the full verification**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests\*.test.mjs
& 'C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe' -m unittest discover -s tests -p 'test_*.py'
git diff --check
```

Expected: zero failures and no whitespace errors.

- [ ] **Step 2: Commit source changes**

Stage only the specification, plan, two production modules, CSS, and their tests. Do not stage `server-selfplay*.log`.

- [ ] **Step 3: Synchronize and verify deployment files**

Copy the four changed static files to `C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy`, compare SHA-256 hashes, and run `node --check` on both modules.

- [ ] **Step 4: Commit and push the deployment**

Commit the deployment worktree, then run:

```powershell
git push burger-public HEAD:main
```

- [ ] **Step 5: Verify the public build without screenshots**

Fetch the public HTML, CSS, and state module with a cache-busting query. Confirm the new version token, transform variables, and adjacent-card scale are present.
