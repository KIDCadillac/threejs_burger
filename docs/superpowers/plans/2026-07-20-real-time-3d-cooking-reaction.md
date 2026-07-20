# Real-Time 3D Cooking Reaction Implementation Plan

> **Priority update (2026-07-20):** The reusable single-player cooking simulator is the main product mode. Build and validate the cooking workbench, spatial ingredient bins, real 3D food assembly, direct touch manipulation, condiment pouring, recipe flow, and tutorial before integrating poison, competitive, reveal, or character-reaction modes. The hamburger is the first recipe used to prove the framework, not a hard-coded product boundary. Use the latest sushi/cooking-simulator reference for spatial logic: central preparation surface with ingredients and tools arranged around it for direct pickup.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the picture/SVG deployment and reveal flow with a mobile-first real-time 3D hamburger preparation scene and a real-time 3D character that grabs, bites, reacts, and breathes fire, then expose the playable build through a temporary public HTTPS URL.

**Architecture:** Keep the existing FastAPI/WebSocket room and turn lifecycle. Add a vendored Three.js rendering layer with small focused modules for scene lifecycle, burger state/model, condiment strokes, touch interaction, character rig, and reaction direction; extend the existing recipe payload with a strictly validated compact composition summary so private deployment and public reveal remain authoritative.

**Tech Stack:** Python 3.12, FastAPI, pytest, vanilla ES modules, Three.js 0.185.1/WebGL 2, Node built-in test runner, Playwright browser QA, Cloudflare Quick Tunnel over HTTP/2.

---

## Scope and file map

New runtime modules:

- `app/static/vendor/three.module.min.js`: pinned Three.js 0.185.1 browser module.
- `app/static/vendor/three.LICENSE.txt`: upstream MIT license.
- `app/static/cooking-state.mjs`: pure immutable burger layer and sauce-stroke state.
- `app/static/three-scene-host.mjs`: WebGL canvas, camera, lights, resize, visibility, context-loss, and disposal lifecycle.
- `app/static/burger-model-3d.mjs`: seven-layer procedural hamburger and sauce meshes.
- `app/static/cooking-interaction-controller.mjs`: pointer hit testing, orbit, pinch, layer drag, snapping, and condiment drawing.
- `app/static/cooking-deployment-stage.mjs`: deployment scene coordinator and public API consumed by `app.js`.
- `app/static/character-rig-3d.mjs`: hierarchical ordinary-person rig and face controls.
- `app/static/reaction-effects-3d.mjs`: mesh/particle fire, tears, heat, and crumbs without textures.
- `app/static/reaction-director-3d.mjs`: deterministic grab, bite, suspense, burst, and recovery timeline.
- `app/recipe_data.py`: strict parsing and serialization for burger compositions.
- `app/security.py`: security headers and lightweight public-test connection/message throttling.
- `scripts/start-remote-test.ps1`: loopback Uvicorn plus an HTTPS tunnel using Cloudflare HTTP/2.

Existing integration points:

- `app/static/app.js`: mount/unmount the 3D deployment and reveal stages and send the composition payload.
- `app/static/finished-reaction-flow.mjs`: own the new 3D reaction playback object.
- `app/static/reaction-model.mjs`: expose the ten approved reaction phases.
- `app/static/index.html`: remove the old character stylesheet and add the 3D viewport metadata/hook.
- `app/static/styles.css`: mobile 3D stage shell, loading, error, controls, and focus styles; remove picture-backed deployment styling.
- `app/domain.py`, `app/service.py`, `app/main.py`, `app/protocol.py`, `app/bot.py`: accept, retain, hide, reveal, and replay validated composition data.

Test command variables for Windows PowerShell:

```powershell
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$pythonExe = 'python'
```

### Task 1: Pin and serve the real-time 3D engine

**Files:**
- Create: `app/static/vendor/three.module.min.js`
- Create: `app/static/vendor/three.LICENSE.txt`
- Create: `tests/three-vendor.test.mjs`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Write the failing vendor tests**

```js
// tests/three-vendor.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";

test("vendored Three.js is pinned to r185 and exposes WebGL primitives", () => {
  assert.equal(THREE.REVISION, "185");
  assert.equal(typeof THREE.WebGLRenderer, "function");
  assert.equal(typeof THREE.Raycaster, "function");
  assert.equal(typeof THREE.MeshPhysicalMaterial, "function");
});
```

Add to `tests/test_app.py`:

```python
def test_vendored_three_module_and_license_are_served_locally() -> None:
    module = client.get("/static/vendor/three.module.min.js")
    license_text = client.get("/static/vendor/three.LICENSE.txt")
    assert module.status_code == 200
    assert len(module.content) > 500_000
    assert b"cdn" not in module.content.lower()
    assert license_text.status_code == 200
    assert "MIT License" in license_text.text
```

- [ ] **Step 2: Run the tests and verify the missing dependency failure**

Run:

```powershell
& $nodeExe --test tests/three-vendor.test.mjs
python -m pytest tests/test_app.py::test_vendored_three_module_and_license_are_served_locally -q
```

Expected: Node reports `ERR_MODULE_NOT_FOUND`; pytest receives `404`.

- [ ] **Step 3: Vendor the pinned official package files**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'app/static/vendor' | Out-Null
Invoke-WebRequest 'https://unpkg.com/three@0.185.1/build/three.module.min.js' -OutFile 'app/static/vendor/three.module.min.js'
Invoke-WebRequest 'https://unpkg.com/three@0.185.1/LICENSE' -OutFile 'app/static/vendor/three.LICENSE.txt'
```

Do not edit the upstream minified module. Keep the version pinned in both URLs.

- [ ] **Step 4: Re-run the focused tests**

Run the Step 2 commands.

Expected: both commands pass and the Node assertion reports revision `185`.

- [ ] **Step 5: Commit**

```powershell
git add app/static/vendor tests/three-vendor.test.mjs tests/test_app.py
git commit -m "build: vendor pinned three.js runtime"
```

### Task 2: Define deterministic burger composition state

**Files:**
- Create: `app/static/cooking-state.mjs`
- Create: `tests/cooking-state.test.mjs`

- [ ] **Step 1: Write failing tests for layers, movement, strokes, and serialization**

```js
// tests/cooking-state.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  BURGER_LAYER_IDS,
  addSauceStroke,
  createCookingState,
  moveLayer,
  reorderLayer,
  serializeComposition,
} from "../app/static/cooking-state.mjs";

