# Silver food-truck main game implementation plan

## Goal

Turn the current burger prototype into a continuous eight-order food-truck game with a responsive landscape/portrait workbench, visible customer state, complete scoring loop, satisfying feedback, and preserved economy/save behavior.

## Existing behavior to retain

- Ingredient models, stacking controller, focus mode, undo, sauce interaction, and burger scoring.
- Coins, sign-in, settings, feedback upload, saved burger/run state, and GitHub Pages deployment.
- Customer phase state machine, audio hooks, and existing reaction animations.

## UI to rebuild

- Replace the phone-like orders overlay with a scene-first silver food-truck layout.
- Make customer/order, workbench, run status, and ingredients explicit responsive regions.
- Add visible patience, score, combo, pause/reset/trash, and layer controls.
- Hide lobby navigation while an order run is active.

## Implementation sequence

1. Baseline: run all tests, serve the current build, verify static entry points, and record retained architecture.
2. Order engine: test and extend the run from three to eight orders; remove hard-coded three-order labels and results.
3. Order variety: test eight difficulty steps, recipe naming, customer rotation, legal layer and sauce bounds.
4. Markup: introduce semantic truck, order, workbench, run-status, ingredient, and tool regions.
5. Responsive CSS: implement desktop landscape, tablet, and mobile portrait layouts for the six target sizes.
6. Scene art: build silver truck metal panels, rivets, hatch, wheel, awning, warm lamps, burger sign, and rotating menu lightbox with CSS/DOM assets.
7. Gameplay controls: wire pause, reset, trash/layer delete, score, combo, coins, patience, and next-customer continuity.
8. Feedback: add pickup bounce, stack compression, correct/wrong response, coin fly, combo pop, patience pulse, and result motion with reduced-motion support.
9. Persistence: confirm run, coins, settings, and burger state reload correctly.
10. Verification: full automated tests, served-page console audit, six viewport layout checks, and three complete eight-order runs.

## Test commands

- Node tests: `node --test tests/*.test.mjs`
- Python static tests: `python -m unittest discover -s tests -p "test_*.py"`
- Static server: `python -m http.server 4173`

Visual verification must use DOM/layout measurements and interaction assertions; do not generate screenshots or image data.

