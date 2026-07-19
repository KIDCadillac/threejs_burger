import test from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORTED_SNACK_KINDS,
  foodAssemblyMarkup,
} from "../app/static/food-assembly.mjs";

test("every supported snack is rendered as code-native transparent SVG", () => {
  for (const kind of SUPPORTED_SNACK_KINDS) {
    const markup = foodAssemblyMarkup(kind);
    assert.match(markup, /data-food-assembly/);
    assert.match(markup, /data-food-state="whole"/);
    assert.match(markup, /data-food-state="bitten"/);
    assert.doesNotMatch(markup, /<image\b|\/static\/art\/foods\//);
  }
});

test("the hamburger has seven explicit layers and a real bitten cross-section", () => {
  const markup = foodAssemblyMarkup("nugget");
  for (const layer of [
    "bottom-bun", "patty", "cheese", "tomato", "lettuce", "sauce", "top-bun",
  ]) {
    assert.match(markup, new RegExp(`data-food-layer="${layer}"`));
  }
  assert.match(markup, /data-bite-cross-section/);
  assert.ok(
    markup.indexOf("data-bite-cross-section")
      > markup.indexOf('data-food-state="bitten"'),
  );
  for (const layer of ["bread", "patty", "cheese", "vegetable"]) {
    assert.match(markup, new RegExp(`data-cross-section-layer="${layer}"`));
  }
  assert.doesNotMatch(markup, /<mask\b|<circle[^>]+fill="black"/);
});

test("unknown and inherited snack keys safely fall back to the hamburger", () => {
  for (const kind of ["unknown", "constructor", "__proto__"]) {
    const markup = foodAssemblyMarkup(kind);
    assert.match(markup, /data-snack-kind="nugget"/);
    assert.match(markup, /data-food-layer="patty"/);
  }
});
