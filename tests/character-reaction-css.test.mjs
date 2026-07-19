import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  REACTION_DURATION_MS,
  REACTION_PHASES,
} from "../app/static/reaction-model.mjs";

const css = readFileSync(
  new URL("../app/static/character-reaction.css", import.meta.url),
  "utf8",
);

const cssRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(),
  declarations: match[2],
}));

function phaseWindowMs(phaseName) {
  const phaseIndex = REACTION_PHASES.findIndex(({ name }) => name === phaseName);
  assert.notEqual(phaseIndex, -1, `unknown reaction phase: ${phaseName}`);
  const start = REACTION_PHASES[phaseIndex].at;
  const end = REACTION_PHASES[phaseIndex + 1]?.at ?? REACTION_DURATION_MS;
  return end - start;
}

function animationsForPhase(phaseName) {
  const phaseMarker = `[data-phase="${phaseName}"]`;
  return cssRules
    .filter(({ selector }) => selector.includes(phaseMarker))
    .flatMap(({ selector, declarations }) => (
      [...declarations.matchAll(/\banimation\s*:\s*([^;]+);/g)]
        .map((match) => ({ selector, shorthand: match[1].trim() }))
    ));
}

function toMilliseconds(value, unit) {
  return Number(value) * (unit === "s" ? 1000 : 1);
}

function animationTotalMs(shorthand, maximumFireDuration) {
  const resolved = shorthand.replace(
    /var\(--reaction-fire-duration\)/g,
    `${maximumFireDuration}ms`,
  );
  const times = [...resolved.matchAll(/(\d*\.?\d+)(ms|s)\b/g)]
    .map((match) => toMilliseconds(match[1], match[2]));
  assert.ok(times.length >= 1, `animation has no duration: ${shorthand}`);

  const tokensWithoutFunctionsOrTimes = resolved
    .replace(/[a-z-]+\([^)]*\)/g, "")
    .replace(/\d*\.?\d+(?:ms|s)\b/g, "")
    .trim()
    .split(/\s+/);
  const iterationToken = tokensWithoutFunctionsOrTimes.find((token) => (
    /^\d*\.?\d+$/.test(token)
  ));
  const iterations = iterationToken ? Number(iterationToken) : 1;
  const delay = times[1] ?? 0;
  return delay + times[0] * iterations;
}

function extractBlock(marker) {
  const markerStart = css.indexOf(marker);
  assert.notEqual(markerStart, -1, `missing CSS block: ${marker}`);
  const openBrace = css.indexOf("{", markerStart);
  let depth = 0;

  for (let index = openBrace; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(openBrace + 1, index);
  }

  assert.fail(`unclosed CSS block: ${marker}`);
}

function keyframeTransformAt(animationName, percentage) {
  const keyframes = extractBlock(`@keyframes ${animationName}`);
  for (const match of keyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const offsets = match[1].split(",").map((offset) => offset.trim());
    if (!offsets.includes(percentage)) continue;

    const transform = match[2].match(/\btransform:\s*([^;]+);/)?.[1].trim();
    assert.ok(transform, `missing ${animationName} transform at ${percentage}`);
    return transform;
  }

  assert.fail(`missing ${animationName} keyframe at ${percentage}`);
}

test("phase animations finish inside their model-derived timeline windows", () => {
  const fireDurations = [...css.matchAll(
    /--reaction-fire-duration:\s*(\d*\.?\d+)ms;/g,
  )].map((match) => Number(match[1]));
  assert.deepEqual(fireDurations, [520, 560, 620, 680]);
  const maximumFireDuration = Math.max(...fireDurations);

  for (const phaseName of ["bite", "brace", "burst", "recover", "settle"]) {
    const window = phaseWindowMs(phaseName);
    const animations = animationsForPhase(phaseName);
    assert.ok(animations.length > 0, `${phaseName} has no phase animation`);

    for (const { selector, shorthand } of animations) {
      assert.ok(
        animationTotalMs(shorthand, maximumFireDuration) <= window,
        `${phaseName} animation exceeds ${window}ms: ${selector} (${shorthand})`,
      );
    }
  }

  assert.doesNotMatch(
    css,
    /\banimation(?:-iteration-count)?\s*:[^;{}]*\binfinite\b/,
  );
});

test("the head uses a fixed view-box neck pivot", () => {
  const headRule = cssRules.find(({ selector }) => (
    selector === '.reaction-rig [data-bone="head"]'
  ));
  assert.ok(headRule);
  assert.match(headRule.declarations, /transform-box:\s*view-box;/);
  assert.match(headRule.declarations, /transform-origin:\s*195px 241px;/);
  assert.doesNotMatch(headRule.declarations, /transform-origin:\s*\d+%/);
});