test("hamburger starts as seven independent ordered 3D layers", () => {
  const state = createCookingState();
  assert.deepEqual(BURGER_LAYER_IDS, [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun",
  ]);
  assert.equal(state.layers.length, 7);
  assert.equal(new Set(state.layers.map(({ id }) => id)).size, 7);
});

test("moving one layer never mutates another layer", () => {
  const initial = createCookingState();
  const moved = moveLayer(initial, "top-bun", { x: 0.7, z: -0.3, yaw: 0.4 });
  assert.notEqual(moved, initial);
  assert.deepEqual(initial.layers.at(-1).pose, { x: 0, z: 0, yaw: 0 });
  assert.deepEqual(moved.layers.at(-1).pose, { x: 0.7, z: -0.3, yaw: 0.4 });
});

test("a dropped layer can be inserted at a new stack position", () => {
  const state = reorderLayer(createCookingState(), "cheese", 5);
  assert.deepEqual(state.layers.sort((a, b) => a.order - b.order).map(({ id }) => id), [
    "bottom-bun", "patty", "tomato", "lettuce", "pickle", "cheese", "top-bun",
  ]);
});

test("repeated and mixed condiment strokes are preserved on selected layers", () => {
  let state = createCookingState();
  state = addSauceStroke(state, {
    sauce: "chili", layerId: "patty", amount: 0.6,
    points: [[-0.5, 0], [0, 0.25], [0.5, 0]],
  });
  state = addSauceStroke(state, {
    sauce: "chili", layerId: "patty", amount: 0.4,
    points: [[-0.2, -0.3], [0.3, 0.3]],
  });
  state = addSauceStroke(state, {
    sauce: "mustard", layerId: "cheese", amount: 0.3,
    points: [[-0.4, 0], [0.4, 0]],
  });
  const payload = serializeComposition(state);
  assert.deepEqual(payload.strokes.map(({ sauce }) => sauce), ["chili", "chili", "mustard"]);
  assert.equal(payload.layerOrder.length, 7);
});

test("network safety bounds stroke count and point count without a two-sauce UI cap", () => {
  let state = createCookingState();
  for (let index = 0; index < 70; index += 1) {
    state = addSauceStroke(state, {
      sauce: index % 2 ? "chili" : "sour",
      layerId: "patty",
      amount: 0.1,
      points: Array.from({ length: 30 }, (_, point) => [point / 29, 0]),
    });
  }
  const payload = serializeComposition(state);
  assert.equal(payload.strokes.length, 64);
  assert.ok(payload.strokes.every(({ points }) => points.length <= 24));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `& $nodeExe --test tests/cooking-state.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `cooking-state.mjs`.

- [ ] **Step 3: Implement the pure state module**

```js
// app/static/cooking-state.mjs
export const BURGER_LAYER_IDS = Object.freeze([
  "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun",
]);
export const SAUCE_KEYS = Object.freeze(["chili", "mustard", "sour", "sticky"]);
const MAX_STROKES = 64;
const MAX_POINTS = 24;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const copyState = (state) => ({
  ...state,
  layers: state.layers.map((layer) => ({ ...layer, pose: { ...layer.pose } })),
  strokes: state.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point]) })),
});

export function createCookingState() {
  return {
    food: "burger",
    expanded: false,
    layers: BURGER_LAYER_IDS.map((id, order) => ({ id, order, pose: { x: 0, z: 0, yaw: 0 } })),
    strokes: [],
  };
}

export function moveLayer(state, layerId, pose) {
  if (!BURGER_LAYER_IDS.includes(layerId)) throw new TypeError("未知汉堡夹层");
  const next = copyState(state);
  const layer = next.layers.find(({ id }) => id === layerId);
  layer.pose = {
    x: clamp(pose.x, -1, 1),
    z: clamp(pose.z, -1, 1),
    yaw: clamp(pose.yaw, -Math.PI, Math.PI),
  };
  return next;
}

export function reorderLayer(state, layerId, targetIndex) {
  if (!BURGER_LAYER_IDS.includes(layerId)) throw new TypeError("未知汉堡夹层");
  const ordered = [...state.layers].sort((a, b) => a.order - b.order);
  const sourceIndex = ordered.findIndex(({ id }) => id === layerId);
  const [layer] = ordered.splice(sourceIndex, 1);
  ordered.splice(Math.round(clamp(targetIndex, 0, ordered.length)), 0, layer);
  const next = copyState(state);
  next.layers = ordered.map((item, order) => ({ ...item, order, pose: { ...item.pose } }));
  return next;
}

export function addSauceStroke(state, stroke) {
  if (!SAUCE_KEYS.includes(stroke.sauce)) throw new TypeError("未知调料");
  if (!BURGER_LAYER_IDS.includes(stroke.layerId)) throw new TypeError("未知汉堡夹层");
  const next = copyState(state);
  next.strokes.push({
    sauce: stroke.sauce,
    layerId: stroke.layerId,
    amount: clamp(stroke.amount, 0.01, 1),
    points: stroke.points.slice(0, MAX_POINTS).map(([x, z]) => [clamp(x, -1, 1), clamp(z, -1, 1)]),
  });
  next.strokes = next.strokes.slice(-MAX_STROKES);
  return next;
}

export function serializeComposition(state) {
  return {
    food: "burger",
    layerOrder: [...state.layers].sort((a, b) => a.order - b.order).map(({ id }) => id),
    layerPoses: Object.fromEntries(state.layers.map(({ id, pose }) => [id, { ...pose }])),
    strokes: state.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point]) })),
  };
}
```

- [ ] **Step 4: Run the focused test and commit**

Run: `& $nodeExe --test tests/cooking-state.test.mjs`

Expected: 4 passing tests.

```powershell
git add app/static/cooking-state.mjs tests/cooking-state.test.mjs
git commit -m "feat: model layered burger composition"
```

### Task 3: Validate and preserve 3D composition on the server

**Files:**
- Create: `app/recipe_data.py`
- Create: `tests/test_recipe_data.py`
- Modify: `app/domain.py`
- Modify: `app/service.py`
- Modify: `app/main.py`
- Modify: `app/protocol.py`
- Modify: `app/bot.py`
- Modify: `tests/test_domain.py`
- Modify: `tests/test_protocol.py`
- Modify: `tests/test_service.py`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Write failing parser and privacy tests**

```python
# tests/test_recipe_data.py
import pytest
from app.recipe_data import BURGER_LAYERS, parse_composition


