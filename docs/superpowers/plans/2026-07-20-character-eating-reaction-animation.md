# Character Eating Reaction Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static round-face reaction with a playable four-second sequence in which a neutral modern character grabs the selected food, bites it, reveals a bite mark, recoils into a chili fire-breath reaction, and fans their mouth before settling.

**Architecture:** Keep the Python game state and WebSocket protocol unchanged. Add a pure JavaScript reaction model for deterministic recipe resolution, a focused SVG character-stage module for rig markup and playback, and a separate CSS file for bone transforms and effects; `app.js` only supplies the replay data and handles completion/replay controls. Use the existing food PNG as an SVG image texture and an SVG mask for the bite, so the prop remains visibly connected to the character's hand.

**Tech Stack:** FastAPI static serving, vanilla ES modules, inline SVG, CSS keyframes, Web Animations-compatible phase classes, Web Audio API, Vibration API, Node built-in test runner, pytest, Playwright CLI.

---

## File Structure

- Create `app/static/reaction-model.mjs`: pure recipe resolution, reaction intensity, phase timing, and captions; no DOM access.
- Create `app/static/character-reaction.mjs`: SVG rig markup, playback controller, cancellation, replay, and DOM phase updates.
- Create `app/static/character-reaction.css`: modern 2.5D SVG styling, bone transforms, fire/crumb/sweat effects, responsive layout, and reduced-motion fallback.
- Create `app/static/reaction-feedback.js`: optional audio and vibration keyed by named timeline events.
- Replace `app/static/art/shared-table.png`: mode-neutral modern snack table with ordinary young adults and no witch/fantasy costume.
- Replace `app/static/art/deployment-counter.png`: mode-neutral modern food-preparation counter with ordinary hands and no magic effects.
- Create `tests/reaction-model.test.mjs`: deterministic JavaScript unit tests for recipe and timeline logic.
- Modify `app/static/index.html`: load the reaction stylesheet.
- Modify `app/static/app.js`: replace the old round-face renderer and timers with the character reaction module.
- Modify `app/static/styles.css`: remove obsolete `.cartoon-face` reaction rules and keep only shared reveal/result layout.
- Modify `app/protocol.py`: expose the practice opponent as a neutral computer player rather than a witch character.
- Modify `tests/test_protocol.py`: assert the neutral computer-player identity.
- Modify `tests/test_app.py`: verify every new static module is served and wired into the finished-round screen.
- Modify `README.md`: document the first reaction sample and mobile playtest steps.

### Task 1: Build the Deterministic Reaction Model

**Files:**
- Create: `tests/reaction-model.test.mjs`
- Create: `app/static/reaction-model.mjs`

- [ ] **Step 1: Write failing recipe-resolution and phase tests**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  REACTION_DURATION_MS,
  REACTION_PHASES,
  phaseAt,
  resolveReactionPlan,
} from "../app/static/reaction-model.mjs";

test("repeated chili becomes a stronger primary reaction", () => {
  assert.deepEqual(resolveReactionPlan(["chili", "chili", "chili"]), {
    primary: "chili",
    primaryIntensity: 3,
    secondary: null,
    secondaryIntensity: 0,
  });
});

test("mixed recipe keeps the strongest effect primary and one readable follow-up", () => {
  assert.deepEqual(resolveReactionPlan(["mustard", "chili", "chili", "sour"]), {
    primary: "chili",
    primaryIntensity: 2,
    secondary: "mustard",
    secondaryIntensity: 1,
  });
});

test("ties preserve the player's ingredient order", () => {
  assert.equal(resolveReactionPlan(["sour", "mustard"]).primary, "sour");
});

test("the four-second sequence exposes named phases", () => {
  assert.equal(REACTION_DURATION_MS, 4000);
  assert.deepEqual(REACTION_PHASES.map(({ name }) => name), [
    "notice", "reach", "lift", "bite", "chew", "brace", "burst", "recover", "settle",
  ]);
  assert.equal(phaseAt(0).name, "notice");
  assert.equal(phaseAt(1150).name, "bite");
  assert.equal(phaseAt(2200).name, "burst");
  assert.equal(phaseAt(3900).name, "settle");
});
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run:

```powershell
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/reaction-model.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `reaction-model.mjs`.

- [ ] **Step 3: Implement the minimal pure model**

```javascript
export const REACTION_DURATION_MS = 4000;

