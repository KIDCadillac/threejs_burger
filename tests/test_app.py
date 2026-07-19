from fastapi.testclient import TestClient

from app.main import app, create_app
from app.service import GameService


client = TestClient(app)


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


def test_client_declares_private_state_and_four_reactions() -> None:
    app_script = client.get("/static/app.js")
    effects_script = client.get("/static/effects.js")

    assert app_script.status_code == 200
    assert "只有你能看见" in app_script.text
    assert effects_script.status_code == 200
    for effect in ("chili", "mustard", "sour", "sticky"):
        assert effect in effects_script.text