def valid_payload() -> dict:
    return {
        "food": "burger",
        "layerOrder": list(BURGER_LAYERS),
        "layerPoses": {layer: {"x": 0, "z": 0, "yaw": 0} for layer in BURGER_LAYERS},
        "strokes": [{
            "sauce": "chili", "layerId": "patty", "amount": 0.6,
            "points": [[-0.5, 0], [0, 0.25], [0.5, 0]],
        }],
    }


def test_parser_accepts_repeated_mixed_strokes_and_round_trips() -> None:
    payload = valid_payload()
    payload["layerOrder"] = [
        "bottom-bun", "patty", "tomato", "lettuce", "pickle", "cheese", "top-bun"
    ]
    payload["strokes"] *= 3
    parsed = parse_composition(payload)
    assert parsed.to_payload() == payload


@pytest.mark.parametrize("mutation", [
    lambda data: data.update(food="cookie"),
    lambda data: data.update(layerOrder=["top-bun"]),
    lambda data: data["strokes"][0].update(sauce="unknown"),
    lambda data: data["strokes"][0].update(layerId="table"),
    lambda data: data["strokes"][0].update(points=[[2, 0]]),
])
def test_parser_rejects_forged_composition(mutation) -> None:
    payload = valid_payload()
    mutation(payload)
    with pytest.raises(ValueError):
        parse_composition(payload)
```

Add a protocol test that locks recipes for both players, then asserts `composition` is visible only in the owner's `private` view while mixing and appears in both viewers' `result.replay` only after a poison hit.

- [ ] **Step 2: Run and verify failure**

Run: `python -m pytest tests/test_recipe_data.py tests/test_protocol.py -q`

Expected: import failure for `app.recipe_data` and missing composition keys.

- [ ] **Step 3: Implement strict immutable recipe data**

```python
# app/recipe_data.py
from __future__ import annotations
from dataclasses import dataclass
from math import isfinite
from typing import Any

BURGER_LAYERS = (
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun"
)
SAUCES = frozenset({"chili", "mustard", "sour", "sticky"})
MAX_STROKES = 64
MAX_POINTS = 24