export const REACTION_PHASES = Object.freeze([
  { name: "notice", at: 0, caption: "看起来还挺正常……" },
  { name: "reach", at: 180, caption: "拿起来尝一口" },
  { name: "lift", at: 520, caption: "送到嘴边" },
  { name: "bite", at: 1100, caption: "咔嚓！" },
  { name: "chew", at: 1350, caption: "嚼一嚼……" },
  { name: "brace", at: 1800, caption: "等一下，好像不对劲" },
  { name: "burst", at: 2050, caption: "辣到喷火！" },
  { name: "recover", at: 2750, caption: "快给嘴巴降降温" },
  { name: "settle", at: 3600, caption: "强装镇定失败" },
]);

export function phaseAt(milliseconds) {
  return REACTION_PHASES.reduce(
    (current, phase) => (milliseconds >= phase.at ? phase : current),
    REACTION_PHASES[0],
  );
}

export function resolveReactionPlan(sauces = []) {
  if (!sauces.length) return null;
  const counts = new Map();
  sauces.forEach((key, index) => {
    const current = counts.get(key) ?? { key, count: 0, first: index };
    current.count += 1;
    counts.set(key, current);
  });
  const ranked = [...counts.values()].sort(
    (left, right) => right.count - left.count || left.first - right.first,
  );
  return {
    primary: ranked[0].key,
    primaryIntensity: ranked[0].count,
    secondary: ranked[1]?.key ?? null,
    secondaryIntensity: ranked[1]?.count ?? 0,
  };
}
```

- [ ] **Step 4: Re-run the Node tests and verify PASS**

Run the Step 2 command. Expected: 4 tests pass.

- [ ] **Step 5: Commit the reaction model**

```powershell
git add app/static/reaction-model.mjs tests/reaction-model.test.mjs
git commit -m "feat: add deterministic food reaction model"
```

### Task 2: Create the Articulated SVG Character Stage

**Files:**
- Create: `app/static/character-reaction.mjs`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Add a failing static-stage test**

```python
def test_character_reaction_stage_is_served_as_an_articulated_svg() -> None:
    response = client.get("/static/character-reaction.mjs")

    assert response.status_code == 200
    for marker in (
        "characterReactionMarkup",
        'data-bone="torso"',
        'data-bone="head"',
        'data-bone="left-arm"',
        'data-bone="right-arm"',
        'data-prop="food"',
        'data-food-state="bitten"',
        'data-effect="fire"',
    ):
        assert marker in response.text
```

- [ ] **Step 2: Run the focused pytest and verify failure**

Run:

```powershell
python -m pytest tests/test_app.py::test_character_reaction_stage_is_served_as_an_articulated_svg -q
```

Expected: FAIL because `/static/character-reaction.mjs` returns 404.

- [ ] **Step 3: Create the SVG rig markup**

Create `characterReactionMarkup` with separate transformable groups and a masked food image:

```javascript
const FOOD_PATHS = Object.freeze({
  fry: "/static/art/foods/fry.png",
  nugget: "/static/art/foods/nugget.png",
  donut: "/static/art/foods/donut.png",
  cookie: "/static/art/foods/cookie.png",
  "onion-ring": "/static/art/foods/onion-ring.png",
  mochi: "/static/art/foods/mochi.png",
});

