# Single Player Practice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an instant single-player practice choice where the existing full game is played against a fair, animated server-side computer witch.

**Architecture:** `GameService` owns practice-room lifecycle and a small scheduled bot state machine. A pure `PracticeBotPolicy` receives only public choices, while the existing async timer advances one visible bot action at a time and broadcasts the resulting room state. The WebSocket protocol gains one start command, and the current client gains home and matchmaking fallback buttons without changing human matchmaking.

**Tech Stack:** Python 3.13, FastAPI WebSockets, pytest, vanilla JavaScript, HTML, CSS

---

## File map

- Create `app/bot.py`: fair decision policy that only accepts public position and action sequences.
- Modify `app/service.py`: practice-room creation, bot scheduling, rematch automation, turn deadlines, and abandoned setup cleanup.
- Modify `app/protocol.py`: expose bot identity/online metadata without revealing recipes.
- Modify `app/main.py`: dispatch `practice.start` and publish removed-room tick results correctly.
- Modify `app/static/index.html`: keep the no-JavaScript/loading home shell aligned with the rendered home screen.
- Modify `app/static/app.js`: single-player entry points and computer-specific labels.
- Modify `app/static/styles.css`: visually distinguish the practice action without copying reference-game art.
- Modify `tests/test_service.py`: practice lifecycle, scheduling, fairness boundary, rematch, and cleanup tests.
- Modify `tests/test_protocol.py`: computer metadata and secret isolation tests.
- Modify `tests/test_app.py`: WebSocket command and client-marker tests.
- Modify `README.md`: document single-player playtest steps and remove the external bot from the required path.

### Task 1: Practice room lifecycle and computer identity

**Files:**
- Modify: `app/service.py`
- Modify: `app/protocol.py`
- Test: `tests/test_service.py`
- Test: `tests/test_protocol.py`

- [ ] **Step 1: Write failing service tests**

Add tests that express the room API before implementing it:

```python
def test_start_practice_creates_immediate_game_with_unique_bot() -> None:
    service = GameService(clock=FakeClock())

    room = service.start_practice("p1")

    assert room.mode == "practice"
    assert room.players[0] == "p1"
    assert room.players[1].startswith("bot-")
    assert room.game is not None
    assert room.game.phase is Phase.MIXING
    assert service.room_for("p1") is room


def test_start_practice_cancels_matchmaking_and_is_idempotent() -> None:
    service = GameService(clock=FakeClock())
    service.join_queue("p1")

    first = service.start_practice("p1")
    second = service.start_practice("p1")

    assert first is second
    assert "p1" not in service.queue
    assert len(service.rooms) == 1
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
python -m pytest tests/test_service.py -k "start_practice" -q
```

Expected: both tests fail because `GameService.start_practice` does not exist.

- [ ] **Step 3: Implement the minimal practice-room API**

Add `Room.bot_player_id`, `Room.bot_due_at`, and `Room.bot_step` fields. Implement `start_practice` so it cancels a queued player, returns an existing practice room on duplicate start, rejects an existing human room, creates a unique `bot-<room-code>` player, and initializes `GameState` in `practice` mode.

The public helper should be:

```python
def start_practice(self, player_id: str) -> Room:
    existing = self.room_for(player_id)
    if existing is not None and existing.mode == "practice":
        return existing
    self.cancel_queue(player_id)
    self._require_available(player_id)
    code = self._new_code()
    bot_id = f"bot-{code}"
    room = Room(
        code=code,
        mode="practice",
        players=[player_id, bot_id],
        created_at=self.clock.now(),
        expires_at=None,
        bot_player_id=bot_id,
    )
    room.game = GameState.create(code, room.players, first_player=player_id)
    self.rooms[code] = room
    self.player_rooms[player_id] = code
    self.player_rooms[bot_id] = code
    self._schedule_bot(room, "deploy-mix")
    return room
```

- [ ] **Step 4: Verify service tests pass**

Run the focused command from Step 2. Expected: 2 passed.

- [ ] **Step 5: Write failing protocol tests**

Add a test that serializes a practice room and expects stable bot metadata while retaining secret isolation:

