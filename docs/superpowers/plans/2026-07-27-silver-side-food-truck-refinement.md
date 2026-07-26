# Silver Side Food Truck Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主页汉堡店卡片从“平面摊位”重构为一眼能认出的银灰色侧视汉堡餐车，同时保留现有轮播、卷帘门、营业状态、模式切换和响应式交互。

**Architecture:** 继续使用现有 HTML + CSS 2.5D 分层结构，不引入图片、视频、Canvas 或第三方 3D 资源。HTML 只增加餐车车身、服务窗口、驾驶室、车门、踏板等装饰节点；CSS 负责金属车身、比例、景深、灯光和动画。现有 `home-lobby-app.mjs` 状态机继续作为唯一动画进度来源，除非测试证明必须补充变量，否则不改业务状态逻辑。

**Tech Stack:** HTML5, CSS custom properties/transforms, vanilla JavaScript ES modules, Node.js built-in test runner.

---

## Task 1: Lock the side-profile truck anatomy with tests

**Files:**
- Modify: `tests/cooking-solo-page.test.mjs`
- Reference: `app/static/index.html`
- Reference: `app/static/home.css`

- [ ] **Step 1: Extend the existing burger food-truck markup test**

In the existing test named `burger map reads as a lit food truck with rotating three-face menu boxes`, add assertions for the new structural hooks:

```js
assert.match(homeHtml, /class="food-truck-body-panel"/);
assert.match(homeHtml, /class="food-truck-serving-hatch"/);
assert.match(homeHtml, /class="food-truck-metal-trim"/);
assert.match(homeHtml, /class="food-truck-step"/);
assert.match(homeHtml, /class="food-truck-shell__cab-window"/);
assert.match(homeHtml, /class="food-truck-shell__cab-door"/);
assert.equal(
  (homeHtml.match(/class="food-truck-wheel/g) || []).length,
  2,
);
assert.equal(
  (homeHtml.match(/class="food-truck-arch/g) || []).length,
  2,
);
```

- [ ] **Step 2: Add CSS contract assertions**

Add assertions that prevent the old colorful block from returning and verify the responsive side-profile hooks:

```js
assert.match(homeCss, /\.food-truck-body-panel\s*\{/);
assert.match(homeCss, /\.food-truck-serving-hatch\s*\{/);
assert.match(homeCss, /\.food-truck-shell__cab-window\s*\{/);
assert.match(homeCss, /\.food-truck-shell__cab-door\s*\{/);
assert.match(homeCss, /\.food-truck-step\s*\{/);
assert.match(homeCss, /--truck-metal-light:/);
assert.match(homeCss, /--truck-metal-shadow:/);
assert.match(homeCss, /@media\s*\(max-width:\s*430px\)/);
```

- [ ] **Step 3: Run the focused test and confirm it fails**

Run:

```powershell
node --test tests/cooking-solo-page.test.mjs
```

Expected: FAIL on at least one new side-profile anatomy assertion because the new nodes and CSS do not exist yet.

- [ ] **Step 4: Commit the red test**

```powershell
git add tests/cooking-solo-page.test.mjs
git commit -m "test: define silver food truck anatomy"
```

## Task 2: Add semantic 2.5D truck structure without changing game controls

**Files:**
- Modify: `app/static/index.html`
- Test: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Replace the decorative truck-shell interior**

Keep the existing `.food-truck-shell`, two wheel arches, two wheels, headlamp, and bumper hooks. Replace the cab’s generic child `<i>` and add explicit decorative parts:

```html
<span class="food-truck-body-panel" aria-hidden="true">
  <i class="food-truck-serving-hatch"></i>
  <i class="food-truck-metal-trim"></i>
  <i class="food-truck-step"></i>
</span>
<span class="food-truck-shell__cab" aria-hidden="true">
  <i class="food-truck-shell__cab-window"></i>
  <i class="food-truck-shell__cab-door"></i>
</span>
<span class="food-truck-arch food-truck-arch--rear" aria-hidden="true"></span>
<span class="food-truck-arch food-truck-arch--front" aria-hidden="true"></span>
<span class="food-truck-wheel food-truck-wheel--rear" aria-hidden="true"></span>
<span class="food-truck-wheel food-truck-wheel--front" aria-hidden="true"></span>
<span class="food-truck-headlamp" aria-hidden="true"></span>
<span class="food-truck-bumper" aria-hidden="true"></span>
```

Do not move or rename:
- `data-burger-food-truck`
- `data-shop-shutter`
- `data-business-action`
- `data-card-mode-indicator`
- map slide data attributes

- [ ] **Step 2: Ensure decorative nodes cannot intercept gestures**

