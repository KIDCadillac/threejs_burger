# Witch Fries Web Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable, server-authoritative two-player web prototype of 《女巫的毒药：薯条篇》 with matchmaking, invite rooms, secret recipes, alternating picks, reaction effects, rematches, and reconnect handling.

**Architecture:** A FastAPI application serves a responsive vanilla web client and owns all in-memory match state. Pure domain classes implement game rules; room and match services coordinate sessions; a WebSocket endpoint accepts commands and returns public plus per-player private state. Two browser tabs use separate session storage identities to simulate two phones.

**Tech Stack:** Python 3.13, FastAPI, Uvicorn, Starlette TestClient, pytest, vanilla HTML/CSS/JavaScript, browser-based acceptance testing.

---

## File map

- `requirements.txt`: runtime and test dependencies.
- `app/__init__.py`: Python package marker.
- `app/domain.py`: enums, recipes, player state, game state, and rule transitions.
- `app/service.py`: room lifecycle, quick-match queue, sessions, disconnect grace, and timers.
- `app/protocol.py`: client command parsing and permission-safe state serialization.
- `app/main.py`: FastAPI app, static serving, health endpoint, and WebSocket command routing.
- `app/static/index.html`: semantic single-page game shell.
- `app/static/styles.css`: responsive visual system, food board, characters, and animations.
- `app/static/app.js`: client state machine, rendering, input, and socket reconnect.
- `app/static/effects.js`: sauce-to-reaction presentation mapping.
- `app/static/platform.js`: local copy-link adapter with a future Douyin adapter boundary.
- `tests/test_domain.py`: deterministic rule tests.
- `tests/test_service.py`: queue, room, timer, rematch, and disconnect tests.
- `tests/test_protocol.py`: hidden-information serialization tests.
- `tests/test_app.py`: HTTP and WebSocket integration tests.
- `README.md`: setup, launch, two-tab acceptance steps, and known prototype limits.

### Task 1: Scaffold the runnable FastAPI shell

**Files:**
- Create: `requirements.txt`
- Create: `app/__init__.py`
- Create: `app/main.py`
- Create: `app/static/index.html`
- Test: `tests/test_app.py`

- [ ] **Step 1: Write the failing health and page tests**

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}

def test_home_page_contains_game_title():
    response = client.get('/')
    assert response.status_code == 200
    assert '女巫的毒药' in response.text
```

- [ ] **Step 2: Install dependencies and verify the tests fail**

Run: `python -m pip install -r requirements.txt && python -m pytest tests/test_app.py -q`

Expected: import or route failure because `app.main` is not implemented.

- [ ] **Step 3: Add the minimal application shell**

```python
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).parent
app = FastAPI(title='Witch Fries Prototype')
app.mount('/static', StaticFiles(directory=BASE_DIR / 'static'), name='static')

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.get('/')
def home():
    return FileResponse(BASE_DIR / 'static' / 'index.html')
```

`requirements.txt` contains compatible FastAPI, Uvicorn, pytest, and httpx version ranges. `index.html` contains the Chinese title and links `/static/styles.css` and `/static/app.js`.

- [ ] **Step 4: Run the shell tests**

Run: `python -m pytest tests/test_app.py -q`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the shell**

Run: `git add requirements.txt app tests/test_app.py && git commit -m "chore: scaffold witch fries web app"`

### Task 2: Implement the deterministic game engine

**Files:**
- Create: `app/domain.py`
- Create: `tests/test_domain.py`

- [ ] **Step 1: Write failing tests for setup, safe picks, hits, self-removal, shared poison, draw, and rematch**

```python
def locked_game(first='p1', p1_pos=1, p2_pos=7):
    game = GameState.create('ROOM01', ['p1', 'p2'], first_player=first)
    game.lock_recipe('p1', p1_pos, ('chili', 'mustard'))
    game.lock_recipe('p2', p2_pos, ('sour', 'sticky'))
    return game

def test_safe_pick_changes_turn():
    game = locked_game()
    outcome = game.pick('p1', 3)
    assert outcome.kind == 'safe'
    assert game.current_player == 'p2'

def test_hitting_opponents_poison_loses():
    game = locked_game()
    outcome = game.pick('p1', 7)
    assert outcome.kind == 'hit'
    assert game.winner == 'p2'
    assert outcome.recipe.sauces == ('sour', 'sticky')

