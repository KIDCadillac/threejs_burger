import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPath = new URL("../app/static/cooking.html", import.meta.url);
const cssPath = new URL("../app/static/cooking.css", import.meta.url);
const homePath = new URL("../app/static/index.html", import.meta.url);
const homeCssPath = new URL("../app/static/home.css", import.meta.url);
const homeAppPath = new URL("../app/static/home-lobby-app.mjs", import.meta.url);
const appPath = new URL("../app/static/cooking-solo-app.mjs", import.meta.url);
const loaderPath = new URL("../app/static/cooking-loader.mjs", import.meta.url);
const feedbackPath = new URL("../app/static/cooking-feedback.mjs", import.meta.url);

function attribute(tag, name) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null;
}

function hasBooleanAttribute(tag, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|>|$)`).test(tag);
}

function tagWithAttribute(html, tagName, name, value) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "g"))]
    .map((match) => match[0])
    .find((tag) => attribute(tag, name) === value) ?? "";
}

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
    'id="focus-layer-manager"',
    'id="focus-layer-list"',
    'id="focus-layer-count"',
    'data-action="focus-layer-replace"',
    'id="focus-layer-replace-panel"',
    'data-action="delete-focused-layer"',
    'id="focus-layer-hint"',
    'id="workbench-slot-controls"',
    'data-slot-lines',
    'data-slot-buttons',
    'data-slot-regions',
    'data-slot-region-menu',
    'data-slot-hint',
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
    'data-action="highlight-open"',
    'data-action="highlight-close"',
    'data-action="highlight-previous"',
    'data-action="highlight-next"',
    'id="highlight-sheet"',
    'id="highlight-video"',
    'id="highlight-download"',
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
  assert.match(html, />0\/60</);
  assert.match(html, /自由料理台/);
  assert.match(html, /自由叠放食材，最多 60 层/);
  assert.match(html, /不看配方，最多 60 层/);
  assert.match(html, /至少放 2 层食材后完成料理/);
  assert.doesNotMatch(html, /装完\s*7\s*层|再装\s*7\s*层/);
  assert.match(html, /rel="icon" href="data:,"/);
  assert.doesNotMatch(html, /cooking-loading-elapsed|已等待\s*[\d.]+\s*秒/);
});

test("workbench slot controls overlay the canvas with touch-safe, focus-aware controls", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /\.workbench-slot-controls\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(css, /\.workbench-slot-control[\s\S]*min-width:\s*52px;/);
  assert.match(css, /\.workbench-slot-control[\s\S]*min-height:\s*52px;/);
  assert.match(css, /\.workbench-slot-controls\[hidden\][^}]*display:\s*none;/s);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("home page uses a large buffered shop carousel without the old four-button grid", async () => {
  const [html, css, app] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
    readFile(homeAppPath, "utf8"),
  ]);

  assert.equal((html.match(/data-map-template/g) ?? []).length, 2);
  assert.ok(html.includes("新店预告"));
  assert.ok(html.includes("寿司店筹备中"));
  assert.doesNotMatch(html, /class="lobby-actions"/);
  assert.doesNotMatch(html, /data-home-mode-index=/);
  assert.doesNotMatch(html, /id="map-subtitle"/);
  assert.match(html, /<div class="diner-sign">[\s\S]*data-business-toggle[\s\S]*id="lobby-title"/);
  assert.doesNotMatch(html, /class="open-shop-button"/);
  assert.match(css, /--home-map-height:\s*clamp\(/);
  assert.match(css, /\.business-sign-button\s*\{/);
  assert.match(css, /\.home-map-slide\s*\{[^}]*transform-origin:\s*center center/s);
  assert.ok(app.includes("slide.style.transform = motion;"));
  assert.ok(app.includes('slide.style.setProperty("--map-shade-opacity", String(pose.shadeOpacity));'));
  assert.match(
    css,
    /transform:\s*translate3d\(0,\s*0,\s*0\)\s*scale\(1\)/,
  );
  assert.match(css, /transform\s+280ms\s+cubic-bezier\(\.22,\.8,\.2,1\)/);
  assert.match(css, /\.home-map-viewport\.is-dragging \.home-map-slide\s*\{\s*transition:\s*none;\s*\}/);
  assert.doesNotMatch(css, /\.lobby-actions\s*\{/);
});

test("home business control looks and behaves like a physical wooden hanging sign", async () => {
  const [html, css, app] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
    readFile(homeAppPath, "utf8"),
  ]);

  assert.match(html, /class="business-sign__board"/);
  assert.match(html, /class="business-sign__welcome"[^>]*>WELCOME</);
  assert.match(html, /id="map-status">已打烊</);
  assert.match(html, /id="business-label">点击开门营业</);
  assert.match(css, /\.business-sign__board\s*\{/);
  assert.match(css, /repeating-linear-gradient\(/);
  assert.match(css, /\.business-sign__board::before/);
  assert.match(css, /\.business-sign-button\.is-flipping\s*\{[^}]*animation:\s*business-sign-flip/s);
  assert.match(css, /@keyframes business-sign-flip/);
  assert.match(css, /\.lobby-stage\.is-open\s+\.business-sign__board/);
  assert.doesNotMatch(css, /\.lobby-stage\.is-open\s+\.business-sign-button\s*\{/);
  assert.match(app, /businessOpen\s*\?\s*"点击关门打烊"\s*:\s*"点击开门营业"/);
  assert.match(app, /classList\.add\("is-flipping"\)/);
  assert.match(app, /animationend/);
});

test("home carousel cards expose store emblems, lightweight depth shade, and closing shutters", async () => {
  const [html, css, app] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
    readFile(homeAppPath, "utf8"),
  ]);

  assert.match(html, /class="hero-burger" data-store-emblem="burger"/);
  assert.match(html, /class="sushi-platter" data-store-emblem="sushi"/);
  assert.equal((html.match(/class="shop-shutter(?: [^"]*)?"/g) ?? []).length, 2);
  assert.match(css, /\.home-map-slide::before/);
  assert.match(css, /var\(--map-shade-opacity\)/);
  assert.doesNotMatch(css, /filter:\s*blur\(var\(--map-blur\)\)/);
  assert.match(css, /\.home-map-slide\.is-closing \.shop-shutter/);
  assert.ok(app.includes("slide.style.transform = motion;"));
  assert.ok(app.includes("slide.style.opacity = String(pose.opacity);"));
  assert.ok(!app.includes('slide.style.setProperty("--map-motion",'));
  assert.ok(!app.includes('slide.style.setProperty("--map-opacity",'));
  assert.ok(app.includes('slide.style.setProperty("--map-shade-opacity", String(pose.shadeOpacity));'));
});

test("leaving a shop closes the shutter while the card starts moving without a dead pause", async () => {
  const app = await readFile(homeAppPath, "utf8");

  assert.match(app, /function beginShopClose\(/);
  assert.match(
    app,
    /replayBusinessFlip\(\);[\s\S]*classList\.add\("is-closing"\)[\s\S]*renderWheel\(step\);[\s\S]*queueWheelFinish\(\)/,
  );
  assert.match(app, /prefers-reduced-motion/);
  assert.doesNotMatch(app, /SHOP_CLOSE_DELAY_MS|closeTimer/);
  assert.match(app, /const WHEEL_TRANSITION_MS = 280;/);
});

test("finishing a map switch recycles one buffered card instead of rebuilding all five", async () => {
  const app = await readFile(homeAppPath, "utf8");

  assert.match(app, /function advanceBufferedMapSlides\(/);
  assert.match(app, /shiftBufferedCardOffset/);
  assert.match(
    app,
    /function finishWheelTransition\([\s\S]*resetBufferedWheel\(\{\s*step:\s*arrivedStep\s*\}\)/,
  );
});

test("map gestures can interrupt shop animation and arriving opens without locking input", async () => {
  const [css, app] = await Promise.all([
    readFile(homeCssPath, "utf8"),
    readFile(homeAppPath, "utf8"),
  ]);

  assert.match(app, /function settleWheelForInteraction\(/);
  assert.match(app, /createLatestFrameScheduler/);
  assert.match(app, /wheelFrameScheduler\.schedule\(progress\)/);
  assert.match(app, /wheelFrameScheduler\.cancel\(\)/);
  assert.match(
    app,
    /function beginMapDrag\(event\)[\s\S]*if \(wheelTransitioning\) settleWheelForInteraction\(\)/,
  );
  assert.match(
    app,
    /function playShopOpen\(\)[\s\S]*classList\.add\("is-opening"\)/,
  );
  assert.doesNotMatch(
    app,
    /function playShopOpen\(\)[\s\S]{0,500}wheelTransitioning\s*=\s*true/,
  );
  assert.match(css, /@keyframes shop-shutter-open/);
  assert.match(css, /\.home-map-slide\.is-opening \.shop-shutter/);
});

test("committed map swipes continue from the released drag pose without snapping backward", async () => {
  const app = await readFile(homeAppPath, "utf8");

  assert.match(app, /dragProgressFromDelta/);
  assert.match(
    app,
    /function endMapDrag\(event,[\s\S]*wheelFrameScheduler\.flush\(\)[\s\S]*moveMap\(direction,\s*\{\s*fromProgress\s*\}\)/,
  );
  assert.match(
    app,
    /function beginShopClose\(step,\s*nextIndex,\s*\{\s*persist = true,\s*fromProgress = 0\s*\} = \{\}\)[\s\S]*renderWheel\(fromProgress\)/,
  );
});

test("home store cards read as a burger food truck and a sushi counter with stone service", async () => {
  const [html, css] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
  ]);

  assert.match(html, /class="food-truck-shell"/);
  assert.equal((html.match(/class="food-truck-wheel/g) ?? []).length, 2);
  assert.match(html, /class="sushi-bar-seats"/);
  assert.match(html, /class="sushi-stone-service"/);
  assert.match(css, /\.food-truck-shell\s*\{/);
  assert.match(css, /\.sushi-stone-service\s*\{/);
  assert.match(css, /\.home-map-slide\.is-opening \.sushi-stone-service/);
  assert.match(css, /\.home-map-slide\.is-closing \.food-truck-wheel/);
  assert.match(css, /\.home-map-slide\.is-opening \.food-truck-shell/);
  assert.match(css, /\.home-map-slide\.is-closing \.diner-scene--sushi/);
});

test("home lobby uses responsive flow and keeps the active mode inside its map card", async () => {
  const [html, css, app] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
    readFile(homeAppPath, "utf8"),
  ]);

  assert.match(
    html,
    /class="home-map-viewport"[\s\S]*id="home-mode-indicator"[\s\S]*data-map-direction="1"/,
  );
  assert.doesNotMatch(html, /class="home-map-meta"|id="home-map-count"/);
  assert.match(css, /\.lobby-stage\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:/s);
  assert.match(css, /\.map-carousel\s*\{[^}]*position:\s*relative;/s);
  assert.doesNotMatch(css, /\.map-carousel\s*\{[^}]*top:\s*8\.1rem;/s);
  assert.match(css, /calc\(100vh\s*-\s*17rem\)/);
  assert.match(css, /@supports\s*\(height:\s*100dvh\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(app, /home-map-count|mapCount/);
});

test("the public page exposes a touch-safe playable highlight replay dialog", async () => {
  const [html, css, app] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(cssPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);
  const openButton = tagWithAttribute(html, "button", "data-action", "highlight-open");
  const dialog = tagWithAttribute(html, "div", "id", "highlight-sheet");
  const video = tagWithAttribute(html, "video", "id", "highlight-video");
  const download = tagWithAttribute(html, "a", "id", "highlight-download");

  assert.equal(attribute(openButton, "aria-haspopup"), "dialog");
  assert.equal(attribute(openButton, "aria-controls"), "highlight-sheet");
  assert.equal(hasBooleanAttribute(openButton, "disabled"), false);
  assert.equal(attribute(dialog, "role"), "dialog");
  assert.equal(attribute(dialog, "aria-modal"), "true");
  assert.equal(attribute(dialog, "aria-labelledby"), "highlight-title");
  assert.equal(attribute(dialog, "tabindex"), "-1");
  assert.equal(hasBooleanAttribute(dialog, "hidden"), true);
  assert.equal(hasBooleanAttribute(video, "controls"), true);
  assert.equal(hasBooleanAttribute(video, "playsinline"), true);
  assert.equal(hasBooleanAttribute(video, "hidden"), true);
  assert.equal(hasBooleanAttribute(download, "download"), true);
  assert.equal(hasBooleanAttribute(download, "hidden"), true);
  assert.match(html, /最近 8 秒高清短视频/);
  assert.doesNotMatch(html, /最近 6 秒 GIF 操作回放/);

  assert.match(app, /createCookingHighlightReplayCoordinator/);
  assert.match(app, /createCanvasReplayRecorder/);
  assert.match(app, /highlights\?\.observe/);
  assert.match(app, /recorder:\s*replayRecorder/);
  assert.match(css, /\.highlight-sheet\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*40/s);
  assert.match(css, /\.highlight-sheet\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(css, /#highlight-video\s*\{[^}]*width:\s*100%[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.highlight-actions\s+a\s*\{[^}]*min-height:\s*44px/s);
});

test("recipe selector publishes four original references plus free cooking without brand copy", async () => {
  const [html, css, app] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(cssPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);
  for (const marker of [
    'id="recipe-selector"',
    'aria-labelledby="recipe-selector-title"',
    'data-action="recipe-select"',
    'data-recipe-id="classic-beef"',
    'data-recipe-id="melty-cheese"',
    'data-recipe-id="double-melty-cheese"',
    'data-recipe-id="tower-double-beef"',
    "自由料理",
    "小馆经典牛肉堡",
    "融金芝士牛肉堡",
    "双层融金芝士堡",
    "三层高塔双牛堡",
    'id="recipe-reference"',
    'id="recipe-reference-name"',
    'id="recipe-reference-steps"',
    'data-action="recipe-change"',
    "更换参考",
  ]) assert.ok(html.includes(marker), marker);

  const cards = [...html.matchAll(
    /<button\b[^>]*data-action="recipe-select"[^>]*data-recipe-id="([^"]*)"[^>]*>/g,
  )];
  assert.deepEqual(cards.map((match) => match[1]), [
    "", "classic-beef", "melty-cheese", "double-melty-cheese", "tower-double-beef",
  ]);
  assert.doesNotMatch(html, /麦当劳|巨无霸|吉士汉堡包/u);
  assert.doesNotMatch(app, /developmentReferenceName/);
  assert.match(app, /from "\.\/burger-recipes\.mjs"/);
  assert.match(app, /stage\.selectReferenceRecipe/);

  const overlay = css.match(/\.recipe-selector\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(overlay, /position:\s*fixed/);
  assert.ok(Number(overlay.match(/z-index:\s*(\d+)/)?.[1]) > 40);
  assert.match(css, /\.recipe-selector\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.recipe-grid\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.recipe-card\s*\{[^}]*min-height:\s*(?:1[2-9]\d|[2-9]\d\d)px/s);
  assert.match(css, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.recipe-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("page modules import the authoritative stack limit instead of defining another one", async () => {
  const [app, feedback] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(feedbackPath, "utf8"),
  ]);

  for (const source of [app, feedback]) {
    assert.match(source, /import\s*\{[^}]*MAX_SOLO_STACK_LAYERS[^}]*\}\s*from\s*"\.\/cooking-solo-state\.mjs"/s);
  }
  assert.doesNotMatch(app, /(?:length\s*[>=]+|continue叠[^\n]*|最多\s*)20/);
  assert.doesNotMatch(feedback, /MAX_REPORT_LAYERS\s*=\s*20|slice\(\s*-?20\s*\)/);
});

test("the public cooking page is connected to the automatic feedback receiver", async () => {
  const html = await readFile(htmlPath, "utf8");

  assert.ok(html.includes(
    '<meta name="feedback-endpoint" content="https://script.google.com/macros/s/AKfycbyk3Fl5BUFRuan-SJYZk4n6QIlRQEHlloeXE1JMskpNJhsduV_1UfbhxoFRUj1my7cHhw/exec">',
  ));
  assert.ok(html.includes(
    '<meta name="feedback-upload-key" content="kid-burger-feedback-20260721-v1">',
  ));
});

test("the page exposes the complete accessible live tuning dialog contract", async () => {
  const html = await readFile(htmlPath, "utf8");
  const openButton = tagWithAttribute(html, "button", "data-action", "tuning-open");
  const dialog = tagWithAttribute(html, "div", "id", "tuning-sheet");

  assert.equal(attribute(openButton, "aria-haspopup"), "dialog");
  assert.equal(attribute(openButton, "aria-controls"), "tuning-sheet");
  assert.match(html, /<button\b(?=[^>]*data-action="tuning-open")[^>]*>\s*参数\s*<\/button>/);
  assert.ok(html.indexOf('id="tuning-sheet"') > html.indexOf('id="feedback-sheet"'));
  assert.equal(attribute(dialog, "role"), "dialog");
  assert.equal(attribute(dialog, "aria-modal"), "true");
  assert.equal(attribute(dialog, "aria-labelledby"), "tuning-title");
  assert.equal(attribute(dialog, "aria-hidden"), "true");
  assert.equal(hasBooleanAttribute(dialog, "hidden"), true);

  const tabMatches = [...html.matchAll(
    /<button\b[^>]*data-ingredient-id="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/button>/g,
  )];
  assert.deepEqual(tabMatches.map((match) => match[1]), [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "pickle", "top-bun",
    "onion", "middle-bun",
  ]);
  assert.deepEqual(tabMatches.map((match) => match[2].trim()), [
    "下层面包", "牛肉饼", "芝士", "番茄", "生菜", "酸黄瓜", "上层面包",
    "洋葱碎", "中层面包",
  ]);

  const expectedLimits = {
    presentationScale: { min: 0.55, max: 0.9, step: 0.01 },
    scaleX: { min: 0.6, max: 1.6, step: 0.01 },
    scaleY: { min: 0.4, max: 2.5, step: 0.01 },
    scaleZ: { min: 0.6, max: 1.6, step: 0.01 },
    sinkY: { min: 0, max: 0.18, step: 0.001 },
  };
  const tuningInputs = [...html.matchAll(/<input\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => attribute(tag, "data-tuning-key"));
  assert.equal(tuningInputs.length, 10);
  for (const [key, limits] of Object.entries(expectedLimits)) {
    const pair = tuningInputs.filter((tag) => attribute(tag, "data-tuning-key") === key);
    assert.deepEqual(pair.map((tag) => attribute(tag, "type")).sort(), ["number", "range"], key);
    for (const tag of pair) {
      assert.equal(Number(attribute(tag, "min")), limits.min, `${key} min`);
      assert.equal(Number(attribute(tag, "max")), limits.max, `${key} max`);
      assert.equal(Number(attribute(tag, "step")), limits.step, `${key} step`);
    }
  }

  for (const action of [
    "tuning-close", "tuning-copy", "tuning-reset-current", "tuning-reset-all",
  ]) {
    assert.ok(tagWithAttribute(html, "button", "data-action", action), action);
  }
  const status = tagWithAttribute(html, "p", "data-tuning-status", "");
  assert.equal(attribute(status, "role"), "status");
  assert.equal(attribute(status, "aria-live"), "polite");
  const fallback = tagWithAttribute(html, "textarea", "data-tuning-copy-fallback", "");
  assert.equal(hasBooleanAttribute(fallback, "readonly"), true);
  assert.equal(hasBooleanAttribute(fallback, "hidden"), true);
});

test("tuning CSS provides a safe responsive bottom sheet and wide side panel", async () => {
  const css = await readFile(cssPath, "utf8");
  const overlay = css.match(/\.tuning-sheet\s*\{([^}]+)\}/)?.[1] ?? "";
  const card = css.match(/\.tuning-card\s*\{([^}]+)\}/)?.[1] ?? "";
  const hidden = css.match(/\.tuning-sheet\[hidden\]\s*\{([^}]+)\}/)?.[1] ?? "";
  const zIndex = Number(overlay.match(/z-index:\s*(\d+)/)?.[1]);

  assert.match(overlay, /position:\s*fixed/);
  assert.ok(zIndex > 30, `z-index ${zIndex}`);
  assert.match(overlay, /align-items:\s*end/);
  assert.match(card, /width:\s*100%/);
  assert.match(card, /max-width:\s*100%/);
  assert.match(card, /max-height:\s*min\(86dvh,\s*48rem\)/);
  assert.match(card, /overflow-y:\s*auto/);
  assert.match(card, /overscroll-behavior:\s*contain/);
  assert.match(card, /env\(safe-area-inset-bottom\)/);
  assert.match(hidden, /display:\s*none/);
  assert.match(css, /\.tuning-tabs\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.tuning-inputs\s+input\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*44px/s);
  assert.match(css, /\.tuning-card\s+button[\s\S]*?min-height:\s*44px/);
  assert.match(css, /input\[type="number"\][\s\S]*?font-size:\s*16px/);
  assert.match(css, /\.tuning-copy-fallback\s*\{[^}]*font-size:\s*16px/s);
  assert.match(css, /\.tuning-inputs\s*\{[^}]*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media\s*\(min-width:\s*720px\)/);
  assert.match(css, /width:\s*clamp\(420px,\s*42vw,\s*460px\)/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*560px\)[\s\S]*?\.tuning-card\s*\{[^}]*max-height:[^;}]+[^}]*overflow-y:\s*auto/s);
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

test("daily check-in is centered inside phone safe areas without its ribbon covering content", async () => {
  const css = await readFile(homeCssPath, "utf8");
  const sheet = css.match(/\.lobby-sheet\s*\{([^}]+)\}/)?.[1] ?? "";
  const openSheet = css.match(/\.lobby-sheet\[data-open="true"\]\s*\{([^}]+)\}/)?.[1] ?? "";
  const daily = css.match(/\.daily-sheet\s*\{([^}]+)\}/)?.[1] ?? "";
  const ribbon = css.match(/\.daily-sheet\s*>\s*\.sheet-ribbon\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(sheet, /top:\s*50%/);
  assert.match(sheet, /left:\s*50%/);
  assert.match(sheet, /max-height:\s*calc\(100dvh/);
  assert.match(sheet, /env\(safe-area-inset-top\)/);
  assert.match(sheet, /env\(safe-area-inset-bottom\)/);
  assert.match(sheet, /overflow-y:\s*auto/);
  assert.match(openSheet, /translate\(-50%,\s*-50%\)/);
  assert.match(daily, /padding-top:\s*(?:4\.[5-9]|[5-9])rem/);
  assert.match(ribbon, /position:\s*absolute/);
  assert.match(ribbon, /top:\s*(?:0?\.)?\d+rem/);
  assert.match(ribbon, /left:\s*50%/);
  assert.match(ribbon, /margin:\s*0/);
});

test("home lobby refills five stable card slots after every map move", async () => {
  const app = await readFile(homeAppPath, "utf8");
  for (const marker of [
    "createMapCardWindow",
    "setupBufferedMapSlides",
    "refreshBufferedMapSlides",
    "pendingMapIndex",
    "data-card-offset",
    "renderWheel",
    '"pointerdown"',
    '"ArrowLeft"',
    '"ArrowRight"',
  ]) assert.ok(app.includes(marker), marker);
  for (const removed of [
    "setupMapLoopSlides",
    "data-map-clone",
    "wheelPhysicalIndex",
    "normalizeWheelLoop",
  ]) assert.equal(app.includes(removed), false, removed);
});

test("burger cookbook keeps recipe quick starts accessible without crowding the lobby", async () => {
  const [html, css] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
  ]);
  const sectionTag = tagWithAttribute(html, "section", "id", "cookbook-sheet");
  const sectionMatch = html.match(
    /<section\b[^>]*id="cookbook-sheet"[^>]*>[\s\S]*?<\/section>/,
  );

  assert.ok(sectionMatch, "burger cookbook sheet");
  assert.equal(attribute(sectionTag, "aria-labelledby"), "cookbook-title");
  assert.match(sectionMatch[0], /id="cookbook-title"/);

  const links = [...sectionMatch[0].matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
    .map((match) => ({
      html: match[0],
      tag: match[0].match(/^<a\b[^>]*>/)?.[0] ?? "",
    }));
  const expectedLinks = [
    ["./cooking.html?recipe=classic-beef", "小馆经典牛肉堡"],
    ["./cooking.html?recipe=melty-cheese", "融金芝士牛肉堡"],
    ["./cooking.html?recipe=double-melty-cheese", "双层融金芝士堡"],
    ["./cooking.html?recipe=tower-double-beef", "三层高塔双牛堡"],
    ["./cooking.html?mode=practice", "自由练习"],
  ];

  assert.deepEqual(links.map(({ tag }) => attribute(tag, "href")), expectedLinks.map(([href]) => href));
  for (const [href, publicName] of expectedLinks) {
    const link = links.find(({ tag }) => attribute(tag, "href") === href);
    assert.ok(link?.html.includes(publicName), `${href} uses ${publicName}`);
  }

  assert.doesNotMatch(html, /麦当劳|巨无霸|吉士汉堡包/u);

  const touchRule = css.match(/\.recipe-button\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(touchRule, /min-height:\s*(?:44|48|52|56)px/);
  assert.match(css, /\.lobby-sheet\[data-open="true"\]/);
});

test("page and modules use only relative static imports with no socket dependency", async () => {
  const [html, app, loader] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(loaderPath, "utf8"),
  ]);
  assert.match(html, /href="\.\/cooking\.css\?v=20260723-ui3"/);
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

test("mobile cooking UI keeps the 3D workbench dominant with an in-stage HUD", async () => {
  const [html, css] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  const shellStart = html.indexOf('<section class="game-shell"');
  const objectiveStart = html.indexOf('<section class="objective-card"');
  const stageStart = html.indexOf('<section class="cooking-stage"');
  const shellEnd = html.indexOf('</section>', stageStart) + '</section>'.length;
  assert.ok(shellStart >= 0, "game shell should exist");
  assert.ok(shellStart < objectiveStart, "objective belongs to the game shell");
  assert.ok(objectiveStart < stageStart, "HUD precedes the 3D stage");
  assert.ok(shellEnd > stageStart, "3D stage belongs to the game shell");

  const mobileStart = css.indexOf("@media (max-width: 700px)");
  const mobileEnd = css.indexOf("@media (prefers-reduced-motion: reduce)", mobileStart);
  const mobile = css.slice(mobileStart, mobileEnd);
  for (const marker of [
    ".game-shell",
    ".objective-card",
    ".recipe-reference",
    ".inventory-stock",
    ".cooking-stage",
    "#cooking-canvas",
    ".tutorial-coach",
  ]) assert.ok(mobile.includes(marker), marker);
  assert.match(mobile, /\.inventory-stock\s*\{[^}]*display:\s*none;/);
  assert.match(mobile, /\.objective-card\s*\{[^}]*position:\s*absolute;/);
  assert.match(mobile, /\.recipe-reference\s*\{[^}]*position:\s*absolute;/);
  assert.match(mobile, /\.cooking-stage\s*\{[^}]*min-height:\s*calc\(100dvh\s*-\s*68px\);/);
  assert.match(mobile, /#cooking-canvas\s*\{[^}]*height:\s*calc\(100dvh\s*-\s*68px\);/);
  assert.match(mobile, /\.tutorial-coach\s*\{[^}]*max-width:\s*min\(calc\(100%\s*-\s*24px\),\s*330px\);/);
  assert.match(mobile, /\.workbench-slot-control\[data-region="filling"\]\s*\{[^}]*top:\s*max\(var\(--slot-y\),\s*148px\);/);
  assert.match(mobile, /\.workbench-slot-controls__lines\s*\{[^}]*display:\s*none;/);
  assert.match(
    mobile,
    /\.workbench-slot-control\s*\{[^}]*background:\s*transparent;[^}]*filter:\s*none;/s,
  );
  assert.match(
    mobile,
    /\.workbench-slot-control__label\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s,
  );
  assert.match(
    mobile,
    /\.workbench-slot-controls__capsule\s*\{[^}]*top:\s*clamp\(248px,\s*36%,\s*320px\);[^}]*transform:\s*translateX\(-50%\)\s*!important;/s,
  );
  assert.match(mobile, /\.cooking-stage > \.focus-button\s*\{[^}]*top:\s*8px;/);
  assert.match(mobile, /\.objective-label\s*\{[^}]*display:\s*none;/);
});

test("the cooking workbench declares one reusable gesture grammar for every game mode", async () => {
  const html = await readFile(htmlPath, "utf8");
  assert.match(
    html,
    /class="cooking-stage"[^>]*data-control-grammar="tap-switch hold-choose drag-place pinch-zoom undo"/,
  );
  assert.match(html, /data-slot-hint[^>]*>轻触换材料，长按看全部，拖动做料理</);
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
