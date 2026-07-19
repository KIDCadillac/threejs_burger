# Interactive Food Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-playable vertical slice where players privately open and season a food, then switch to a shared table to bluff, pick, eat, and watch the trap replay.

**Architecture:** Keep the Python domain, WebSocket protocol, matchmaking, and bot behavior unchanged. Add a small client-only deployment interaction state in `app.js`, render the two approved visual phases with responsive HTML/CSS, and use generated concept art as progressively enhanced scene backdrops.

**Tech Stack:** FastAPI, vanilla JavaScript modules, HTML/CSS, pytest, Playwright browser QA.

---

### Task 1: Lock the New Client Contract with Failing Tests

**Files:**
- Modify: `tests/test_app.py`

- [ ] **Step 1: Write the failing test**

```python
def test_client_contains_interactive_deployment_and_shared_table() -> None:
    script = client.get("/static/app.js").text
    styles = client.get("/static/styles.css").text
    for marker in (
        "deploymentOpened",
        'data-action="open-snack"',
        "prep-workbench",
        "shared-table-scene",
        "tutorial-coach",
        "trap-cutaway",
    ):
        assert marker in script or marker in styles


def test_cartoon_real_scene_assets_are_served() -> None:
    for path in ("/static/art/deployment-counter.png", "/static/art/shared-table.png"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pytest tests/test_app.py::test_client_contains_interactive_deployment_and_shared_table tests/test_app.py::test_cartoon_real_scene_assets_are_served -q`

Expected: FAIL because the state markers and art files do not exist.

- [ ] **Step 3: Copy the two approved concept images into the application**

Copy the approved generated deployment and shared-table PNG files into `app/static/art/` as `deployment-counter.png` and `shared-table.png`.

- [ ] **Step 4: Re-run only the asset test**

Run: `pytest tests/test_app.py::test_cartoon_real_scene_assets_are_served -q`

Expected: PASS; the client marker test remains FAIL.

### Task 2: Implement the Private Open-and-Season Flow

**Files:**
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Test: `tests/test_app.py`

- [ ] **Step 1: Add the client-only interaction state**

```javascript
let deploymentOpened = false;

function resetDeploymentInteraction() {
  deploymentOpened = false;
  selectedSauces = [];
}
```

Reset it when a new round starts or a different snack is selected.

- [ ] **Step 2: Replace the mixing screen with the workbench composition**

Render a `.prep-workbench` containing the scene backdrop, the selected food close-up, a four-step progress row, and sauce controls. Sauce buttons remain disabled until `deploymentOpened` is true.

- [ ] **Step 3: Add the open action**

```javascript
if (action === "open-snack") {
  deploymentOpened = true;
  render(lastMessage);
}
```

The open button label comes from the selected snack kind: cut open, lift lid, tear pack, or peel film.

- [ ] **Step 4: Style the workbench and open-food states**

Add `.prep-workbench`, `.food-operation`, `.food-operation--open`, `.deployment-steps`, `.sauce-rack`, and mobile safe-area rules. Use the deployment PNG as a backdrop with a gradient fallback.

- [ ] **Step 5: Run the focused test**

Run: `pytest tests/test_app.py::test_client_contains_interactive_deployment_and_shared_table -q`

Expected: still FAIL only for later shared-table or replay markers.

### Task 3: Build the Shared Table Turn Screen

**Files:**
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Test: `tests/test_app.py`

- [ ] **Step 1: Add the face-to-face scene markup**

Wrap the existing public snack board in `.shared-table-scene`; render two `.table-witch` panels and keep all positions driven by the server `snacks` array.

- [ ] **Step 2: Preserve existing turn commands**

Keep the current event payloads unchanged:

```javascript
send({ type: "snack.aim", position: Number(target.dataset.position) });
send({ type: "gesture.send", key });
send({ type: "snack.confirm" });
```

- [ ] **Step 3: Style the public table**

Use `shared-table.png` as an atmospheric backdrop, then place the live snack grid and aim marker above it. Ensure the secret position is only styled for the owning viewer.

- [ ] **Step 4: Run existing privacy and WebSocket tests**

Run: `pytest tests/test_protocol.py tests/test_app.py::test_websocket_create_and_join_room -q`

Expected: PASS, proving the redesign did not expose the opponent recipe or change commands.

### Task 4: Add First-Run Coaching and Food Cutaway Replay

**Files:**
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Test: `tests/test_app.py`

- [ ] **Step 1: Add tutorial persistence**

```javascript
const tutorialComplete = localStorage.getItem("witch-food-tutorial") === "done";
```

Show `.tutorial-coach` only during practice until the player finishes the first deployment; include a skip button that stores `done`.

- [ ] **Step 2: Enhance the reveal markup**

Wrap the replay food in `.trap-cutaway`, add an open-food state, and animate both sauce layers into the visible interior before the result card appears.

- [ ] **Step 3: Respect reduced motion**

Keep all important state changes visible without animation inside `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 4: Run the full automated suite**

Run: `pytest -q`

Expected: all tests PASS with no warnings or errors.

### Task 5: Mobile QA and Handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Start a clean server and open single-player practice**

Run: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`

- [ ] **Step 2: Test at 390×844**

Complete deployment, wait for the computer, aim at a snack, use an emote, confirm the pick, and observe either a safe result or trap reveal.

- [ ] **Step 3: Check visual and interaction quality**

Verify no horizontal overflow, no console errors, all primary touch targets are at least 44×44 CSS pixels, and scene images have gradient fallbacks.

- [ ] **Step 4: Update the README playtest section**

Document the new four-step deployment and shared-table turn flow.

- [ ] **Step 5: Run final verification**

Run: `pytest -q`

Expected: all tests PASS.
