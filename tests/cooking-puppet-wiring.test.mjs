import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("cooking page uses the real puppet booth and separated chef artwork", async () => {
  const html = await readFile(new URL("cooking.html", root), "utf8");

  assert.match(html, /class="puppet-cooking"/);
  assert.match(html, /silver-puppet-booth-frame\.png/);
  assert.match(html, /puppet-booth-strings\.png/);
  assert.match(html, /marionette-rig\.png/);
  assert.match(html, /puppet-chef-body\.png/);
  assert.match(html, /puppet-chef-arm-left\.png/);
  assert.match(html, /puppet-chef-arm-right\.png/);
  assert.match(html, /id="puppet-order-progress"/);
  assert.match(html, /data-action="finish"/);
  assert.match(html, /data-action="reset">重做订单/);
  assert.doesNotMatch(html, /🍔|🧀|🥩|🏙️|✦/u);
});

test("cooking loader connects every stage update to the puppet performer", async () => {
  const [loader, app, css] = await Promise.all([
    readFile(new URL("cooking-loader.mjs", root), "utf8"),
    readFile(new URL("cooking-solo-app.mjs", root), "utf8"),
    readFile(new URL("cooking.css", root), "utf8"),
  ]);

  assert.match(loader, /importPuppetPerformer/);
  assert.match(loader, /puppetPerformer\?\.handleStageChange\?\.\(detail\)/);
  assert.match(loader, /dataset\.debug/);
  assert.match(app, /chooseRecipe\("classic-beef", \{ resume: false \}\)/);
  assert.match(app, /recipeLayerProgress/);
  assert.match(css, /data-puppet-state="reach"/);
  assert.match(css, /data-puppet-state="carry"/);
  assert.match(css, /data-puppet-state="place"/);
  assert.match(css, /data-puppet-state="celebrate"/);
  assert.match(css, /\.puppet-cooking\[data-debug="true"\] \.header-actions/);
});
