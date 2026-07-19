from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Protocol

from app.domain import GameState


INVITE_TTL_SECONDS = 600


class Clock(Protocol):
    def now(self) -> float: ...


class SystemClock:
    def now(self) -> float:
        return time.time()


class RoomError(ValueError):
    """Raised when a matchmaking or room operation cannot be completed."""


@dataclass(slots=True)
class Room:
    code: str
    mode: str
    players: list[str]
    created_at: float
    expires_at: float | None
    game: GameState | None = None
    connected: set[str] = field(default_factory=set)
    disconnected_at: dict[str, float] = field(default_factory=dict)
    turn_deadline: float | None = None


@dataclass(frozen=True, slots=True)
class QueueResult:
    status: str
    room_code: str | None = None


class GameService:
    def __init__(self, *, clock: Clock | None = None) -> None:
        self.clock = clock or SystemClock()
        self.rooms: dict[str, Room] = {}
        self.player_rooms: dict[str, str] = {}
        self.queue: list[str] = []

    def create_room(self, player_id: str) -> Room:
        self._require_available(player_id)
        code = self._new_code()
        now = self.clock.now()
        room = Room(
            code=code,
            mode="invite",
            players=[player_id],
            created_at=now,
            expires_at=now + INVITE_TTL_SECONDS,
        )
        self.rooms[code] = room
        self.player_rooms[player_id] = code
        return room

    def join_room(self, player_id: str, code: str) -> Room:
        room = self.rooms.get(code)
        if room is None:
            raise RoomError("找不到这个房间")
        if room.expires_at is not None and self.clock.now() > room.expires_at:
            self._remove_room(room)
            raise RoomError("房间已过期")
        if len(room.players) >= 2:
            raise RoomError("房间已满")
        self._require_available(player_id)

        room.players.append(player_id)
        room.expires_at = None
        room.game = GameState.create(
            room.code, room.players, first_player=room.players[0]
        )
        self.player_rooms[player_id] = room.code
        return room

    def join_queue(self, player_id: str) -> QueueResult:
        self._require_available(player_id)
        if player_id in self.queue:
            return QueueResult(status="waiting")
        if not self.queue:
            self.queue.append(player_id)
            return QueueResult(status="waiting")

        opponent = self.queue.pop(0)
        code = self._new_code()
        room = Room(
            code=code,
            mode="quick",
            players=[opponent, player_id],
            created_at=self.clock.now(),
            expires_at=None,
        )
        room.game = GameState.create(code, room.players, first_player=opponent)
        self.rooms[code] = room
        self.player_rooms[opponent] = code
        self.player_rooms[player_id] = code
        return QueueResult(status="matched", room_code=code)

    def cancel_queue(self, player_id: str) -> bool:
        if player_id not in self.queue:
            return False
        self.queue.remove(player_id)
        return True

    def room_for(self, player_id: str) -> Room | None:
        code = self.player_rooms.get(player_id)
        return self.rooms.get(code) if code is not None else None

    def leave(self, player_id: str) -> None:
        self.cancel_queue(player_id)
        room = self.room_for(player_id)
        if room is None:
            return
        self.player_rooms.pop(player_id, None)
        if room.game is None:
            self._remove_room(room)
            return
        if not any(candidate in self.player_rooms for candidate in room.players):
            self._remove_room(room)

    def cleanup(self) -> None:
        now = self.clock.now()
        expired = [
            room
            for room in self.rooms.values()
            if room.expires_at is not None and now > room.expires_at
        ]
        for room in expired:
            self._remove_room(room)

    def _require_available(self, player_id: str) -> None:
        if player_id in self.player_rooms:
            raise RoomError("你已经在其他房间")

    def _new_code(self) -> str:
        for _ in range(100):
            code = f"{secrets.randbelow(900_000) + 100_000:06d}"
            if code not in self.rooms:
                return code
        raise RoomError("暂时无法创建房间，请稍后重试")

    def _remove_room(self, room: Room) -> None:
        self.rooms.pop(room.code, None)
        for player_id in room.players:
            self.player_rooms.pop(player_id, None)