```python
def test_practice_room_marks_computer_online_without_revealing_recipe() -> None:
    service = GameService()
    room = service.start_practice("p1")
    room.game.lock_recipe(room.bot_player_id, 7, ("sour", "sticky"))

    view = serialize_room(room, viewer_id="p1")

    bot = next(player for player in view["players"] if player["computer"])
    assert bot["id"] == room.bot_player_id
    assert bot["name"] == "电脑女巫"
    assert bot["online"] is True
    assert "sour" not in json.dumps(view)
```

- [ ] **Step 6: Run protocol test to verify RED**

Run:

```powershell
python -m pytest tests/test_protocol.py -k "computer_online" -q
```

Expected: failure because `computer` and `name` metadata are absent.

- [ ] **Step 7: Add protocol metadata and verify GREEN**

In both waiting and started player serialization, add:

```python
"computer": room.bot_player_id == player_id,
"name": "电脑女巫" if room.bot_player_id == player_id else None,
"online": player_id in online or room.bot_player_id == player_id,
```

Run the focused protocol test and all service/protocol tests:

```powershell
python -m pytest tests/test_service.py tests/test_protocol.py -q
```

Expected: all tests pass.

- [ ] **Step 8: Commit lifecycle work**

```powershell
git add app/service.py app/protocol.py tests/test_service.py tests/test_protocol.py
git commit -m "feat: add single player practice rooms"
```

### Task 2: Fair computer policy and staged actions

**Files:**
- Create: `app/bot.py`
- Modify: `app/service.py`
- Test: `tests/test_service.py`

- [ ] **Step 1: Write a failing policy-boundary test**

The test constructs a policy with deterministic `randbelow`, passes only public options, and verifies every output belongs to the supplied sequence:

```python
def test_practice_bot_policy_uses_only_supplied_public_options() -> None:
    spec = importlib.util.find_spec("app.bot")
    assert spec is not None
    module = importlib.import_module("app.bot")
    policy = module.PracticeBotPolicy(randbelow=lambda size: size - 1)

    assert policy.choose_position((2, 5, 9)) == 9
    assert policy.choose_sauces(("chili", "mustard")) == ("mustard", "mustard")
    assert policy.choose_gesture(("calm", "laugh")) == "laugh"
```

- [ ] **Step 2: Run policy test to verify RED**

Run:

```powershell
python -m pytest tests/test_service.py -k "policy_uses_only" -q
```

Expected: assertion failure because `app.bot` is absent.

- [ ] **Step 3: Implement the pure policy**

Create `app/bot.py` with a policy that never receives `GameState`, `Room`, recipes, or player secrets:

```python
class PracticeBotPolicy:
    def __init__(self, randbelow=secrets.randbelow) -> None:
        self.randbelow = randbelow

    def choose_position(self, positions: Sequence[int]) -> int:
        return positions[self.randbelow(len(positions))]

    def choose_sauces(self, sauces: Sequence[str]) -> tuple[str, str]:
        return (self._choose(sauces), self._choose(sauces))

    def choose_gesture(self, gestures: Sequence[str]) -> str:
        return self._choose(gestures)

    def should_change(self, option_count: int) -> bool:
        return option_count > 1 and self.randbelow(3) == 0
```

Validate non-empty sequences with `ValueError` and keep `_choose` private.

- [ ] **Step 4: Verify policy test passes**

Run the focused test. Expected: 1 passed.

- [ ] **Step 5: Write failing staged-action tests**

Use `FakeClock` and a deterministic policy to verify visible stages:

```python
class FixedBotPolicy:
    def choose_position(self, positions):
        return positions[-1]

    def choose_sauces(self, sauces):
        return (sauces[0], sauces[1])

    def choose_gesture(self, gestures):
        return gestures[1]

    def should_change(self, option_count):
        return option_count > 1


def test_practice_bot_deploys_in_visible_stages() -> None:
    clock = FakeClock()
    service = GameService(clock=clock, bot_policy=FixedBotPolicy())
    room = service.start_practice("p1")

    clock.advance(1)
    assert service.tick() == [room]
    assert room.game.gestures[room.bot_player_id].key == "mix"
    assert room.game.players[room.bot_player_id].recipe is None

    clock.advance(1)
    service.tick()
    assert room.game.gestures[room.bot_player_id].key == "sealed"

    clock.advance(1)
    service.tick()
    assert room.game.players[room.bot_player_id].recipe is not None


def test_practice_bot_turn_aims_then_may_change_then_confirms() -> None:
    clock = FakeClock()
    service = GameService(clock=clock, bot_policy=FixedBotPolicy())
    room = service.start_practice("p1")
    service.lock_recipe("p1", 0, ("chili", "mustard"))
    for _ in range(3):
        clock.advance(1)
        service.tick()
    service.pick("p1", 1)

    clock.advance(1)
    service.tick()
    first_target = room.game.pending_pick.position
    clock.advance(1)
    service.tick()
    clock.advance(1)
    service.tick()
    assert room.game.pending_pick.changed is True
    assert room.game.pending_pick.position != first_target
    clock.advance(1)
    service.tick()
    assert room.game.current_player == "p1" or room.game.phase is Phase.FINISHED
```