def _number(value: Any, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("三维配方包含无效数字")
    number = float(value)
    if not isfinite(number) or not minimum <= number <= maximum:
        raise ValueError("三维配方数字超出范围")
    return number


@dataclass(frozen=True, slots=True)
class SauceStroke:
    sauce: str
    layer_id: str
    amount: float
    points: tuple[tuple[float, float], ...]

    def to_payload(self) -> dict[str, Any]:
        return {"sauce": self.sauce, "layerId": self.layer_id, "amount": self.amount,
                "points": [list(point) for point in self.points]}


@dataclass(frozen=True, slots=True)
class BurgerComposition:
    layer_order: tuple[str, ...]
    layer_poses: tuple[tuple[str, float, float, float], ...]
    strokes: tuple[SauceStroke, ...]

    def to_payload(self) -> dict[str, Any]:
        return {
            "food": "burger",
            "layerOrder": list(self.layer_order),
            "layerPoses": {key: {"x": x, "z": z, "yaw": yaw}
                           for key, x, z, yaw in self.layer_poses},
            "strokes": [stroke.to_payload() for stroke in self.strokes],
        }


def parse_composition(payload: Any) -> BurgerComposition:
    if not isinstance(payload, dict) or payload.get("food") != "burger":
        raise ValueError("三维配方食物无效")
    order = payload.get("layerOrder")
    if (not isinstance(order, list) or len(order) != len(BURGER_LAYERS)
            or set(order) != set(BURGER_LAYERS)):
        raise ValueError("汉堡夹层顺序无效")
    poses = payload.get("layerPoses")
    if not isinstance(poses, dict) or set(poses) != set(BURGER_LAYERS):
        raise ValueError("汉堡夹层位置无效")
    parsed_poses = []
    for layer in BURGER_LAYERS:
        pose = poses[layer]
        if not isinstance(pose, dict):
            raise ValueError("汉堡夹层位置无效")
        parsed_poses.append((layer, _number(pose.get("x"), -1, 1),
                             _number(pose.get("z"), -1, 1),
                             _number(pose.get("yaw"), -3.1416, 3.1416)))
    strokes_payload = payload.get("strokes")
    if not isinstance(strokes_payload, list) or not 1 <= len(strokes_payload) <= MAX_STROKES:
        raise ValueError("至少添加一条且最多保留 64 条调料轨迹")
    strokes = []
    for item in strokes_payload:
        if not isinstance(item, dict) or item.get("sauce") not in SAUCES:
            raise ValueError("调料类型无效")
        if item.get("layerId") not in BURGER_LAYERS:
            raise ValueError("调料夹层无效")
        points = item.get("points")
        if not isinstance(points, list) or not 2 <= len(points) <= MAX_POINTS:
            raise ValueError("调料轨迹点数无效")
        parsed_points = tuple((_number(point[0], -1, 1), _number(point[1], -1, 1))
                              for point in points if isinstance(point, list) and len(point) == 2)
        if len(parsed_points) != len(points):
            raise ValueError("调料轨迹坐标无效")
        strokes.append(SauceStroke(item["sauce"], item["layerId"],
                                   _number(item.get("amount"), 0.01, 1), parsed_points))
    return BurgerComposition(tuple(order), tuple(parsed_poses), tuple(strokes))
```

Add a deterministic bot helper to `app/recipe_data.py`:

```python
def composition_for_sauces(sauces: tuple[str, ...]) -> BurgerComposition:
    strokes = tuple(
        SauceStroke(sauce, "patty", 0.35, ((-0.45, index * 0.08), (0.45, index * 0.08)))
        for index, sauce in enumerate(sauces)
    )
    poses = tuple((layer, 0.0, 0.0, 0.0) for layer in BURGER_LAYERS)
    return BurgerComposition(BURGER_LAYERS, poses, strokes)
```

Replace `Recipe` and `GameState.lock_recipe` in `app/domain.py` with a composition-owned contract:

```python
from app.recipe_data import BurgerComposition


@dataclass(frozen=True, slots=True)
class Recipe:
    position: int
    composition: BurgerComposition

    @property
    def sauces(self) -> tuple[str, ...]:
        return tuple(stroke.sauce for stroke in self.composition.strokes)


def lock_recipe(
    self, player_id: str, position: int, composition: BurgerComposition
) -> None:
    if self.phase is not Phase.MIXING:
        raise RuleError("当前不能调制食物")
    player = self._player(player_id)
    if player.recipe is not None:
        raise RuleError("你的配方已经封装")
    if position not in range(FRY_COUNT):
        raise RuleError("食物位置无效")
    if self.snacks[position] != "burger":
        raise RuleError("首个三维版本请选择汉堡")
    player.recipe = Recipe(position=position, composition=composition)
    player.poison_active = True
    if all(candidate.recipe is not None for candidate in self.players.values()):
        self.phase = Phase.TURN
        self.current_player = self.first_player
```

Add one `burger` slot to each half of every `SNACK_LAYOUTS` tuple, add `burger` to `app/static/effects.js`, and update the bot to choose only positions whose snack kind is `burger`. In `app/main.py`, parse the only authoritative composition field:

```python
if kind == "recipe.lock":
    position = payload.get("position")
    if not isinstance(position, int):
        raise ProtocolError("请选择一件食物")
    try:
        composition = parse_composition(payload.get("composition"))
    except ValueError as error:
        raise ProtocolError(str(error)) from error
    room = service.lock_recipe(player_id, position, composition)
    await hub.broadcast_room(room)
    return
```

Change `GameService.lock_recipe` to accept `BurgerComposition` and pass it unchanged to `game.lock_recipe`. During bot `deploy-lock`, call `composition_for_sauces(policy.choose_sauces(...))`. Serialize `sauces` from `recipe.sauces` for existing reaction scoring, serialize `composition: recipe.composition.to_payload()` only inside the owner's `private` object, and reveal the same composition inside `result.recipe` and `result.replay` only after `Phase.FINISHED`. Do not serialize an opponent's composition while mixing or during turns.

- [ ] **Step 4: Run all Python tests**

Run: `python -m pytest -q`

Expected: all Python tests pass, including forged payload rejection and privacy assertions.

- [ ] **Step 5: Commit**

```powershell
git add app/recipe_data.py app/domain.py app/service.py app/main.py app/protocol.py app/bot.py tests
git commit -m "feat: validate 3d burger recipes"
```

### Task 4: Build a reusable WebGL scene lifecycle

**Files:**
- Create: `app/static/three-scene-host.mjs`
- Create: `tests/three-scene-host.test.mjs`
- Modify: `app/static/styles.css`

- [ ] **Step 1: Write failing lifecycle tests with injected fakes**

```js
// tests/three-scene-host.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createThreeSceneHost } from "../app/static/three-scene-host.mjs";

test("scene host starts once, pauses while hidden, and disposes once", () => {
  const calls = [];
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const host = createThreeSceneHost({
    canvas,
    rendererFactory: () => ({
      domElement: canvas,
      setPixelRatio: (value) => calls.push(["ratio", value]),
      setSize: (...args) => calls.push(["size", ...args]),
      render: () => calls.push(["render"]),
      setAnimationLoop: (callback) => calls.push(["loop", Boolean(callback)]),
      dispose: () => calls.push(["dispose"]),
    }),
    viewport: () => ({ width: 390, height: 520, pixelRatio: 3 }),
  });
  host.start();
  host.setVisible(false);
  host.dispose();
  host.dispose();
  assert.deepEqual(calls.filter(([name]) => name === "ratio"), [["ratio", 2]]);
  assert.equal(calls.filter(([name]) => name === "dispose").length, 1);
});
```

- [ ] **Step 2: Run and verify missing-module failure**

Run: `& $nodeExe --test tests/three-scene-host.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the lifecycle host**

Export `createThreeSceneHost({canvas, rendererFactory, viewport})`. Construct a `THREE.Scene`, `PerspectiveCamera`, warm `HemisphereLight`, key `DirectionalLight`, and transparent-antialiased `WebGLRenderer`; cap pixel ratio at `2`, use `setAnimationLoop`, stop the loop while `document.hidden`, handle `webglcontextlost`/`webglcontextrestored`, resize from the canvas bounding box, and traverse/dispose every geometry and material exactly once. The returned interface must be:

```js
{
  scene, camera, renderer,
  start(), resize(), setVisible(visible), onFrame(callback),
  onContextError(callback), dispose(),
}
```

Add `.three-stage`, `.three-stage__canvas`, `.three-stage__loading`, and `.three-stage__error` rules with a portrait minimum height of `28rem`, `touch-action:none` only on the canvas, and visible keyboard focus.

- [ ] **Step 4: Run the focused test and commit**

```powershell
& $nodeExe --test tests/three-scene-host.test.mjs
git add app/static/three-scene-host.mjs app/static/styles.css tests/three-scene-host.test.mjs
git commit -m "feat: add mobile webgl scene host"
```

### Task 5: Create the seven-layer 3D hamburger and visible sauce meshes

**Files:**
- Create: `app/static/burger-model-3d.mjs`
- Create: `tests/burger-model-3d.test.mjs`

- [ ] **Step 1: Write failing structural and behavior tests**

```js
// tests/burger-model-3d.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { createBurgerModel3D } from "../app/static/burger-model-3d.mjs";

test("burger exposes seven independently movable named layer groups", () => {
  const burger = createBurgerModel3D(THREE);
  assert.equal(burger.layers.size, 7);
  assert.ok([...burger.layers.values()].every((layer) => layer.isGroup));
  burger.setExpanded(true);
  assert.ok(burger.layers.get("top-bun").position.y > burger.layers.get("pickle").position.y);
});

test("sauce stroke becomes a real mesh attached to the requested layer", () => {
  const burger = createBurgerModel3D(THREE);
  const mesh = burger.addSauceStroke({
    sauce: "chili", layerId: "patty", amount: 0.5,
    points: [[-0.5, 0], [0, 0.2], [0.5, 0]],
  });
  assert.equal(mesh.isMesh, true);
  assert.equal(mesh.parent, burger.layers.get("patty"));
  assert.equal(mesh.material.map, null);
});

test("bite deforms the food model without swapping an image", () => {
  const burger = createBurgerModel3D(THREE);
  burger.setBiteAmount(1);
  assert.equal(burger.root.userData.biteAmount, 1);
  assert.ok(burger.root.scale.x < 1);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `& $nodeExe --test tests/burger-model-3d.test.mjs`

Expected: missing module.

- [ ] **Step 3: Implement procedural food geometry**

Use only Three.js geometry and materials:

- Buns: `LatheGeometry` from rounded profiles, toasted `MeshPhysicalMaterial`, seeded sesame `CapsuleGeometry` instances.
- Patty: low-segment `CylinderGeometry` with deterministic radial vertex displacement.
- Cheese: custom `BufferGeometry` with four drooping corners.
- Tomato and pickle: thin `CylinderGeometry` slices.
- Lettuce: wavy ring `BufferGeometry` with alternating radii.
- Sauce: `CatmullRomCurve3` plus `TubeGeometry`, mapped from normalized stroke points onto the target layer surface.

Export:

```js
createBurgerModel3D(THREE) => {
  root, layers,
  setExpanded(expanded),
  setLayerPose(layerId, pose),
  snapLayer(layerId),
  addSauceStroke(stroke),
  clearSauces(),
  setBiteAmount(amount),
  dispose(),
}
```

All materials must have `map === null`; the visual result must come from geometry, color, roughness, metalness, lighting, and shadows.

- [ ] **Step 4: Run and commit**

```powershell
& $nodeExe --test tests/burger-model-3d.test.mjs
git add app/static/burger-model-3d.mjs tests/burger-model-3d.test.mjs
git commit -m "feat: build layered 3d hamburger"
```

### Task 6: Add touch manipulation and three-dimensional condiment tools

**Files:**
- Create: `app/static/cooking-interaction-controller.mjs`
- Create: `tests/cooking-interaction-controller.test.mjs`

- [ ] **Step 1: Write failing pointer-state tests**

```js
// tests/cooking-interaction-controller.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createCookingInteractionController } from "../app/static/cooking-interaction-controller.mjs";

test("dragging a layer captures, moves, drops, and snaps it", () => {
  const events = [];
  const controller = createCookingInteractionController({
    hitTest: () => ({ kind: "layer", id: "top-bun" }),
    projectToWorkbench: ({ x, y }) => ({ x: x / 100, z: y / 100 }),
    onLayerMove: (id, pose) => events.push(["move", id, pose]),
    onLayerDrop: (id) => events.push(["drop", id]),
  });
  controller.pointerDown({ pointerId: 1, x: 20, y: 30 });
  controller.pointerMove({ pointerId: 1, x: 40, y: 50 });
  controller.pointerUp({ pointerId: 1, x: 40, y: 50 });
  assert.equal(events[0][0], "move");
  assert.deepEqual(events.at(-1), ["drop", "top-bun"]);
});

test("condiment drag samples a stroke on one target layer", () => {
  const strokes = [];
  const controller = createCookingInteractionController({
    hitTest: ({ x }) => x < 20 ? { kind: "bottle", sauce: "chili" } : { kind: "layer", id: "patty" },
    projectToLayer: ({ x, y }) => [x / 100, y / 100],
    onSauceStroke: (stroke) => strokes.push(stroke),
  });
  controller.pointerDown({ pointerId: 2, x: 10, y: 20 });
  controller.pointerMove({ pointerId: 2, x: 30, y: 30 });
  controller.pointerMove({ pointerId: 2, x: 60, y: 40 });
  controller.pointerUp({ pointerId: 2, x: 70, y: 45 });
  assert.equal(strokes[0].sauce, "chili");
  assert.equal(strokes[0].layerId, "patty");
  assert.ok(strokes[0].points.length >= 2);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `& $nodeExe --test tests/cooking-interaction-controller.test.mjs`

Expected: missing module.

- [ ] **Step 3: Implement the gesture state machine**

Implement explicit states `idle`, `orbiting`, `dragging-layer`, `dragging-bottle`, and `pinching`. Use pointer capture; begin orbit only when hit testing returns no interactive mesh; use two active pointers for pinch distance; constrain layer projection to the workbench; sample sauce points only after 0.04 normalized movement; finish a stroke only when at least two points hit the same layer. Return `{pointerDown, pointerMove, pointerUp, pointerCancel, resetCamera, dispose}` and guarantee `dispose()` releases pointer capture and DOM listeners.

Create each condiment bottle from cylinder/cap/nozzle meshes. During a valid stroke tilt the bottle toward the target, show a thin live `TubeGeometry`, and call `navigator.vibrate?.(12)` only after user interaction.

- [ ] **Step 4: Run and commit**

```powershell
& $nodeExe --test tests/cooking-interaction-controller.test.mjs
git add app/static/cooking-interaction-controller.mjs tests/cooking-interaction-controller.test.mjs
git commit -m "feat: add touch 3d cooking controls"
```

### Task 7: Mount the playable 3D deployment stage

**Files:**
- Create: `app/static/cooking-deployment-stage.mjs`
- Create: `tests/cooking-deployment-stage.test.mjs`
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Modify: `tests/test_app.py`
- Remove: `app/static/art/deployment-counter.webp`

- [ ] **Step 1: Write failing coordinator and integration tests**

```js
// tests/cooking-deployment-stage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createCookingDeploymentStage } from "../app/static/cooking-deployment-stage.mjs";

test("stage emits a serializable composition only after sauce is added", () => {
  const changes = [];
  const stage = createCookingDeploymentStage({
    root: { querySelector: () => ({}) },
    hostFactory: () => ({ start() {}, dispose() {} }),
    modelFactory: () => ({ root: {}, dispose() {} }),
    interactionFactory: ({ onSauceStroke }) => ({
      addTestStroke: () => onSauceStroke({
        sauce: "chili", layerId: "patty", amount: 0.5,
        points: [[-0.5, 0], [0.5, 0]],
      }),
      dispose() {},
    }),
    onChange: (value) => changes.push(value),
  });
  assert.equal(stage.canConfirm(), false);
  stage.interaction.addTestStroke();
  assert.equal(stage.canConfirm(), true);
  assert.equal(changes.at(-1).strokes[0].layerId, "patty");
  stage.dispose();
});
```

Update `tests/test_app.py` to assert:

```python
def test_mixing_uses_webgl_deployment_instead_of_picture_or_svg_food() -> None:
    script = client.get("/static/app.js").text
    styles = client.get("/static/styles.css").text
    assert 'from "/static/cooking-deployment-stage.mjs"' in script
    assert 'data-three-deployment' in script
    assert "deployment-counter.webp" not in styles
    assert client.get("/static/art/deployment-counter.webp").status_code == 404
    assert "MAX_SAUCES = 4" not in script
```

- [ ] **Step 2: Run and verify failure**

```powershell
& $nodeExe --test tests/cooking-deployment-stage.test.mjs
python -m pytest tests/test_app.py::test_mixing_uses_webgl_deployment_instead_of_picture_or_svg_food -q
```

Expected: missing module and missing 3D marker failures.

- [ ] **Step 3: Implement the coordinator and wire it to `app.js`**

`createCookingDeploymentStage({root, initialComposition, onChange, onError, hostFactory = createThreeSceneHost, modelFactory = createBurgerModel3D, interactionFactory = createCookingInteractionController})` must create the host, burger, four bottle tools, interaction controller, warm workbench plane, plate, and reset/expand/undo controls. Its public interface is:

```js
{
  interaction,
  setExpanded(value),
  undo(),
  resetCamera(),
  canConfirm(),
  getComposition(),
  playSealAnimation(),
  dispose(),
}
```

In `app.js`, keep one `deployment3D` instance. `renderMixing` must render a `<section class="three-stage" data-three-deployment>` with a real `<canvas>`, four text-labeled condiment buttons, expand/reset/undo controls, and a confirm button disabled until `stage.canConfirm()`. Mount after `replaceApp`, store the current composition, and send:

```js
send({
  type: "recipe.lock",
  position: selectedFry,
  composition,
});
```

In the selection board, enable the two `burger` positions and label the other snack models as coming in later 3D food packs; the bot and server use the same burger-only deployment rule. Add a code-native layered burger thumbnail for the selection board instead of a PNG. Remove the four-slot UI cap, picture-backed deployment markup, emoji sauce drops, and deployment background asset. Destroy the stage before every route replacement.

- [ ] **Step 4: Run focused and full front-end tests**

```powershell
& $nodeExe --test tests/cooking-deployment-stage.test.mjs
python -m pytest tests/test_app.py -q
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add app/static/cooking-deployment-stage.mjs app/static/app.js app/static/styles.css tests
git add -u app/static/art/deployment-counter.webp
git commit -m "feat: replace deployment with interactive 3d cooking"
```

### Task 8: Build an articulated ordinary-person 3D character

**Files:**
- Create: `app/static/character-rig-3d.mjs`
- Create: `tests/character-rig-3d.test.mjs`

- [ ] **Step 1: Write failing rig and face tests**

```js
// tests/character-rig-3d.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../app/static/vendor/three.module.min.js";
import { createCharacterRig3D } from "../app/static/character-rig-3d.mjs";

test("ordinary character exposes hierarchical joints and a hand grip anchor", () => {
  const rig = createCharacterRig3D(THREE);
  for (const key of ["root", "torso", "head", "leftUpperArm", "leftForearm", "leftHand", "gripAnchor"])
    assert.ok(rig.nodes[key]);
  assert.equal(rig.nodes.gripAnchor.parent, rig.nodes.leftHand);
});

test("face parameters move real eye brow and mouth meshes", () => {
  const rig = createCharacterRig3D(THREE);
  const before = rig.nodes.mouth.scale.y;
  rig.setFace({ eyeOpen: 0.3, browTilt: 0.8, mouthOpen: 1, mouthWide: 0.2 });
  assert.notEqual(rig.nodes.mouth.scale.y, before);
  assert.equal(rig.root.userData.face.mouthOpen, 1);
  assert.equal(rig.nodes.mouth.material.map, null);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `& $nodeExe --test tests/character-rig-3d.test.mjs`

Expected: missing module.

- [ ] **Step 3: Implement the procedural character rig**

Create a warm, ordinary young-adult character from rounded capsule/sphere/lathe geometry. Use nested `Group` pivots for shoulder, elbow, wrist, neck, and jaw. Build both hands from a palm plus five small capsule fingers; provide a left-hand `gripAnchor`. Build eyes, eyelids, brows, cheeks, and an open-mouth cavity as actual meshes with no texture maps.

Export:

```js
createCharacterRig3D(THREE, options = {}) => {
  root, nodes,
  setPose({ torsoPitch, headPitch, headYaw, leftShoulder, leftElbow, leftWrist,
            rightShoulder, rightElbow, jaw }),
  setFace({ eyeOpen, pupilScale, browTilt, mouthOpen, mouthWide, cheekHeat }),
  attachFood(object3D), detachFood(), lookAtFood(worldPosition), dispose(),
}
```

Use neutral clothes and hair; do not add hats, wands, robes, witch symbols, emoji planes, or bitmap face textures.

- [ ] **Step 4: Run and commit**

```powershell
& $nodeExe --test tests/character-rig-3d.test.mjs
git add app/static/character-rig-3d.mjs tests/character-rig-3d.test.mjs
git commit -m "feat: add articulated 3d eater character"
```

### Task 9: Direct the full bite and chili-fire performance

**Files:**
- Create: `app/static/reaction-effects-3d.mjs`
- Create: `app/static/reaction-director-3d.mjs`
- Create: `tests/reaction-director-3d.test.mjs`
- Modify: `app/static/reaction-model.mjs`
- Modify: `tests/reaction-model.test.mjs`

- [ ] **Step 1: Update the failing ten-phase contract and director test**

Change the expected reaction phases to:

```js
[
  "notice", "reach", "grip", "lift", "bite",
  "chew", "suspense", "burst", "recover", "settle",
]
```

Add:

```js
// tests/reaction-director-3d.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createReactionDirector3D } from "../app/static/reaction-director-3d.mjs";

test("chili performance grabs food before bite and emits fire only in burst", () => {
  const calls = [];
  const director = createReactionDirector3D({
    rig: { attachFood: () => calls.push("attach"), detachFood: () => calls.push("detach"), setPose() {}, setFace() {} },
    burger: { setBiteAmount: (amount) => calls.push(`bite:${amount}`) },
    effects: { setFire: (visible) => calls.push(`fire:${visible}`), update() {}, reset() {} },
    onPhase: (phase) => calls.push(`phase:${phase}`),
  });
  director.seek(0.21);  // grip
  director.seek(0.48);  // bite
  director.seek(0.74);  // burst
  assert.ok(calls.indexOf("attach") < calls.indexOf("bite:1"));
  assert.ok(calls.includes("fire:true"));
  director.cancel();
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
& $nodeExe --test tests/reaction-model.test.mjs tests/reaction-director-3d.test.mjs
```

Expected: phase list mismatch and missing director module.

- [ ] **Step 3: Implement mesh-only reaction effects**

Create fire from pooled transparent cone/icosahedron meshes colored red, orange, and yellow; advance them from the mouth along a seeded curve during `burst`. Create tears from blue droplet meshes, sweat from clear-blue spheres, crumbs from small bun-colored meshes, and heat from transparent torus meshes. No effect material may have a texture map.

Return:

```js
createReactionEffects3D(THREE, scene, mouthAnchor) => {
  setFire(visible, intensity), setTears(visible), setHeat(visible),
  burstCrumbs(), update(deltaSeconds), reset(), dispose(),
}
```

- [ ] **Step 4: Implement the deterministic director**

`createReactionDirector3D({rig, burger, effects, plan, onPhase, now})` must expose `play`, `seek`, `skip`, `cancel`, and `dispose`. Use smoothstep interpolation between explicit pose/face keyframes. At `grip`, parent the burger to the hand anchor; at `bite`, deform the burger; at `suspense`, freeze for a readable beat; at chili `burst`, open the mouth, lean back, widen the eyes, show tears, and enable fire; at `recover`, turn off fire and animate both arms fanning the mouth. Calling `cancel` must detach food and reset effects.

- [ ] **Step 5: Run and commit**

```powershell
& $nodeExe --test tests/reaction-model.test.mjs tests/reaction-director-3d.test.mjs
git add app/static/reaction-model.mjs app/static/reaction-effects-3d.mjs app/static/reaction-director-3d.mjs tests
git commit -m "feat: animate 3d bite and chili reaction"
```

### Task 10: Replace the SVG reveal and replay with the 3D performance

**Files:**
- Create: `app/static/reaction-stage-3d.mjs`
- Create: `tests/reaction-stage-3d.test.mjs`
- Modify: `app/static/finished-reaction-flow.mjs`
- Modify: `app/static/app.js`
- Modify: `app/static/index.html`
- Modify: `app/static/styles.css`
- Modify: `tests/finished-reaction-flow.test.mjs`
- Modify: `tests/test_app.py`
- Remove: `app/static/character-reaction.mjs`
- Remove: `app/static/character-reaction.css`
- Remove: `app/static/food-assembly.mjs`
- Remove: `tests/character-reaction.test.mjs`
- Remove: `tests/character-reaction-css.test.mjs`
- Remove: `tests/food-assembly.test.mjs`

- [ ] **Step 1: Write failing integration assertions**

Replace the old articulated-SVG test with:

```python
def test_finished_round_uses_real_time_3d_character_and_food() -> None:
    page = client.get("/").text
    script = client.get("/static/app.js").text
    assert 'from "/static/reaction-stage-3d.mjs"' in script
    assert 'data-three-reaction' in script
    assert "character-reaction.mjs" not in script
    assert "character-reaction.css" not in page
    assert client.get("/static/character-reaction.mjs").status_code == 404
    assert client.get("/static/food-assembly.mjs").status_code == 404
```

Update `finished-reaction-flow.test.mjs` so the fake `playReaction` returns `{play, skip, cancel, dispose}` and assert `dispose` runs on route exit and before replay.

- [ ] **Step 2: Run and verify old implementation fails the new assertions**

```powershell
python -m pytest tests/test_app.py::test_finished_round_uses_real_time_3d_character_and_food -q
& $nodeExe --test tests/finished-reaction-flow.test.mjs
```

Expected: imports and DOM markers still point to SVG.

- [ ] **Step 3: Implement and mount the 3D reaction stage**

`createReactionStage3D({root, composition, reactionPlan, onPhase, onComplete, onError})` creates a host, character, reconstructed burger, effects, and director. Its interface is:

```js
{ play(), skip(), cancel(), replay(), dispose() }
```

Update `renderFinished` to render one `<canvas data-three-reaction>` and one `<canvas data-three-replay>` shell. Reconstruct sauce meshes from `result.replay.composition`; use the same composition for deployment replay. Keep the existing result-card delay, explicit skip, replay buttons, live region, focus movement, sound, and vibration. Delete the SVG modules/styles/tests and every runtime import/reference to them.

- [ ] **Step 4: Run all JS and Python tests**

```powershell
Get-ChildItem tests -Filter '*.test.mjs' | ForEach-Object { & $nodeExe --test $_.FullName; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
python -m pytest -q
```

Expected: every test passes; no old SVG reaction files are served.

- [ ] **Step 5: Commit**

```powershell
git add app/static app tests
git commit -m "feat: replace reveal with realtime 3d performance"
```

### Task 11: Harden mobile behavior, public-test safety, and remote delivery

**Files:**
- Create: `app/security.py`
- Create: `tests/test_security.py`
- Create: `scripts/start-remote-test.ps1`
- Modify: `.gitignore`
- Modify: `app/main.py`
- Modify: `app/static/styles.css`
- Modify: `tests/mobile-layout-css.test.mjs`
- Modify: `tests/test_app.py`
- Modify: `README.md`

- [ ] **Step 1: Write failing security and mobile tests**

```python
# tests/test_security.py
from fastapi.testclient import TestClient

from app.main import create_app
from app.security import SlidingWindowLimit
from app.service import GameService


client = TestClient(create_app(GameService()))


def test_sliding_window_rejects_burst_and_recovers() -> None:
    limiter = SlidingWindowLimit(max_events=3, window_seconds=10)
    assert [limiter.allow("client", now=value) for value in (0, 1, 2)] == [True, True, True]
    assert limiter.allow("client", now=3) is False
    assert limiter.allow("client", now=11) is True


def test_public_pages_send_browser_security_headers() -> None:
    response = client.get("/")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'self'" in response.headers["content-security-policy"]
```

Extend the mobile CSS test to require `touch-action:none` only on `.three-stage__canvas`, a viewport height fallback using `100dvh`, and an `@media (prefers-reduced-motion: reduce)` rule that shortens camera motion while preserving readable phase changes.

- [ ] **Step 2: Run and verify failure**

```powershell
python -m pytest tests/test_security.py -q
& $nodeExe --test tests/mobile-layout-css.test.mjs
```

Expected: missing security module and missing 3D mobile rules.

- [ ] **Step 3: Implement rate limiting and headers**

```python
# app/security.py
from collections import defaultdict, deque
from dataclasses import dataclass, field


@dataclass
class SlidingWindowLimit:
    max_events: int
    window_seconds: float
    events: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))

    def allow(self, key: str, *, now: float) -> bool:
        queue = self.events[key]
        cutoff = now - self.window_seconds
        while queue and queue[0] <= cutoff:
            queue.popleft()
        if len(queue) >= self.max_events:
            return False
        queue.append(now)
        return True


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; connect-src 'self' ws: wss:; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    ),
}
```

Add HTTP middleware that applies these headers. Before WebSocket acceptance, limit each client IP to 20 connection attempts per minute; inside the receive loop, limit each authorized player to 120 commands per minute and close with code `1008` when exceeded. Continue validating credentials, room state, composition shape, and turn authority server-side.

- [ ] **Step 4: Add a repeatable HTTPS remote-test launcher**

```powershell
# scripts/start-remote-test.ps1
param([int]$Port = 8010)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root '.remote-test'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$serverOut = Join-Path $logDir 'uvicorn.out.log'
$serverErr = Join-Path $logDir 'uvicorn.err.log'
$tunnelOut = Join-Path $logDir 'cloudflared.out.log'
$tunnelErr = Join-Path $logDir 'cloudflared.err.log'
$cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
$server = Start-Process python -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port',"$Port") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru
$tunnel = Start-Process $cloudflared -ArgumentList @('tunnel','--protocol','http2','--url',"http://127.0.0.1:$Port",'--no-autoupdate') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru
for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  $match = Select-String -Path $tunnelOut,$tunnelErr -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' -AllMatches | Select-Object -Last 1
  if ($match) {
    Write-Output $match.Matches[0].Value
    Write-Output "server_pid=$($server.Id) tunnel_pid=$($tunnel.Id)"
    exit 0
  }
}
Stop-Process -Id $server.Id,$tunnel.Id -Force -ErrorAction SilentlyContinue
throw '公网 HTTPS 隧道启动失败'
```

Document that the launcher exposes only loopback Uvicorn through the tunnel, prints the temporary URL and process IDs, and must be stopped after user acceptance.

Add `.remote-test/` to `.gitignore`. Before the first remote run, ensure the tunnel binary is available:

```powershell
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  winget install --id Cloudflare.cloudflared --exact --accept-package-agreements --accept-source-agreements
}
```

- [ ] **Step 5: Run full automated verification**

```powershell
python -m pytest -q
Get-ChildItem tests -Filter '*.test.mjs' | ForEach-Object { & $nodeExe --test $_.FullName; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
Get-ChildItem app/static -Include '*.js','*.mjs' -Recurse | ForEach-Object { & $nodeExe --check $_.FullName; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
python -m compileall -q app
git diff --check
```

Expected: all tests and syntax checks pass with no diff errors.

- [ ] **Step 6: Run browser and remote-phone acceptance**

Start local Uvicorn, then use Playwright with an iPhone-sized viewport to verify:

1. Single-player practice opens a WebGL canvas.
2. The hamburger rotates from an empty-area drag.
3. The top bun and at least two other layers move independently.
4. Chili and mustard strokes can both be drawn, with a repeated chili stroke.
5. Confirming sends a valid composition and reaches the turn screen.
6. A poison hit shows the 3D character grabbing and biting the hamburger.
7. Fire geometry appears only during `burst`.
8. Replay works twice without duplicate canvases or growing renderer count.
9. No request for `deployment-counter.webp`, `character-reaction.mjs`, `food-assembly.mjs`, or `/static/art/foods/*.png` occurs in the deployment/reveal route.

Run `scripts/start-remote-test.ps1`, open the printed `https://…trycloudflare.com` URL from a browser outside the home network, verify `/health`, the practice WebSocket flow, touch dragging, and the complete reaction. Provide that exact HTTPS URL to the user.

- [ ] **Step 7: Commit the verified delivery tooling**

```powershell
git add .gitignore app/security.py app/main.py app/static/styles.css scripts/start-remote-test.ps1 tests README.md
git commit -m "feat: harden and publish 3d mobile prototype"
```

## Final acceptance checklist

- [ ] Core deployment and reveal use WebGL canvases, not food/person/background pictures, video, SVG food, or SVG people.
- [ ] Hamburger has seven independently movable 3D layers and visible geometry-based sauce strokes.
- [ ] Four condiment types support repeated and mixed placement on any layer.
- [ ] Ordinary 3D character performs reach, grip, lift, bite, chew, suspense, chili burst, and recovery.
- [ ] Fire, tears, heat, and crumbs are texture-free real-time meshes/particles.
- [ ] Private composition stays secret until a poison outcome; forged payloads are rejected.
- [ ] iPhone Safari and Android Chrome can use the public HTTPS build from outside the LAN.
- [ ] All Python, Node, syntax, browser, and diff checks pass.
