import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../app/static/styles.css", import.meta.url),
  "utf8",
);
const reactionCss = readFileSync(
  new URL("../app/static/character-reaction.css", import.meta.url),
  "utf8",
);

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

test("the hidden reaction stage wins over the short-screen minimum height", () => {
  assert.match(
    css,
    /\.reaction-stage\.reaction-stage--hidden\s*\{[^}]*min-height:\s*0;[^}]*height:\s*0;/,
  );
});

test("recipe removal and animation skip controls guarantee 44px touch targets", () => {
  const recipeSlot = ruleBody(".recipe-slot");
  const skipEffect = ruleBody(".skip-effect");

  assert.match(recipeSlot, /min-height:\s*2\.75rem;/);
  assert.match(recipeSlot, /min-width:\s*2\.75rem;/);
  assert.match(skipEffect, /min-height:\s*2\.75rem;/);
  assert.match(skipEffect, /font-size:\s*0\.(?:75|8)rem;/);
});

test("short screens keep reaction captions legible", () => {
  const shortScreen = reactionCss.match(
    /@media \(max-height: 720px\)\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  assert.match(shortScreen, /font-size:\s*0\.(?:75|8)rem;/);
});

test("revealing the reaction stage never scales its 44px skip target smaller", () => {
  const hiddenStage = ruleBody(".reaction-stage.reaction-stage--hidden");

  assert.doesNotMatch(hiddenStage, /transform:\s*scale\(/);
});
