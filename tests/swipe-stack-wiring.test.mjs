import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("swipe-stack mode is a separate image-free 3D route", async () => {
  const [html, css, app, stage] = await Promise.all([
    readFile(new URL("swipe-stack.html", root), "utf8"),
    readFile(new URL("swipe-stack.css", root), "utf8"),
    readFile(new URL("swipe-stack-app.mjs", root), "utf8"),
    readFile(new URL("swipe-stack-stage.mjs", root), "utf8"),
  ]);

  assert.match(html, /id="swipe-stack-canvas"/);
  assert.match(html, /id="ingredient-rail-window"/);
  assert.match(html, /swipe-stack-app\.mjs\?v=20260826-orderbelt47/);
  assert.match(html, /id="belt-empty-state"/);
  assert.doesNotMatch(html, /<img\b/i);
  assert.match(css, /touch-action: none/);
  assert.match(css, /ingredient-token--patty/);
  assert.match(app, /createConveyorSupplyState/);
  assert.match(app, /spawnConveyorSupply/);
  assert.match(app, /consumeConveyorSupply/);
  assert.doesNotMatch(app, /moveSwipeRailIndex/);
  assert.match(app, /tryLaunchIngredient/);
  assert.match(html, /id="order-dock-row"/);
  assert.match(html, /id="served-count"/);
  assert.match(css, /@keyframes belt-flow/);
  assert.match(css, /left var\(--travel-ms\)/);
  assert.match(app, /createSwipeStackOrderBoard/);
  assert.match(app, /placeIngredientInOrder/);
  assert.match(app, /refreshCompletedOrder/);
  assert.match(app, /nearestOrderDock/);
  assert.match(stage, /createBurgerModel3D/);
  assert.match(stage, /createLayerInstance/);
  assert.match(stage, /onImpact/);
});

test("homepage exposes swipe-stack without replacing free cooking", async () => {
  const [modes, lobby] = await Promise.all([
    readFile(new URL("home-mode-switch-state.mjs", root), "utf8"),
    readFile(new URL("home-lobby-app.mjs", root), "utf8"),
  ]);

  assert.match(modes, /id: "practice"/);
  assert.match(modes, /id: "swipe-stack"/);
  assert.match(modes, /\["practice", "swipe-stack", "duel", "duo"\]/);
  assert.match(lobby, /mode\.action === "practice"[\s\S]*cooking\.html/);
  assert.match(lobby, /mode\.action === "swipe-stack"[\s\S]*swipe-stack\.html\?v=20260826-orderbelt47/);
});
