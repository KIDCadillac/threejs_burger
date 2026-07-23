# Burger Shop Game Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing 3D burger workbench into a continuous three-order single-player shop run with customers, order tickets, a 45-second timer, serving, tasting reactions, scoring, rewards, and resumable progress.

**Architecture:** Keep `cooking-solo-stage.mjs` as the only 3D cooking engine. Add pure order/run/score modules around it, then mount one order-mode controller over the existing page when `mode=orders`; free cooking keeps the current controller. The order controller owns the state machine and fixed HUD, while a small adapter translates stage snapshots and commands.

**Tech Stack:** Browser ES modules, Three.js, semantic HTML/CSS, `localStorage`, Node.js built-in test runner, existing Python regression suite.

---

## File map

- Create `app/static/burger-shop-run-state.mjs`: pure three-order state machine and clock rules.
- Create `app/static/burger-order-generator.mjs`: deterministic legal order generation for orders 1–3.
- Create `app/static/burger-order-score.mjs`: five-part 1000-point scoring, stars, and coins.
- Create `app/static/burger-shop-save.mjs`: validated versioned run persistence.
- Create `app/static/burger-shop-stage-adapter.mjs`: narrow adapter over the existing solo cooking stage.
- Create `app/static/burger-customer-stage.mjs`: customer entrance, tasting, and fallback reaction state.
- Create `app/static/burger-shop-audio.mjs`: optional sound/haptic lifecycle with silent degradation.
- Create `app/static/burger-shop-app.mjs`: orchestration and DOM rendering for order mode.
- Modify `app/static/cooking-loader.mjs`: choose order mode or practice mode without duplicating loading.
- Modify `app/static/cooking.html`: add the fixed order HUD, customer layer, ticket, serving, and result surfaces.
- Modify `app/static/cooking.css`: make order mode non-scrolling and keep controls off the burger.
- Modify `app/static/index.html`: make “今日营业” the primary entry and demote practice/duel.
- Modify `app/static/home.css`: style one dominant game entry and smaller secondary modes.
- Add focused tests under `tests/` for every new module and integration boundary.

### Task 1: Three-order run state machine

**Files:**
- Create: `tests/burger-shop-run-state.test.mjs`
- Create: `app/static/burger-shop-run-state.mjs`

- [ ] **Step 1: Write the failing state-machine tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBurgerShopEvent,
  createBurgerShopRun,
} from "../app/static/burger-shop-run-state.mjs";

const at = (state, now, event) => applyBurgerShopEvent(state, event, { now: () => now });

test("runs arrival, preview, cooking, serving, tasting and the next order", () => {
  let state = createBurgerShopRun({ runId: "run-1", now: () => 1_000 });
  state = at(state, 1_100, { type: "customer.arrived" });
  state = at(state, 2_000, { type: "order.previewed" });
  assert.equal(state.phase, "cooking");
  assert.equal(state.deadlineAt, 47_000);
  state = at(state, 12_000, { type: "order.served", snapshot: { assembledOrder: ["b0", "p0"] } });
  state = at(state, 12_100, { type: "order.scored", score: 800 });
  state = at(state, 14_000, { type: "tasting.finished" });
  state = at(state, 15_000, { type: "order.next" });
  assert.equal(state.phase, "customer-arrival");
  assert.equal(state.orderNumber, 2);
});

test("timeout and serve at the same deadline settle only once", () => {
  let state = createBurgerShopRun({ runId: "run-2", now: () => 0 });
  state = at(state, 1, { type: "customer.arrived" });
  state = at(state, 2, { type: "order.previewed" });
  const served = at(state, state.deadlineAt, { type: "order.served", snapshot: { assembledOrder: [] } });
  const duplicate = at(served, state.deadlineAt, { type: "clock.tick" });
  assert.equal(served.phase, "serving");
  assert.strictEqual(duplicate, served);
});