- [ ] **Step 6: Run staged-action tests to verify RED**

Run:

```powershell
python -m pytest tests/test_service.py -k "practice_bot_deploys or practice_bot_turn" -q
```

Expected: failures because `tick` does not advance practice steps.

- [ ] **Step 7: Implement bot scheduling in `GameService`**

Add a `bot_policy` dependency and central helpers:

```python
def _schedule_bot(self, room: Room, step: str, delay: float = 0.8) -> None:
    room.bot_step = step
    room.bot_due_at = self.clock.now() + delay

def _clear_bot_schedule(self, room: Room) -> None:
    room.bot_step = None
    room.bot_due_at = None
    room.bot_target = None

def _sync_practice_schedule(self, room: Room) -> None:
    game = room.game
    bot_id = room.bot_player_id
    if game is None or bot_id is None or room.bot_step is not None:
        return
    if game.phase is Phase.MIXING and game.players[bot_id].recipe is None:
        self._schedule_bot(room, "deploy-mix")
    elif game.phase is Phase.TURN and game.current_player == bot_id:
        self._schedule_bot(room, "turn-aim")
    elif game.phase is Phase.TURN:
        self._schedule_bot(room, "human-bluff")

def _advance_practice(self, room: Room) -> bool:
    game = room.game
    bot_id = room.bot_player_id
    step = room.bot_step
    if (
        game is None
        or bot_id is None
        or step is None
        or room.bot_due_at is None
        or self.clock.now() < room.bot_due_at
        or game.paused
    ):
        return False

    room.bot_step = None
    room.bot_due_at = None
    if step == "deploy-mix" and game.phase is Phase.MIXING:
        game.send_gesture(bot_id, "mix")
        self._schedule_bot(room, "deploy-seal")
    elif step == "deploy-seal" and game.phase is Phase.MIXING:
        game.send_gesture(bot_id, "sealed")
        self._schedule_bot(room, "deploy-lock")
    elif step == "deploy-lock" and game.phase is Phase.MIXING:
        position = self.bot_policy.choose_position(tuple(sorted(game.remaining_fries)))
        sauces = self.bot_policy.choose_sauces(tuple(sorted(SAUCES)))
        game.lock_recipe(bot_id, position, sauces)
        self._after_game_change(room)
    elif step == "human-bluff" and game.phase is Phase.TURN and game.current_player != bot_id:
        gesture = self.bot_policy.choose_gesture(("calm", "laugh", "point", "hurry"))
        game.send_gesture(bot_id, gesture)
        room.bot_step = "idle-human"
    elif step == "turn-aim" and game.phase is Phase.TURN and game.current_player == bot_id:
        target = self.bot_policy.choose_position(tuple(sorted(game.remaining_fries)))
        game.aim(bot_id, target)
        room.bot_target = target
        self._schedule_bot(room, "turn-gesture")
    elif step == "turn-gesture" and game.phase is Phase.TURN and game.current_player == bot_id:
        gesture = self.bot_policy.choose_gesture(("calm", "laugh", "point", "hurry"))
        game.send_gesture(bot_id, gesture)
        next_step = "turn-change" if self.bot_policy.should_change(len(game.remaining_fries)) else "turn-confirm"
        self._schedule_bot(room, next_step)
    elif step == "turn-change" and game.phase is Phase.TURN and game.current_player == bot_id:
        current = game.pending_pick.position
        options = tuple(sorted(game.remaining_fries - {current}))
        if options:
            game.aim(bot_id, self.bot_policy.choose_position(options))
        self._schedule_bot(room, "turn-confirm")
    elif step == "turn-confirm" and game.phase is Phase.TURN and game.current_player == bot_id:
        game.confirm_pick(bot_id)
        self._after_game_change(room)
    else:
        self._after_game_change(room)
    return True
```

