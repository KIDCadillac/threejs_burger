import test from "node:test";
import assert from "node:assert/strict";

import * as characterReaction from "../app/static/character-reaction.mjs";
import {
  REACTION_DURATION_MS,
  REACTION_PHASES,
} from "../app/static/reaction-model.mjs";

const { characterReactionMarkup } = characterReaction;

function extractSvgGroup(markup, attribute) {
  const start = markup.indexOf(`<g ${attribute}>`);
  assert.notEqual(start, -1, `missing SVG group: ${attribute}`);

  let depth = 0;
  for (const match of markup.slice(start).matchAll(/<\/?g\b[^>]*>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      return markup.slice(start, start + match.index + match[0].length);
    }
  }

  assert.fail(`unclosed SVG group: ${attribute}`);
}

function makeReactionHarness() {
  const caption = { textContent: "initial caption" };
  const scheduled = [];
  const cancelled = [];
  const phases = [];
  const completions = [];
  const root = {
    dataset: {},
    querySelector(selector) {
      assert.equal(selector, "[data-reaction-caption]");
      return caption;
    },
  };
  const options = {
    scheduleTimeout(callback, at) {
      const handle = { callback, at };
      scheduled.push(handle);
      return handle;
    },
    cancelTimeout(handle) {
      cancelled.push(handle);
    },
    onPhase(phase, plan) {
      phases.push({ phase, plan });
    },
    onComplete(plan) {
      completions.push(plan);
    },
  };

  return {
    root,
    caption,
    scheduled,
    cancelled,
    phases,
    completions,
    options,
  };
}

test("the reaction schedule mirrors the model and returns fresh data", () => {
  const schedule = characterReaction.createReactionSchedule();
  const expected = [
    ...REACTION_PHASES.map(({ name, at, caption }) => ({
      phase: name,
      at,
      caption,
    })),
    { phase: "complete", at: REACTION_DURATION_MS },
  ];

  assert.deepEqual(schedule, expected);
  schedule[0].phase = "mutated";
  schedule.at(-1).at = -1;
  schedule.push({ phase: "extra", at: 5000 });
  assert.deepEqual(characterReaction.createReactionSchedule(), expected);
});

test("playing a mixed recipe initializes the reaction dataset", () => {
  const { root, options } = makeReactionHarness();

  characterReaction.playCharacterReaction(
    root,
    ["mustard", "chili", "chili", "sour"],
    options,
  );

  assert.deepEqual(root.dataset, {
    primaryReaction: "chili",
    primaryIntensity: "2",
    secondaryReaction: "mustard",
    secondaryIntensity: "1",
    foodBitten: "false",
    phase: "notice",
  });
});

test("the bite event updates the stage and reports its reaction plan", () => {
  const { root, caption, scheduled, phases, options } = makeReactionHarness();
  const expectedPlan = {
    primary: "chili",
    primaryIntensity: 2,
    secondary: "mustard",
    secondaryIntensity: 1,
  };

  characterReaction.playCharacterReaction(
    root,
    ["mustard", "chili", "chili", "sour"],
    options,
  );
  const bite = scheduled.find(({ at }) => at === 1100);

  assert.ok(bite, "bite callback should be scheduled");
  bite.callback();
  assert.equal(root.dataset.phase, "bite");
  assert.equal(root.dataset.foodBitten, "true");
  assert.equal(caption.textContent, "咔嚓！");
  assert.deepEqual(phases, [{ phase: "bite", plan: expectedPlan }]);
});

test("phase callbacks tolerate a missing caption node", () => {
  const { root, scheduled, phases, options } = makeReactionHarness();
  root.querySelector = () => null;

  characterReaction.playCharacterReaction(root, ["chili"], options);
  const bite = scheduled.find(({ at }) => at === 1100);

  assert.doesNotThrow(() => bite.callback());
  assert.equal(root.dataset.phase, "bite");
  assert.equal(root.dataset.foodBitten, "true");
  assert.equal(phases.at(-1).phase, "bite");
});

test("phase callbacks update the current caption node after replacement", () => {
  const { root, caption, scheduled, options } = makeReactionHarness();
  const replacement = { textContent: "replacement caption" };
  let currentCaption = caption;
  root.querySelector = (selector) => {
    assert.equal(selector, "[data-reaction-caption]");
    return currentCaption;
  };

  characterReaction.playCharacterReaction(root, ["chili"], options);
  currentCaption = replacement;
  scheduled.find(({ at }) => at === 1100).callback();

  assert.equal(caption.textContent, "initial caption");
  assert.equal(replacement.textContent, "咔嚓！");
});

