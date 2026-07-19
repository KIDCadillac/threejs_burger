import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../app/static/styles.css", import.meta.url),
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
});

test("revealing the reaction stage never scales its 44px skip target smaller", () => {
  const hiddenStage = ruleBody(".reaction-stage.reaction-stage--hidden");

  assert.doesNotMatch(hiddenStage, /transform:\s*scale\(/);
});
