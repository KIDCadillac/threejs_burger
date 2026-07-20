from __future__ import annotations

import secrets
from collections.abc import Callable, Sequence
from typing import TypeVar


T = TypeVar("T")


def available_burger_positions(
    positions: Sequence[int], snacks: Sequence[str]
) -> tuple[int, ...]:
    return tuple(
        position for position in positions if snacks[position] == "burger"
    )


class PracticeBotPolicy:
    def __init__(
        self, randbelow: Callable[[int], int] = secrets.randbelow
    ) -> None:
        self.randbelow = randbelow

    def choose_position(self, positions: Sequence[int]) -> int:
        return self._choose(positions)

    def choose_sauces(
        self, sauces: Sequence[str]
    ) -> tuple[str, str]:
        return (self._choose(sauces), self._choose(sauces))

    def choose_gesture(self, gestures: Sequence[str]) -> str:
        return self._choose(gestures)

    def should_change(self, option_count: int) -> bool:
        return option_count > 1 and self.randbelow(3) == 0

    def _choose(self, options: Sequence[T]) -> T:
        if not options:
            raise ValueError("电脑没有可选操作")
        return options[self.randbelow(len(options))]