def test_eating_own_poison_is_safe_and_disables_it():
    game = locked_game()
    outcome = game.pick('p1', 1)
    assert outcome.kind == 'safe-own'
    assert game.players['p1'].poison_active is False

def test_shared_poison_position_still_defeats_picker():
    game = locked_game(p1_pos=5, p2_pos=5)
    assert game.pick('p1', 5).kind == 'hit'
    assert game.winner == 'p2'

def test_both_owners_remove_poison_causes_draw():
    game = locked_game(p1_pos=1, p2_pos=7)
    game.pick('p1', 1)
    outcome = game.pick('p2', 7)
    assert outcome.kind == 'draw'
    assert game.phase is Phase.FINISHED

def test_both_players_must_accept_rematch():
    game = locked_game()
    game.pick('p1', 7)
    assert game.request_rematch('p1') is False
    assert game.request_rematch('p2') is True
    assert game.phase is Phase.MIXING
    assert game.first_player == 'p2'
```

- [ ] **Step 2: Run domain tests to verify failure**

Run: `python -m pytest tests/test_domain.py -q`

Expected: failure because `GameState`, `Phase`, and rule methods do not exist.

- [ ] **Step 3: Implement focused domain types and transitions**

`domain.py` defines `Phase`, `Recipe`, `PlayerState`, `PickOutcome`, `RuleError`, and `GameState`. `GameState.lock_recipe()` validates player identity, phase, fry position 0–11, exactly two sauces from `{chili, mustard, sour, sticky}`, and one lock per player. `GameState.pick()` validates turn and availability, resolves opponent hit before own-poison removal, swaps turns for safe picks, and emits a draw when no active poison remains. `request_rematch()` resets all per-round data only after both players agree and alternates first player.

- [ ] **Step 4: Run domain tests**

Run: `python -m pytest tests/test_domain.py -q`

Expected: all domain tests pass.

- [ ] **Step 5: Commit the engine**

Run: `git add app/domain.py tests/test_domain.py && git commit -m "feat: add server authoritative game rules"`

### Task 3: Add rooms, matchmaking, sessions, and lifecycle rules

**Files:**
- Create: `app/service.py`
- Create: `tests/test_service.py`

- [ ] **Step 1: Write failing queue and room tests**

```python
def test_two_quick_match_players_share_room():
    service = GameService(clock=FakeClock())
    assert service.join_queue('p1').status == 'waiting'
    result = service.join_queue('p2')
    assert result.status == 'matched'
    assert service.room_for('p1').code == service.room_for('p2').code

def test_cancelled_player_is_not_matched():
    service = GameService(clock=FakeClock())
    service.join_queue('p1')
    service.cancel_queue('p1')
    assert service.join_queue('p2').status == 'waiting'

def test_invite_room_accepts_code_then_rejects_third_player():
    service = GameService(clock=FakeClock())
    room = service.create_room('p1')
    service.join_room('p2', room.code)
    with pytest.raises(RoomError, match='房间已满'):
        service.join_room('p3', room.code)

def test_expired_invite_room_is_rejected():
    clock = FakeClock()
    service = GameService(clock=clock)
    room = service.create_room('p1')
    clock.advance(601)
    with pytest.raises(RoomError, match='房间已过期'):
        service.join_room('p2', room.code)
```

- [ ] **Step 2: Run service tests to verify failure**

Run: `python -m pytest tests/test_service.py -q`

Expected: failure because `GameService` and lifecycle types do not exist.

- [ ] **Step 3: Implement the service boundary**

`service.py` defines `Room`, `QueueResult`, `RoomError`, `SystemClock`, and `GameService`. It generates collision-checked six-digit room codes, maintains FIFO quick matching, expires empty invite rooms after ten minutes, maps player IDs to one room, and exposes `create_room`, `join_room`, `join_queue`, `cancel_queue`, `leave`, `room_for`, and `cleanup`.

- [ ] **Step 4: Run service tests**

Run: `python -m pytest tests/test_service.py -q`

Expected: all service tests pass.

- [ ] **Step 5: Commit multiplayer services**

Run: `git add app/service.py tests/test_service.py && git commit -m "feat: add matchmaking and invite rooms"`

### Task 4: Protect secrets and expose the WebSocket protocol

**Files:**
- Create: `app/protocol.py`
- Modify: `app/main.py`
- Create: `tests/test_protocol.py`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Write failing privacy and socket tests**

```python
def test_player_view_never_contains_opponent_recipe():
    game = locked_game()
    p1_view = serialize_game(game, viewer_id='p1')
    encoded = json.dumps(p1_view)
    assert 'sour' not in encoded
    assert p1_view['private']['poisonPosition'] == 1

