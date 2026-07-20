from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from collections.abc import Callable, Sequence
from typing import Protocol

from app.bot import PracticeBotPolicy, available_burger_positions
from app.domain import GameState, Phase, PickOutcome
from app.recipe_data import BurgerComposition, SAUCES, composition_for_sauces


INVITE_TTL_SECONDS = 600
TURN_SECONDS = 20
RECONNECT_GRACE_SECONDS = 30
BOT_ACTION_DELAY_SECONDS = 0.8


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
    bot_player_id: str | None = None
    bot_due_at: float | None = None
    bot_step: str | None = None
    bot_target: int | None = None


@dataclass(frozen=True, slots=True)
class QueueResult:
    status: str
    room_code: str | None = None


class GameService:
    def __init__(
        self,
        *,
        clock: Clock | None = None,
        random_choice: Callable[[Sequence[int]], int] | None = None,
        bot_policy: PracticeBotPolicy | None = None,
    ) -> None:
        self.clock = clock or SystemClock()
        self.random_choice = random_choice or secrets.choice
        self.bot_policy = bot_policy or PracticeBotPolicy()
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

    def start_practice(self, player_id: str) -> Room:
        self.cancel_queue(player_id)
        existing = self.room_for(player_id)
        if existing is not None and existing.mode == "practice":
            return existing
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
        self._sync_practice_schedule(room)
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

    def connect(self, player_id: str) -> Room | None:
        room = self.room_for(player_id)
        if room is None:
            return None
        room.connected.add(player_id)
        room.disconnected_at.pop(player_id, None)
        if (
            room.game is not None
            and room.game.phase is Phase.TURN
            and not room.disconnected_at
        ):
            room.game.paused = False
            self._after_game_change(room)
        return room

    def disconnect(self, player_id: str) -> Room | None:
        self.cancel_queue(player_id)
        room = self.room_for(player_id)
        if room is None:
            return None
        room.connected.discard(player_id)
        room.disconnected_at[player_id] = self.clock.now()
        if room.game is not None and room.game.phase is Phase.TURN:
            room.game.paused = True
            room.turn_deadline = None
        return room

    def lock_recipe(
        self,
        player_id: str,
        position: int,
        composition: BurgerComposition,
    ) -> Room:
        room = self._started_room(player_id)
        room.game.lock_recipe(player_id, position, composition)
        self._after_game_change(room)
        return room

    def pick(
        self, player_id: str, position: int, *, automatic: bool = False
    ) -> PickOutcome:
        room = self._started_room(player_id)
        outcome = room.game.pick(player_id, position, automatic=automatic)
        self._after_game_change(room)
        return outcome

    def aim(self, player_id: str, position: int) -> Room:
        room = self._started_room(player_id)
        room.game.aim(player_id, position)
        return room

    def send_gesture(self, player_id: str, key: str) -> Room:
        room = self._started_room(player_id)
        room.game.send_gesture(player_id, key)
        return room

    def confirm_pick(
        self, player_id: str, *, automatic: bool = False
    ) -> PickOutcome:
        room = self._started_room(player_id)
        outcome = room.game.confirm_pick(player_id, automatic=automatic)
        self._after_game_change(room)
        return outcome

    def request_rematch(self, player_id: str) -> bool:
        room = self._started_room(player_id)
        reset = room.game.request_rematch(player_id)
        if (
            not reset
            and room.mode == "practice"
            and room.bot_player_id is not None
        ):
            reset = room.game.request_rematch(room.bot_player_id)
        if reset:
            self._after_game_change(room)
        else:
            room.turn_deadline = None
        return reset

    def expire_turn(self, room_code: str) -> Room | None:
        room = self.rooms.get(room_code)
        if (
            room is None
            or room.game is None
            or room.game.phase is not Phase.TURN
            or room.game.paused
            or room.game.current_player is None
        ):
            return None
        options = sorted(room.game.remaining_fries)
        if not options:
            return None
        if (
            room.game.pending_pick is not None
            and room.game.pending_pick.picker == room.game.current_player
        ):
            self.confirm_pick(room.game.current_player, automatic=True)
        else:
            position = self.random_choice(options)
            self.pick(room.game.current_player, position, automatic=True)
        return room

    def tick(self) -> list[Room]:
        self.cleanup()
        now = self.clock.now()
        changed: list[Room] = []
        for room in list(self.rooms.values()):
            game = room.game
            if game is None:
                continue
            timed_out_players = [
                player_id
                for player_id, disconnected_at in room.disconnected_at.items()
                if now - disconnected_at > RECONNECT_GRACE_SECONDS
            ]
            if timed_out_players and (
                room.mode == "practice" or game.phase is Phase.MIXING
            ):
                self._remove_room(room)
                changed.append(room)
                continue
            if timed_out_players and game.phase is Phase.TURN:
                game.finish_by_disconnect(timed_out_players[0])
                room.turn_deadline = None
                changed.append(room)
                continue
            if room.mode == "practice" and self._advance_practice(room):
                changed.append(room)
                continue
            if game.phase is not Phase.TURN:
                continue
            if (
                not game.paused
                and room.turn_deadline is not None
                and now >= room.turn_deadline
            ):
                if self.expire_turn(room.code) is not None:
                    changed.append(room)
        return changed

    def leave(self, player_id: str) -> Room | None:
        self.cancel_queue(player_id)
        room = self.room_for(player_id)
        if room is None:
            return None
        self._remove_room(room)
        return room

    def cleanup(self) -> None:
        now = self.clock.now()
        expired = [
            room
            for room in self.rooms.values()
            if room.expires_at is not None and now > room.expires_at
        ]
        for room in expired:
            self._remove_room(room)

    def _started_room(self, player_id: str) -> Room:
        room = self.room_for(player_id)
        if room is None:
            raise RoomError("你还没有加入房间")
        if room.game is None:
            raise RoomError("正在等待另一名玩家")
        return room

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

    def _schedule_bot(
        self,
        room: Room,
        step: str,
        delay: float = BOT_ACTION_DELAY_SECONDS,
    ) -> None:
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

    def _after_game_change(self, room: Room) -> None:
        game = room.game
        if game is None:
            room.turn_deadline = None
            return

        is_bot_turn = (
            room.bot_player_id is not None
            and game.current_player == room.bot_player_id
        )
        room.turn_deadline = (
            self.clock.now() + TURN_SECONDS
            if game.phase is Phase.TURN and not is_bot_turn
            else None
        )
        if room.mode != "practice":
            return

        bot_id = room.bot_player_id
        bot_still_deploying = (
            game.phase is Phase.MIXING
            and bot_id is not None
            and game.players[bot_id].recipe is None
        )
        if not bot_still_deploying:
            self._clear_bot_schedule(room)
        self._sync_practice_schedule(room)

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
            burger_positions = available_burger_positions(
                tuple(sorted(game.remaining_fries)), game.snacks
            )
            position = self.bot_policy.choose_position(burger_positions)
            sauces = self.bot_policy.choose_sauces(tuple(sorted(SAUCES)))
            game.lock_recipe(bot_id, position, composition_for_sauces(sauces))
            self._after_game_change(room)
        elif (
            step == "human-bluff"
            and game.phase is Phase.TURN
            and game.current_player != bot_id
        ):
            gesture = self.bot_policy.choose_gesture(
                ("calm", "laugh", "point", "hurry")
            )
            game.send_gesture(bot_id, gesture)
            room.bot_step = "idle-human"
        elif (
            step == "turn-aim"
            and game.phase is Phase.TURN
            and game.current_player == bot_id
        ):
            target = self.bot_policy.choose_position(
                tuple(sorted(game.remaining_fries))
            )
            game.aim(bot_id, target)
            room.bot_target = target
            self._schedule_bot(room, "turn-gesture")
        elif (
            step == "turn-gesture"
            and game.phase is Phase.TURN
            and game.current_player == bot_id
        ):
            gesture = self.bot_policy.choose_gesture(
                ("calm", "laugh", "point", "hurry")
            )
            game.send_gesture(bot_id, gesture)
            next_step = (
                "turn-change"
                if self.bot_policy.should_change(len(game.remaining_fries))
                else "turn-confirm"
            )
            self._schedule_bot(room, next_step)
        elif (
            step == "turn-change"
            and game.phase is Phase.TURN
            and game.current_player == bot_id
        ):
            current = game.pending_pick.position
            options = tuple(sorted(game.remaining_fries - {current}))
            if options:
                game.aim(bot_id, self.bot_policy.choose_position(options))
            self._schedule_bot(room, "turn-confirm")
        elif (
            step == "turn-confirm"
            and game.phase is Phase.TURN
            and game.current_player == bot_id
        ):
            game.confirm_pick(bot_id)
            self._after_game_change(room)
        else:
            self._after_game_change(room)
        return True