Use these sequences:

- Deployment: `deploy-mix` -> `deploy-seal` -> `deploy-lock`.
- Human turn: optionally schedule one `human-bluff`, then clear the bot step.
- Computer turn: `turn-aim` -> `turn-gesture` -> optional `turn-change` -> `turn-confirm`.

Implement `_after_game_change` to clear stale bot state, set `turn_deadline` only when a human owns a live turn, and call `_sync_practice_schedule`. Call it after every recipe lock, pick, confirm, rematch, and reconnect that changes the phase or current player.

- [ ] **Step 8: Verify staged actions and regression tests**

Run:

```powershell
python -m pytest tests/test_service.py -q
```

Expected: all service tests pass.

- [ ] **Step 9: Commit bot behavior**

```powershell
git add app/bot.py app/service.py tests/test_service.py
git commit -m "feat: animate fair computer opponent"
```

### Task 3: WebSocket start, rematch, and cleanup

**Files:**
- Modify: `app/main.py`
- Modify: `app/service.py`
- Test: `tests/test_service.py`
- Test: `tests/test_app.py`

- [ ] **Step 1: Write failing service tests for rematch and cleanup**

Add tests proving a single human vote restarts practice, human games still need two votes, and a setup-phase disconnect releases a room after 30 seconds:

```python
def test_practice_rematch_restarts_after_human_vote() -> None:
    service = GameService(clock=FakeClock())
    room = service.start_practice("p1")
    bot_id = room.bot_player_id
    service.lock_recipe("p1", 0, ("chili", "mustard"))
    service.lock_recipe(bot_id, 1, ("sour", "sticky"))
    service.pick("p1", 1)

    assert service.request_rematch("p1") is True
    assert room.game.phase is Phase.MIXING
    assert room.game.round_number == 2


def test_human_room_still_requires_two_rematch_votes() -> None:
    service, room = started_room()
    service.pick("p1", 7)

    assert service.request_rematch("p1") is False
    assert room.game.phase is Phase.FINISHED


def test_mixing_disconnect_after_grace_releases_room() -> None:
    clock = FakeClock()
    service = GameService(clock=clock)
    room = service.create_room("p1")
    service.join_room("p2", room.code)
    service.connect("p1")
    service.connect("p2")
    service.disconnect("p2")
    clock.advance(31)

    changed = service.tick()

    assert changed == [room]
    assert room.code not in service.rooms
    assert service.room_for("p1") is None
```

- [ ] **Step 2: Run focused service tests to verify RED**

Run:

```powershell
python -m pytest tests/test_service.py -k "practice_rematch or mixing_disconnect" -q
```

Expected: rematch waits for the bot vote and mixing disconnect remains stuck.

- [ ] **Step 3: Implement rematch and setup cleanup**

In `request_rematch`, automatically cast the room bot vote only for `practice`. In `tick`, calculate timed-out disconnected humans before filtering to `Phase.TURN`; remove `MIXING` rooms, return the removed room for notification, and preserve disconnect-forfeit behavior in `TURN` human rooms.

- [ ] **Step 4: Verify focused service tests pass**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Write failing WebSocket tests**

Add one end-to-end test for the command and one helper test for removed-room publishing:

```python
def test_websocket_starts_practice_without_waiting() -> None:
    isolated_client = TestClient(create_app(GameService()))
    with isolated_client.websocket_connect("/ws?player=p1") as socket:
        socket.receive_json()
        socket.send_json({"type": "practice.start"})
        state = socket.receive_json()
        assert state["phase"] == "mixing"
        assert state["room"]["mode"] == "practice"
        assert any(player["computer"] for player in state["players"])


def test_removed_tick_room_returns_connected_players_home() -> None:
    assert hasattr(main_module, "_publish_tick_room")

    class FakeHub:
        def __init__(self) -> None:
            self.sent = []
            self.broadcasted = []

        async def send(self, player_id, payload) -> None:
            self.sent.append((player_id, payload))

        async def broadcast_room(self, room) -> None:
            self.broadcasted.append(room)

    service = GameService()
    room = service.create_room("p1")
    service.leave("p1")
    hub = FakeHub()

    asyncio.run(main_module._publish_tick_room(service, hub, room))

    assert hub.sent == [("p1", {"type": "home"})]
    assert hub.broadcasted == []
```