test("three scored orders finish one run", () => {
  let state = createBurgerShopRun({ runId: "run-3", now: () => 0 });
  for (let order = 1; order <= 3; order += 1) {
    state = at(state, order * 100, { type: "customer.arrived" });
    state = at(state, order * 100 + 1, { type: "order.previewed" });
    state = at(state, order * 100 + 2, { type: "order.served", snapshot: { assembledOrder: [] } });
    state = at(state, order * 100 + 3, { type: "order.scored", score: 700 });
    state = at(state, order * 100 + 4, { type: "tasting.finished" });
    state = at(state, order * 100 + 5, { type: "order.next" });
  }
  assert.equal(state.phase, "run-result");
  assert.equal(state.totalScore, 2_100);
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `node --test tests/burger-shop-run-state.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the immutable run reducer**

Implement these exports with exact phases and an injected clock:

```js
export const BURGER_SHOP_ORDER_COUNT = 3;
export const BURGER_SHOP_ORDER_MS = 45_000;

export function createBurgerShopRun({ runId, now = Date.now } = {}) {
  if (!runId) throw new TypeError("runId is required");
  return Object.freeze({
    version: 1,
    runId,
    phase: "customer-arrival",
    orderNumber: 1,
    phaseStartedAt: now(),
    deadlineAt: null,
    orders: Object.freeze([]),
    servedSnapshot: null,
    totalScore: 0,
  });
}

export function applyBurgerShopEvent(state, event, { now = Date.now } = {}) {
  const timestamp = now();
  if (event.type === "customer.arrived" && state.phase === "customer-arrival") {
    return Object.freeze({ ...state, phase: "order-preview", phaseStartedAt: timestamp });
  }
  if (event.type === "order.previewed" && state.phase === "order-preview") {
    return Object.freeze({
      ...state,
      phase: "cooking",
      phaseStartedAt: timestamp,
      deadlineAt: timestamp + BURGER_SHOP_ORDER_MS,
    });
  }
  if (
    event.type === "order.served"
    && state.phase === "cooking"
    && timestamp <= state.deadlineAt
  ) {
    return Object.freeze({
      ...state,
      phase: "serving",
      phaseStartedAt: timestamp,
      servedSnapshot: event.snapshot,
      deadlineAt: null,
    });
  }
  if (event.type === "clock.tick" && state.phase === "cooking" && timestamp >= state.deadlineAt) {
    return Object.freeze({
      ...state,
      phase: "serving",
      phaseStartedAt: timestamp,
      servedSnapshot: Object.freeze({ assembledOrder: Object.freeze([]) }),
      deadlineAt: null,
    });
  }
  if (event.type === "order.scored" && state.phase === "serving") {
    const order = Object.freeze({
      number: state.orderNumber,
      score: event.score,
      snapshot: state.servedSnapshot,
    });
    return Object.freeze({
      ...state,
      phase: "tasting",
      phaseStartedAt: timestamp,
      orders: Object.freeze([...state.orders, order]),
      totalScore: state.totalScore + event.score,
    });
  }
  if (event.type === "tasting.finished" && state.phase === "tasting") {
    return Object.freeze({ ...state, phase: "order-result", phaseStartedAt: timestamp });
  }
  if (event.type === "order.next" && state.phase === "order-result") {
    if (state.orderNumber === BURGER_SHOP_ORDER_COUNT) {
      return Object.freeze({ ...state, phase: "run-result", phaseStartedAt: timestamp });
    }
    return Object.freeze({
      ...state,
      phase: "customer-arrival",
      orderNumber: state.orderNumber + 1,
      phaseStartedAt: timestamp,
      servedSnapshot: null,
    });
  }
  return state;
}
```

- [ ] **Step 4: Run the state tests**

Run: `node --test tests/burger-shop-run-state.test.mjs`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/static/burger-shop-run-state.mjs tests/burger-shop-run-state.test.mjs
git commit -m "feat: add burger shop run state"
```

### Task 2: Legal orders and deterministic scoring

**Files:**
- Create: `tests/burger-order-generator.test.mjs`
- Create: `tests/burger-order-score.test.mjs`
- Create: `app/static/burger-order-generator.mjs`
- Create: `app/static/burger-order-score.mjs`

- [ ] **Step 1: Add failing order and score tests**

```js
test("first order has no sauce and third order has seven or eight layers", () => {
  const first = createBurgerOrder({ orderNumber: 1, random: () => 0 });
  const third = createBurgerOrder({ orderNumber: 3, random: () => 0.5 });
  assert.equal(first.sauces.length, 0);
  assert.ok(third.layers.length >= 7 && third.layers.length <= 8);
});

test("perfect composition scores 1000 and three perfect orders award three stars", () => {
  const result = scoreBurgerOrder(perfectOrder, perfectSnapshot, { remainingMs: 45_000 });
  assert.equal(result.total, 1_000);
  assert.deepEqual(result.parts, {
    ingredients: 350, order: 250, sauce: 150, placement: 100, speed: 150,
  });
  assert.deepEqual(summarizeBurgerRun([result, result, result]), {
    totalScore: 3_000, stars: 3, coins: 45,
  });
});
```

- [ ] **Step 2: Verify both tests fail**

Run: `node --test tests/burger-order-generator.test.mjs tests/burger-order-score.test.mjs`

Expected: FAIL with two missing modules.

- [ ] **Step 3: Implement order generation**

Export `createBurgerOrder({ orderNumber, random })` using only IDs from
`SOLO_BURGER_INGREDIENT_IDS` and `SOLO_COOKING_SAUCE_IDS`. Enforce:

```js
const DIFFICULTY = Object.freeze({
  1: Object.freeze({ minLayers: 4, maxLayers: 5, sauces: 0 }),
  2: Object.freeze({ minLayers: 5, maxLayers: 6, sauces: 1 }),
  3: Object.freeze({ minLayers: 7, maxLayers: 8, sauces: 1 }),
});
```

Every order begins with `bottom-bun`, ends with `top-bun`, has at least one
`patty`, and never generates adjacent bread layers.

- [ ] **Step 4: Implement the score breakdown**

Export:

```js
export function scoreBurgerOrder(order, snapshot, { remainingMs = 0 } = {}) {
  return Object.freeze({
    total,
    parts: Object.freeze({ ingredients, order: layerOrder, sauce, placement, speed }),
    reaction: total >= 850 ? "high" : total >= 550 ? "medium" : "low",
  });
}

export function summarizeBurgerRun(orderScores) {
  const totalScore = orderScores.reduce((sum, item) => sum + item.total, 0);
  const stars = totalScore >= 2550 ? 3 : totalScore >= 2100 ? 2 : totalScore >= 1500 ? 1 : 0;
  return Object.freeze({
    totalScore,
    stars,
    coins: Math.floor(totalScore / 100) + stars * 5,
  });
}
```

Compare ingredient multisets, longest correct layer subsequence, sauce target
layer/coverage, mean offset radius, and clamped remaining time. Empty snapshots
must return zero without throwing.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/burger-order-generator.test.mjs tests/burger-order-score.test.mjs`

Expected: all tests PASS.

```powershell
git add app/static/burger-order-generator.mjs app/static/burger-order-score.mjs tests/burger-order-generator.test.mjs tests/burger-order-score.test.mjs
git commit -m "feat: generate and score burger orders"
```

### Task 3: Versioned run save and resume

**Files:**
- Create: `tests/burger-shop-save.test.mjs`
- Create: `app/static/burger-shop-save.mjs`

- [ ] **Step 1: Write failing persistence tests**

Test round-trip, corrupt JSON fallback, saved remaining-time clamp, and separation
from `SOLO_AUTOSAVE_STORAGE_KEY`. Use an in-memory object exposing
`getItem`, `setItem`, and `removeItem`.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/burger-shop-save.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement strict storage**

```js
export const BURGER_SHOP_SAVE_KEY = "burger-shop-run:v1";

export function createBurgerShopSave({ storage, now = Date.now } = {}) {
  return Object.freeze({
    load() {
      try {
        return validate(JSON.parse(storage.getItem(BURGER_SHOP_SAVE_KEY)));
      } catch {
        return null;
      }
    },
    save({ run, order, cookingSnapshot, settings }) {
      const savedAt = now();
      const remainingMs = run.deadlineAt === null
        ? null
        : Math.max(0, run.deadlineAt - savedAt);
      storage.setItem(BURGER_SHOP_SAVE_KEY, JSON.stringify({
        version: 1, savedAt, remainingMs, run, order, cookingSnapshot, settings,
      }));
    },
    clear() {
      storage.removeItem(BURGER_SHOP_SAVE_KEY);
    },
  });
}
```

Validation must accept only known phases, order numbers 1–3, finite non-negative
scores/times, version 1, and a valid cooking snapshot decoded through the existing
solo save validator.

- [ ] **Step 4: Run tests and commit**

Run: `node --test tests/burger-shop-save.test.mjs`

Expected: all tests PASS.

```powershell
git add app/static/burger-shop-save.mjs tests/burger-shop-save.test.mjs
git commit -m "feat: persist burger shop runs"
```

### Task 4: Adapter over the existing 3D stage

**Files:**
- Create: `tests/burger-shop-stage-adapter.test.mjs`
- Create: `app/static/burger-shop-stage-adapter.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`

- [ ] **Step 1: Write failing adapter tests**

Use a fake stage and verify that `startOrder()` resets the workbench and pauses it
until cooking begins, `serve()` returns `getState()`, `setCooking(false)`
blocks interaction, and focus delegates to `setBurgerFocus`.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/burger-shop-stage-adapter.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Add one restore hook to the stage API**

Expose a public `replaceState(nextState)` method that validates with
`hydrateSoloCookingState`, exits focus, reconciles models/stations, redraws sauces,
and emits `"replace-state"`. Reuse the existing private competition restore logic;
do not duplicate hydration code.

- [ ] **Step 4: Implement the adapter**

```js
export function createBurgerShopStageAdapter(stage) {
  if (!stage?.getComposition || !stage?.reset) throw new TypeError("valid stage is required");
  return Object.freeze({
    startOrder({ restoredState = null } = {}) {
      if (restoredState) stage.replaceState(restoredState);
      else stage.reset();
      stage.setBurgerFocus(false);
      stage.setInteractionPaused(true);
    },
    setCooking(active) {
      stage.setInteractionPaused(!active);
    },
    serve() {
      stage.setBurgerFocus(false);
      stage.setInteractionPaused(true);
      return stage.getState();
    },
    getCookingState() {
      return stage.getState();
    },
    focus(active) {
      return stage.setBurgerFocus(active);
    },
    resetCamera() {
      return stage.resetCamera();
    },
  });
}
```

- [ ] **Step 5: Run adapter and stage regressions, then commit**

Run: `node --test tests/burger-shop-stage-adapter.test.mjs tests/cooking-solo-stage.test.mjs`

Expected: all tests PASS.

```powershell
git add app/static/burger-shop-stage-adapter.mjs app/static/cooking-solo-stage.mjs tests/burger-shop-stage-adapter.test.mjs
git commit -m "feat: adapt 3d stage for burger shop runs"
```

### Task 5: Fixed order HUD and non-scrolling shop layout

**Files:**
- Create: `tests/burger-shop-page.test.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Add failing markup/CSS contract tests**

Assert the HTML contains `#shop-customer`, `#shop-order-ticket`,
`#shop-order-timer`, `#shop-serve-button`, `#shop-tasting`, and
`#shop-run-result`. Assert order-mode CSS uses a viewport-height app, hidden body
overflow, a top HUD, a centered stage, and a bottom action dock that does not
overlap the stage safe area.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/burger-shop-page.test.mjs`

Expected: FAIL because the order HUD does not exist.

- [ ] **Step 3: Add semantic order-mode surfaces**

Insert one hidden `.burger-shop-ui` inside `.cooking-stage`:

```html
<section class="burger-shop-ui" id="burger-shop-ui" hidden>
  <header class="shop-hud">
    <div id="shop-customer" aria-live="polite"></div>
    <button id="shop-order-ticket" type="button" aria-expanded="false"></button>
    <strong id="shop-order-timer" aria-label="订单剩余时间">45</strong>
  </header>
  <aside class="shop-ticket-panel" id="shop-ticket-panel" hidden></aside>
  <div class="shop-tasting" id="shop-tasting" hidden></div>
  <div class="shop-order-result" id="shop-order-result" hidden></div>
  <div class="shop-run-result" id="shop-run-result" hidden></div>
  <nav class="shop-actions" aria-label="订单操作">
    <button type="button" data-shop-action="undo">撤销</button>
    <button type="button" data-shop-action="focus">聚焦</button>
    <button id="shop-serve-button" type="button" data-shop-action="serve">按铃交付</button>
  </nav>
</section>
```

- [ ] **Step 4: Add `body[data-game-mode="orders"]` layout rules**

Use `100dvh`, `overflow: hidden`, safe-area padding, `pointer-events: none` on the
HUD container and `pointer-events: auto` only on controls. Reserve at least 96px
for the bottom dock and 84px for the top HUD. Keep the existing practice layout
unchanged when the data attribute is absent.

- [ ] **Step 5: Run page/mobile tests and commit**

Run: `node --test tests/burger-shop-page.test.mjs tests/mobile-layout-css.test.mjs tests/cooking-solo-page.test.mjs`

Expected: all tests PASS.

```powershell
git add app/static/cooking.html app/static/cooking.css tests/burger-shop-page.test.mjs
git commit -m "feat: add fixed burger shop hud"
```

### Task 6: Customer reaction and optional audio/haptics

**Files:**
- Create: `tests/burger-customer-stage.test.mjs`
- Create: `tests/burger-shop-audio.test.mjs`
- Create: `app/static/burger-customer-stage.mjs`
- Create: `app/static/burger-shop-audio.mjs`
- Modify: `app/static/cooking.css`

- [ ] **Step 1: Write failing behavior tests**

Verify customer states `entering`, `waiting`, `eating`, `high`, `medium`, `low`;
reduced motion jumps directly to the stable state; missing audio context and
missing vibration never throw; backgrounding pauses audio.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/burger-customer-stage.test.mjs tests/burger-shop-audio.test.mjs`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement DOM-based original customer reactions**

Create a simple original character from layered HTML/CSS parts controlled by:

```js
export function createBurgerCustomerStage({
  root,
  reducedMotion = false,
  schedule = globalThis.setTimeout,
  cancel = globalThis.clearTimeout,
} = {}) {
  return Object.freeze({
    enter(customer),
    wait(),
    taste(reaction),
    leave(),
    dispose(),
  });
}
```

`taste("high")`, `taste("medium")`, and `taste("low")` must set distinct
`data-reaction` values and finish through a callback/promise even when animation
events are unavailable.

- [ ] **Step 4: Implement silent-safe feedback**

`createBurgerShopAudio()` exposes `play("pick"|"drop"|"correct"|"bell"|"tick"|"result")`,
`setMuted`, `setHaptics`, `pause`, `resume`, and `dispose`. It returns `false`
instead of throwing when audio is unavailable.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/burger-customer-stage.test.mjs tests/burger-shop-audio.test.mjs`

Expected: all tests PASS.

```powershell
git add app/static/burger-customer-stage.mjs app/static/burger-shop-audio.mjs app/static/cooking.css tests/burger-customer-stage.test.mjs tests/burger-shop-audio.test.mjs
git commit -m "feat: add burger customers and shop feedback"
```

### Task 7: Order-mode controller and loader routing

**Files:**
- Create: `tests/burger-shop-app.test.mjs`
- Modify: `tests/cooking-loader.test.mjs`
- Create: `app/static/burger-shop-app.mjs`
- Modify: `app/static/cooking-loader.mjs`
- Modify: `app/static/cooking-solo-app.mjs`

- [ ] **Step 1: Add failing controller tests**

With fake DOM, stage adapter, clock, customer, audio, save, generator, and scorer,
verify:

- `mode=orders` starts `customer-arrival` without opening the recipe picker.
- preview advances to cooking and starts 45 seconds.
- the timer renders once per second and last 10 seconds receive ticks.
- serve and timeout call scoring once.
- tasting advances to order result, then the next order, then run result.
- background pauses the local interval and foreground resumes without adding time.
- a valid save restores the same order with no more remaining time than saved.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/burger-shop-app.test.mjs tests/cooking-loader.test.mjs`

Expected: FAIL because order-mode boot is missing.

- [ ] **Step 3: Make solo boot embeddable**

Add options to `bootSoloCookingPage`:

```js
{
  openRecipePicker = true,
  mountDefaultActions = true,
  onStageChange = () => {},
}
```

When false, do not open the picker, do not finish through the old finish sheet,
and return the same stage for the order controller. Chain `onStageChange(detail)`
after the existing render callback so order mode can persist every cooking
change. Preserve current defaults so practice tests do not change.

- [ ] **Step 4: Implement `bootBurgerShopPage`**

```js
export function bootBurgerShopPage(documentTarget, {
  windowTarget,
  stage,
  now = Date.now,
  random = Math.random,
  setIntervalFn = windowTarget.setInterval.bind(windowTarget),
  clearIntervalFn = windowTarget.clearInterval.bind(windowTarget),
} = {}) {
  // Create run, order, adapter, customer, feedback and save.
  // Render from state after every reducer event.
  // Register data-shop-action handlers.
  // Return { getState, serve, next, dispose } for tests and lifecycle cleanup.
}
```

The controller must use one `dispatch(event)` function, save after every phase
transition and cooking change, and keep rendering phase-driven rather than
manually hiding unrelated elements in event handlers.

- [ ] **Step 5: Route the loader**

Read `new URL(windowTarget.location.href).searchParams.get("mode")`. For
`mode=orders`, import both app modules, boot solo with the recipe picker/default
finish disabled, then mount the shop controller. Otherwise preserve current
practice behavior.

- [ ] **Step 6: Run integration tests and commit**

Run: `node --test tests/burger-shop-app.test.mjs tests/cooking-loader.test.mjs tests/cooking-solo-app.test.mjs`

Expected: all tests PASS.

```powershell
git add app/static/burger-shop-app.mjs app/static/cooking-loader.mjs app/static/cooking-solo-app.mjs tests/burger-shop-app.test.mjs tests/cooking-loader.test.mjs
git commit -m "feat: run three-order burger shop mode"
```

### Task 8: Make the shop run the primary home experience

**Files:**
- Create: `tests/burger-shop-home.test.mjs`
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`

- [ ] **Step 1: Add a failing home hierarchy test**

Assert exactly one primary link points to `./cooking.html?mode=orders`, its
visible label is `今日营业`, practice links to `./cooking.html?mode=practice`, and
replica duel remains in a secondary section.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/burger-shop-home.test.mjs`

Expected: FAIL because the current burger card opens free cooking.

- [ ] **Step 3: Rebuild the home hierarchy**

Keep the current visual brand but change the content hierarchy:

```html
<a class="today-business" href="./cooking.html?mode=orders">
  <span>今日营业</span>
  <strong>完成 3 位顾客的汉堡订单</strong>
  <small>约 3 分钟 · 最高三星</small>
</a>
<section class="other-modes" aria-label="其他玩法">
  <a href="./cooking.html?mode=practice">自由练习</a>
  <a href="./replica-duel.html">复刻对决</a>
</section>
```

Remove the five equal-weight recipe quick-start cards from the first viewport.
Keep sushi as a non-interactive future-shop teaser below secondary modes.

- [ ] **Step 4: Run home tests and commit**

Run: `node --test tests/burger-shop-home.test.mjs tests/view-navigation.test.mjs`

Expected: all tests PASS.

```powershell
git add app/static/index.html app/static/home.css tests/burger-shop-home.test.mjs
git commit -m "feat: make burger shop run the main entry"
```

### Task 9: Full regression, device contract, and public deployment

**Files:**
- Modify: `README.md`
- Modify: `deploy/github-pages/README.md`

- [ ] **Step 1: Document the three public routes**

Document:

- `cooking.html?mode=orders` — three-order main game.
- `cooking.html?mode=practice` — unrestricted workbench.
- `replica-duel.html` — local two-player prototype.

State that order mode is offline-capable after initial static assets load and
does not require account permissions.

- [ ] **Step 2: Run all JavaScript tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests PASS with zero failures/cancellations/skips.

- [ ] **Step 3: Run Python regressions**

Run: `python -m pytest -q`

Expected: all tests PASS.

- [ ] **Step 4: Run static validation**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Perform non-image device acceptance**

Using DOM size assertions and browser console only, verify at 390×844 and
412×915:

- no document scroll in order mode;
- canvas safe area is not covered by the bottom actions;
- order ticket, timer, focus and serve remain reachable;
- a three-order run reaches the result without a navigation;
- practice and replica duel still open.

- [ ] **Step 6: Commit documentation**

```powershell
git add README.md deploy/github-pages/README.md
git commit -m "docs: describe burger shop game routes"
```

- [ ] **Step 7: Copy the verified static files to the public deployment worktree**

Copy only the committed `app/static` files required by the page, run the same
Node tests against source before publishing, commit in
`C:\Users\KID\Documents\游戏领域\.worktrees\burger-public-deploy`, push `main`,
and verify the GitHub Pages workflow finishes successfully.
