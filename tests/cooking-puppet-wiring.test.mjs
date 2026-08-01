import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("cooking page uses a clean first-person counter without puppet scenery", async () => {
  const html = await readFile(new URL("cooking.html", root), "utf8");

  assert.match(html, /class="first-person-cooking"/);
  assert.match(html, /data-experience="first-person-counter"/);
  assert.match(html, /id="cooking-action-label"/);
  assert.match(html, /id="first-person-hands"/);
  assert.match(html, /first-person-puppet-hand\.png/);
  assert.doesNotMatch(html, /silver-puppet-booth-frame\.png/);
  assert.doesNotMatch(html, /puppet-booth-strings\.png/);
  assert.doesNotMatch(html, /marionette-rig\.png/);
  assert.doesNotMatch(html, /puppet-chef-(?:body|arm-left|arm-right)\.png/);
  assert.match(html, /id="puppet-order-progress"/);
  assert.match(html, /id="puppet-order-progress">0\/6/);
  assert.match(html, /id="finish-reaction"/);
  assert.match(html, /id="finish-score"/);
  assert.match(html, /id="finish-coins"/);
  assert.match(html, /data-action="view-finished">查看成品/);
  assert.match(html, /data-action="restart">再做一份/);
  assert.match(html, /data-action="finish"/);
  assert.match(html, /data-action="reset">重做订单/);
  assert.doesNotMatch(html, /🍔|🧀|🥩|🏙️|✦/u);
});

test("cooking loader and app wire the fixed burger loop without a puppet performer", async () => {
  const [loader, app, css] = await Promise.all([
    readFile(new URL("cooking-loader.mjs", root), "utf8"),
    readFile(new URL("cooking-solo-app.mjs", root), "utf8"),
    readFile(new URL("cooking.css", root), "utf8"),
  ]);

  assert.doesNotMatch(loader, /importPuppetPerformer/);
  assert.doesNotMatch(loader, /puppetPerformer/);
  assert.match(loader, /importFirstPersonHands/);
  assert.match(loader, /handPerformer\?\.handleStageChange\?\.\(detail\)/);
  assert.match(loader, /dataset\.debug/);
  assert.match(app, /chooseRecipe\(CLASSIC_BURGER_RECIPE_ID, \{ resume: false \}\)/);
  assert.match(app, /evaluateClassicBurger/);
  assert.match(app, /validateClassicTransition/);
  assert.match(app, /settleClassicBurgerAttempt/);
  assert.match(app, /stage\.setCameraLocked\?\.\(true\)/);
  assert.match(await readFile(new URL("cooking-solo-stage.mjs", root), "utf8"), /reason: "reset-fit"/);
  assert.match(css, /\.first-person-cooking \.cooking-stage/);
  assert.match(css, /\.first-person-cooking \.first-person-action-label/);
  assert.match(css, /\.first-person-cooking \.workbench-slot-controls \{ display: none; \}/);
  assert.match(css, /\.first-person-cooking\[data-debug="true"\] \.header-actions/);
});
