import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SUPPORTED_SNACK_KINDS,
  foodAssemblyMarkup,
} from "../app/static/food-assembly.mjs";

const effects = readFileSync(
  new URL("../app/static/effects.js", import.meta.url),
  "utf8",
);

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

test("legacy snack keys render the food named by the visible UI label", () => {
  const variants = {
    fry: "fries",
    nugget: "hamburger",
    donut: "donut",
    cookie: "cookie",
    "onion-ring": "sandwich",
    mochi: "jelly-cup",
  };
  for (const [kind, variant] of Object.entries(variants)) {
    assert.match(
      foodAssemblyMarkup(kind),
      new RegExp(`data-food-variant="${variant}"`),
    );
  }
  assert.match(effects, /"onion-ring": \{ label: "三明治"/);
  assert.match(effects, /"mochi": \{ label: "果冻"/);

  const sandwich = foodAssemblyMarkup("onion-ring");
  assert.match(sandwich, /data-food-layer="bread-top"/);
  assert.match(sandwich, /data-food-layer="bread-bottom"/);
  assert.match(sandwich, /data-food-layer="sandwich-filling"/);
  assert.match(sandwich, /data-bite-cross-section/);

  const jelly = foodAssemblyMarkup("mochi");
  assert.match(jelly, /data-food-layer="jelly-cup"/);
  assert.match(jelly, /data-food-layer="jelly"/);
  assert.match(jelly, /(?:opacity="\.[0-9]+"|fill-opacity="\.[0-9]+")/);
});