export function characterReactionMarkup({ victim, snackKind }) {
  const foodPath = FOOD_PATHS[snackKind] ?? FOOD_PATHS.nugget;
  return `
    <section class="character-reaction" id="character-reaction" data-phase="notice" aria-label="${victim}拿起食物并产生夸张反应">
      <p class="reaction-caption" data-reaction-caption>看起来还挺正常……</p>
      <svg class="reaction-rig" viewBox="0 0 390 500" role="img" aria-label="${victim}的完整进食动画">
        <defs>
          <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd5b5"/><stop offset="1" stop-color="#d98e70"/></linearGradient>
          <linearGradient id="hoodie" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#738a67"/><stop offset="1" stop-color="#344b3b"/></linearGradient>
          <radialGradient id="fire" cx="30%" cy="50%" r="70%"><stop stop-color="#fff49a"/><stop offset=".45" stop-color="#ffae32"/><stop offset="1" stop-color="#f0442f"/></radialGradient>
          <mask id="bitten-food-mask" maskUnits="userSpaceOnUse" x="28" y="314" width="96" height="96"><rect x="28" y="314" width="96" height="96" fill="white"/><circle cx="104" cy="326" r="22" fill="black"/><circle cx="119" cy="344" r="18" fill="black"/></mask>
        </defs>
        <ellipse class="rig-shadow" cx="198" cy="456" rx="92" ry="18"/>
        <g class="rig-person">
          <g data-bone="torso">
            <path class="rig-hoodie" d="M126 237 Q194 205 262 237 L282 420 Q198 455 108 420Z"/>
            <path class="rig-pocket" d="M151 354 Q195 380 239 354 L230 407 Q195 423 160 407Z"/>
          </g>
          <g data-bone="head">
            <ellipse class="rig-neck" cx="195" cy="241" rx="28" ry="37"/>
            <path class="rig-face" d="M121 116 Q194 53 270 115 L258 217 Q196 270 132 216Z"/>
            <g data-bone="hair"><path class="rig-hair" d="M119 132 Q113 54 178 66 Q222 28 274 83 Q301 119 263 151 Q251 106 216 105 Q164 119 126 166Z"/></g>
            <g class="rig-eyes"><ellipse cx="165" cy="160" rx="9" ry="13"/><ellipse cx="226" cy="160" rx="9" ry="13"/></g>
            <path class="rig-brow rig-brow--left" d="M147 137 Q165 126 181 137"/><path class="rig-brow rig-brow--right" d="M210 137 Q229 126 244 139"/>
            <path class="rig-mouth rig-mouth--closed" d="M177 205 Q196 215 216 204"/>
            <ellipse class="rig-mouth rig-mouth--open" cx="197" cy="207" rx="25" ry="19"/>
          </g>
          <g data-bone="left-arm"><path class="rig-sleeve" d="M138 251 Q95 266 79 327 L112 341 Q132 303 166 283Z"/><g data-bone="left-hand"><path class="rig-hand" d="M78 319 Q59 321 56 340 Q60 358 79 354 L107 337Z"/></g></g>
          <g data-bone="right-arm"><path class="rig-sleeve" d="M252 249 Q296 264 314 324 L282 340 Q263 303 230 283Z"/><g data-bone="right-hand"><path class="rig-hand" d="M308 316 Q328 318 331 337 Q327 356 307 352 L280 335Z"/></g></g>
          <g class="rig-legs"><path d="M134 407 L186 407 L177 472 L124 472Z"/><path d="M206 407 L257 407 L268 472 L215 472Z"/></g>
        </g>
        <g data-prop="food">
          <image data-food-state="whole" href="${foodPath}" x="28" y="314" width="96" height="96" preserveAspectRatio="xMidYMid slice"/>
          <image data-food-state="bitten" href="${foodPath}" x="28" y="314" width="96" height="96" preserveAspectRatio="xMidYMid slice" mask="url(#bitten-food-mask)"/>
          <g class="food-crumbs"><circle cx="70" cy="336" r="4"/><circle cx="91" cy="347" r="3"/><circle cx="104" cy="330" r="2"/></g>
        </g>
        <g data-effect="fire"><path d="M237 203 C286 171 301 215 359 180 C335 229 367 249 293 252 C266 248 246 235 229 218Z"/><path class="fire-core" d="M246 209 C282 195 297 221 330 205 C309 235 280 236 246 220Z"/></g>
        <g data-effect="heat"><path d="M260 83 Q282 57 270 32"/><path d="M292 105 Q320 80 306 51"/></g>
        <g data-effect="sweat"><path d="M274 161 Q294 185 275 200 Q256 184 274 161Z"/></g>
      </svg>
      <p class="victim-label">${victim}正在努力表情管理</p>
    </section>`;
}
```

- [ ] **Step 4: Re-run the focused pytest and verify PASS**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the articulated stage**

```powershell
git add app/static/character-reaction.mjs tests/test_app.py
git commit -m "feat: add articulated character reaction stage"
```

### Task 3: Implement Timeline Playback and Cancellation

**Files:**
- Modify: `tests/reaction-model.test.mjs`
- Modify: `app/static/character-reaction.mjs`

- [ ] **Step 1: Add failing scheduler tests**

```javascript
import { createReactionSchedule } from "../app/static/character-reaction.mjs";