- [ ] **Step 6: Run WebSocket tests to verify RED**

Run:

```powershell
python -m pytest tests/test_app.py -k "starts_practice or removed_tick_room" -q
```

Expected: `practice.start` returns an unsupported-operation error and the publish helper is absent.

- [ ] **Step 7: Implement dispatch and tick publishing**

Add to `_dispatch`:

```python
if kind == "practice.start":
    room = service.start_practice(player_id)
    service.connect(player_id)
    await hub.broadcast_room(room)
    return
```

Extract `_publish_tick_room(service, hub, room)`: broadcast active rooms; send `home` to former players when `tick` returned a removed room. Make `_timer_loop` use this helper.

- [ ] **Step 8: Verify service and app suites pass**

Run:

```powershell
python -m pytest tests/test_service.py tests/test_app.py -q
```

Expected: all selected suites pass.

- [ ] **Step 9: Commit protocol flow**

```powershell
git add app/main.py app/service.py tests/test_app.py tests/test_service.py
git commit -m "feat: wire practice websocket lifecycle"
```

### Task 4: Mobile single-player entry points and labels

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Test: `tests/test_app.py`

- [ ] **Step 1: Write a failing client-marker test**

Extend the client static-content test:

```python
def test_client_offers_practice_from_home_and_matching() -> None:
    script = client.get("/static/app.js").text
    assert script.count('data-action="start-practice"') >= 2
    assert 'type: "practice.start"' in script
    assert "单人练习" in script
    assert "没人？和电脑玩" in script
    assert "电脑女巫" in script
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
python -m pytest tests/test_app.py -k "offers_practice" -q
```

Expected: failure because the controls and command are absent.

- [ ] **Step 3: Add the client behavior**

In `app/static/index.html` and `renderHome`, put the original primary matchmaking control beside a new prominent but visually distinct practice control:

```html
<button class="button button--practice" type="button" data-action="start-practice">
  <span class="button__icon">🧙</span>
  <span><strong>单人练习</strong><small>立即对战电脑女巫</small></span>
</button>
```

In `renderMatching`, add a `start-practice` button labeled “没人？和电脑玩”. In the click handler send `{ type: "practice.start" }`. Reset deployment/reaction local state when entering a new practice room just as for other new rounds.

Use `player.computer` and `player.name` in `playerRibbon` to show “电脑女巫” and suppress its offline label. On a practice result, the existing rematch label remains “再来一局” and the server makes it single-click.

- [ ] **Step 4: Style and responsive-check the controls**

Add `.button--practice` using the project's purple/gold witch palette and ensure the label stacks at 390px without changing the existing minimum 44px touch target. Do not reproduce the reference game's colors, icons, menus, or layout.

- [ ] **Step 5: Verify client tests pass**

Run:

```powershell
python -m pytest tests/test_app.py -q
```

Expected: all app tests pass.

- [ ] **Step 6: Commit UI work**

```powershell
git add app/static/index.html app/static/app.js app/static/styles.css tests/test_app.py
git commit -m "feat: add single player mobile entry points"
```

### Task 5: Documentation, full verification, and live handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update playtest documentation**

Document both single-player entry paths, the fair-computer rule, single-click rematch, and the fact that the external practice-bot process is not required for single-player play.

- [ ] **Step 2: Run static checks and the full test suite**

Run:

```powershell
git diff --check
python -m pytest -q
```

Expected: no whitespace errors and all tests pass.

- [ ] **Step 3: Restart the local server**

Stop only the verified Uvicorn process serving this worktree, then start:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Keep the existing Cloudflare tunnel process if its upstream remains `127.0.0.1:8000`.

- [ ] **Step 4: Verify local and public endpoints**

Check both `/health` and `/`, confirm HTTP 200, then exercise a WebSocket `practice.start` flow or use the mobile browser to verify immediate mixing state and staged bot deployment.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md
git commit -m "docs: add single player playtest guide"
```

- [ ] **Step 6: Report the playable result**

Provide the public URL, tell the user to refresh once, identify both entry buttons, report the fresh test count, and list any remaining prototype boundary without claiming unverified behavior.
