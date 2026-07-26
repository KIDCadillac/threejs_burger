# UI and gameplay review checklist

Mark every item as **pass**, **needs improvement**, or **fail** after each self-check.

## First impression

- The screen reads as a silver burger food truck, not a phone webpage.
- A new player understands the customer, target burger, workbench, ingredients, and serve action within ten seconds.
- The primary action is visually dominant and no secondary control covers the food.

## Layout

- Desktop uses a true landscape layout with left order, central workbench, right status, and bottom ingredients.
- Mobile uses a compact portrait layout without clipped controls or forced desktop scaling.
- Tablet does not look like a narrow phone strip with empty side space.
- Safe areas, browser chrome, long text, and large text settings do not hide critical controls.

## Interaction

- Ingredients are easy to pick up, highlight while held, and land where expected.
- Correct placement gives a green response; invalid placement gives a red response and shake.
- Undo, trash, reset, pause, focus, and serve are discoverable.
- Layer order is readable and removable without accidental selection.
- Buttons have press feedback and minimum comfortable touch targets.

## Game continuity

- Customer arrival, order preview, cooking, serving, reaction, reward, and next customer form one uninterrupted loop.
- Timer, patience, score, coins, and combo update immediately.
- At least eight varied orders are available.
- Correct, wrong, and timeout outcomes all recover into a valid next state.
- Save and reload preserve the intended run and economy state.

## Motion and performance

- Ingredient pickup, bounce, stack compression, customer reaction, coin reward, combo, and results motion are visible but quick.
- Camera or UI motion does not block input or cause repeated animation.
- Reduced-motion settings remain usable.
- No console errors, frozen controls, layout jumps, or unbounded asset loading.

## Final acceptance

- Complete three full runs without manual state repair.
- Record the five worst issues found, fix them, and retest.
- Run the complete automated suite.
- Recheck all six target viewport sizes without using generated screenshots.

