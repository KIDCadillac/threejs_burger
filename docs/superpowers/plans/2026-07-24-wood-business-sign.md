# Wood Business Sign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lobby's generic business toggle with a tactile, accessible wooden hanging sign.

**Architecture:** Keep the existing business state and persistence functions. Add semantic sign layers in the existing homepage markup, style them as a carved wooden plaque with CSS, and replay a temporary flip class from the current toggle handler.

**Tech Stack:** HTML, CSS, browser JavaScript modules, Node test runner, pytest/FastAPI static delivery tests.

---

### Task 1: Lock the wooden sign contract with tests

**Files:**
- Modify: `tests/cooking-solo-page.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions requiring `business-sign__board`, a decorative `WELCOME` label, the two action phrases, `.business-sign-button.is-flipping`, wood-grain gradients, and `@keyframes business-sign-flip`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/cooking-solo-page.test.mjs
```

Expected: FAIL because the board layer and flip animation do not exist yet.

### Task 2: Implement structure, wood styling, and state feedback

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Modify: `app/static/home-lobby-app.mjs`

- [ ] **Step 1: Add the sign structure**

Wrap the sign text in `business-sign__board`, add a decorative `WELCOME` element, and change the initial action label to `点击开门营业`.

- [ ] **Step 2: Add the physical wooden treatment**

Make the button itself transparent, draw the two hanging ropes with pseudo-elements, and render the inner board using layered wood-grain gradients, carved borders, inset highlights, and a deep bottom shadow.

- [ ] **Step 3: Add the flip interaction**

Set action text to `点击关门打烊` or `点击开门营业`, add `is-flipping` on successful toggles, and remove it on `animationend` so every click can replay the effect.

- [ ] **Step 4: Run the focused test**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/cooking-solo-page.test.mjs
```

Expected: PASS.

### Task 3: Verify and publish

**Files:**
- Modify: deploy copies of `index.html`, `home.css`, and `home-lobby-app.mjs`

- [ ] **Step 1: Run all Node tests**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run all Python tests**

Run:

```powershell
& 'C:\Users\KID\AppData\Local\Programs\Python\Python313\python.exe' -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 3: Commit source and deploy**

Commit only the planned source, tests, and documentation; preserve the unrelated server log files. Copy the three homepage files into the deploy worktree, commit, and push `deploy/focus-layer` to `burger-public/main`.

- [ ] **Step 4: Verify the public files**

Fetch the public HTML, CSS, and JavaScript with `Invoke-WebRequest` and assert the new cache tag, board class, wood-grain rules, and flip animation are present.
