# Homepage Layout Editor Implementation Plan

> **For agentic workers:** Use the superpowers `executing-plans` skill to implement this plan task-by-task.

**Goal:** Add an opt-in editor to the real homepage so the owner can reposition, resize, rotate, hide, reorder, save, and export visual elements without affecting ordinary players.

**Architecture:** The production homepage remains unchanged unless the URL includes `?layout=1`. A pure state module owns normalized layout values and undo/redo history. A separate browser controller decorates existing elements marked with `data-layout-id`, renders a selection box and inspector, and persists layouts to local storage.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Pointer Events, localStorage, Node built-in test runner.

---

### Task 1: Layout state and history

**Files:**
- Create: `home-layout-editor-state.mjs`
- Create: `tests/home-layout-editor-state.test.mjs`

1. Write failing tests for defaults, normalization, updates, undo/redo, and import validation.
2. Run the tests and confirm the module is missing.
3. Implement the minimal pure state API.
4. Run the tests and confirm they pass.

### Task 2: Mark editable homepage groups

**Files:**
- Modify: `index.html`

1. Add stable `data-layout-id` attributes to the HUD, title, carousel controls, map-specific scene groups, and bottom navigation.
2. Load the editor controller as a separate ES module.
3. Keep normal homepage markup and behavior unchanged without the editor query parameter.

### Task 3: In-page manipulation UI

**Files:**
- Create: `home-layout-editor.mjs`
- Create: `home-layout-editor.css`

1. Enable the controller only for `?layout=1`.
2. Add selection, drag, resize, rotate, layer, visibility, lock, and opacity controls.
3. Apply the same saved rule to all buffered carousel clones sharing one layout ID.
4. Keep the editor usable on desktop and mobile without covering the whole stage.

### Task 4: Persistence and handoff

**Files:**
- Modify: `home-layout-editor.mjs`
- Modify: `home-layout-editor.css`

1. Add undo, redo, save, reset, import, and export.
2. Persist to localStorage and restore automatically in editor mode.
3. Allow copying a compact JSON layout for implementation handoff.

### Task 5: Verification and deployment

1. Run state tests and syntax checks for all ES modules.
2. Verify the normal URL contains no editor activation and the editor URL loads the editor module.
3. Commit and push to the GitHub Pages main branch.
4. Confirm the public HTML contains the deployed editor entrypoint.
