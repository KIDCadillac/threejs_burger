import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("homepage loads the v2 UI motion editor assets", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /home-layout-editor\.css\?v=20260729-align1/);
  assert.match(html, /home-layout-editor\.mjs\?v=20260729-align1/);
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
  assert.match(source, /data-action="truck-overview"/);
  assert.match(source, /previewTruckAnimation/);
  assert.match(source, /layout-editor-truck-overview/);
  assert.match(source, /layout-editor-wheel-mode/);
  assert.match(source, /layout-editor-selected-target/);
  assert.match(source, /burger:editor-select-map/);
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

test("editor freezes the full truck while wheels are adjusted", async () => {
  const css = await readFile(new URL("home-layout-editor.css", root), "utf8");
  const source = await readFile(
    new URL("home-layout-editor.mjs", root),
    "utf8",
  );

  assert.match(css, /layout-editor-truck-overview/);
  assert.match(css, /burger-truck-camera/);
  assert.match(css, /scale\(0\.9\)/);
  assert.match(css, /burger-truck-wheel/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /layout-editor-wheel-mode/);
  assert.match(css, /pointer-events: none !important/);
  assert.match(css, /z-index: 8 !important/);
  assert.match(
    css,
    /layout-editor-selected-target[\s\S]*pointer-events: auto !important/,
  );
  assert.match(
    css,
    /layout-editor-moveable\.layout-editor-wheel-mode[\s\S]*layout-editor-selection/,
  );
  assert.match(
    source,
    /useDirectWheelDrag = isWheelLayer\(id\)[\s\S]*startOperation\(event,\s*"move"\)/,
  );
  assert.match(source, /if \(selectedId !== id\) setSelected\(id\)/);
  assert.match(source, /id && !isWheelLayer\(id\) \? preferredElement\(id\) : null/);
  assert.match(
    source,
    /Object\.entries\(patch\)[\s\S]*set\(object\.props\[scope\]\[key\], value\)/,
  );
});

test("homepage carousel gestures stand down while the editor is active", async () => {
  const source = await readFile(
    new URL("home-lobby-app.mjs", root),
    "utf8",
  );

  assert.match(source, /beginMapDrag\(event\)/);
  assert.match(source, /layout-editor-active/);
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /burger:editor-select-map/);
  assert.match(source, /persist: false/);
});

test("editor exposes visible alignment, snapping and perspective controls", async () => {
  const [source, css, state] = await Promise.all([
    readFile(new URL("home-layout-editor.mjs", root), "utf8"),
    readFile(new URL("home-layout-editor.css", root), "utf8"),
    readFile(new URL("home-layout-editor-state.mjs", root), "utf8"),
  ]);

  assert.match(source, /home-layout-guides\.mjs\?v=20260729-align1/);
  assert.match(source, /className = "layout-editor-align-dock/);
  assert.match(source, /data-align="left"/);
  assert.match(source, /data-align="hcenter"/);
  assert.match(source, /data-align="right"/);
  assert.match(source, /data-guide-setting="gridSize"/);
  assert.match(source, /data-guide-setting="snapping"/);
  assert.match(source, /data-quick-field="opacity"/);
  assert.match(source, /data-quick-field="perspective"/);
  assert.match(source, /snapDragLayout/);
  assert.match(source, /ArrowLeft/);
  assert.match(css, /layout-editor-grid-surface/);
  assert.match(css, /layout-editor-guide-line\.is-active/);
  assert.match(css, /layout-editor-align-buttons/);
  assert.match(state, /perspective: 0/);
  assert.match(state, /rotateX: 0/);
  assert.match(state, /rotateY: 0/);
});
