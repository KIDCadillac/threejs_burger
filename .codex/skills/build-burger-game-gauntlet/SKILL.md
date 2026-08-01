---
name: build-burger-game-gauntlet
description: Build, repair, and finish the KIDCadillac threejs_burger game through one vertical slice at a time, with deterministic checks, same-state browser evidence, and a separate ruthless review pass. Use for burger-game gameplay, first-person hand interaction, homepage food/mode navigation, animation, visual polish, GitHub Pages releases, and laptop-to-desktop handoff work where "looks okay" is not an acceptable completion criterion.
---

# Burger Game Gauntlet

## Purpose

Turn one requested game outcome into a tested, visually reviewed, publishable vertical slice. Keep scope narrow enough that the player can experience the whole slice in one sitting.

Do not transplant the source space-game aesthetic or Blender workflow. Transfer its discipline: coherent asset rules, constant real-browser rendering, automated probes, and a builder/reviewer loop.

## Required context

Read these files completely before changing the game:

1. `references/project-contract.md`
2. `references/review-rubric.md`
3. The repository's current handoff, design QA, and art-direction documents when present.

Treat the repository and current browser output as truth when old documentation conflicts with code.

## Resource limit

Keep at most one sub-agent active for this project. Run builder and critic sequentially, never as a fan-out swarm. Work locally when a separate reviewer would not materially improve the result.

## Gauntlet workflow

### 1. Define one finish line

Write a one-sentence player-visible outcome and 3-7 observable acceptance criteria. Select one vertical slice, not a collection of loosely related screens.

Examples:

- "A hand grabs every burger ingredient from the correct side, follows it continuously, releases at the plate, and leaves the playfield."
- "Horizontal gestures switch burger/sushi while vertical gestures switch mode, without adjacent content overlapping the center."

Reject scope that mixes homepage redesign, sushi gameplay, editor cleanup, and burger interaction in one pass.

### 2. Capture the baseline

Run the current game in a real browser. Record the exact URL, viewport, input sequence, game step, and screenshot. Preserve this state recipe so the after image is comparable.

Inspect console errors and current automated tests before coding. Do not infer visual quality from source code alone.

### 3. Build the smallest coherent system

Prefer a reusable behavior or data rule over one-off coordinates and special-case timers. Bind animated overlays to real projected object positions when the illusion depends on contact.

Use existing approved assets or generate/import a deliberate asset. Do not replace important game art with emoji, arbitrary CSS shapes, fake text icons, or unrelated stock art.

Preserve input semantics and the art contract in `references/project-contract.md`.

### 4. Run deterministic gates

Run `scripts/run_repo_checks.ps1` from this skill. On Windows systems that block local scripts, invoke it with `powershell -NoProfile -ExecutionPolicy Bypass -File ...`. Also run focused tests for the modified system.

Treat any failed test, `git diff --check` error, cache-chain mismatch, uncaught browser error, or missing asset as a hard failure.

### 5. Capture the same state after the change

Use the same URL, viewport, input sequence, and game step as the baseline. Capture additional frames for motion timing when a single still cannot prove the behavior.

For animations, collect at minimum: start, contact/peak, release/settle. For gestures, capture both directions and the return path.

### 6. Run a blind critic pass

Give the critic only:

- the original player requirement;
- the acceptance criteria;
- raw before/after evidence with neutral labels;
- `references/review-rubric.md`.

Do not include the builder's rationale, effort, commit message, or preferred image. Require the critic to name visible evidence and return PASS or FAIL.

When no sub-agent is used, perform the same review in a fresh checklist pass after leaving the implementation context.

### 7. Iterate with a stop condition

Fix concrete failures and repeat deterministic plus visual gates. Limit the loop to three review rounds per slice. If the slice still fails, report the exact blocker and evidence instead of lowering the bar.

### 8. Hand off and publish

Update the laptop-to-desktop handoff with:

- player-visible result;
- files changed;
- tests and browser states checked;
- evidence paths;
- commit and branch;
- remaining P0/P1 work;
- exact resume commands.

Publish only when authorized. After push, verify the GitHub Pages URL with a cache-busting query and repeat the critical path once.

## Completion rule

Call a slice complete only when:

- every hard gate in `references/review-rubric.md` passes;
- deterministic checks pass;
- before/after evidence is comparable;
- the browser interaction works through the full player path;
- handoff documentation describes the actual published state.

"Implemented", "tests pass", and "looks better" are not completion by themselves.
