# Shared Snack Showdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the prototype to a shared mixed-snack board with private deployment animation, server-synchronized bluff/aim interaction, and hit replay with stronger facial reactions.

**Architecture:** Keep FastAPI/WebSocket and the server-authoritative `GameState`. Add public snack metadata and a small pending-pick state machine; keep recipes viewer-private until a hit. Rebuild the client board from server snack metadata and drive setup, bite, reaction, and replay as presentation-only animation stages.

**Tech Stack:** Python 3.13, FastAPI, dataclasses, pytest, native JavaScript, HTML/CSS, WebSocket.

---

## File map

- `app/domain.py`: snack layouts, pending-pick rules, bluff validation, confirmed picks and rematch reset.
- `app/protocol.py`: viewer-safe serialization for snacks, pending interaction and hit replay.
- `app/service.py`: confirm aimed picks on timeout.
- `app/main.py`: dispatch the three new WebSocket commands.
- `app/static/app.js`: mixed board, private deployment animation, synchronized aim/bluff UI, hit/replay sequence.
- `app/static/effects.js`: snack display metadata alongside sauce reaction metadata.
- `app/static/styles.css`: six snack shapes and the new interaction/animation stages.
- `tests/test_domain.py`: rule state-machine tests.
- `tests/test_protocol.py`: privacy and replay payload tests.
- `tests/test_service.py`: timeout behavior with an aimed snack.
- `tests/test_app.py`: WebSocket flow and client-contract tests.
- `README.md`: revised rules and browser acceptance steps.

### Task 1: Server domain state machine

**Files:** `tests/test_domain.py`, `app/domain.py`

- [ ] Add failing tests proving both players share one snack layout, `aim()` exposes a pending position without consuming it, the opponent can bluff once, the picker can change once, and `confirm_pick()` consumes the final position.
- [ ] Run `python -m pytest tests/test_domain.py -q` and verify failures mention missing `snacks`, `aim`, `send_bluff`, or `confirm_pick`.
- [ ] Add `SNACK_LAYOUTS`, `PendingPick`, `GameState.pending_pick`, `aim()`, `send_bluff()`, and `confirm_pick()`; clear pending state inside `pick()`, finish, and rematch.
- [ ] Run `python -m pytest tests/test_domain.py -q` and verify all domain tests pass.

### Task 2: Private protocol and timeout behavior

**Files:** `tests/test_protocol.py`, `tests/test_service.py`, `app/protocol.py`, `app/service.py`, `app/main.py`

- [ ] Add failing tests asserting `snacks` is shared/public, `pendingPick` contains no recipe, `result.replay` appears only after a hit, and timeout confirms an existing aim.
- [ ] Add failing WebSocket coverage for `snack.aim`, `bluff.send`, and `snack.confirm` in `tests/test_app.py`.
- [ ] Run the focused protocol/service/app tests and verify they fail for the missing payload and dispatch behavior.
- [ ] Serialize snack metadata and hit replay, add service methods, and dispatch validated integer positions and fixed bluff keys.
- [ ] Run `python -m pytest tests/test_protocol.py tests/test_service.py tests/test_app.py -q` and verify all focused tests pass.

### Task 3: Mixed-snack and performance UI

**Files:** `tests/test_app.py`, `app/static/effects.js`, `app/static/app.js`, `app/static/styles.css`

- [ ] Add failing static-contract tests for six snack types, private deployment stage, bluff controls, confirm control, editor caption, and replay control.
- [ ] Run `python -m pytest tests/test_app.py -q` and verify the new assertions fail.
- [ ] Export snack metadata; render the server-provided shared board; add the local deployment sequence before `recipe.lock`; render pending aim, one-change affordance and opponent bluff buttons.
- [ ] Add bite suspense, safe micro-feedback, larger three-stage victim face, opponent peek, editor caption, automatic single-item deployment replay, and a replay button.
- [ ] Run `python -m pytest tests/test_app.py -q` and verify the static and WebSocket tests pass.

### Task 4: Documentation and complete verification

**Files:** `README.md`, `docs/游戏创意/女巫的毒药-薯条篇.md`

- [ ] Update the rules and acceptance guide to say one shared mixed-snack plate, private deployment, aim/bluff/confirm, and hit replay.
- [ ] Run `python -m pytest -q` and require zero failures.
- [ ] Start the local server and complete a two-player browser round at 390px width: private setup, shared layout, aim, bluff, one change, hit, reaction, replay, and rematch.
- [ ] Inspect browser console and horizontal overflow, then restart the phone tunnel and practice bot against the verified build.

## Self-review

- Spec coverage: shared board, private setup, multiple snacks, interaction, replay, reaction, timeout, rematch, mobile and privacy each map to a task.
- Placeholder scan: no deferred implementation markers or unspecified error handling remain.
- Type consistency: the plan consistently uses `pending_pick` in Python, `pendingPick` in JSON, and the commands `snack.aim`, `bluff.send`, `snack.confirm`.
