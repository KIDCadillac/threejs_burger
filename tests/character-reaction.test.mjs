import test from "node:test";
import assert from "node:assert/strict";

import { characterReactionMarkup } from "../app/static/character-reaction.mjs";


test("all supported foods render both whole and bitten images", () => {
  for (const snackKind of [
    "fry",
    "nugget",
    "donut",
    "cookie",
    "onion-ring",
    "mochi",
  ]) {
    const markup = characterReactionMarkup({ victim: "玩家", snackKind });
    const foodPath = `/static/art/foods/${snackKind}.png`;

    assert.equal(markup.split(foodPath).length - 1, 2, snackKind);
  }
});

test("unknown and inherited snack keys fall back to nugget", () => {
  for (const snackKind of ["unknown", "constructor", "__proto__"]) {
    const markup = characterReactionMarkup({ victim: "玩家", snackKind });

    assert.equal(
      markup.split("/static/art/foods/nugget.png").length - 1,
      2,
      snackKind,
    );
  }
});

test("victim text is escaped before being used in markup", () => {
  const victim = `<img/onerror="alert(1)">&'"`;
  const escapedVictim =
    "&lt;img/onerror=&quot;alert(1)&quot;&gt;&amp;&#39;&quot;";
  const markup = characterReactionMarkup({ victim, snackKind: "nugget" });

  assert.equal(markup.includes(victim), false);
  assert.equal(markup.includes("<img/onerror"), false);
  assert.equal(markup.split(escapedVictim).length - 1, 2);
});

test("each stage owns unique and internally consistent SVG resource ids", () => {
  const first = characterReactionMarkup({ victim: "甲", snackKind: "fry" });
  const second = characterReactionMarkup({ victim: "乙", snackKind: "fry" });
  const resourceIds = (markup) =>
    [...markup.matchAll(/<(?:linearGradient|radialGradient|mask) id="([^"]+)"/g)]
      .map((match) => match[1]);
  const firstIds = resourceIds(first);
  const secondIds = resourceIds(second);

  assert.equal(firstIds.length, 4);
  assert.equal(secondIds.length, 4);
  for (const suffix of ["skin", "hoodie", "fire", "bitten-food-mask"]) {
    assert.ok(firstIds.some((id) => id.endsWith(`-${suffix}`)), suffix);
    assert.ok(secondIds.some((id) => id.endsWith(`-${suffix}`)), suffix);
  }
  for (const id of [...firstIds, ...secondIds]) {
    const owner = firstIds.includes(id) ? first : second;
    assert.ok(owner.includes(`url(#${id})`), id);
  }
  assert.deepEqual(
    firstIds.filter((id) => secondIds.includes(id)),
    [],
  );
});

test("the SVG title provides the stage accessible name without section duplication", () => {
  const markup = characterReactionMarkup({ victim: "玩家", snackKind: "nugget" });
  const title = markup.match(
    /<title id="([^"]+)">玩家的完整进食动画<\/title>/,
  );

  assert.ok(title);
  assert.ok(markup.includes(`role="img" aria-labelledby="${title[1]}"`));
  assert.equal(/<section[^>]+aria-label=/.test(markup), false);
  assert.ok(markup.includes('<p class="victim-label">玩家正在努力表情管理</p>'));
});
