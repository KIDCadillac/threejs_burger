# Project working rules

Before changing code, read `README.md`, `docs/GAME_VISION.md`, `docs/UI_REVIEW_CHECKLIST.md`, `.agent/PLANS.md`, and the relevant design or implementation plan.

Work autonomously unless a missing product decision would materially change the result. Preserve existing coins, sign-in, settings, feedback, save data, and public deployment behavior.

For every meaningful change:

1. Add or update tests before implementation.
2. Run the affected tests and the full project test suite.
3. Start the project and check the served page and console.
4. Validate desktop, tablet, and mobile layouts.
5. Audit the result against `docs/UI_REVIEW_CHECKLIST.md`.
6. For gameplay changes, complete at least three full playable rounds.
7. Fix obvious visual, interaction, and continuity issues before reporting.

Do not claim completion merely because code was written. Completion requires verified behavior, a final code review, and a final UX review.

The main experience is a real game, not a collection of webpage panels. The silver burger food truck, customer order, large workbench, ingredient interaction, scoring feedback, and continuous next-order loop must remain the visual and interaction focus.

