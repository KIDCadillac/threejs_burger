# Tactile Food Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace geometric snack drawings with cartoon-real food assets and let players drag one to four sauce bottles onto an opened food.

**Architecture:** Keep room and turn commands stable while widening the recipe invariant in the Python domain from exactly two sauces to one through four. Add a pointer-event drag controller in `app.js`; keep drag position local and submit only the ordered final recipe. Reuse cropped concept-art foods as lightweight PNG assets.

**Tech Stack:** FastAPI, Python dataclasses, vanilla JavaScript Pointer Events, HTML/CSS, Pillow asset cropping, pytest, Playwright CLI.

---

### Task 1: Widen the Recipe Invariant

**Files:**
- Modify: `tests/test_domain.py`
- Modify: `app/domain.py`

- [ ] Write tests proving one and four sauces are accepted, while zero and five are rejected:

```python
def test_recipe_accepts_one_to_four_sauces() -> None:
    one = GameState.create("ONE", ["p1", "p2"], first_player="p1")
    one.lock_recipe("p1", 0, ("chili",))
    assert one.players["p1"].recipe.sauces == ("chili",)

    four = GameState.create("FOUR", ["p1", "p2"], first_player="p1")
    four.lock_recipe("p1", 0, ("chili", "mustard", "sour", "sticky"))
    assert len(four.players["p1"].recipe.sauces) == 4
```
- [ ] Run `python -m pytest tests/test_domain.py -q` and verify the new tests fail against the two-sauce invariant.
- [ ] Change the invariant and preserve the complete tuple:

```python
if not 1 <= len(sauce_tuple) <= 4:
    raise RuleError("必须选择 1 到 4 份调味料")
player.recipe = Recipe(position=position, sauces=sauce_tuple)
```
- [ ] Re-run `python -m pytest tests/test_domain.py -q` and verify PASS.

### Task 2: Add Real Food Assets

**Files:**
- Create: `app/static/art/foods/fry.png`
- Create: `app/static/art/foods/nugget.png`
- Create: `app/static/art/foods/donut.png`
- Create: `app/static/art/foods/cookie.png`
- Create: `app/static/art/foods/onion-ring.png`
- Create: `app/static/art/foods/mochi.png`
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Modify: `tests/test_app.py`

- [ ] Add a failing static asset test for all six `/static/art/foods/*.png` URLs and `snack-piece__image`:

```python
for kind in ("fry", "nugget", "donut", "cookie", "onion-ring", "mochi"):
    assert client.get(f"/static/art/foods/{kind}.png").status_code == 200
assert "snack-piece__image" in client.get("/static/app.js").text
```
- [ ] Crop the six approved food subjects from `shared-table.png` into square PNG assets with dark-edge padding.
- [ ] Render the real asset and retain the CSS shape as fallback:

```javascript
return `<span class="snack-piece snack--${kind}"><img class="snack-piece__image" src="/static/art/foods/${kind}.png" alt=""><i></i><i></i><i></i></span>`;
```
- [ ] Run the focused asset and client tests and verify PASS.

### Task 3: Implement Touch Drag and Four Slots

**Files:**
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Modify: `tests/test_app.py`

- [ ] Add a failing test for the pointer controller and four slots:

```python
for marker in ("pointerdown", "pointermove", "pointerup", "sauce-drag-ghost", "food-drop-target", "MAX_SAUCES = 4"):
    assert marker in client.get("/static/app.js").text or marker in client.get("/static/styles.css").text
```
- [ ] Add pointer capture, ghost movement, hit testing, and outside-drop cancellation:

```javascript
function finishSauceDrag(event) {
  const droppedOnFood = document.elementFromPoint(event.clientX, event.clientY)?.closest(".food-drop-target");
  if (droppedOnFood && selectedSauces.length < MAX_SAUCES) selectedSauces.push(draggedSauce);
  clearSauceDrag();
  render(lastMessage);
}
```
- [ ] Render four slots and allow completion with one through four sauces:

```javascript
const MAX_SAUCES = 4;
const canLock = deploymentOpened && selectedSauces.length >= 1 && selectedSauces.length <= MAX_SAUCES;
${[0, 1, 2, 3].map((index) => recipeSlot(index, selectedSauces[index])).join("")}
```
- [ ] Add sauce-layer markup to the open food and replay, including positions for layers 0 through 3.
- [ ] Re-run focused tests and the complete suite.

### Task 4: Mobile Interaction QA

**Files:**
- Modify: `README.md`

- [ ] Use Playwright at 390×844 to verify a drag outside the food cancels.
- [ ] Drag four sauces into the food, remove one, re-add it, and complete deployment.
- [ ] Verify no horizontal overflow, console errors, or active touch targets below 44×44 CSS pixels.
- [ ] Update the playtest guide and run `python -m pytest -q`.
