import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPath = new URL("../app/static/cooking.html", import.meta.url);
const cssPath = new URL("../app/static/cooking.css", import.meta.url);
const homePath = new URL("../app/static/index.html", import.meta.url);
const homeCssPath = new URL("../app/static/home.css", import.meta.url);
const appPath = new URL("../app/static/cooking-solo-app.mjs", import.meta.url);
const loaderPath = new URL("../app/static/cooking-loader.mjs", import.meta.url);

test("standalone cooking page is accessible, Chinese, and contains the full playable HUD", async () => {
  const html = await readFile(htmlPath, "utf8");
  for (const marker of [
    'lang="zh-CN"',
    'id="cooking-canvas"',
    'aria-describedby="cooking-objective"',
    'id="cooking-objective"',
    'id="cooking-progress"',
    'id="cooking-stock"',
    'id="cooking-summary"',
    'data-action="rotate-left"',
    'data-action="rotate-right"',
    'data-action="camera-reset"',
    'data-action="toggle-focus"',
    'data-action="toggle-expanded"',
    'data-action="undo"',
    'data-action="reset"',
    'data-action="finish"',
    'data-action="continue"',
    'data-action="restart"',
    'data-action="tutorial-skip"',
    'data-action="tutorial-replay"',
    'data-action="feedback-open"',
    'data-action="feedback-close"',
    'data-action="feedback-submit"',
    'id="feedback-sheet"',
    'id="feedback-preview"',
    'id="feedback-message"',
    'id="feedback-status"',
    'role="dialog"',
    'aria-modal="true"',
    'aria-labelledby="finish-title"',
    'tabindex="-1"',
    'role="status"',
    'aria-live="polite"',
    'cooking-loading',
    'id="cooking-loading-phase"',
    'id="cooking-loading-percent"',
    'id="cooking-loading-note"',
    'id="cooking-loading-bar"',
    'cooking-error',
  ]) assert.ok(html.includes(marker), marker);
  assert.match(html, />0\/20</);
  assert.match(html, /自由料理台/);
  assert.match(html, /自由叠放食材，最多 20 层/);
  assert.match(html, /rel="icon" href="data:,"/);
  assert.doesNotMatch(html, /cooking-loading-elapsed|已等待\s*[\d.]+\s*秒/);
});

test("the pure-food focus control stays inside the visible 3d stage", async () => {
  const html = await readFile(htmlPath, "utf8");
  const stageStart = html.indexOf('<section class="cooking-stage"');
  const stageEnd = html.indexOf("</section>", stageStart);
  const focusControl = html.indexOf('class="focus-button"');

  assert.ok(stageStart >= 0);
  assert.ok(stageEnd > stageStart);
  assert.ok(focusControl > stageStart && focusControl < stageEnd);
});

test("the pure-food focus control is a persistent stage overlay", async () => {
  const css = await readFile(cssPath, "utf8");
  const rule = css.match(/\.cooking-stage\s*>\s*\.focus-button\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /z-index:\s*[5-9]/);
  assert.match(rule, /min-height:\s*(?:4[8-9]|[5-9]\d)px/);
});

test("root page is an original cooking map catalog with burger playable and sushi upcoming", async () => {
  const [html, css] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
  ]);
  for (const marker of [
    'lang="zh-CN"',
    'class="home-shell"',
    'href="./cooking.html"',
    'data-map="burger"',
    'data-map="sushi"',
    'aria-disabled="true"',
    "自由汉堡店",
    "深夜寿司店",
    "下一张地图",
  ]) assert.ok(html.includes(marker), marker);
  assert.match(html, /自由做菜/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /background-image\s*:\s*url\(/i);
  assert.doesNotMatch(html, /Papa|老爹|pizzeria|burgeria/i);
});

test("page and modules use only relative static imports with no socket dependency", async () => {
  const [html, app, loader] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(loaderPath, "utf8"),
  ]);
  assert.match(html, /href="\.\/cooking\.css"/);
  assert.match(html, /src="\.\/cooking-loader\.mjs"/);
  assert.match(app, /from "\.\/vendor\/three\.module\.min\.js"/);
  assert.match(app, /from "\.\/cooking-solo-stage\.mjs"/);
  assert.match(loader, /import\("\.\/cooking-solo-app\.mjs"\)/);
  for (const forbidden of ["WebSocket", "axios", 'from "/', "https://", "http://"]) {
    assert.equal(`${app}\n${loader}`.includes(forbidden), false, forbidden);
  }
});

test("mobile CSS protects touch targets, safe areas, WebGL states, and reduced motion", async () => {
  const css = await readFile(cssPath, "utf8");
  for (const marker of [
    "env(safe-area-inset-top)",
    "env(safe-area-inset-bottom)",
    "min-height: 44px",
    "touch-action: none",
    ":focus-visible",
    "@media (orientation: landscape) and (max-height: 560px)",
    "@media (prefers-reduced-motion: reduce)",
    "@supports (min-height: 100dvh)",
    "min-height: 100dvh",
    ".cooking-loading",
    ".cooking-loading__spinner",
    ".cooking-loading__progress",
    ".cooking-loading__meta",
    ".cooking-error",
    ".tutorial-coach",
    ".tutorial-pointer",
    ".finish-sheet",
    ".feedback-sheet",
    ".feedback-preview",
    "height: clamp(38rem, 72dvh, 48rem)",
  ]) assert.ok(css.includes(marker), marker);
  assert.doesNotMatch(css, /background-image\s*:\s*url\(/i);
});

test("uses only in-world feedback and contains no text drop-intent control", async () => {
  const [html, css, app] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(cssPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);
  assert.doesNotMatch(html, /cooking-drop-intent|放在最上层|塞到最下层|放回原料格/);
  assert.doesNotMatch(css, /cooking-drop-intent|data-intent=/);
  assert.doesNotMatch(app, /DROP_INTENT_COPY|cooking-drop-intent|放在最上层|塞到最下层|放回原料格/);
});

test("app exposes concise ingredient/sauce summaries and action-matched tutorial coaching", async () => {
  const app = await readFile(appPath, "utf8");
  for (const marker of [
    "LAYER_NAMES",
    "SAUCE_NAMES",
    "TUTORIAL_COPY",
    'pick:',
    'drop:',
    'rotate:',
    'sauce:',
    'assemble:',
    'finish:',
    "stage.rotateSelected",
    "stage.toggleExpanded",
    "stage.resetCamera",
    "stage.undo",
    "stage.finish",
    "stage.continueEditing",
    "stage.skipTutorial",
    "stage.replayTutorial",
    "mountSoloCookingLifecycle",
    "createFinishFocusManager",
    "detail.message",
  ]) assert.ok(app.includes(marker), marker);
});
