import pytest

from app.domain import GameState, Phase, RuleError


def locked_game(
    *, first: str = "p1", p1_pos: int = 1, p2_pos: int = 7
) -> GameState:
    game = GameState.create("ROOM01", ["p1", "p2"], first_player=first)
    game.lock_recipe("p1", p1_pos, ("chili", "mustard"))
    game.lock_recipe("p2", p2_pos, ("sour", "sticky"))
    return game


def test_create_requires_exactly_two_distinct_players() -> None:
    with pytest.raises(RuleError, match="需要两名不同玩家"):
        GameState.create("ROOM01", ["p1", "p1"], first_player="p1")


def test_recipe_requires_valid_position_and_two_known_sauces() -> None:
    game = GameState.create("ROOM01", ["p1", "p2"], first_player="p1")

    with pytest.raises(RuleError, match="薯条位置无效"):
        game.lock_recipe("p1", 12, ("chili", "mustard"))
    with pytest.raises(RuleError, match="必须选择两份调味料"):
        game.lock_recipe("p1", 1, ("chili",))
    with pytest.raises(RuleError, match="未知调味料"):
        game.lock_recipe("p1", 1, ("chili", "pepper"))


def test_both_recipes_move_game_into_turn_phase() -> None:
    game = locked_game()

    assert game.phase is Phase.TURN
    assert game.current_player == "p1"
    assert game.remaining_fries == set(range(12))


def test_player_cannot_lock_recipe_twice() -> None:
    game = GameState.create("ROOM01", ["p1", "p2"], first_player="p1")
    game.lock_recipe("p1", 2, ("chili", "chili"))

    with pytest.raises(RuleError, match="已经封装"):
        game.lock_recipe("p1", 3, ("sour", "sticky"))


def test_safe_pick_changes_turn() -> None:
    game = locked_game()

    outcome = game.pick("p1", 3)

    assert outcome.kind == "safe"
    assert outcome.position == 3
    assert game.current_player == "p2"
    assert 3 not in game.remaining_fries


def test_only_current_player_can_pick_and_removed_fry_cannot_repeat() -> None:
    game = locked_game()

    with pytest.raises(RuleError, match="还没轮到你"):
        game.pick("p2", 3)
    game.pick("p1", 3)
    game.pick("p2", 4)
    with pytest.raises(RuleError, match="已经被吃掉"):
        game.pick("p1", 3)


def test_hitting_opponents_poison_loses_and_reveals_recipe() -> None:
    game = locked_game()

    outcome = game.pick("p1", 7)

    assert outcome.kind == "hit"
    assert outcome.loser == "p1"
    assert outcome.winner == "p2"
    assert outcome.recipe is not None
    assert outcome.recipe.sauces == ("sour", "sticky")
    assert game.phase is Phase.FINISHED
    assert game.winner == "p2"


def test_eating_own_poison_is_safe_and_disables_it() -> None:
    game = locked_game()

    outcome = game.pick("p1", 1)

    assert outcome.kind == "safe-own"
    assert game.players["p1"].poison_active is False
    assert game.current_player == "p2"


def test_shared_poison_position_still_defeats_picker() -> None:
    game = locked_game(p1_pos=5, p2_pos=5)

    outcome = game.pick("p1", 5)

    assert outcome.kind == "hit"
    assert outcome.winner == "p2"


def test_both_owners_remove_poison_causes_draw() -> None:
    game = locked_game(p1_pos=1, p2_pos=7)
    game.pick("p1", 1)

    outcome = game.pick("p2", 7)

    assert outcome.kind == "draw"
    assert game.phase is Phase.FINISHED
    assert game.winner is None


def test_both_players_must_accept_rematch_and_first_player_alternates() -> None:
    game = locked_game()
    game.pick("p1", 7)

    assert game.request_rematch("p1") is False
    assert game.request_rematch("p2") is True

    assert game.phase is Phase.MIXING
    assert game.first_player == "p2"
    assert game.current_player is None
    assert game.remaining_fries == set(range(12))
    assert all(player.recipe is None for player in game.players.values())


def test_pick_can_record_server_auto_selection() -> None:
    game = locked_game()

    outcome = game.pick("p1", 3, automatic=True)

    assert outcome.automatic is True


def test_round_exposes_one_shared_mixed_snack_layout() -> None:
    game = GameState.create("ROOM01", ["p1", "p2"], first_player="p1")

    assert len(game.snacks) == 12
    assert set(game.snacks) == {
        "fry",
        "nugget",
        "donut",
        "cookie",
        "onion-ring",
        "mochi",
    }
    assert game.snacks is game.snacks


def test_aim_is_public_intent_but_does_not_consume_snack() -> None:
    game = locked_game()

    pending = game.aim("p1", 3)

    assert pending.picker == "p1"
    assert pending.position == 3
    assert pending.changed is False
    assert 3 in game.remaining_fries
    assert game.current_player == "p1"


def test_picker_can_change_aim_once_then_must_confirm() -> None:
    game = locked_game()
    game.aim("p1", 3)

    changed = game.aim("p1", 4)

    assert changed.position == 4
    assert changed.changed is True
    with pytest.raises(RuleError):
        game.aim("p1", 5)


def test_opponent_gesture_becomes_first_bluff_without_recipe_data() -> None:
    game = locked_game()
    game.aim("p1", 3)

    own_event = game.send_gesture("p1", "calm")
    opponent_event = game.send_gesture("p2", "point")
    game.send_gesture("p2", "laugh")

    assert own_event.key == "calm"
    assert opponent_event.sequence > own_event.sequence
    assert game.pending_pick is not None
    assert game.pending_pick.bluff == "point"
    assert game.gestures["p2"].key == "laugh"


def test_confirm_pick_consumes_final_aimed_snack() -> None:
    game = locked_game()
    game.aim("p1", 3)
    game.aim("p1", 4)

    outcome = game.confirm_pick("p1")

    assert outcome.position == 4
    assert outcome.kind == "safe"
    assert 4 not in game.remaining_fries
    assert game.pending_pick is None
    assert game.current_player == "p2"
    assert game.last_outcome is outcome
