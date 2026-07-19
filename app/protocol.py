from __future__ import annotations

from typing import Any

from app.domain import GameState, Phase, PickOutcome
from app.service import Room


class ProtocolError(ValueError):
    """Raised when a client message is malformed or unsupported."""


def command_type(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise ProtocolError("消息格式无效")
    kind = payload.get("type")
    if not isinstance(kind, str) or not kind:
        raise ProtocolError("消息缺少操作类型")
    return kind


def serialize_game(game: GameState, *, viewer_id: str) -> dict[str, Any]:
    if viewer_id not in game.players:
        raise ValueError("无权查看这个房间")

    viewer = game.players[viewer_id]
    private: dict[str, Any] | None = None
    if viewer.recipe is not None:
        private = {
            "poisonPosition": viewer.recipe.position,
            "sauces": list(viewer.recipe.sauces),
            "active": viewer.poison_active,
        }

    result: dict[str, Any] | None = None
    if game.phase is Phase.FINISHED:
        result = {
            "reason": game.result_reason,
            "winner": game.winner,
            "loser": game.loser,
        }
        if game.result_reason == "poison" and game.last_outcome is not None:
            if game.last_outcome.recipe is not None:
                result["recipe"] = {
                    "sauces": list(game.last_outcome.recipe.sauces)
                }

    return {
        "phase": game.phase.value,
        "currentPlayer": game.current_player,
        "remainingFries": sorted(game.remaining_fries),
        "roundNumber": game.round_number,
        "paused": game.paused,
        "players": [
            {
                "id": player_id,
                "seat": index,
                "ready": game.players[player_id].recipe is not None,
            }
            for index, player_id in enumerate(game.player_order)
        ],
        "private": private,
        "lastOutcome": _serialize_outcome(game.last_outcome),
        "result": result,
        "rematchVotes": sorted(game.rematch_votes),
    }


def serialize_room(room: Room, *, viewer_id: str) -> dict[str, Any]:
    if viewer_id not in room.players:
        raise ValueError("无权查看这个房间")
    room_info = {"code": room.code, "mode": room.mode}
    if room.game is None:
        return {
            "type": "state",
            "room": room_info,
            "phase": "waiting",
            "currentPlayer": None,
            "remainingFries": list(range(12)),
            "roundNumber": 0,
            "paused": False,
            "players": [
                {
                    "id": player_id,
                    "seat": index,
                    "ready": False,
                    "online": player_id in room.connected,
                }
                for index, player_id in enumerate(room.players)
            ],
            "private": None,
            "lastOutcome": None,
            "result": None,
            "rematchVotes": [],
            "deadline": room.turn_deadline,
            "me": viewer_id,
        }

    payload = serialize_game(room.game, viewer_id=viewer_id)
    payload.update(
        {
            "type": "state",
            "room": room_info,
            "deadline": room.turn_deadline,
            "me": viewer_id,
        }
    )
    online = room.connected
    for player in payload["players"]:
        player["online"] = player["id"] in online
    return payload


def _serialize_outcome(outcome: PickOutcome | None) -> dict[str, Any] | None:
    if outcome is None:
        return None
    public_kind = "safe" if outcome.kind == "safe-own" else outcome.kind
    return {
        "kind": public_kind,
        "position": outcome.position,
        "picker": outcome.picker,
        "winner": outcome.winner,
        "loser": outcome.loser,
        "automatic": outcome.automatic,
    }

