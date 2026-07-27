import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("homepage loads the layout editor assets", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(html, /home-layout-editor\.css/);
  assert.match(html, /home-layout-editor\.mjs/);
});

test("homepage exposes the main layout parts as editable elements", async () => {
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
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`data-layout-id="${id.replace(".", "\\.")}"`));
  }
});

test("editor keeps a persistent local layout and has an explicit edit-mode URL", async () => {
  const source = await readFile(new URL("home-layout-editor.mjs", root), "utf8");

  assert.match(source, /burger\.home\.layout\.v1/);
  assert.match(source, /query\.get\("layout"\) === "1"/);
  assert.match(source, /localStorage\.setItem/);
});