test("playback schedules every phase and completion at four seconds", () => {
  const schedule = createReactionSchedule();
  assert.equal(schedule.at(0).phase, "notice");
  assert.equal(schedule.find(({ phase }) => phase === "bite").at, 1100);
  assert.equal(schedule.find(({ phase }) => phase === "burst").at, 2050);
  assert.deepEqual(schedule.at(-1), { phase: "complete", at: 4000 });
});
```

- [ ] **Step 2: Run Node tests and verify `createReactionSchedule` is missing**

Run the Task 1 Node test command. Expected: FAIL because the export does not exist.

- [ ] **Step 3: Add schedule creation and an injectable playback controller**

```javascript
import {
  REACTION_DURATION_MS,
  REACTION_PHASES,
  resolveReactionPlan,
} from "./reaction-model.mjs";

export function createReactionSchedule() {
  return [
    ...REACTION_PHASES.map(({ name, at, caption }) => ({ phase: name, at, caption })),
    { phase: "complete", at: REACTION_DURATION_MS },
  ];
}

export function playCharacterReaction(root, sauces, options = {}) {
  const scheduleTimeout = options.scheduleTimeout ?? window.setTimeout.bind(window);
  const cancelTimeout = options.cancelTimeout ?? window.clearTimeout.bind(window);
  const onPhase = options.onPhase ?? (() => {});
  const onComplete = options.onComplete ?? (() => {});
  const plan = resolveReactionPlan(sauces);
  const handles = [];
  let cancelled = false;

  root.dataset.primaryReaction = plan?.primary ?? "none";
  root.dataset.primaryIntensity = String(plan?.primaryIntensity ?? 0);
  root.dataset.secondaryReaction = plan?.secondary ?? "none";
  root.dataset.foodBitten = "false";

  createReactionSchedule().forEach((event) => {
    handles.push(scheduleTimeout(() => {
      if (cancelled) return;
      if (event.phase === "complete") {
        onComplete();
        return;
      }
      root.dataset.phase = event.phase;
      if (event.phase === "bite") root.dataset.foodBitten = "true";
      const caption = root.querySelector("[data-reaction-caption]");
      if (caption) caption.textContent = event.caption;
      onPhase(event.phase, plan);
    }, event.at));
  });

  return {
    cancel() {
      cancelled = true;
      handles.forEach(cancelTimeout);
    },
  };
}
```

- [ ] **Step 4: Re-run Node tests and verify PASS**

Expected: 5 tests pass.

- [ ] **Step 5: Commit timeline playback**

```powershell
git add app/static/character-reaction.mjs tests/reaction-model.test.mjs
git commit -m "feat: add cancellable reaction timeline"
```

### Task 4: Animate the Rig, Bite Mask, and Chili Fire

**Files:**
- Create: `app/static/character-reaction.css`
- Modify: `app/static/index.html`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Add failing stylesheet wiring tests**

```python
def test_character_reaction_styles_define_food_and_full_body_motion() -> None:
    page = client.get("/").text
    styles = client.get("/static/character-reaction.css")

    assert styles.status_code == 200
    assert 'href="/static/character-reaction.css"' in page
    for marker in (
        '[data-phase="reach"]',
        '[data-phase="bite"]',
        '[data-phase="burst"]',
        '[data-phase="recover"]',
        "reaction-fire-burst",
        "reaction-mouth-fan",
        "prefers-reduced-motion",
    ):
        assert marker in styles.text
