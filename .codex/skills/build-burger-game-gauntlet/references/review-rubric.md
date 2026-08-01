# Burger Game Blind Review Rubric

## Review protocol

Score each item using only raw evidence:

- `2` = clearly passes in the supplied state or motion sequence.
- `1` = partly passes, ambiguous, or has a noticeable defect.
- `0` = fails, is missing, or cannot be verified.

Return `PASS` only when every hard gate scores `2` and the average of all applicable items is at least `1.6`. Missing evidence never earns `2`.

## Hard gates

### Correctness

- The requested order, state transition, and completion condition are correct.
- Left/right hand assignment matches the source station and visible hand anatomy.
- Horizontal input changes theme only; vertical input changes mode only.
- No adjacent card, scene, ingredient, or overlay overlaps the active center state.

### Contact and motion

- The hand visibly stays attached to the grabbed ingredient/tool throughout the meaningful gesture.
- The grabbed object does not move on its own while its hand is absent.
- Entry, contact, release, and exit read as one continuous action.
- Motion has believable weight and does not float, teleport, jitter, or bounce without cause.

### Visibility

- The burger, target plate, and current ingredient remain readable.
- The hand/overlay does not cover the primary action longer than necessary.
- Nothing is clipped by the playfield, browser edge, or another UI layer in the tested viewport.

### Technical

- Focused tests and the full repository test suite pass.
- Browser console has no new uncaught error.
- `git diff --check` passes.
- Entry-module cache versions are consistent and the deployed URL loads the new build.

## Quality items

### Visual language

- Shapes, outlines, palette, texture, and shadow match the existing flat warm game style.
- The result does not introduce glossy AI-render styling, photographic detail, emoji, or generic placeholders.
- Proportions and silhouettes are readable at the smallest supported viewport.

### Interaction feedback

- The player immediately understands what was selected and where it will go.
- Correct, wrong, and completed actions are distinguishable without reading debug text.
- Undo/reset/retry returns the stage to a deterministic state.

### Responsive behavior

- The complete action is usable at a narrow mobile viewport around 390 CSS px wide.
- Desktop layout does not stretch or separate hand, object, and target.
- Pointer/touch and keyboard paths preserve the same semantics where applicable.

### Evidence quality

- Before and after use the same viewport, URL, and gameplay state.
- Motion evidence contains start, contact/peak, and release/settle frames.
- The reviewer can reproduce the path from the recorded input sequence.

## Required critic output

1. `PASS` or `FAIL`.
2. Hard-gate scores with one evidence sentence each.
3. Three largest visible defects, ordered by player impact.
4. The smallest concrete fix for each defect.
5. Any claim that could not be verified from the evidence.