All new decorative nodes must be `aria-hidden="true"` and later receive `pointer-events: none` in CSS. Do not add buttons, links, or duplicate IDs.

- [ ] **Step 3: Run the focused test**

```powershell
node --test tests/cooking-solo-page.test.mjs
```

Expected: markup assertions pass; CSS contract assertions still fail.

- [ ] **Step 4: Commit semantic structure**

```powershell
git add app/static/index.html
git commit -m "feat: add side-profile food truck structure"
```

## Task 3: Rebuild the truck as a silver side-profile vehicle

**Files:**
- Modify: `app/static/home.css`
- Test: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Introduce scoped truck design tokens**

At the burger scene scope, define reusable tones:

```css
.diner-scene[data-burger-food-truck] {
  --truck-metal-light: #f1eee3;
  --truck-metal-mid: #c9c8c2;
  --truck-metal-shadow: #85878a;
  --truck-trim: #44464a;
  --truck-window: #273d44;
  --truck-interior-warm: #ffb34f;
  --truck-accent: #d85a32;
}
```

Use these variables instead of the previous saturated red/yellow body gradient.

- [ ] **Step 2: Reshape the full-length body**

Update `.food-truck-shell` so the body reads as one long vehicle:

```css
.food-truck-shell {
  position: absolute;
  right: 0.42rem;
  bottom: 0.18rem;
  left: 0.42rem;
  height: 3.55rem;
  overflow: visible;
  pointer-events: none;
  border: 0.12rem solid var(--truck-trim);
  border-radius: 0.48rem 1.25rem 0.38rem 0.38rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.65), transparent 22%),
    linear-gradient(105deg, var(--truck-metal-light), var(--truck-metal-mid) 58%, var(--truck-metal-shadow));
  box-shadow:
    inset 0 -0.32rem 0 rgba(50, 52, 55, 0.18),
    0 0.3rem 0 rgba(56, 34, 22, 0.32);
}
```

Keep the serving area on the left/centre and the cab on the right. The cab must protrude slightly instead of looking painted onto the body.

- [ ] **Step 3: Build the serving hatch and warm interior**

Style `.food-truck-body-panel` and `.food-truck-serving-hatch` as a horizontal opening:

```css
.food-truck-body-panel {
  position: absolute;
  inset: 0.28rem 4.25rem 0.58rem 0.32rem;
  pointer-events: none;
}

.food-truck-serving-hatch {
  position: absolute;
  inset: 0.12rem 0.25rem 0.86rem 0.18rem;
  overflow: hidden;
  border: 0.12rem solid var(--truck-trim);
  border-radius: 0.2rem;
  background:
    linear-gradient(
      180deg,
      rgba(255, 187, 88, calc(0.18 + var(--shop-open-progress, 1) * 0.48)),
      rgba(64, 39, 29, 0.96)
    );
  box-shadow: inset 0 0 1.2rem rgba(255, 181, 76, calc(var(--shop-open-progress, 1) * 0.45));
}
```

The existing awning must be shortened to align only above the hatch, not across the cab.

- [ ] **Step 4: Build the independent cab**

Replace broad selectors such as `.food-truck-shell__cab i` with explicit selectors:

```css
.food-truck-shell__cab {
  position: absolute;
  right: -0.08rem;
  bottom: 0.42rem;
  width: 4.25rem;
  height: 2.8rem;
  border: 0.11rem solid var(--truck-trim);
  border-radius: 0.42rem 1.2rem 0.2rem 0.25rem;
  background: linear-gradient(115deg, #deddd6, #a5a7a8);
}

.food-truck-shell__cab-window {
  position: absolute;
  top: 0.28rem;
  right: 0.45rem;
  width: 1.65rem;
  height: 0.92rem;
  border: 0.09rem solid var(--truck-trim);
  border-radius: 0.2rem 0.7rem 0.16rem 0.16rem;
  background: linear-gradient(145deg, #496570, var(--truck-window));
}

.food-truck-shell__cab-door {
  position: absolute;
  right: 1.52rem;
  bottom: 0.12rem;
  width: 1.4rem;
  height: 1.6rem;
  border: 0.07rem solid rgba(68, 70, 74, 0.65);
  border-radius: 0.12rem;
}
```

Add a simple door handle and windshield highlight with pseudo-elements, but no real brand marks.

- [ ] **Step 5: Place wheels and lower hardware by vehicle proportions**

Place the rear wheel under the serving body and the front wheel under the cab:

```css
.food-truck-arch--rear,
.food-truck-wheel--rear {
  left: 20%;
}

.food-truck-arch--front,
.food-truck-wheel--front {
  right: 12%;
}
```