def test_websocket_create_and_join_room():
    with client.websocket_connect('/ws?player=p1') as ws1:
        ws1.send_json({'type': 'room.create'})
        created = ws1.receive_json()
        code = created['room']['code']
        with client.websocket_connect('/ws?player=p2') as ws2:
            ws2.send_json({'type': 'room.join', 'code': code})
            assert ws2.receive_json()['phase'] == 'mixing'
```

- [ ] **Step 2: Run protocol tests to verify failure**

Run: `python -m pytest tests/test_protocol.py tests/test_app.py -q`

Expected: failure because serialization and `/ws` are absent.

- [ ] **Step 3: Implement command parsing and permission-safe views**

`protocol.py` accepts only the command types `match.join`, `match.cancel`, `room.create`, `room.join`, `recipe.lock`, `fry.pick`, `rematch.request`, and `room.leave`. It converts domain state to camelCase JSON. The public payload includes phase, players, remaining fries, current player, deadline, result, and rematch votes. The `private` object includes only the viewer's recipe and poison position. Opponent recipe appears only in the finished result when it caused the hit.

`main.py` owns one `GameService`, tracks live sockets by player ID, routes commands, returns `{type: 'error', message}` for rejected actions, and broadcasts a newly serialized view per recipient after every accepted action.

- [ ] **Step 4: Run protocol tests**

Run: `python -m pytest tests/test_protocol.py tests/test_app.py -q`

Expected: all protocol and integration tests pass.

- [ ] **Step 5: Commit the protocol**

Run: `git add app/protocol.py app/main.py tests && git commit -m "feat: expose private-safe multiplayer protocol"`

### Task 5: Build the responsive entry and room client

**Files:**
- Modify: `app/static/index.html`
- Create: `app/static/styles.css`
- Create: `app/static/app.js`
- Create: `app/static/platform.js`

- [ ] **Step 1: Add a client smoke assertion**

Extend `test_home_page_contains_game_title` to assert the rendered shell contains `data-action="quick-match"`, `data-action="create-room"`, and `data-action="join-room"`.

- [ ] **Step 2: Run the smoke test to verify failure**

Run: `python -m pytest tests/test_app.py::test_home_page_contains_game_title -q`

Expected: failure because the entry actions are absent.

- [ ] **Step 3: Implement the shell, navigation, and transport**

`index.html` provides one `#app` region, an accessible live status region, and template elements for home, waiting room, mixing, turn, and reveal states. `app.js` creates a per-tab player ID in `sessionStorage`, opens `/ws?player=...`, reconnects with bounded backoff, renders by server phase, supports the three home actions, parses `?room=123456`, and copies errors into the live region. `platform.js` exports `inviteFriend({code, url})`, implemented locally with the Clipboard API and a visible manual URL fallback.

- [ ] **Step 4: Implement the responsive visual foundation**

`styles.css` defines CSS custom properties for tomato red, mustard yellow, lake blue, cream, and deep purple; a centered 480px mobile stage; minimum 44px tap targets; focus-visible outlines; reduced-motion fallbacks; and card/button states. The home screen shows one dominant quick-match action, one invite action, and a smaller room-code form.

- [ ] **Step 5: Run automated tests and commit**

Run: `python -m pytest -q`

Expected: all tests pass.

Run: `git add app/static tests/test_app.py && git commit -m "feat: add multiplayer lobby experience"`

### Task 6: Implement mixing, food selection, and reaction effects

**Files:**
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Create: `app/static/effects.js`
- Modify: `app/static/index.html`

- [ ] **Step 1: Add static effect contract tests**

Create an assertion in `tests/test_app.py` that `/static/effects.js` contains the four stable effect keys `chili`, `mustard`, `sour`, and `sticky`, and that the page shell contains the private-state label `只有你能看见`.

- [ ] **Step 2: Run the effect contract test to verify failure**

Run: `python -m pytest tests/test_app.py -q`

Expected: failure because the effect module and private-state label are absent.

- [ ] **Step 3: Implement mixing and turn rendering**

