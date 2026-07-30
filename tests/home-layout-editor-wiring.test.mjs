import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("homepage loads the suspended service booth assets", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /home\.css\?v=20260730-pendulum3/);
  assert.match(html, /home-lobby-app\.mjs\?v=20260730-pendulum3/);
  assert.match(html, /home-layout-editor\.css\?v=20260730-pendulum3/);
  assert.match(html, /home-layout-editor\.mjs\?v=20260730-pendulum3/);
  assert.match(html, /puppet-booth-strings\.png/);
  assert.match(html, /class="burger-truck-puppet"/);
  assert.match(html, /burger-truck-marionette-string--left/);
  assert.match(html, /burger-truck-marionette-string--right/);
  assert.match(html, /silver-puppet-booth-frame\.png/);
  assert.match(html, /data-layout-id="burger\.frame"/);
  assert.doesNotMatch(html, /silver-truck__body/);
  assert.doesNotMatch(html, /burger-truck-wheel/);
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

  assert.match(source, /burger\.home\.layout\.v6/);
  assert.match(source, /burger\.home\.layout\.v5/);
  assert.match(source, /burger\.home\.layout\.v4/);
  assert.match(source, /burger\.home\.layout\.v3/);
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
  assert.match(source, /data-action="toggle-truck-focus"/);
  assert.match(source, /data-action="toggle-studio"/);
  assert.match(source, /previewTruckAnimation/);
  assert.match(source, /layout-editor-truck-overview/);
  assert.match(source, /layout-editor-selected-target/);
  assert.match(source, /burger:editor-select-map/);
  assert.match(source, /query\.get\("layout"\) === "1"/);
  assert.match(source, /localStorage\.setItem/);
});

