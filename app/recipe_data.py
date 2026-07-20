from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from math import isfinite
from typing import Any


BURGER_LAYERS = (
    "bottom-bun",
    "patty",
    "cheese",
    "tomato",
    "lettuce",
    "pickle",
    "top-bun",
)
SAUCES = frozenset({"chili", "mustard", "sour", "sticky"})
MAX_STROKES = 64
MAX_POINTS = 24

_COMPOSITION_KEYS = frozenset({"food", "layerOrder", "layerPoses", "strokes"})
_POSE_KEYS = frozenset({"x", "z", "yaw"})
_STROKE_KEYS = frozenset({"sauce", "layerId", "amount", "points"})


def _finite_number(value: Any, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("3D recipe contains an invalid number")
    try:
        number = float(value)
    except OverflowError as error:
        raise ValueError("3D recipe number is out of range") from error
    if not isfinite(number) or not minimum <= number <= maximum:
        raise ValueError("3D recipe number is out of range")
    return number


def _require_exact_keys(value: Any, keys: frozenset[str], message: str) -> dict:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(message)
    return value


@dataclass(frozen=True, slots=True)
class SauceStroke:
    sauce: str
    layer_id: str
    amount: float
    points: tuple[tuple[float, float], ...]

    def to_payload(self) -> dict[str, Any]:
        return {
            "sauce": self.sauce,
            "layerId": self.layer_id,
            "amount": self.amount,
            "points": [list(point) for point in self.points],
        }


@dataclass(frozen=True, slots=True)
class BurgerComposition:
    layer_order: tuple[str, ...]
    layer_poses: tuple[tuple[str, float, float, float], ...]
    strokes: tuple[SauceStroke, ...]

    def to_payload(self) -> dict[str, Any]:
        return {
            "food": "burger",
            "layerOrder": list(self.layer_order),
            "layerPoses": {
                layer_id: {"x": x, "z": z, "yaw": yaw}
                for layer_id, x, z, yaw in self.layer_poses
            },
            "strokes": [stroke.to_payload() for stroke in self.strokes],
        }


def parse_composition(payload: Any) -> BurgerComposition:
    data = _require_exact_keys(
        payload, _COMPOSITION_KEYS, "3D recipe object is invalid"
    )
    if data["food"] != "burger":
        raise ValueError("3D recipe food is invalid")

    order = data["layerOrder"]
    if (
        not isinstance(order, list)
        or len(order) != len(BURGER_LAYERS)
        or any(
            not isinstance(layer_id, str) or layer_id not in BURGER_LAYERS
            for layer_id in order
        )
        or len(set(order)) != len(BURGER_LAYERS)
    ):
        raise ValueError("Burger layer order is invalid")

    poses = data["layerPoses"]
    if not isinstance(poses, dict) or set(poses) != set(BURGER_LAYERS):
        raise ValueError("Burger layer poses are invalid")
    parsed_poses: list[tuple[str, float, float, float]] = []
    for layer_id in BURGER_LAYERS:
        pose = _require_exact_keys(
            poses[layer_id], _POSE_KEYS, "Burger layer pose is invalid"
        )
        parsed_poses.append(
            (
                layer_id,
                _finite_number(pose["x"], -1, 1),
                _finite_number(pose["z"], -1, 1),
                _finite_number(pose["yaw"], -3.1416, 3.1416),
            )
        )

    stroke_payloads = data["strokes"]
    if (
        not isinstance(stroke_payloads, list)
        or not 1 <= len(stroke_payloads) <= MAX_STROKES
    ):
        raise ValueError("A recipe needs between 1 and 64 sauce strokes")
    strokes: list[SauceStroke] = []
    for stroke_payload in stroke_payloads:
        stroke = _require_exact_keys(
            stroke_payload, _STROKE_KEYS, "Sauce stroke is invalid"
        )
        sauce = stroke["sauce"]
        if not isinstance(sauce, str) or sauce not in SAUCES:
            raise ValueError("Sauce type is invalid")
        layer_id = stroke["layerId"]
        if not isinstance(layer_id, str) or layer_id not in BURGER_LAYERS:
            raise ValueError("Sauce layer is invalid")

        point_payloads = stroke["points"]
        if (
            not isinstance(point_payloads, list)
            or not 2 <= len(point_payloads) <= MAX_POINTS
        ):
            raise ValueError("Sauce stroke point count is invalid")
        points: list[tuple[float, float]] = []
        for point in point_payloads:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError("Sauce stroke coordinate is invalid")
            points.append(
                (
                    _finite_number(point[0], -1, 1),
                    _finite_number(point[1], -1, 1),
                )
            )

        strokes.append(
            SauceStroke(
                sauce=sauce,
                layer_id=layer_id,
                amount=_finite_number(stroke["amount"], 0.01, 1),
                points=tuple(points),
            )
        )

    return BurgerComposition(tuple(order), tuple(parsed_poses), tuple(strokes))


def composition_for_sauces(sauces: Iterable[str]) -> BurgerComposition:
    sauce_order = tuple(sauces)
    if not 1 <= len(sauce_order) <= MAX_STROKES or any(
        not isinstance(sauce, str) or sauce not in SAUCES
        for sauce in sauce_order
    ):
        raise ValueError("Sauce list is invalid")
    strokes = tuple(
        SauceStroke(
            sauce=sauce,
            layer_id="patty",
            amount=0.35,
            points=(
                (-0.45, min(index * 0.08, 1.0)),
                (0.45, min(index * 0.08, 1.0)),
            ),
        )
        for index, sauce in enumerate(sauce_order)
    )
    poses = tuple((layer_id, 0.0, 0.0, 0.0) for layer_id in BURGER_LAYERS)
    return BurgerComposition(BURGER_LAYERS, poses, strokes)