test("complete is terminal and idempotent", () => {
  const {
    root,
    caption,
    scheduled,
    phases,
    completions,
    options,
  } = makeReactionHarness();

  characterReaction.playCharacterReaction(root, ["chili"], options);
  const complete = scheduled.find(({ at }) => at === 4000);

  assert.ok(complete, "complete callback should be scheduled");
  complete.callback();
  complete.callback();
  scheduled.find(({ at }) => at === 1100).callback();
  assert.equal(completions.length, 1);
  assert.deepEqual(phases, []);
  assert.equal(root.dataset.phase, "notice");
  assert.equal(caption.textContent, "initial caption");
});

test("cancelling clears every timer and invalidates saved callbacks", () => {
  const {
    root,
    caption,
    scheduled,
    cancelled,
    phases,
    completions,
    options,
  } = makeReactionHarness();
  const playback = characterReaction.playCharacterReaction(
    root,
    ["chili"],
    options,
  );

  assert.equal(
    scheduled.length,
    characterReaction.createReactionSchedule().length,
  );
  playback.cancel();
  playback.cancel();

  assert.deepEqual(cancelled, scheduled);
  scheduled.forEach(({ callback }) => callback());
  assert.equal(root.dataset.phase, "notice");
  assert.equal(root.dataset.foodBitten, "false");
  assert.equal(caption.textContent, "initial caption");
  assert.deepEqual(phases, []);
  assert.deepEqual(completions, []);
});

test("cancel clears only callbacks that have not executed", () => {
  const { root, scheduled, cancelled, options } = makeReactionHarness();
  const playback = characterReaction.playCharacterReaction(
    root,
    ["chili"],
    options,
  );
  const notice = scheduled.find(({ at }) => at === 0);
  const bite = scheduled.find(({ at }) => at === 1100);

  notice.callback();
  bite.callback();
  playback.cancel();

  assert.deepEqual(
    cancelled,
    scheduled.filter((handle) => handle !== notice && handle !== bite),
  );
});

test("cancelling after natural completion clears no expired handles", () => {
  const {
    root,
    scheduled,
    cancelled,
    completions,
    options,
  } = makeReactionHarness();
  const playback = characterReaction.playCharacterReaction(
    root,
    ["chili"],
    options,
  );

  scheduled.forEach(({ callback }) => callback());
  playback.cancel();

  assert.equal(completions.length, 1);
  assert.deepEqual(cancelled, []);
});

test("an empty recipe initializes neutral reaction data without throwing", () => {
  const { root, options } = makeReactionHarness();

  assert.doesNotThrow(() => {
    characterReaction.playCharacterReaction(root, [], options);
  });
  assert.equal(root.dataset.primaryReaction, "none");
  assert.equal(root.dataset.primaryIntensity, "0");
  assert.equal(root.dataset.secondaryReaction, "none");
  assert.equal(root.dataset.secondaryIntensity, "0");
});

test("Node default timers can be cancelled immediately", () => {
  const root = {
    dataset: {},
    querySelector() {
      return null;
    },
  };

  assert.doesNotThrow(() => {
    const playback = characterReaction.playCharacterReaction(root, []);
    playback.cancel();
  });
});

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

test("the fire effect is mouth-anchored inside the articulated head", () => {
  const markup = characterReactionMarkup({ victim: "玩家", snackKind: "fry" });
  const head = extractSvgGroup(markup, 'data-bone="head"');
  const mouthAnchor = extractSvgGroup(head, 'data-effect="mouth-anchor"');
  const fire = extractSvgGroup(mouthAnchor, 'data-effect="fire"');
  const fireGradientId = markup.match(
    /<radialGradient id="([^"]+-fire)"/,
  )?.[1];

  assert.equal(markup.match(/data-effect="fire"/g)?.length, 1);
  assert.ok(fireGradientId);
  assert.ok(fire.includes(`fill="url(#${fireGradientId})"`));
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
  const allIds = (markup) =>
    [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const resourceIds = (markup) =>
    [...markup.matchAll(/<(?:linearGradient|radialGradient|mask) id="([^"]+)"/g)]
      .map((match) => match[1]);
  const firstAllIds = allIds(first);
  const secondAllIds = allIds(second);
  const firstIds = resourceIds(first);
  const secondIds = resourceIds(second);

  assert.deepEqual(
    firstAllIds.filter((id) => secondAllIds.includes(id)),
    [],
  );
  for (const markup of [first, second]) {
    const section = markup.match(/<section\b([^>]*)>/);
    assert.ok(section);
    assert.ok(section[1].includes('class="character-reaction"'));
    assert.ok(section[1].includes("data-character-reaction"));
    assert.equal(section[1].includes(" id="), false);
  }
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
