import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("homepage loads the v2 UI motion editor assets", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /home-layout-editor\.css\?v=20260728-motion4/);
  assert.match(html, /home-layout-editor\.mjs\?v=20260728-motion4/);
});

test("homepage exposes main scenes and sheets as editable roots", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const requiredIds = [
    "global.hud",
    "global.title",
    "global.carousel",
    "global.bottom-nav",
    "burger.card",
    "burger.truck",
    "sushi.card",
    "sushi.scene",
    "sheet.daily",
    "sheet.cookbook",
    "sheet.settings",
  ];

  for (const id of requiredIds) {
    assert.match(
      html,
      new RegExp(`data-layout-id="${id.replace(".", "\\.")}"`),
    );
  }
});

test("editor supports deep selection, tabs, motion preview and timeline replay", async () => {
  const source = await readFile(
    new URL("home-layout-editor.mjs", root),
    "utf8",
  );

  assert.match(source, /burger\.home\.layout\.v2/);
  assert.match(source, /data-layout-runtime-id/);
  assert.match(source, /data-tab="motion"/);
  assert.match(source, /data-tab="truck"/);
  assert.match(source, /data-editor-view="daily"/);
  assert.match(source, /data-editor-view="cookbook"/);
  assert.match(source, /playElementMotion/);
  assert.match(source, /replayTruck/);
  assert.match(source, /vendor\/theatre\/core-and-studio\.js/);
  assert.match(source, /vendor\/moveable\/moveable\.min\.js/);
  assert.match(source, /theatreStudio\.initialize/);
  assert.match(source, /new window\.Moveable/);
  assert.match(source, /createContentOfSaveFile/);
  assert.match(source, /汉堡小馆-UI调整-/);
  assert.match(source, /LAYER_CATEGORY_DEFINITIONS/);
  assert.match(source, /data-layer-group/);
  assert.match(source, /下载调整文件/);
  assert.match(source, /query\.get\("layout"\) === "1"/);
  assert.match(source, /localStorage\.setItem/);
});

test("truck CSS uses editor-controlled timing and focus variables", async () => {
  const css = await readFile(new URL("home.css", root), "utf8");

  assert.match(css, /--truck-camera-duration/);
  assert.match(css, /--truck-camera-end-x/);
  assert.match(css, /--truck-wheel-turns/);
  assert.match(css, /--truck-shutter-delay/);
  assert.match(css, /--truck-menu-duration/);
  assert.match(css, /@keyframes burger-truck-camera-arrive/);
});
