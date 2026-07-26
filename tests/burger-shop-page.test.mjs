import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPath = new URL("../app/static/cooking.html", import.meta.url);
const cssPath = new URL("../app/static/cooking.css", import.meta.url);

test("the cooking page contains one semantic burger shop HUD", async () => {
  const html = await readFile(htmlPath, "utf8");

  for (const marker of [
    'class="burger-shop-ui"',
    'id="burger-shop-ui"',
    'id="shop-customer"',
    'id="shop-order-ticket"',
    'aria-controls="shop-ticket-panel"',
    'id="shop-order-timer"',
    'id="shop-ticket-panel"',
    'id="shop-tasting"',
    'id="shop-order-result"',
    'id="shop-run-result"',
    'id="shop-serve-button"',
    'data-shop-action="undo"',
    'data-shop-action="focus"',
    'data-shop-action="serve"',
  ]) {
    assert.match(html, new RegExp(marker), `missing ${marker}`);
  }
  assert.equal((html.match(/id="burger-shop-ui"/g) ?? []).length, 1);
  assert.match(html, /<b data-shop-order-number>1<\/b>\/8/);
});

test("order mode is a fixed safe-area game layout rather than a scrolling page", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /body\[data-game-mode="orders"\]\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /body\[data-game-mode="orders"\]\s+\.cooking-stage\s*\{[^}]*--shop-top-safe:\s*max\(84px,[^;]+;[^}]*--shop-bottom-safe:\s*max\(96px,/s);
  assert.match(css, /body\[data-game-mode="orders"\]\s+#cooking-canvas\s*\{[^}]*height:\s*100%;/s);
  assert.match(css, /\.burger-shop-ui\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/s);
  assert.match(css, /\.shop-hud\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;/s);
  assert.match(css, /\.shop-actions\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*0;/s);
  assert.match(css, /\.shop-hud[^}]*button[^}]*,\s*\.shop-actions[^}]*button\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(css, /\.shop-result-card\s*\{[^}]*max-width:\s*360px;[^}]*border-radius:/s);
  assert.match(css, /\.shop-result-card\s*>\s*button[^}]*min-height:\s*52px/s);
});

test("desktop order mode becomes a full-width silver food-truck cockpit", async () => {
  const css = await readFile(cssPath, "utf8");
  const desktop = css.match(/@media\s*\(min-width:\s*1000px\)\s*\{([\s\S]+)\}\s*$/)?.[1] ?? "";

  assert.notEqual(desktop, "", "missing desktop food-truck breakpoint");
  assert.match(desktop, /body\[data-game-mode="orders"\]\s+\.cooking-stage\s*\{[^}]*--shop-left-safe:\s*clamp\([^;]+;[^}]*--shop-right-safe:\s*clamp\([^;]+;[^}]*width:\s*100vw;[^}]*max-width:\s*none;/s);
  assert.match(desktop, /body\[data-game-mode="orders"\]\s+\.shop-hud\s*\{[^}]*top:\s*18px;[^}]*bottom:\s*18px;[^}]*left:\s*18px;[^}]*right:\s*auto;[^}]*width:\s*calc\(var\(--shop-left-safe\)\s*-\s*36px\);/s);
  assert.match(desktop, /body\[data-game-mode="orders"\]\s+\.shop-actions\s*\{[^}]*top:\s*18px;[^}]*right:\s*18px;[^}]*bottom:\s*18px;[^}]*left:\s*auto;[^}]*width:\s*calc\(var\(--shop-right-safe\)\s*-\s*36px\);/s);
  assert.match(desktop, /body\[data-game-mode="orders"\]\s+\.workbench-slot-controls\s*\{[^}]*left:\s*var\(--shop-left-safe\);[^}]*right:\s*var\(--shop-right-safe\);/s);
  assert.match(desktop, /body\[data-game-mode="orders"\]\s+#cooking-canvas\s*\{[^}]*border:\s*2px solid rgba\(255,\s*255,\s*255,\s*\.28\);/s);
});
