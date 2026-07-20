import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPath = new URL("../app/static/cooking.html", import.meta.url);
const cssPath = new URL("../app/static/cooking.css", import.meta.url);
const appPath = new URL("../app/static/cooking-solo-app.mjs", import.meta.url);

test("standalone cooking page is accessible, Chinese, and contains the full playable HUD", async () => {
  const html = await readFile(htmlPath, "utf8");
  for (const marker of [
    'lang="zh-CN"',
    'id="cooking-canvas"',
    'aria-describedby="cooking-objective"',
    'id="cooking-objective"',
    'id="cooking-progress"',
    'id="cooking-summary"',
    'data-action="rotate-left"',
    'data-action="rotate-right"',
    'data-action="camera-reset"',
    'data-action="toggle-expanded"',
    'data-action="undo"',
    'data-action="reset"',
    'data-action="finish"',
    'data-action="continue"',
    'data-action="restart"',
    'data-action="tutorial-skip"',
    'data-action="tutorial-replay"',
    'role="dialog"',
    'aria-labelledby="finish-title"',
    'tabindex="-1"',
    'role="status"',
    'aria-live="polite"',
    'cooking-loading',
    'cooking-error',
  ]) assert.ok(html.includes(marker), marker);
  assert.match(html, /自由料理台/);
  assert.match(html, /先把七层食材装到中央餐盘/);
  assert.match(html, /rel="icon" href="data:,"/);
});

test("page and module use only relative static imports with no socket or network dependency", async () => {
  const [html, app] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);
  assert.match(html, /href="\.\/cooking\.css"/);
  assert.match(html, /src="\.\/cooking-solo-app\.mjs"/);
  assert.match(app, /from "\.\/vendor\/three\.module\.min\.js"/);
  assert.match(app, /from "\.\/cooking-solo-stage\.mjs"/);
  for (const forbidden of ["WebSocket", "fetch(", "axios", 'from "/', "https://", "http://"]) {
    assert.equal(app.includes(forbidden), false, forbidden);
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
    ".cooking-error",
    ".tutorial-coach",
    ".tutorial-pointer",
    ".finish-sheet",
  ]) assert.ok(css.includes(marker), marker);
  assert.doesNotMatch(css, /background-image\s*:\s*url\(/i);
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
