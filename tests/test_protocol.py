import json

from app.domain import GameState
from app.protocol import serialize_game, serialize_room
from app.service import GameService


def locked_game() -> GameState:
    game = GameState.create("ROOM01", ["p1", "p2"], first_player="p1")
    game.lock_recipe("p1", 1, ("chili", "mustard"))
    game.lock_recipe("p2", 7, ("sour", "sticky"))
    return game


def test_player_view_never_contains_opponent_recipe() -> None:
    game = locked_game()

    p1_view = serialize_game(game, viewer_id="p1")
    encoded = json.dumps(p1_view)

    assert "sour" not in encoded
    assert "sticky" not in encoded
    assert p1_view["private"]["poisonPosition"] == 1
    assert p1_view["private"]["sauces"] == ["chili", "mustard"]


def test_safe_outcome_does_not_reveal_recipe() -> None:
    game = locked_game()
    game.pick("p1", 3)

    view = serialize_game(game, viewer_id="p2")

    assert view["lastOutcome"]["kind"] == "safe"
    assert "recipe" not in view["lastOutcome"]


def test_shared_snacks_and_public_interaction_never_reveal_opponent_recipe() -> None:
    game = locked_game()
    game.aim("p1", 3)
    game.send_gesture("p2", "point")

    p1_view = serialize_game(game, viewer_id="p1")
    p2_view = serialize_game(game, viewer_id="p2")

    assert p1_view["snacks"] == p2_view["snacks"]
    assert len(p1_view["snacks"]) == 12
    assert p1_view["pendingPick"] == {
        "picker": "p1",
        "position": 3,
        "changed": False,
        "bluff": "point",
    }
    assert p1_view["gestures"] == p2_view["gestures"]
    assert "sour" not in json.dumps(p1_view)
    assert "chili" not in json.dumps(p2_view)


def test_hit_result_reveals_only_triggered_recipe() -> None:
    game = locked_game()
    game.pick("p1", 7)

    view = serialize_game(game, viewer_id="p1")

    assert view["result"] == {
        "reason": "poison",
        "winner": "p2",
        "loser": "p1",
        "recipe": {"sauces": ["sour", "sticky"]},
        "replay": {
            "position": 7,
            "snackKind": game.snacks[7],
            "sauces": ["sour", "sticky"],
            "creator": "p2",
        },
    }


def test_view_for_non_player_is_rejected() -> None:
    game = locked_game()

    try:
        serialize_game(game, viewer_id="spectator")
    except ValueError as error:
        assert str(error) == "无权查看这个房间"
    else:
        raise AssertionError("non-player view should fail")


def test_practice_room_marks_computer_online_without_revealing_recipe() -> None:
    service = GameService()
    room = service.start_practice("p1")
    bot_id = room.bot_player_id
    assert bot_id is not None
    room.game.lock_recipe(bot_id, 7, ("sour", "sticky"))

    view = serialize_room(room, viewer_id="p1")

    bot = next(player for player in view["players"] if player["computer"])
    assert bot["id"] == bot_id
    assert bot["name"] == "电脑女巫"
    assert bot["online"] is True
    assert "sour" not in json.dumps(view)
