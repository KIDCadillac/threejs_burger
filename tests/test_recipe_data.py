from __future__ import annotations

from copy import deepcopy
from math import inf, nan
from typing import Any, Callable

import pytest

from app.recipe_data import (
    BURGER_LAYERS,
    MAX_POINTS,
    MAX_STROKES,
    composition_for_sauces,
    parse_composition,
)


def valid_payload() -> dict[str, Any]:
    return {
        "food": "burger",
        "layerOrder": list(BURGER_LAYERS),
        "layerPoses": {
            layer: {"x": 0, "z": 0, "yaw": 0} for layer in BURGER_LAYERS
        },
        "strokes": [
            {
                "sauce": "chili",
                "layerId": "patty",
                "amount": 0.6,
                "points": [[-0.5, 0], [0, 0.25], [0.5, 0]],
            }
        ],
    }


def test_valid_reordered_layer_payload_round_trips() -> None:
    payload = valid_payload()
    payload["layerOrder"] = [
        "bottom-bun",
        "patty",
        "tomato",
        "lettuce",
        "pickle",
        "cheese",
        "top-bun",
    ]
    payload["layerPoses"]["patty"] = {"x": 0.25, "z": -0.5, "yaw": 1.25}

    assert parse_composition(payload).to_payload() == payload


def test_repeated_and_mixed_strokes_round_trip_in_order() -> None:
    payload = valid_payload()
    payload["strokes"] = [
        {
            "sauce": sauce,
            "layerId": layer,
            "amount": amount,
            "points": [[-0.75, y], [0.75, y]],
        }
        for sauce, layer, amount, y in (
            ("chili", "patty", 0.2, -0.3),
            ("mustard", "cheese", 0.4, -0.1),
            ("chili", "patty", 0.8, 0.1),
            ("sticky", "top-bun", 1.0, 0.3),
        )
    ]

    assert parse_composition(payload).to_payload() == payload


Mutation = Callable[[dict[str, Any]], None]


def _set_order(value: Any) -> Mutation:
    return lambda data: data.update(layerOrder=value)


def _set_strokes(value: Any) -> Mutation:
    return lambda data: data.update(strokes=value)


def _mutate_stroke(key: str, value: Any) -> Mutation:
    return lambda data: data["strokes"][0].update({key: value})


def _mutate_pose(layer: str, key: str, value: Any) -> Mutation:
    return lambda data: data["layerPoses"][layer].update({key: value})


def _extra_pose(data: dict[str, Any]) -> None:
    data["layerPoses"]["table"] = {"x": 0, "z": 0, "yaw": 0}


def _missing_pose(data: dict[str, Any]) -> None:
    del data["layerPoses"]["patty"]


def _extra_root_key(data: dict[str, Any]) -> None:
    data["__proto__"] = {"food": "cookie"}


def _extra_stroke_key(data: dict[str, Any]) -> None:
    data["strokes"][0]["constructor"] = "forged"


@pytest.mark.parametrize(
    ("case", "mutation"),
    [
        ("wrong food", lambda data: data.update(food="cookie")),
        ("missing layer", _set_order(list(BURGER_LAYERS[:-1]))),
        (
            "duplicate layer",
            _set_order([*BURGER_LAYERS[:-1], BURGER_LAYERS[-2]]),
        ),
        (
            "unknown layer",
            _set_order([*BURGER_LAYERS[:-1], "table"]),
        ),
        ("missing pose", _missing_pose),
        ("extra pose", _extra_pose),
        ("unknown sauce", _mutate_stroke("sauce", "pepper")),
        ("unknown stroke layer", _mutate_stroke("layerId", "table")),
        ("bool pose number", _mutate_pose("patty", "x", True)),
        ("string pose number", _mutate_pose("patty", "z", "0")),
        ("nan pose number", _mutate_pose("patty", "yaw", nan)),
        ("infinite pose number", _mutate_pose("patty", "yaw", inf)),
        ("oversized integer pose", _mutate_pose("patty", "x", 10**400)),
        ("pose x below range", _mutate_pose("patty", "x", -1.01)),
        ("pose z above range", _mutate_pose("patty", "z", 1.01)),
        ("yaw above range", _mutate_pose("patty", "yaw", 3.1417)),
        ("bool amount", _mutate_stroke("amount", False)),
        ("non-number amount", _mutate_stroke("amount", None)),
        ("amount below range", _mutate_stroke("amount", 0.009)),
        ("amount above range", _mutate_stroke("amount", 1.01)),
        ("fewer than two points", _mutate_stroke("points", [[0, 0]])),
        (
            "over maximum points",
            _mutate_stroke("points", [[0, 0]] * (MAX_POINTS + 1)),
        ),
        ("point is not a list", _mutate_stroke("points", [[0, 0], (0, 0)])),
        ("point has extra coordinate", _mutate_stroke("points", [[0, 0], [0, 0, 0]])),
        ("bool point coordinate", _mutate_stroke("points", [[0, 0], [True, 0]])),
        ("non-number point coordinate", _mutate_stroke("points", [[0, 0], [None, 0]])),
        ("nan point coordinate", _mutate_stroke("points", [[0, 0], [nan, 0]])),
        ("infinite point coordinate", _mutate_stroke("points", [[0, 0], [inf, 0]])),
        ("point coordinate out of range", _mutate_stroke("points", [[0, 0], [1.01, 0]])),
        ("zero strokes", _set_strokes([])),
        ("too many strokes", _set_strokes(valid_payload()["strokes"] * (MAX_STROKES + 1))),
        ("unknown root key", _extra_root_key),
        ("unknown stroke key", _extra_stroke_key),
        (
            "unknown pose key",
            lambda data: data["layerPoses"]["patty"].update({"prototype": 0}),
        ),
    ],
    ids=lambda value: value if isinstance(value, str) else None,
)
def test_parser_rejects_forged_composition(case: str, mutation: Mutation) -> None:
    payload = deepcopy(valid_payload())
    mutation(payload)

    with pytest.raises(ValueError):
        parse_composition(payload)


def test_composition_for_sauces_preserves_repeated_order() -> None:
    composition = composition_for_sauces(("sticky", "chili", "sticky", "mustard"))

    assert [stroke["sauce"] for stroke in composition.to_payload()["strokes"]] == [
        "sticky",
        "chili",
        "sticky",
        "mustard",
    ]
    assert all(
        stroke["layerId"] == "patty" and len(stroke["points"]) == 2
        for stroke in composition.to_payload()["strokes"]
    )


def test_composition_for_sauces_stays_valid_at_maximum_strokes() -> None:
    composition = composition_for_sauces(("chili",) * MAX_STROKES)

    assert parse_composition(composition.to_payload()) == composition
