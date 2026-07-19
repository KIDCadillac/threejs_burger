import asyncio
import importlib.util

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import ConnectionHub, app, create_app
from app.service import GameService


client = TestClient(app)


def test_stale_socket_cannot_unregister_replacement() -> None:
    hub = ConnectionHub()
    old_socket = object()
    replacement_socket = object()
    hub.register("p1", old_socket)
    hub.register("p1", replacement_socket)

    assert hub.unregister("p1", old_socket) is False
    assert hub.sockets["p1"] is replacement_socket
    assert hub.unregister("p1", replacement_socket) is True


def test_real_server_has_websocket_runtime() -> None:
    assert importlib.util.find_spec("websockets") is not None


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home_page_contains_game_title() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "女巫的毒药" in response.text
    assert 'data-action="quick-match"' in response.text
    assert 'data-action="create-room"' in response.text
    assert 'data-action="join-room"' in response.text


def test_websocket_create_and_join_room() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect("/ws?player=p1") as ws1:
        assert ws1.receive_json()["type"] == "home"
        ws1.send_json({"type": "room.create"})
        created = ws1.receive_json()
        code = created["room"]["code"]
        assert created["phase"] == "waiting"

        with isolated_client.websocket_connect("/ws?player=p2") as ws2:
            assert ws2.receive_json()["type"] == "home"
            ws2.send_json({"type": "room.join", "code": code})

            p2_state = ws2.receive_json()
            p1_state = ws1.receive_json()
            assert p1_state["phase"] == "mixing"
            assert p2_state["phase"] == "mixing"
            assert p1_state["room"]["code"] == p2_state["room"]["code"]

            ws1.send_json(
                {
                    "type": "recipe.lock",
                    "position": 1,
                    "sauces": ["chili", "mustard"],
                }
            )
            ws1.receive_json()
            ws2.receive_json()
            ws2.send_json(
                {
                    "type": "recipe.lock",
                    "position": 7,
                    "sauces": ["sour", "sticky"],
                }
            )
            turn_for_p1 = ws1.receive_json()
            turn_for_p2 = ws2.receive_json()
            assert turn_for_p1["phase"] == "turn"
            assert turn_for_p2["phase"] == "turn"
            assert turn_for_p1["deadline"] is not None

            ws1.send_json({"type": "snack.aim", "position": 3})
            aimed_for_p1 = ws1.receive_json()
            assert aimed_for_p1["type"] == "state"
            aimed_for_p2 = ws2.receive_json()
            assert aimed_for_p1["pendingPick"]["position"] == 3
            assert aimed_for_p2["pendingPick"] == aimed_for_p1["pendingPick"]

            ws2.send_json({"type": "gesture.send", "key": "point"})
            gesture_for_p2 = ws2.receive_json()
            gesture_for_p1 = ws1.receive_json()
            assert gesture_for_p1["pendingPick"]["bluff"] == "point"
            assert gesture_for_p2["gestures"] == gesture_for_p1["gestures"]

            ws1.send_json({"type": "snack.aim", "position": 4})
            changed_for_p1 = ws1.receive_json()
            changed_for_p2 = ws2.receive_json()
            assert changed_for_p1["pendingPick"]["changed"] is True
            assert changed_for_p2["pendingPick"]["position"] == 4

            ws1.send_json({"type": "snack.confirm"})
            confirmed_for_p1 = ws1.receive_json()
            confirmed_for_p2 = ws2.receive_json()
            assert confirmed_for_p1["lastOutcome"]["position"] == 4
            assert confirmed_for_p2["currentPlayer"] == "p2"


def test_websocket_rejects_unknown_command_without_closing() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect("/ws?player=p1") as socket:
        socket.receive_json()
        socket.send_json({"type": "room.explode"})

        error = socket.receive_json()
        assert error["type"] == "error"
        assert "不支持" in error["message"]

        socket.send_json({"type": "room.create"})
        assert socket.receive_json()["phase"] == "waiting"


def test_leaving_room_returns_both_players_home() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect("/ws?player=p1") as ws1:
        ws1.receive_json()
        ws1.send_json({"type": "room.create"})
        code = ws1.receive_json()["room"]["code"]
        with isolated_client.websocket_connect("/ws?player=p2") as ws2:
            ws2.receive_json()
            ws2.send_json({"type": "room.join", "code": code})
            ws2.receive_json()
            ws1.receive_json()

            ws1.send_json({"type": "room.leave"})

            assert ws1.receive_json()["type"] == "home"
            assert ws2.receive_json()["type"] == "home"


