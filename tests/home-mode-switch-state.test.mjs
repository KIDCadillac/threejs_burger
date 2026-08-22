import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_MODES,
  changeModeIndexForMap,
  normalizeBusinessOpen,
} from "../home-mode-switch-state.mjs";

test("business starts open unless the player explicitly closed it", () => {
  assert.equal(normalizeBusinessOpen(null), true);
  assert.equal(normalizeBusinessOpen(undefined), true);
  assert.equal(normalizeBusinessOpen(true), true);
  assert.equal(normalizeBusinessOpen("open"), true);
  assert.equal(normalizeBusinessOpen(false), false);
  assert.equal(normalizeBusinessOpen("closed"), false);
  assert.equal(normalizeBusinessOpen("unknown"), false);
});

test("burger homepage cycles through the new swipe-stack mode", () => {
  const practice = HOME_MODES.findIndex(({ id }) => id === "practice");
  const swipeStack = HOME_MODES.findIndex(({ id }) => id === "swipe-stack");
  assert.ok(swipeStack >= 0);
  assert.equal(changeModeIndexForMap("burger", practice, 1), swipeStack);
});

test("homepage keeps theme and mode gestures separate without an autoplay booth", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = new URL("../", import.meta.url);
  const [html, css, lobby] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("home-focus.css", root), "utf8"),
    readFile(new URL("home-lobby-app.mjs", root), "utf8"),
  ]);

  assert.match(html, /左右滑动切换料理主题/);
  assert.match(html, /上下滑动切换玩法/);
  assert.doesNotMatch(html, /burger-truck-camera/);
  assert.match(css, /touch-action: none/);
  assert.match(
    lobby,
    /gestureAxis === "horizontal"[\s\S]*?resolveSwipe[\s\S]*?moveTheme\(direction\)/,
  );
  assert.match(
    lobby,
    /gestureAxis === "vertical"[\s\S]*?resolveModeSwipe[\s\S]*?moveMode\(direction\)/,
  );
  assert.doesNotMatch(lobby, /showSheet\("daily-checkin"\)[\s\S]*?setTimeout/);
});