test("body and head phases have continuous transform endpoints", () => {
  const braceEnd = keyframeTransformAt("reaction-brace", "100%");
  const recoilStart = keyframeTransformAt("reaction-recoil", "0%");
  assert.equal(recoilStart, braceEnd);

  const braceHeadRule = cssRules.find(({ selector }) => (
    selector.includes('[data-phase="brace"]')
      && selector.includes('[data-bone="head"]')
  ));
  const braceHeadAnimation = braceHeadRule?.declarations.match(
    /\banimation:\s*([^;]+);/,
  )?.[1].trim();
  assert.match(braceHeadAnimation ?? "", /^reaction-head-brace 220ms\b/);

  const chewHeadRule = cssRules.find(({ selector }) => (
    selector.includes('[data-phase="chew"]')
      && selector.includes('[data-bone="head"]')
  ));
  const chewHeadAnimation = chewHeadRule?.declarations.match(
    /\banimation:\s*([^;]+);/,
  )?.[1].trim();
  assert.match(chewHeadAnimation ?? "", /\b2 both$/);

  const chewMouthRule = cssRules.find(({ selector }) => (
    selector === '.character-reaction[data-phase="chew"] .rig-mouth--open'
  ));
  const chewMouthAnimation = chewMouthRule?.declarations.match(
    /\banimation:\s*([^;]+);/,
  )?.[1].trim();
  assert.match(chewMouthAnimation ?? "", /\b2 both$/);
  assert.equal(
    keyframeTransformAt("reaction-chew", "100%"),
    keyframeTransformAt("reaction-chew", "0%"),
  );

  const biteEnd = keyframeTransformAt("reaction-head-bite", "100%");
  const chewStart = keyframeTransformAt("reaction-head-chew", "0%");
  const chewEnd = keyframeTransformAt("reaction-head-chew", "100%");
  const headBraceStart = keyframeTransformAt("reaction-head-brace", "0%");
  const headBraceEnd = keyframeTransformAt("reaction-head-brace", "100%");
  const headRecoilStart = keyframeTransformAt("reaction-head-recoil", "0%");
  assert.equal(chewStart, biteEnd);
  assert.equal(chewEnd, biteEnd);
  assert.equal(headBraceStart, chewEnd);
  assert.equal(headRecoilStart, headBraceEnd);

  for (const animationName of [
    "reaction-recoil",
    "reaction-head-recoil",
    "reaction-hair-whip",
    "reaction-arm-release",
  ]) {
    assert.equal(keyframeTransformAt(animationName, "100%"), "none");
  }

  for (const animationName of [
    "reaction-mouth-fan-left",
    "reaction-mouth-fan-right",
  ]) {
    assert.equal(keyframeTransformAt(animationName, "0%"), "none");
  }
});

test("the narrow rig keeps a side gutter while chili intensity scales upward", () => {
  const stageRule = cssRules.find(({ selector }) => selector === ".character-reaction");
  const rigRule = cssRules.find(({ selector }) => selector === ".reaction-rig");
  assert.ok(stageRule);
  assert.ok(rigRule);
  assert.match(stageRule.declarations, /box-sizing:\s*border-box;/);
  assert.match(stageRule.declarations, /padding-inline:\s*1\.375rem;/);
  assert.match(stageRule.declarations, /overflow:\s*hidden;/);
  assert.match(
    rigRule.declarations,
    /width:\s*min\(100%,\s*24rem\);/,
  );
  assert.doesNotMatch(css, /width:\s*min\(calc\(100% - 2\.75rem\),/);
  assert.match(rigRule.declarations, /overflow:\s*visible;/);

  const fireScales = [...css.matchAll(
    /--reaction-fire-scale:\s*(\d*\.?\d+);/g,
  )].map((match) => Number(match[1]));
  assert.deepEqual(fireScales, [0.82, 0.96, 1.08, 1.18]);
});

test("each primary reaction has its own burst and recovery language", () => {
  for (const [reaction, effect] of [
    ["chili", "fire"],
    ["mustard", "sneeze"],
    ["sour", "sour-wave"],
    ["sticky", "sticky-strands"],
  ]) {
    assert.match(css, new RegExp(`data-primary-reaction="${reaction}"[^\\n]*data-phase="burst"`));
    assert.match(css, new RegExp(`data-primary-reaction="${reaction}"[^\\n]*data-phase="recover"`));
    assert.match(css, new RegExp(`data-effect="${effect}"`));
  }
  assert.match(css, /data-primary-reaction="chili"[^\n]*data-effect="fire"/);
  assert.doesNotMatch(css, /data-primary-reaction="(?:mustard|sour|sticky)"[^\n]*data-effect="fire"/);
});

test("secondary reactions appear only after the recover phase consumes them", () => {
  for (const reaction of ["chili", "mustard", "sour", "sticky"]) {
    assert.match(
      css,
      new RegExp(`data-secondary-consumed="true"[^\\n]*data-secondary-reaction="${reaction}"[^\\n]*data-phase="recover"`),
    );
  }
});