```

- [ ] **Step 2: Run the focused test and verify the stylesheet is missing**

Run:

```powershell
python -m pytest tests/test_app.py::test_character_reaction_styles_define_food_and_full_body_motion -q
```

Expected: FAIL with a 404 for the stylesheet.

- [ ] **Step 3: Link the dedicated stylesheet after `styles.css`**

```html
<link rel="stylesheet" href="/static/styles.css">
<link rel="stylesheet" href="/static/character-reaction.css">
```

- [ ] **Step 4: Implement the modern 2.5D stage and phase transforms**

The stylesheet must include these complete phase contracts:

```css
.character-reaction { position:relative; display:grid; min-height:31rem; place-items:center; overflow:hidden; isolation:isolate; }
.reaction-rig { width:min(100%,24rem); height:auto; overflow:visible; filter:drop-shadow(0 1.2rem 1.6rem rgba(10,5,18,.28)); }
.rig-shadow { fill:rgba(12,8,17,.25); }
.rig-face,.rig-neck,.rig-hand { fill:url(#skin); stroke:#563c3b; stroke-width:3; }
.rig-hoodie { fill:url(#hoodie); stroke:#243a2d; stroke-width:4; }
.rig-pocket { fill:none; stroke:rgba(255,255,255,.24); stroke-width:3; }
.rig-hair { fill:#33251f; stroke:#1c1412; stroke-width:4; }
.rig-eyes { fill:#251c23; transform-origin:center; }
.rig-brow,.rig-mouth--closed { fill:none; stroke:#3a2024; stroke-width:5; stroke-linecap:round; }
.rig-mouth--open { fill:#5f1e28; stroke:#3a2024; stroke-width:4; opacity:0; }
.rig-sleeve { fill:url(#hoodie); stroke:#243a2d; stroke-width:4; }
.rig-legs path { fill:#242936; stroke:#151821; stroke-width:4; }
[data-bone],[data-prop="food"] { transform-box:fill-box; }
[data-bone="head"] { transform-origin:50% 92%; }
[data-bone="left-arm"] { transform-origin:86% 12%; }
[data-bone="right-arm"] { transform-origin:14% 12%; }
[data-prop="food"] { transform-origin:50% 50%; }
[data-food-state="bitten"],[data-effect],[data-effect="sweat"],.food-crumbs { opacity:0; }
[data-food-bitten="true"] [data-food-state="whole"] { opacity:0; }
[data-food-bitten="true"] [data-food-state="bitten"] { opacity:1; }

[data-phase="reach"] [data-bone="left-arm"] { animation:reaction-reach .34s cubic-bezier(.2,.8,.25,1) both; }
[data-phase="reach"] [data-prop="food"] { animation:reaction-food-grab .34s cubic-bezier(.2,.8,.25,1) both; }
[data-phase="lift"] [data-bone="left-arm"],
[data-phase="bite"] [data-bone="left-arm"],
[data-phase="chew"] [data-bone="left-arm"],
[data-phase="brace"] [data-bone="left-arm"] { transform:rotate(-54deg) translate(52px,-28px); }
[data-phase="lift"] [data-prop="food"],
[data-phase="bite"] [data-prop="food"],
[data-phase="chew"] [data-prop="food"],
[data-phase="brace"] [data-prop="food"] { transform:translate(128px,-155px) rotate(-10deg) scale(.88); }
[data-phase="bite"] [data-bone="head"] { animation:reaction-head-bite .24s ease-in-out both; }
[data-phase="bite"] .rig-mouth--closed { opacity:0; }
[data-phase="bite"] .rig-mouth--open { opacity:1; }
[data-phase="bite"] .food-crumbs { opacity:1; }
[data-phase="chew"] [data-bone="head"] { animation:reaction-chew .22s ease-in-out 2 alternate; }
[data-phase="brace"] [data-bone="torso"] { transform:translateY(-5px) scaleX(.98); }
[data-phase="brace"] .rig-eyes { transform:scale(.42); }
[data-phase="brace"] .rig-face { fill:#f08b72; }
[data-primary-reaction="chili"][data-phase="burst"] [data-bone="torso"] { animation:reaction-recoil .7s cubic-bezier(.17,.67,.25,1.3) both; }
[data-primary-reaction="chili"][data-phase="burst"] [data-bone="head"] { animation:reaction-head-recoil .7s ease-out both; }
[data-primary-reaction="chili"][data-phase="burst"] [data-bone="hair"] { animation:reaction-hair-whip .18s ease-in-out 4 alternate; }
[data-phase="burst"] [data-prop="food"] { animation:reaction-food-drop .4s ease-in both; }
[data-primary-reaction="chili"][data-phase="burst"] [data-effect="fire"] { opacity:1; animation:reaction-fire-burst .7s cubic-bezier(.15,.75,.2,1) both; }
[data-phase="recover"] [data-bone="left-arm"],
[data-phase="recover"] [data-bone="right-arm"] { animation:reaction-mouth-fan .18s ease-in-out 5 alternate; }
[data-phase="recover"] [data-effect="heat"],
[data-phase="recover"] [data-effect="sweat"] { opacity:1; animation:reaction-heat-rise .8s ease-out infinite; }
[data-phase="settle"] .rig-person { animation:reaction-settle .38s ease-out both; }

@keyframes reaction-reach { to { transform:rotate(-20deg) translate(-28px,16px); } }
@keyframes reaction-food-grab { to { transform:translate(52px,-6px) rotate(-5deg) scale(.95); } }
@keyframes reaction-head-bite { 55% { transform:translate(-10px,8px) rotate(-5deg); } }
@keyframes reaction-chew { to { transform:translateY(3px) scaleY(.97); } }
@keyframes reaction-recoil { 45% { transform:translate(-14px,-17px) rotate(-9deg); } 100% { transform:translate(-7px,-6px) rotate(-4deg); } }
@keyframes reaction-head-recoil { 45% { transform:translate(-24px,-13px) rotate(-15deg); } 100% { transform:translate(-10px,-5px) rotate(-6deg); } }
@keyframes reaction-hair-whip { to { transform:translateX(-7px) rotate(-7deg); } }
@keyframes reaction-food-drop { from { transform:translate(128px,-155px) rotate(-10deg) scale(.88); } to { transform:translate(84px,72px) rotate(25deg) scale(.74); opacity:0; } }
@keyframes reaction-fire-burst { 0% { transform:translateX(-15px) scaleX(.05) scaleY(.4); } 35% { transform:scaleX(1.08) scaleY(1.16); } 100% { transform:translateX(18px) scaleX(.9); opacity:.82; } }
@keyframes reaction-mouth-fan { to { transform:rotate(-62deg) translate(0,-24px); } }
@keyframes reaction-heat-rise { to { transform:translateY(-22px); opacity:0; } }
@keyframes reaction-settle { 55% { transform:translateY(8px) scaleY(.96); } 100% { transform:none; } }

@media (max-height:720px) { .character-reaction { min-height:24rem; } .reaction-rig { width:min(82vw,19rem); } }
@media (prefers-reduced-motion:reduce) {
  .character-reaction * { animation-duration:.01ms !important; animation-iteration-count:1 !important; }
  [data-primary-reaction="chili"] [data-effect="fire"] { opacity:.75; }
}
```

- [ ] **Step 5: Run the focused test and verify PASS**

- [ ] **Step 6: Commit the character visuals**

```powershell
git add app/static/character-reaction.css app/static/index.html tests/test_app.py
git commit -m "feat: animate food bite and chili fire reaction"
```

### Task 5: Integrate the New Reaction Into Finished Rounds

**Files:**
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Add a failing finished-round integration test**

```python
def test_finished_round_uses_character_playback_instead_of_static_face() -> None:
    script = client.get("/static/app.js").text

    assert 'from "/static/character-reaction.mjs"' in script
    assert "characterReactionMarkup" in script
    assert "playCharacterReaction" in script
    assert 'data-action="replay-reaction"' in script
    finished = script.split("function renderFinished", 1)[1].split("function gameHeader", 1)[0]
    assert "cartoon-face" not in finished
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
python -m pytest tests/test_app.py::test_finished_round_uses_character_playback_instead_of_static_face -q
```

Expected: FAIL because `app.js` still renders `.cartoon-face`.

- [ ] **Step 3: Import the reaction stage and keep one active playback**

```javascript
import {
  characterReactionMarkup,
  playCharacterReaction,
} from "/static/character-reaction.mjs";

let reactionPlayback = null;
```

- [ ] **Step 4: Replace the old face markup in `renderFinished`**

```javascript
${hit ? characterReactionMarkup({ victim, snackKind: replay.snackKind }) : ""}
```

Add this result-card control next to the deployment replay button:

```javascript
${hit ? `<button class="button button--secondary" type="button" data-action="replay-reaction">再看一次吃掉反应</button>` : ""}
```

- [ ] **Step 5: Replace timer-based class mixing with the dedicated player**

```javascript
function playHitSequence(sauces, replay) {
  clearReactionTimers();
  const stage = document.querySelector("#character-reaction");
  if (!sauces.length || !replay || !stage) {
    document.querySelector("#result-card")?.classList.add("result-card--visible");
    return;
  }
  reactionPlayback = playCharacterReaction(stage, sauces, {
    onPhase: () => {},
    onComplete: () => showReplayAndResult(false),
  });
}

function clearReactionTimers() {
  reactionPlayback?.cancel();
  reactionPlayback = null;
  reactionHandles.forEach(window.clearTimeout);
  reactionHandles = [];
}

function replayCharacterReaction() {
  const stage = document.querySelector("#character-reaction");
  const result = lastMessage?.result;
  if (!stage || !result?.replay) return;
  document.querySelector("#deployment-replay")?.classList.remove("deployment-replay--active");
  stage.classList.remove("reaction-stage--hidden");
  stage.dataset.phase = "notice";
  playHitSequence(result.recipe?.sauces ?? [], result.replay);
  stage.scrollIntoView({ behavior: "smooth", block: "center" });
}
```

Call `playHitSequence(sauces, replay)` after the finished screen renders. Wire `replay-reaction` to `replayCharacterReaction()`. Wire `skip-effect` to cancel playback and reveal the deployment replay. Remove `applyReactionClasses` and the brave-face handler because both depend on the deleted static face.

- [ ] **Step 6: Delete obsolete `.cartoon-face`, `.face__*`, and old reaction-specific CSS**

Keep `.reaction-caption`, `.victim-label`, `.reaction-stage--hidden`, `.deployment-replay`, and result-card layout because the new stage still uses them. Remove rules whose selectors start with `.cartoon-face`, `.face__`, `.reaction--chili .cartoon-face`, `.reaction--mustard .face__`, `.reaction--sour .cartoon-face`, or `.reaction--sticky .cartoon-face`.

- [ ] **Step 7: Re-run focused and full pytest suites**

```powershell
python -m pytest tests/test_app.py -q
python -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 8: Commit finished-round integration**

```powershell
git add app/static/app.js app/static/styles.css tests/test_app.py
git commit -m "feat: play articulated eating reaction after a hit"
```

### Task 6: Add Bite, Fire, and Haptic Feedback

**Files:**
- Create: `app/static/reaction-feedback.js`
- Modify: `app/static/character-reaction.mjs`
- Modify: `app/static/app.js`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Add a failing feedback contract test**

```python
def test_reaction_feedback_is_optional_and_phase_driven() -> None:
    script = client.get("/static/reaction-feedback.js")

    assert script.status_code == 200
    for marker in ("primeReactionAudio", "handleReactionFeedback", 'phase === "bite"', 'phase === "burst"', "navigator.vibrate"):
        assert marker in script.text
```

- [ ] **Step 2: Run the focused test and verify a 404**

```powershell
python -m pytest tests/test_app.py::test_reaction_feedback_is_optional_and_phase_driven -q
```

- [ ] **Step 3: Implement optional procedural feedback with silent fallback**

```javascript
let audioContext = null;

export function primeReactionAudio() {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ??= new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
}

function tone({ frequency, duration, type = "sine", gain = 0.04 }) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  volume.gain.setValueAtTime(gain, audioContext.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(volume).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

export function handleReactionFeedback(phase, plan) {
  if (phase === "bite") {
    tone({ frequency: 210, duration: 0.08, type: "square", gain: 0.025 });
    navigator.vibrate?.(22);
  }
  if (phase === "burst" && plan?.primary === "chili") {
    tone({ frequency: 95, duration: 0.58, type: "sawtooth", gain: 0.035 });
    navigator.vibrate?.([35, 30, 45]);
  }
}
```

- [ ] **Step 4: Prime audio from an existing user gesture and pass the handler to playback**

Import both functions in `app.js`. Call `primeReactionAudio()` at the start of the existing `app` click handler, before action dispatch, so later WebSocket-driven reveal events may play audio. Replace the Task 5 no-op `onPhase: () => {}` callback with `onPhase: handleReactionFeedback`.

- [ ] **Step 5: Run the focused and full tests**

Expected: all pytest and Node tests pass; unsupported audio or vibration APIs remain silent and do not throw.

- [ ] **Step 6: Commit feedback**

```powershell
git add app/static/reaction-feedback.js app/static/character-reaction.mjs app/static/app.js tests/test_app.py
git commit -m "feat: add bite and fire reaction feedback"
```

### Task 7: Remove the Accidental Witch-Locked Character Theme

**Files:**
- Replace: `app/static/art/shared-table.png`
- Replace: `app/static/art/deployment-counter.png`
- Modify: `app/protocol.py`
- Modify: `app/static/app.js`
- Modify: `app/static/index.html`
- Modify: `tests/test_app.py`
- Modify: `tests/test_protocol.py`
- Modify: `README.md`

- [ ] **Step 1: Add failing neutral-character identity tests**

Change the protocol expectation and add client assertions:

```python
# tests/test_protocol.py
assert bot["name"] == "电脑吃货"

# tests/test_app.py
def test_mode_name_does_not_force_witch_characters() -> None:
    page = client.get("/").text
    script = client.get("/static/app.js").text

    assert "女巫的毒药" in page
    assert "电脑吃货" in script
    assert "电脑女巫" not in script
    assert "两名女巫" not in script
    assert "卡通写实女巫" not in script
```

- [ ] **Step 2: Run the focused tests and verify failure**

```powershell
python -m pytest tests/test_protocol.py tests/test_app.py::test_mode_name_does_not_force_witch_characters -q
```

Expected: FAIL on the old `电脑女巫` identity and witch-specific scene labels.

- [ ] **Step 3: Change only the character identity while preserving the mode name**

In both computer-player branches in `app/protocol.py`, return `电脑吃货`. In `app.js` and `index.html`, use `🎮` for the practice button icon, `电脑吃货` for the opponent name, and neutral scene labels:

```javascript
const name = isMe ? "你" : player.computer ? (player.name ?? "电脑吃货") : "对手";
```

Use `休闲零食操作台` and `两名玩家面对面观察公共零食` for the two scene `aria-label` values. Keep `女巫的毒药` as the visible name of this particular game mode.

- [ ] **Step 4: Generate two replacement scene assets using these exact art constraints**

Generate a vertical 9:16 polished 2.5D casual-game scene for each existing path. Both must use ordinary contemporary young adults in hoodies, T-shirts, or casual jackets, a warm modern snack bar, believable food materials, playful competitive body language, and generous clear center space for live HTML controls. Exclude pointed hats, robes, potion bottles, cauldrons, magic smoke, spell particles, gothic interiors, text, logos, and watermarks.

For `shared-table.png`, show two ordinary players on opposite sides of one shared round snack table with sandwiches, burgers, cookies, donuts, fries, and jelly. For `deployment-counter.png`, use a first-person preparation view with two ordinary bare hands opening a burger and dragging visible sauces between its layers; the opponent area above the counter remains visually obscured by a normal privacy screen rather than magic.

Inspect both generated assets before replacing the existing files. Preserve the exact PNG dimensions or update background positioning only after testing at 390×844. Do not alter the six already-cropped food PNGs during this task.

- [ ] **Step 5: Re-run protocol and client tests**

```powershell
python -m pytest tests/test_protocol.py tests/test_app.py -q
```

Expected: PASS with `女巫的毒药` still present as the mode name and no forced witch character identity.

- [ ] **Step 6: Commit the neutral character direction**

```powershell
git add app/protocol.py app/static/app.js app/static/index.html app/static/art/shared-table.png app/static/art/deployment-counter.png tests/test_protocol.py tests/test_app.py README.md
git commit -m "feat: make mode characters theme neutral"
```

### Task 8: Mobile Visual QA and Playtest Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run all automated tests**

```powershell
python -m pytest -q
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/reaction-model.test.mjs
```

Expected: pytest and Node suites both pass with zero failures.

- [ ] **Step 2: Start the local server**

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Expected: `Uvicorn running on http://127.0.0.1:8000`.

- [ ] **Step 3: Verify the complete practice flow at 390×844**

Use Playwright CLI at a 390×844 viewport and perform this exact sequence:

1. Open `http://127.0.0.1:8000` and choose `单人练习`.
2. Select the hamburger tile labeled `汉堡`.
3. Open it, drag at least one chili sauce into it, and finish deployment.
4. Complete turns until the poisoned hamburger is eaten.
5. Confirm the character's hand reaches the burger, the burger travels with the hand, the bite mark appears once, fire originates at the mouth, the torso recoils, and both hands fan the mouth.
6. Press `再看一次吃掉反应` and confirm the sequence restarts from the intact-food pose without duplicating timers.
7. Press the skip control during replay and confirm the result card is usable immediately.

- [ ] **Step 4: Inspect performance and accessibility**

Confirm there are no console errors, no horizontal overflow, no fire or food clipping outside the visible stage, and no controls below 44×44 CSS pixels. In DevTools, enable reduced motion and confirm the stage reaches a readable settled frame without long looping animations.

- [ ] **Step 5: Document the sample in README**

Add this section:

```markdown
### 角色进食反应样片

单人练习中，角色会在陷阱揭晓时完整执行拿取、咬合、咀嚼、停顿和配料反应。首条完成的反应是辣味喷火：火焰从嘴部锚点出现，人物后仰并在结束后扇嘴恢复。结果页可重复播放该动作；低动态偏好会自动缩短动画。
```

- [ ] **Step 6: Re-run final verification and commit documentation**

```powershell
python -m pytest -q
& 'C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/reaction-model.test.mjs
git add README.md
git commit -m "docs: add character reaction playtest guide"
```

Expected: all automated tests pass and `git status --short` is empty.
