# Reference Burger Recipes Implementation Plan

> **Goal:** Add four familiar development-reference burger recipes to the solo cooking table while keeping the public UI, assets, and saved composition brand-neutral.

## Task 1: Add the recipe catalog

**Files:**
- Add `app/static/burger-recipes.mjs`
- Add `tests/burger-recipes.test.mjs`

- Define four immutable recipes with stable neutral IDs, original public names, development-only reference names, exact bottom-to-top solid steps, and sauce targets that reference an earlier solid slot.
- Validate every ingredient and sauce ID, unique step IDs, repeated-instance slots, and the absence of reference-brand terms from public copy.
- Keep the catalog independent from the legacy online `recipe_data.py` protocol.

## Task 2: Add a solo-only ingredient and recipe state profile

**Files:**
- Modify `app/static/cooking-solo-state.mjs`
- Modify `tests/cooking-solo-state.test.mjs`
- Add or modify a solo ingredient profile module if needed

- Introduce solo-only ingredient IDs `onion` and `middle-bun` without widening legacy `BURGER_LAYER_IDS`.
- Store `referenceRecipeId` separately from the assembled composition.
- Add an explicit reference-selection action; changing the reference must not clear the current stack.
- Preserve the selected reference across reset, exclude it from undo history, and keep it out of `serializeSoloComposition()`.
- Allow finishing any edible composition with at least two solid layers; preserve the 20-layer cap and 999 stock.

## Task 3: Build the missing models and cooking sauces

**Files:**
- Modify `app/static/burger-model-3d.mjs`
- Modify `app/static/condiment-tools-3d.mjs`
- Modify `app/static/burger-tuning.mjs`
- Modify `app/static/cooking-tuning-panel.mjs`
- Modify focused model, condiment, and tuning tests

- Add real 3D `onion` pieces and a flat, toasted `middle-bun` with accurate stack contact bounds.
- Add solo cooking sauce IDs `ketchup`, `mustard`, and `house-sauce` using the existing generic bottle/stroke geometry.
- Keep legacy prank sauces available to legacy modes only.
- Expose the two new solid ingredients in live tuning and verify no plate or layer floating under every supported tuning range.

## Task 4: Add reference selection and guidance

**Files:**
- Modify `app/static/cooking.html`
- Modify `app/static/cooking.css`
- Modify `app/static/cooking-solo-app.mjs`
- Modify `app/static/cooking-solo-stage.mjs`
- Modify focused page, app, and stage tests

- Show four public recipe cards plus a free-cooking card before the solo stage starts.
- Support `?recipe=<neutral-id>` deep links and fall back to the selector for invalid IDs.
- Pause 3D input while the selector is open and resume after selection.
- Show the selected public recipe name, step list, and a non-destructive “change reference” action.
- Keep manipulation free: no auto-assembly, no locked order, and no strict pass/fail recipe grading in this milestone.

## Task 5: Verify and publish

- Run all Node tests, all Python tests, module syntax checks, and `git diff --check`.
- Test 390×844 and desktop layouts in a real browser.
- Verify all four references, free mode, query-string routing, repeated patties/cheese/onion, middle-bun contact, sauces, reset, undo, focus, and 20-layer stacking.
- Confirm the public page does not display reference logos, packaging, product photography, or reference-brand text.
- Publish to the existing GitHub Pages URL only after the checks pass.
