import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const moduleUrl = new URL("../app/static/view-navigation.mjs", import.meta.url);

test("screen changes reset scroll while same-screen rerenders keep position", async () => {
  assert.ok(existsSync(fileURLToPath(moduleUrl)), "view navigation module is required");
  const { createViewNavigation } = await import(moduleUrl);
  const scrolls = [];
  const navigation = createViewNavigation({
    scrollTo: (x, y) => scrolls.push([x, y]),
  });

  assert.equal(navigation.enter("mixing-editor"), true);
  assert.equal(navigation.enter("mixing-editor"), false);
  assert.equal(navigation.enter("turn"), true);
  assert.deepEqual(scrolls, [[0, 0], [0, 0]]);
});