`app.js` renders twelve large fry buttons from `remainingFries`; during mixing it lets the player select one fry and fill two sauce slots, then sends `recipe.lock`. During turns it disables all fries for the non-current player, highlights the viewer's own active poison using private data, sends `fry.pick`, and displays the server deadline as a countdown without deciding timeout locally.

- [ ] **Step 4: Implement distinct reaction presentations**

`effects.js` exports metadata for the four sauces: label, emoji, CSS class, and particle symbols. `app.js` applies the first effect, then the second after 800ms; duplicate sauces add a `reaction--double` class. `styles.css` supplies red heat pulses and fire, yellow-green tears and hair bounce, lime face squeeze and shake, and purple mouth stretch with sticky strands. The reveal overlay shows victim, creator, recipe labels, win/draw copy, skip, and rematch.

- [ ] **Step 5: Run tests and commit**

Run: `python -m pytest -q`

Expected: all tests pass.

Run: `git add app/static tests/test_app.py && git commit -m "feat: add custom fries and reaction reveals"`

### Task 7: Add deadlines, reconnect grace, and synchronized rematches

**Files:**
- Modify: `app/service.py`
- Modify: `app/main.py`
- Modify: `app/protocol.py`
- Modify: `app/static/app.js`
- Modify: `tests/test_service.py`
- Modify: `tests/test_app.py`

- [ ] **Step 1: Write failing timeout and reconnect tests**

```python
def test_turn_timeout_uses_only_remaining_fries(monkeypatch):
    service, room = started_room()
    room.game.remaining_fries = {4}
    service.expire_turn(room.code)
    assert room.game.last_outcome.position == 4

def test_disconnect_pauses_then_forfeits_after_grace():
    clock = FakeClock()
    service, room = started_room(clock=clock)
    service.disconnect('p1')
    assert room.game.paused is True
    clock.advance(31)
    service.cleanup()
    assert room.game.winner == 'p2'

def test_reconnect_before_grace_restores_play():
    service, room = started_room()
    service.disconnect('p1')
    service.connect('p1')
    assert room.game.paused is False
```

- [ ] **Step 2: Run lifecycle tests to verify failure**

Run: `python -m pytest tests/test_service.py -q`

Expected: failure because pause, deadline expiry, and reconnect transitions are absent.

- [ ] **Step 3: Implement server timers and disconnect lifecycle**

The service records a 20-second turn deadline, cancels it on accepted picks, and resolves expiry through the same `GameState.pick()` path using one remaining position selected by an injectable random chooser. WebSocket disconnect marks the player offline and pauses a live round. Reconnection within 30 seconds cancels forfeit and resumes with a fresh deadline; cleanup after the grace period finishes the game with reason `disconnect`.

- [ ] **Step 4: Surface lifecycle state in the client**

The protocol includes online flags, paused reason, and deadline timestamps. The client displays a reconnect banner, freezes food buttons while paused, shows a five-second warning, marks server auto-picks, and presents a clear disconnect victory/defeat message.

- [ ] **Step 5: Run the complete suite and commit**

Run: `python -m pytest -q`

Expected: all tests pass.

Run: `git add app tests && git commit -m "feat: add multiplayer lifecycle safeguards"`

### Task 8: Verify the complete experience and document handoff

**Files:**
- Create: `README.md`
- Modify: `docs/游戏创意/女巫的毒药-薯条篇.md`
- Modify: `docs/superpowers/plans/2026-07-19-witch-fries-web-prototype.md`

- [ ] **Step 1: Write exact launch and acceptance instructions**

`README.md` documents:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

It tells the reviewer to open two tabs at `http://127.0.0.1:8000`, verify quick match, then create an invite room and open its link in the other tab. It also lists the four sauce reactions, rematch flow, local-only storage, and the missing real Douyin adapter.

- [ ] **Step 2: Run automated verification**

Run: `python -m pytest -q`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Start the server and run browser acceptance**

Run: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`

Use two real browser tabs to complete quick matching, private recipes, alternating safe picks, a poison hit, the correct two-stage reaction, and synchronized rematch. Repeat through an invite URL. Inspect at mobile and desktop viewport sizes and confirm no clipping, horizontal overflow, or inaccessible controls.

- [ ] **Step 4: Check repository quality**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended README, plan checkbox, and context updates remain.

- [ ] **Step 5: Record completion and commit**

Mark every completed plan checkbox, update the local creative context from exploration to prototype-ready, then run:

`git add README.md docs && git commit -m "docs: hand off playable witch fries prototype"`

