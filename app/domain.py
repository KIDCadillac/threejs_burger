from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


FRY_COUNT = 12
SAUCES = frozenset({"chili", "mustard", "sour", "sticky"})
GESTURES = frozenset({"sneak", "mix", "sealed", "calm", "laugh", "point", "hurry"})
SNACK_LAYOUTS = (
    (
        "fry",
        "nugget",
        "donut",
        "cookie",
        "onion-ring",
        "mochi",
        "donut",
        "fry",
        "mochi",
        "nugget",
        "cookie",
        "onion-ring",
    ),
    (
        "cookie",
        "onion-ring",
        "fry",
        "mochi",
        "nugget",
        "donut",
        "nugget",
        "cookie",
        "donut",
        "onion-ring",
        "mochi",
        "fry",
    ),
)


class Phase(str, Enum):
    MIXING = "mixing"
    TURN = "turn"
    FINISHED = "finished"


class RuleError(ValueError):
    """Raised when a player command is invalid for the current game state."""


@dataclass(frozen=True, slots=True)
class Recipe:
    position: int
    sauces: tuple[str, ...]


@dataclass(slots=True)
class PlayerState:
    player_id: str
    recipe: Recipe | None = None
    poison_active: bool = False


@dataclass(frozen=True, slots=True)
class PickOutcome:
    kind: str
    position: int
    picker: str
    winner: str | None = None
    loser: str | None = None
    recipe: Recipe | None = None
    automatic: bool = False


@dataclass(slots=True)
class PendingPick:
    picker: str
    position: int
    changed: bool = False
    bluff: str | None = None


@dataclass(frozen=True, slots=True)
class GestureEvent:
    key: str
    sequence: int


