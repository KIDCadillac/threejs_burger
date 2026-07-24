import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPath = new URL("../app/static/cooking.html", import.meta.url);
const cssPath = new URL("../app/static/cooking.css", import.meta.url);
const homePath = new URL("../app/static/index.html", import.meta.url);
const homeCssPath = new URL("../app/static/home.css", import.meta.url);
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

test("home page presents replica duel as a clear secondary game action", async () => {
  const [html, css] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
  ]);

  for (const marker of [
    'class="lobby-action lobby-action--duel"',
    'href="./replica-duel.html"',
    'class="bottom-nav"',
    "双人轮换",
    "复刻对决",
  ]) assert.ok(html.includes(marker), marker);

  assert.match(css, /\.lobby-actions\s*\{[\s\S]*grid-template-columns:\s*5rem 5rem/);
  assert.match(css, /\.lobby-action\s*\{[\s\S]*min-height:\s*5rem/);
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*1fr\)/);
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

test("root page is a one-screen game lobby with shop mode primary", async () => {
  const [html, css] = await Promise.all([
    readFile(homePath, "utf8"),
    readFile(homeCssPath, "utf8"),
  ]);
  for (const marker of [
    'lang="zh-CN"',
    'class="lobby-shell"',
    'class="lobby-hud"',
    'id="daily-checkin"',
    'id="cookbook-sheet"',
    'id="home-map-viewport"',
    'id="home-map-track"',
    'data-home-map="burger"',
    'data-home-map="sushi"',
    'data-map-direction="-1"',
    'data-map-direction="1"',
    'id="home-map-dots"',
    'id="home-map-count"',
    'id="map-primary-action"',
    'aria-disabled="true"',
    'data-home-action="daily-checkin"',
    'data-home-action="cookbook"',
    'href="./cooking.html?mode=orders"',
    'href="./cooking.html?mode=practice"',
    'href="./replica-duel.html"',
    "今日营业",
    "开门营业",
    "每日签到",
    "汉堡图鉴",
    "自由练习",
    "复刻对决",
    "深夜寿司店",
    "寿司店筹备中",
    "左右滑动切换地图",
  ]) assert.ok(html.includes(marker), marker);
  assert.match(html, /今天也要好好做汉堡/);
  assert.ok(
    html.indexOf('href="./cooking.html?mode=orders"') < html.indexOf('href="./replica-duel.html"'),
    "三单营业入口保持首要",
  );
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /min-height:\s*(?:44|48|52|56)px/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.home-map-track\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.home-map-viewport\s*\{[^}]*touch-action:\s*pan-y/s);
  assert.doesNotMatch(css, /background-image\s*:\s*url\(/i);
  assert.doesNotMatch(html, /Papa|老爹|pizzeria|burgeria/i);
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
