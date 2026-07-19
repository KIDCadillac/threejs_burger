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


def test_room_codes_are_six_digits_and_unique() -> None:
    service = GameService(clock=FakeClock())

    first = service.create_room("p1")
    second = service.create_room("p2")

    assert first.code.isdigit() and len(first.code) == 6
    assert second.code.isdigit() and len(second.code) == 6
    assert first.code != second.code