def test_client_declares_private_state_and_four_reactions() -> None:
    app_script = client.get("/static/app.js")
    effects_script = client.get("/static/effects.js")

    assert app_script.status_code == 200
    assert "只有你能看见" in app_script.text
    assert effects_script.status_code == 200
    for effect in ("chili", "mustard", "sour", "sticky"):
        assert effect in effects_script.text
    assert "🍯" in effects_script.text
    assert "🫧" not in effects_script.text


def test_client_contains_mixed_snacks_gestures_and_hit_replay() -> None:
    app_script = client.get("/static/app.js").text
    effects_script = client.get("/static/effects.js").text
    styles = client.get("/static/styles.css").text

    assert "export const SNACKS" in effects_script
    for snack in ("fry", "nugget", "donut", "cookie", "onion-ring", "mochi"):
        assert f'"{snack}"' in effects_script
        assert f".snack--{snack}" in styles
    for marker in (
        "deployment-stage",
        "opponent-pose",
        "gesture-bar",
        'type: "snack.aim"',
        'type: "gesture.send"',
        'type: "snack.confirm"',
        'data-action="replay-deployment"',
        "reaction-caption",
        "deployment-replay",
    ):
        assert marker in app_script or marker in styles


def test_invite_auto_join_is_not_sent_blindly_on_socket_open() -> None:
    script = client.get("/static/app.js").text
    open_handler = script.split('socket.addEventListener("open"', 1)[1].split(
        'socket.addEventListener("message"', 1
    )[0]

    assert 'type: "room.join"' not in open_handler
    assert "connect();\nrenderHome();" in script
    assert "connect();\nrender(lastMessage);" not in script
    assert "tryInviteAutoJoin" in script


def test_reconnect_broadcasts_resumed_state_to_opponent() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect("/ws?player=p2") as ws2:
        ws2.receive_json()
        with isolated_client.websocket_connect("/ws?player=p1") as ws1:
            ws1.receive_json()
            ws1.send_json({"type": "room.create"})
            code = ws1.receive_json()["room"]["code"]
            ws2.send_json({"type": "room.join", "code": code})
            ws2.receive_json()
            ws1.receive_json()
            ws1.send_json(
                {"type": "recipe.lock", "position": 1, "sauces": ["chili", "mustard"]}
            )
            ws1.receive_json()
            ws2.receive_json()
            ws2.send_json(
                {"type": "recipe.lock", "position": 7, "sauces": ["sour", "sticky"]}
            )
            ws2.receive_json()
            ws1.receive_json()

        paused = ws2.receive_json()
        assert paused["paused"] is True

        with isolated_client.websocket_connect("/ws?player=p1") as reconnected:
            assert reconnected.receive_json()["paused"] is False
            ws2.send_json({"type": "room.explode"})
            resumed_for_opponent = ws2.receive_json()
            assert resumed_for_opponent["type"] == "state"
            assert resumed_for_opponent["paused"] is False


def test_websocket_starts_practice_without_waiting() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect("/ws?player=p1") as socket:
        socket.receive_json()
        socket.send_json({"type": "practice.start"})

        state = socket.receive_json()

        assert state["phase"] == "mixing"
        assert state["room"]["mode"] == "practice"
        assert any(player["computer"] for player in state["players"])


def test_removed_tick_room_returns_connected_players_home() -> None:
    assert hasattr(main_module, "_publish_tick_room")

    class FakeHub:
        def __init__(self) -> None:
            self.sent = []
            self.broadcasted = []

        async def send(self, player_id, payload) -> None:
            self.sent.append((player_id, payload))

        async def broadcast_room(self, room) -> None:
            self.broadcasted.append(room)

    service = GameService()
    room = service.create_room("p1")
    service.leave("p1")
    hub = FakeHub()

    asyncio.run(main_module._publish_tick_room(service, hub, room))

    assert hub.sent == [("p1", {"type": "home"})]
    assert hub.broadcasted == []


def test_client_offers_practice_from_home_and_matching() -> None:
    page = client.get("/").text
    script = client.get("/static/app.js").text

    assert 'data-action="start-practice"' in page
    assert script.count('data-action="start-practice"') >= 2
    assert 'type: "practice.start"' in script
    assert "单人练习" in script
    assert "没人？和电脑玩" in script
    assert "电脑女巫" in script


def test_game_header_offers_a_leave_action_during_play() -> None:
    script = client.get("/static/app.js").text
    header_source = script.split("function gameHeader", 1)[1].split(
        "function playerRibbon", 1
    )[0]

    assert 'data-action="leave-room"' in header_source
    assert "退出本局" in header_source
