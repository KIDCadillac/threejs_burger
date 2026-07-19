import pytest

from app.domain import Phase
from app.service import GameService, RoomError


class FakeClock:
    def __init__(self) -> None:
        self.value = 1_000.0

    def now(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


def test_two_quick_match_players_share_room() -> None:
    service = GameService(clock=FakeClock())

    assert service.join_queue("p1").status == "waiting"
    result = service.join_queue("p2")

    assert result.status == "matched"
    assert result.room_code is not None
    assert service.room_for("p1") is service.room_for("p2")
    assert service.room_for("p1").game is not None
    assert service.room_for("p1").game.phase is Phase.MIXING


def test_cancelled_player_is_not_matched() -> None:
    service = GameService(clock=FakeClock())
    service.join_queue("p1")

    assert service.cancel_queue("p1") is True

    assert service.join_queue("p2").status == "waiting"
    assert service.room_for("p1") is None


def test_invite_room_accepts_code_then_rejects_third_player() -> None:
    service = GameService(clock=FakeClock())
    room = service.create_room("p1")

    joined = service.join_room("p2", room.code)

    assert joined is room
    assert room.game is not None
    with pytest.raises(RoomError, match="房间已满"):
        service.join_room("p3", room.code)


def test_expired_invite_room_is_rejected() -> None:
    clock = FakeClock()
    service = GameService(clock=clock)
    room = service.create_room("p1")
    clock.advance(601)

    with pytest.raises(RoomError, match="房间已过期"):
        service.join_room("p2", room.code)


def test_unknown_room_is_rejected() -> None:
    service = GameService(clock=FakeClock())

    with pytest.raises(RoomError, match="找不到这个房间"):
        service.join_room("p2", "999999")


def test_player_cannot_join_two_rooms() -> None:
    service = GameService(clock=FakeClock())
    service.create_room("p1")
    other = service.create_room("p2")

    with pytest.raises(RoomError, match="已经在其他房间"):
        service.join_room("p1", other.code)


def test_leaving_waiting_room_releases_player_and_room() -> None:
    service = GameService(clock=FakeClock())
    room = service.create_room("p1")

    service.leave("p1")

    assert service.room_for("p1") is None
    assert room.code not in service.rooms


def test_leaving_started_room_releases_both_players_and_room() -> None:
    service = GameService(clock=FakeClock())
    room = service.create_room("p1")
    service.join_room("p2", room.code)

    service.leave("p1")

    assert service.room_for("p1") is None
    assert service.room_for("p2") is None
    assert room.code not in service.rooms


def test_room_codes_are_six_digits_and_unique() -> None:
    service = GameService(clock=FakeClock())

    first = service.create_room("p1")
    second = service.create_room("p2")

    assert first.code.isdigit() and len(first.code) == 6
    assert second.code.isdigit() and len(second.code) == 6
    assert first.code != second.code


def started_room(
    *, clock: FakeClock | None = None, random_choice=None
) -> tuple[GameService, object]:
    active_clock = clock or FakeClock()
    service = GameService(clock=active_clock, random_choice=random_choice)
    room = service.create_room("p1")
    service.join_room("p2", room.code)
    service.connect("p1")
    service.connect("p2")
    service.lock_recipe("p1", 1, ("chili", "mustard"))
    service.lock_recipe("p2", 7, ("sour", "sticky"))
    return service, room


def test_locking_both_recipes_starts_turn_deadline() -> None:
    clock = FakeClock()

    _, room = started_room(clock=clock)

    assert room.turn_deadline == clock.now() + 20


def test_turn_timeout_uses_only_remaining_fries() -> None:
    chosen_options: list[tuple[int, ...]] = []

    def choose(options):
        chosen_options.append(tuple(options))
        return options[0]

    service, room = started_room(random_choice=choose)
    room.game.remaining_fries = {4}

    changed = service.expire_turn(room.code)

    assert changed is room
    assert chosen_options == [(4,)]
    assert room.game.last_outcome.position == 4
    assert room.game.last_outcome.automatic is True


def test_tick_expires_due_turn() -> None:
    clock = FakeClock()
    service, room = started_room(clock=clock, random_choice=lambda values: values[0])
    clock.advance(21)

    changed = service.tick()

    assert room in changed
    assert room.game.last_outcome.automatic is True


def test_disconnect_pauses_then_forfeits_after_grace() -> None:
    clock = FakeClock()
    service, room = started_room(clock=clock)

    service.disconnect("p1")

    assert room.game.paused is True
    assert room.turn_deadline is None
    clock.advance(31)
    changed = service.tick()
    assert room in changed
    assert room.game.winner == "p2"
    assert room.game.result_reason == "disconnect"


def test_reconnect_before_grace_restores_play_with_fresh_deadline() -> None:
    clock = FakeClock()
    service, room = started_room(clock=clock)
    service.disconnect("p1")
    clock.advance(12)

    reconnected = service.connect("p1")

    assert reconnected is room
    assert room.game.paused is False
    assert room.turn_deadline == clock.now() + 20


def test_pick_rearms_deadline_and_rematch_clears_it() -> None:
    clock = FakeClock()
    service, room = started_room(clock=clock)
    clock.advance(4)

    service.pick("p1", 3)

    assert room.turn_deadline == clock.now() + 20
    service.pick("p2", 4)
    service.pick("p1", 7)
    assert room.turn_deadline is None
    service.request_rematch("p1")
    service.request_rematch("p2")
    assert room.game.phase is Phase.MIXING
    assert room.turn_deadline is None