test("truck CSS uses editor-controlled timing and focus variables", async () => {
  const [css, lobby] = await Promise.all([
    readFile(new URL("home.css", root), "utf8"),
    readFile(new URL("home-lobby-app.mjs", root), "utf8"),
  ]);

  assert.match(css, /--truck-camera-duration/);
  assert.match(css, /--truck-camera-end-x/);
  assert.match(css, /--truck-shutter-delay/);
  assert.match(css, /--truck-menu-duration/);
  assert.match(css, /@keyframes burger-truck-camera-arrive/);
  assert.match(css, /@keyframes burger-truck-marionette-drop/);
  assert.match(css, /@keyframes burger-truck-marionette-strings/);
  assert.match(css, /@keyframes burger-puppet-stage-idle/);
  assert.match(css, /var\(--truck-body-duration, 1080ms\)/);
  assert.match(css, /burger-truck-marionette-string-swing/);
  assert.match(css, /calc\(var\(--truck-camera-end-x, 0%\) \+ 5\.2%\)/);
  assert.match(css, /\.home-map-slide\.is-business-open \.burger-service-window__shutter/);
  assert.match(lobby, /classList\.toggle\("is-business-open", available && businessOpen\)/);
  assert.match(css, /width: 100%/);
  assert.doesNotMatch(
    css,
    /\.burger-truck-camera\.is-arriving \.burger-truck-wheel\s*\{[\s\S]*?animation:/,
  );
});

test("editor isolates the suspended booth without legacy vehicle layers", async () => {
  const css = await readFile(new URL("home-layout-editor.css", root), "utf8");
  const source = await readFile(
    new URL("home-layout-editor.mjs", root),
    "utf8",
  );

  assert.match(css, /layout-editor-truck-overview/);
  assert.match(css, /burger-truck-camera/);
  assert.match(css, /scale\(0\.9\)/);
  assert.match(css, /animation: none !important/);
  assert.match(
    css,
    /layout-editor-selected-target[\s\S]*pointer-events: auto !important/,
  );
  assert.match(css, /burger-service-booth__frame/);
  assert.match(source, /"burger\.frame"/);
  assert.match(source, /"burger\.service"/);
  assert.match(source, /if \(selectedId !== id\) setSelected\(id\)/);
  assert.match(
    source,
    /Object\.entries\(patch\)[\s\S]*set\(object\.props\[scope\]\[key\], value\)/,
  );
  assert.doesNotMatch(source, /burger\.wheel-front/);
  assert.doesNotMatch(source, /burger\.wheel-rear/);
  assert.doesNotMatch(css, /burger-truck-wheel/);
});

test("editor loads and resets the v6 pendulum booth baseline", async () => {
  const source = await readFile(
    new URL("home-layout-editor.mjs", root),
    "utf8",
  );

  assert.match(
    source,
    /home-layout-editor-state\.mjs\?v=20260730-pendulum3/,
  );
  assert.match(source, /mergeProjectDefaultLayout\(parseLayoutDocument\(raw\)\)/);
  assert.match(source, /createProjectDefaultLayoutDocument\(\)/);
  assert.match(
    source,
    /history\.replace\(createProjectDefaultLayoutDocument\(\)\)/,
  );
  assert.match(source, /projectDefaultLayoutValue\(selectedId\)/);
  assert.match(
    source,
    /mergeProjectDefaultLayout\(parsed\.layoutDocument\)/,
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

test("layout controls preserve the component-owned street row transform", async () => {
  const [lobby, editor, homeCss, editorCss] = await Promise.all([
    readFile(new URL("home-lobby-app.mjs", root), "utf8"),
    readFile(new URL("home-layout-editor.mjs", root), "utf8"),
    readFile(new URL("home.css", root), "utf8"),
    readFile(new URL("home-layout-editor.css", root), "utf8"),
  ]);

  assert.match(lobby, /--map-carousel-transform/);
  assert.match(lobby, /--map-carousel-z/);
  assert.match(lobby, /home-map-carousel-state\.mjs\?v=20260730-pendulum3/);
  assert.match(homeCss, /var\(\s*--map-carousel-transform/);
  assert.match(homeCss, /z-index:\s*var\(--map-carousel-z\)/);
  assert.match(editor, /layout-editor-has-perspective/);
  assert.doesNotMatch(
    editor,
    /element\.style\.transform\s*=\s*hasPerspective/,
  );
  assert.match(
    editorCss,
    /\.home-map-slide\.layout-editor-has-perspective[\s\S]*--map-carousel-transform/,
  );
});

test("editor exposes visible alignment, snapping and perspective controls", async () => {
  const [source, css, state] = await Promise.all([
    readFile(new URL("home-layout-editor.mjs", root), "utf8"),
    readFile(new URL("home-layout-editor.css", root), "utf8"),
    readFile(new URL("home-layout-editor-state.mjs", root), "utf8"),
  ]);

  assert.match(source, /home-layout-guides\.mjs\?v=20260730-truckfocus1/);
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
  assert.match(source, /Numpad2/);
  assert.match(source, /Numpad4/);
  assert.match(source, /Numpad6/);
  assert.match(source, /Numpad8/);
  assert.match(source, /data-nudge-step/);
  assert.match(source, /data-nudge="left"/);
  assert.match(source, /data-nudge="right"/);
  assert.match(source, /nudgeSelectedDirection/);
  assert.match(css, /layout-editor-grid-surface/);
  assert.match(css, /layout-editor-guide-line\.is-active/);
  assert.match(css, /layout-editor-align-buttons/);
  assert.match(css, /layout-editor-nudge-grid/);
  assert.match(state, /perspective: 0/);
  assert.match(state, /rotateX: 0/);
  assert.match(state, /rotateY: 0/);
});

test("booth focus isolates eight parts and exposes explicit layer controls", async () => {
  const [source, css, guides] = await Promise.all([
    readFile(new URL("home-layout-editor.mjs", root), "utf8"),
    readFile(new URL("home-layout-editor.css", root), "utf8"),
    readFile(new URL("home-layout-guides.mjs", root), "utf8"),
  ]);

  assert.match(source, /TRUCK_EDITOR_BASE_IDS/);
  assert.match(source, /TRUCK_EDITOR_BASE_IDS\.has\(id\)/);
  assert.match(source, /truckEditorRootId/);
  assert.match(source, /layout-editor-truck-focus/);
  assert.match(source, /data-layer-order="backward"/);
  assert.match(source, /data-layer-order="forward"/);
  assert.match(source, /data-layer-order="back"/);
  assert.match(source, /data-layer-order="front"/);
  assert.match(source, /data-layer-order="original"/);
  assert.match(source, /const nextDocument = updateLayoutElement/);
  assert.match(source, /commitDocument\(nextDocument\)/);
  assert.match(source, /theatreStudio\.ui\.hide/);
  assert.match(css, /layout-editor-truck-focus/);
  assert.match(
    css,
    /home-map-slide\[data-home-map="burger"\]\[data-card-offset="0"\]/,
  );
  assert.match(css, /layout-editor-layer-order/);
  assert.match(css, /data-action="play-theatre"/);
  assert.match(css, /data-action="select-truck-timing"/);
  assert.match(guides, /showGrid: false/);
  assert.match(source, /"burger\.frame"/);
  assert.doesNotMatch(source, /data-wheel-align/);
  assert.doesNotMatch(source, /alignSelectedWheelHeight/);
});