Use `transform: translateX(-50%)` only on the rear pair. Keep the two wheel centres stable across animation states. Add:
- dark rubber tire
- silver hubcap
- metal lower trim spanning the body
- serving-side step below the hatch
- small headlamp and bumper at the cab nose

- [ ] **Step 6: Refine scene proportions and clipping**

Adjust:
- `.order-window`
- `.burger-truck-serving-frame`
- `.awning`
- `.service-counter`
- `.food-truck-shell`

so that the cab, hatch, and both wheels remain inside the active card’s rounded mask. Side cards may be clipped by the carousel viewport, but their own body edges must not tear or poke through.

- [ ] **Step 7: Add mobile-first scaling**

At `max-width: 430px`, keep the complete vehicle visible:

```css
@media (max-width: 430px) {
  .food-truck-shell {
    right: 0.24rem;
    left: 0.24rem;
    height: 3.18rem;
  }

  .food-truck-body-panel {
    right: 3.72rem;
  }

  .food-truck-shell__cab {
    width: 3.75rem;
  }
}
```

Do not hide either wheel or collapse the cab into the serving area.

- [ ] **Step 8: Run the focused test**

```powershell
node --test tests/cooking-solo-page.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit visual rebuild**

```powershell
git add app/static/home.css
git commit -m "feat: rebuild burger card as silver food truck"
```

## Task 4: Integrate card transition depth without adding new state

**Files:**
- Modify: `app/static/home.css`
- Reference: `app/static/home-lobby-app.mjs`
- Test: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Reuse current transition progress**

Confirm the existing app already writes:
- `--shop-open-progress`
- card offset or drag progress
- active/inactive map state

Do not create parallel timers. Drive the following from existing CSS state:
- hatch light opacity
- chef visibility
- shutter position
- wheel travel rotation
- side-card blur/scale

- [ ] **Step 2: Keep side cards smaller and softer**

Use the current card offset variable/state to give inactive cards:

```css
.home-map-slide:not(.is-active) .diner-scene {
  filter: saturate(0.78) brightness(0.82) blur(0.45px);
}
```

If an existing transform already scales the slide, modify its scale interpolation rather than stacking a second conflicting `transform`.

- [ ] **Step 3: Synchronize truck-specific motion**

During card travel:
- wheel rotation may follow horizontal movement
- warm serving light fades with opening progress
- chef retracts before full shutter closure
- incoming chef appears after hatch is visibly open

When the card is stationary, wheels must not loop or idle-spin. The three-face lightbox must retain its existing drag pause behavior.

- [ ] **Step 4: Add or extend transition assertions**

Add test assertions that the CSS references the existing open progress and does not define a permanent wheel animation:

```js
assert.match(homeCss, /var\(--shop-open-progress/);
assert.doesNotMatch(
  homeCss,
  /\.food-truck-wheel[^}]*animation\s*:\s*[^;]*(infinite)/s,
);
```

- [ ] **Step 5: Run the focused tests**

```powershell
node --test tests/cooking-solo-page.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit motion integration**

```powershell
git add app/static/home.css tests/cooking-solo-page.test.mjs
git commit -m "fix: synchronize food truck carousel motion"
```

## Task 5: Regression verification and handoff

**Files:**
- Verify: `app/static/index.html`
- Verify: `app/static/home.css`
- Verify: `app/static/home-lobby-app.mjs`
- Verify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Run the targeted homepage test**

```powershell
node --test tests/cooking-solo-page.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run the full project test suite**

```powershell
npm test
```

If the repository does not define `npm test`, run:

```powershell
node --test tests/*.test.mjs
```

Expected: all applicable tests pass.

- [ ] **Step 3: Check syntax and whitespace**

```powershell
node --check app/static/home-lobby-app.mjs
git diff --check
```

Expected: no output from either command other than normal test summaries.

- [ ] **Step 4: Confirm unrelated files are untouched**

```powershell
git status --short
```

Expected: only intended implementation files plus pre-existing untracked server logs. Do not add or delete:
- `server-selfplay.log`
- `server-selfplay-error.log`

- [ ] **Step 5: Final commit if any verified changes remain**

```powershell
git add app/static/index.html app/static/home.css app/static/home-lobby-app.mjs tests/cooking-solo-page.test.mjs docs/superpowers/specs/2026-07-27-silver-side-food-truck-refinement-design.md docs/superpowers/plans/2026-07-27-silver-side-food-truck-refinement.md
git commit -m "feat: refine silver side-profile burger truck"
```

Skip the commit if all intended changes were already committed in the earlier task commits.
