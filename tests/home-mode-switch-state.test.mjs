import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBusinessOpen } from "../home-mode-switch-state.mjs";

test("business starts open unless the player explicitly closed it", () => {
  assert.equal(normalizeBusinessOpen(null), true);
  assert.equal(normalizeBusinessOpen(undefined), true);
  assert.equal(normalizeBusinessOpen(true), true);
  assert.equal(normalizeBusinessOpen("open"), true);
  assert.equal(normalizeBusinessOpen(false), false);
  assert.equal(normalizeBusinessOpen("closed"), false);
  assert.equal(normalizeBusinessOpen("unknown"), false);
});

test("homepage gates the first booth entrance until the startup sheet closes", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = new URL("../", import.meta.url);
  const [html, css, lobby] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("home.css", root), "utf8"),
    readFile(new URL("home-lobby-app.mjs", root), "utf8"),
  ]);

  assert.match(html, /burger-truck-camera is-entry-pending/);
  assert.doesNotMatch(html, /burger-truck-camera is-arriving/);
  assert.match(css, /\.burger-truck-camera\.is-entry-pending\s*\{[\s\S]*?opacity:\s*0/);
  assert.match(lobby, /initialTruckEntryBlocked = shouldOpenDailyCheckin/);
  assert.match(lobby, /openSheet[\s\S]*?\|\| document\.hidden/);
  assert.match(lobby, /camera\.classList\.remove\("is-entry-pending"\)/);
  assert.match(lobby, /camera\.classList\.add\("is-arriving"\);[\s\S]*?initialTruckEntryStarted = true/);
  assert.match(
    lobby,
    /businessOpen = true;[\s\S]*?writeBusinessOpen\(true\);[\s\S]*?renderBusiness\(\);[\s\S]*?replayActiveTruckArrival\(\)/,
  );
  assert.match(
    lobby,
    /if \(!initialTruckEntryStarted\)[\s\S]*?scheduleInitialTruckArrival\(110\)/,
  );
  assert.match(lobby, /window\.addEventListener\("load"/);
  assert.match(lobby, /document\.addEventListener\("visibilitychange"/);
});