@dataclass(slots=True)
class GameState:
    room_code: str
    player_order: tuple[str, str]
    first_player: str
    players: dict[str, PlayerState]
    phase: Phase = Phase.MIXING
    current_player: str | None = None
    remaining_fries: set[int] = field(default_factory=lambda: set(range(FRY_COUNT)))
    winner: str | None = None
    loser: str | None = None
    result_reason: str | None = None
    last_outcome: PickOutcome | None = None
    rematch_votes: set[str] = field(default_factory=set)
    round_number: int = 1
    paused: bool = False
    pending_pick: PendingPick | None = None
    gestures: dict[str, GestureEvent] = field(default_factory=dict)
    gesture_sequence: int = 0

    @property
    def snacks(self) -> tuple[str, ...]:
        return SNACK_LAYOUTS[(self.round_number - 1) % len(SNACK_LAYOUTS)]

    @classmethod
    def create(
        cls, room_code: str, player_ids: Iterable[str], *, first_player: str
    ) -> GameState:
        order = tuple(player_ids)
        if len(order) != 2 or len(set(order)) != 2:
            raise RuleError("需要两名不同玩家")
        if first_player not in order:
            raise RuleError("先手玩家不在房间中")
        typed_order = (order[0], order[1])
        return cls(
            room_code=room_code,
            player_order=typed_order,
            first_player=first_player,
            players={player_id: PlayerState(player_id) for player_id in typed_order},
        )

    def lock_recipe(
        self, player_id: str, position: int, sauces: Iterable[str]
    ) -> None:
        if self.phase is not Phase.MIXING:
            raise RuleError("当前不能调制薯条")
        player = self._player(player_id)
        if player.recipe is not None:
            raise RuleError("你的配方已经封装")
        if position not in range(FRY_COUNT):
            raise RuleError("薯条位置无效")

        sauce_tuple = tuple(sauces)
        if not 1 <= len(sauce_tuple) <= 4:
            raise RuleError("必须选择 1 到 4 份调味料")
        if any(sauce not in SAUCES for sauce in sauce_tuple):
            raise RuleError("包含未知调味料")

        player.recipe = Recipe(position=position, sauces=sauce_tuple)
        player.poison_active = True

        if all(candidate.recipe is not None for candidate in self.players.values()):
            self.phase = Phase.TURN
            self.current_player = self.first_player

    def pick(
        self, player_id: str, position: int, *, automatic: bool = False
    ) -> PickOutcome:
        if self.phase is not Phase.TURN:
            raise RuleError("当前不能选择薯条")
        if self.paused:
            raise RuleError("对局暂时暂停")
        self._player(player_id)
        if self.current_player != player_id:
            raise RuleError("还没轮到你")
        if position not in self.remaining_fries:
            raise RuleError("这根薯条已经被吃掉")

        self.pending_pick = None
        self.remaining_fries.remove(position)
        opponent_id = self._opponent(player_id)
        opponent = self.players[opponent_id]
        picker = self.players[player_id]

        if (
            opponent.poison_active
            and opponent.recipe is not None
            and opponent.recipe.position == position
        ):
            outcome = PickOutcome(
                kind="hit",
                position=position,
                picker=player_id,
                winner=opponent_id,
                loser=player_id,
                recipe=opponent.recipe,
                automatic=automatic,
            )
            self._finish(outcome, reason="poison")
            return outcome

        kind = "safe"
        if (
            picker.poison_active
            and picker.recipe is not None
            and picker.recipe.position == position
        ):
            picker.poison_active = False
            kind = "safe-own"

        if not any(player.poison_active for player in self.players.values()):
            outcome = PickOutcome(
                kind="draw",
                position=position,
                picker=player_id,
                automatic=automatic,
            )
            self._finish(outcome, reason="both-poisons-removed")
            return outcome

        outcome = PickOutcome(
            kind=kind,
            position=position,
            picker=player_id,
            automatic=automatic,
        )
        self.last_outcome = outcome
        self.current_player = opponent_id
        return outcome

    def aim(self, player_id: str, position: int) -> PendingPick:
        if self.phase is not Phase.TURN:
            raise RuleError("当前不能选择零食")
        if self.paused:
            raise RuleError("对局暂时暂停")
        self._player(player_id)
        if self.current_player != player_id:
            raise RuleError("还没轮到你")
        if position not in self.remaining_fries:
            raise RuleError("这件零食已经被吃掉")

        if self.pending_pick is None:
            self.pending_pick = PendingPick(picker=player_id, position=position)
            return self.pending_pick
        if self.pending_pick.picker != player_id:
            raise RuleError("当前瞄准不属于你")
        if self.pending_pick.position == position:
            return self.pending_pick
        if self.pending_pick.changed:
            raise RuleError("本回合已经改选过一次")

        self.pending_pick.position = position
        self.pending_pick.changed = True
        return self.pending_pick

    def send_gesture(self, player_id: str, key: str) -> GestureEvent:
        if self.phase is Phase.FINISHED:
            raise RuleError("本局已经结束")
        self._player(player_id)
        if key not in GESTURES:
            raise RuleError("未知搞怪动作")

        self.gesture_sequence += 1
        event = GestureEvent(key=key, sequence=self.gesture_sequence)
        self.gestures[player_id] = event
        if (
            self.phase is Phase.TURN
            and self.pending_pick is not None
            and self.pending_pick.picker != player_id
            and self.pending_pick.bluff is None
        ):
            self.pending_pick.bluff = key
        return event

    def confirm_pick(
        self, player_id: str, *, automatic: bool = False
    ) -> PickOutcome:
        pending = self.pending_pick
        if pending is None or pending.picker != player_id:
            raise RuleError("请先瞄准一件零食")
        return self.pick(player_id, pending.position, automatic=automatic)

    def finish_by_disconnect(self, loser_id: str) -> PickOutcome:
        if self.phase is not Phase.TURN:
            raise RuleError("当前对局不能按掉线结算")
        self._player(loser_id)
        winner_id = self._opponent(loser_id)
        outcome = PickOutcome(
            kind="disconnect",
            position=-1,
            picker=loser_id,
            winner=winner_id,
            loser=loser_id,
        )
        self._finish(outcome, reason="disconnect")
        return outcome

    def request_rematch(self, player_id: str) -> bool:
        if self.phase is not Phase.FINISHED:
            raise RuleError("本局尚未结束")
        self._player(player_id)
        self.rematch_votes.add(player_id)
        if len(self.rematch_votes) < 2:
            return False

        next_first = self._opponent(self.first_player)
        self.first_player = next_first
        self.phase = Phase.MIXING
        self.current_player = None
        self.remaining_fries = set(range(FRY_COUNT))
        self.winner = None
        self.loser = None
        self.result_reason = None
        self.last_outcome = None
        self.rematch_votes.clear()
        self.round_number += 1
        self.paused = False
        self.pending_pick = None
        self.gestures.clear()
        self.gesture_sequence = 0
        for player in self.players.values():
            player.recipe = None
            player.poison_active = False
        return True

    def _finish(self, outcome: PickOutcome, *, reason: str) -> None:
        self.phase = Phase.FINISHED
        self.current_player = None
        self.winner = outcome.winner
        self.loser = outcome.loser
        self.result_reason = reason
        self.last_outcome = outcome
        self.paused = False
        self.pending_pick = None

    def _player(self, player_id: str) -> PlayerState:
        try:
            return self.players[player_id]
        except KeyError as error:
            raise RuleError("玩家不在这个房间中") from error

    def _opponent(self, player_id: str) -> str:
        self._player(player_id)
        first, second = self.player_order
        return second if player_id == first else first
