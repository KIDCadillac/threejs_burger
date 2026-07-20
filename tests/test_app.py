import asyncio
import hashlib
import importlib.util

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import app.main as main_module
from app.main import ConnectionHub, app, create_app
from app.recipe_data import composition_for_sauces
from app.service import GameService


client = TestClient(app)

THREE_VENDOR_SHA256 = {
    "three.module.min.js": "86bcee248b64f44bcfc23c331ae74619061957d59cab040171dcb6fb5900beb6",
    "three.core.min.js": "05b2609338c76cd65daf74f3ac515bc9a5045e1b3b33edc07d8c9bd55250fa90",
    "three.LICENSE.txt": "8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc",
}

PLAYER_CREDENTIALS = {
    "p1": "p1-private-credential-1234567890abcdef",
    "p2": "p2-private-credential-1234567890abcdef",
}


def assert_vendored_sha256(content: bytes, filename: str) -> None:
    actual = hashlib.sha256(content).hexdigest()
    expected = THREE_VENDOR_SHA256[filename]
    assert actual == expected, f"{filename} SHA-256 is {actual}, expected {expected}"


def ws_path(player_id: str, credential: str | None = None) -> str:
    secret = credential or PLAYER_CREDENTIALS[player_id]
    return f"/ws?player={player_id}&credential={secret}"


def recipe_command(position: int, *sauces: str) -> dict:
    return {
        "type": "recipe.lock",
        "position": position,
        "composition": composition_for_sauces(sauces).to_payload(),
    }


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


def test_vendored_three_module_and_license_are_served_locally() -> None:
    module = client.get("/static/vendor/three.module.min.js")
    core = client.get("/static/vendor/three.core.min.js")
    license_text = client.get("/static/vendor/three.LICENSE.txt")

    assert module.status_code == 200
    assert_vendored_sha256(module.content, "three.module.min.js")
    assert 350_000 < len(module.content) < 400_000
    assert b"cdn" not in module.content.lower()
    assert core.status_code == 200
    assert_vendored_sha256(core.content, "three.core.min.js")
    assert 380_000 < len(core.content) < 420_000
    assert b"cdn" not in core.content.lower()
    assert license_text.status_code == 200
    assert_vendored_sha256(license_text.content, "three.LICENSE.txt")
    assert "MIT License" in license_text.text


def test_standalone_solo_cooking_page_and_modules_are_served() -> None:
    page = client.get("/static/cooking.html")
    stage = client.get("/static/cooking-solo-stage.mjs")
    state = client.get("/static/cooking-solo-state.mjs")
    tutorial = client.get("/static/cooking-tutorial-state.mjs")

    assert page.status_code == 200
    assert "自由料理台" in page.text
    assert 'src="./cooking-solo-app.mjs"' in page.text
    for response in (stage, state, tutorial):
        assert response.status_code == 200
        assert response.headers["content-type"].startswith(
            ("text/javascript", "application/javascript")
        )


def test_vendored_three_integrity_check_rejects_a_mutated_byte() -> None:
    original = client.get("/static/vendor/three.LICENSE.txt").content
    mutated = bytearray(original)
    mutated[-1] ^= 1

    with pytest.raises(AssertionError, match="three.LICENSE.txt SHA-256"):
        assert_vendored_sha256(bytes(mutated), "three.LICENSE.txt")


def test_home_page_contains_game_title() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "女巫的毒药" in response.text
    assert 'data-action="quick-match"' in response.text
    assert 'data-action="create-room"' in response.text
    assert 'data-action="join-room"' in response.text


def test_static_home_matches_the_current_mixed_snack_mode_before_javascript_loads() -> None:
    page = client.get("/").text
    script = client.get("/static/app.js").text

    for source in (page, script):
        assert "零食乱斗篇" in source
        assert "同一盘公共零食，各自秘密埋伏。" in source
        assert "薯条篇" not in source
        assert "调一根整蛊薯条" not in source
    assert '<div class="brand-mark" aria-hidden="true"><span>🍽️</span></div>' in page


def test_websocket_create_and_join_room() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p1")) as ws1:
        assert ws1.receive_json()["type"] == "home"
        ws1.send_json({"type": "room.create"})
        created = ws1.receive_json()
        code = created["room"]["code"]
        assert created["phase"] == "waiting"

        with isolated_client.websocket_connect(ws_path("p2")) as ws2:
            assert ws2.receive_json()["type"] == "home"
            ws2.send_json({"type": "room.join", "code": code})

            p2_state = ws2.receive_json()
            p1_state = ws1.receive_json()
            assert p1_state["phase"] == "mixing"
            assert p2_state["phase"] == "mixing"
            assert p1_state["room"]["code"] == p2_state["room"]["code"]

            ws1.send_json(recipe_command(0, "chili", "mustard"))
            ws1.receive_json()
            ws2.receive_json()
            ws2.send_json(recipe_command(6, "sour", "sticky"))
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

    with isolated_client.websocket_connect(ws_path("p1")) as socket:
        socket.receive_json()
        socket.send_json({"type": "room.explode"})

        error = socket.receive_json()
        assert error["type"] == "error"
        assert "不支持" in error["message"]

        socket.send_json({"type": "room.create"})
        assert socket.receive_json()["phase"] == "waiting"


def test_websocket_rejects_invalid_json_text_then_accepts_a_command() -> None:
    service = GameService()
    application = create_app(service)
    isolated_client = TestClient(application)

    with isolated_client.websocket_connect(ws_path("p1")) as socket:
        socket.receive_json()
        socket.send_text("{")

        error = socket.receive_json()
        assert error["type"] == "error"
        assert "JSON" in error["message"]

        socket.send_json({"type": "room.create"})
        created = socket.receive_json()
        assert created["phase"] == "waiting"
        room = service.room_for("p1")
        assert room is not None

    assert "p1" not in application.state.hub.sockets
    assert "p1" not in room.connected


def test_websocket_rejects_binary_frame_then_accepts_text_json() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p1")) as socket:
        socket.receive_json()
        socket.send_bytes(b'{"type":"room.create"}')

        error = socket.receive_json()
        assert error["type"] == "error"
        assert "文本" in error["message"]

        socket.send_json({"type": "room.create"})
        assert socket.receive_json()["phase"] == "waiting"


@pytest.mark.parametrize(
    "pathological_json",
    ["1" * 5_000, "[" * 5_000 + "0" + "]" * 5_000],
    ids=("oversized-integer", "excessive-nesting"),
)
def test_websocket_rejects_pathological_json_then_accepts_a_command(
    pathological_json: str,
) -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p1")) as socket:
        socket.receive_json()
        socket.send_text(pathological_json)

        error = socket.receive_json()
        assert error["type"] == "error"
        assert "JSON" in error["message"]

        socket.send_json({"type": "room.create"})
        assert socket.receive_json()["phase"] == "waiting"


def test_websocket_rejects_oversized_text_frame_then_accepts_a_command() -> None:
    isolated_client = TestClient(create_app(GameService()))
    oversized = '{"type":"room.create","padding":"' + "x" * 200_000 + '"}'

    with isolated_client.websocket_connect(ws_path("p1")) as socket:
        socket.receive_json()
        socket.send_text(oversized)

        error = socket.receive_json()
        assert error["type"] == "error"
        assert "过大" in error["message"]

        socket.send_json({"type": "room.create"})
        assert socket.receive_json()["phase"] == "waiting"


def test_websocket_cleanup_runs_when_dispatch_exits_unexpectedly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_dispatch(*args, **kwargs) -> None:
        raise RuntimeError("dispatch failed")

    service = GameService()
    application = create_app(service)
    isolated_client = TestClient(application)

    with pytest.raises(RuntimeError, match="dispatch failed"):
        with isolated_client.websocket_connect(ws_path("p1")) as socket:
            socket.receive_json()
            socket.send_json({"type": "room.create"})
            created = socket.receive_json()
            room = service.room_for("p1")
            assert room is not None
            assert created["phase"] == "waiting"
            assert "p1" in room.connected

            monkeypatch.setattr(main_module, "_dispatch", fail_dispatch)
            socket.send_json({"type": "room.explode"})
            socket.receive_json()

    assert "p1" not in application.state.hub.sockets
    assert "p1" not in room.connected
    assert "p1" in room.disconnected_at


def test_websocket_rejects_malformed_composition_then_accepts_valid_lock() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p1")) as socket:
        socket.receive_json()
        socket.send_json({"type": "practice.start"})
        socket.receive_json()
        malformed = recipe_command(0, "chili")
        malformed["composition"]["layerPoses"]["patty"]["x"] = 10**400
        socket.send_json(malformed)

        error = socket.receive_json()
        assert error["type"] == "error"

        valid = recipe_command(0, "chili", "mustard")
        valid["sauces"] = ["sticky"]
        socket.send_json(valid)
        accepted = socket.receive_json()
        assert accepted["type"] == "state"
        assert accepted["private"]["sauces"] == ["chili", "mustard"]
        assert accepted["private"]["composition"] == recipe_command(
            0, "chili", "mustard"
        )["composition"]


def test_leaving_room_returns_both_players_home() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p1")) as ws1:
        ws1.receive_json()
        ws1.send_json({"type": "room.create"})
        code = ws1.receive_json()["room"]["code"]
        with isolated_client.websocket_connect(ws_path("p2")) as ws2:
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


def test_current_client_posts_composition_and_only_deploys_on_burgers() -> None:
    script = client.get("/static/app.js").text
    effects = client.get("/static/effects.js").text
    styles = client.get("/static/styles.css").text

    assert 'from "/static/cooking-state.mjs"' in script
    for marker in (
        "createCookingState",
        "addSauceStroke",
        "serializeComposition",
        'layerId: "patty"',
        'send({ type: "recipe.lock", position, composition });',
        'snack.kind === "burger"',
        "后续 3D 食物包",
    ):
        assert marker in script
    assert 'send({ type: "recipe.lock", position, sauces });' not in script
    assert '"burger"' in effects
    assert ".snack--burger" in styles
    assert 'src="/static/art/foods/burger.png"' not in script


def test_invite_auto_join_is_not_sent_blindly_on_socket_open() -> None:
    script = client.get("/static/app.js").text
    open_handler = script.split('socket.addEventListener("open"', 1)[1].split(
        'socket.addEventListener("message"', 1
    )[0]

    assert 'type: "room.join"' not in open_handler
    assert "connect();\nrenderHome();" in script
    assert "connect();\nrender(lastMessage);" not in script
    assert "tryInviteAutoJoin" in script


def test_client_resets_scroll_only_when_the_screen_flow_changes() -> None:
    script = client.get("/static/app.js").text

    assert 'from "/static/view-navigation.mjs"' in script
    for view in (
        "home",
        "matching",
        "waiting",
        "mixing-editor",
        "mixing-locked",
        "private-deployment",
        "turn",
        "finished",
    ):
        assert f'viewNavigation.enter("{view}")' in script


def test_reconnect_broadcasts_resumed_state_to_opponent() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p2")) as ws2:
        ws2.receive_json()
        with isolated_client.websocket_connect(ws_path("p1")) as ws1:
            ws1.receive_json()
            ws1.send_json({"type": "room.create"})
            code = ws1.receive_json()["room"]["code"]
            ws2.send_json({"type": "room.join", "code": code})
            ws2.receive_json()
            ws1.receive_json()
            ws1.send_json(recipe_command(0, "chili", "mustard"))
            ws1.receive_json()
            ws2.receive_json()
            ws2.send_json(recipe_command(6, "sour", "sticky"))
            ws2.receive_json()
            ws1.receive_json()

        paused = ws2.receive_json()
        assert paused["paused"] is True

        with isolated_client.websocket_connect(ws_path("p1")) as reconnected:
            assert reconnected.receive_json()["paused"] is False
            ws2.send_json({"type": "room.explode"})
            resumed_for_opponent = ws2.receive_json()
            assert resumed_for_opponent["type"] == "state"
            assert resumed_for_opponent["paused"] is False


def test_websocket_rejects_wrong_player_credential() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p1")) as owner:
        assert owner.receive_json()["type"] == "home"

        with pytest.raises(WebSocketDisconnect) as error:
            with isolated_client.websocket_connect(
                ws_path("p1", "attacker-credential-1234567890abcdef")
            ) as attacker:
                attacker.receive_json()

        assert error.value.code == 1008


def test_websocket_starts_practice_without_waiting() -> None:
    isolated_client = TestClient(create_app(GameService()))

    with isolated_client.websocket_connect(ws_path("p1")) as socket:
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
    assert "电脑吃货" in page
    assert "电脑吃货" in script


def test_mode_name_does_not_force_witch_characters() -> None:
    page = client.get("/").text
    script = client.get("/static/app.js").text

    assert "女巫的毒药" in page
    assert 'button__icon">🎮' in page
    assert 'button__icon">🎮' in script
    assert 'aria-label="休闲零食操作台"' in script
    assert 'aria-label="两名玩家面对面观察公共零食"' in script
    for forced_character_copy in (
        "电脑女巫",
        "两名女巫",
        "卡通写实女巫",
        "两名卡通女巫",
        "🧙",
        "魔法餐桌",
    ):
        assert forced_character_copy not in page
        assert forced_character_copy not in script


def test_game_header_offers_a_leave_action_during_play() -> None:
    script = client.get("/static/app.js").text
    header_source = script.split("function gameHeader", 1)[1].split(
        "function playerRibbon", 1
    )[0]

    assert 'data-action="leave-room"' in header_source
    assert "退出本局" in header_source


def test_client_contains_interactive_deployment_and_shared_table() -> None:
    script = client.get("/static/app.js").text
    styles = client.get("/static/styles.css").text

    for marker in (
        "deploymentOpened",
        'data-action="open-snack"',
        "prep-workbench",
        "shared-table-scene",
        "tutorial-coach",
        "trap-cutaway",
    ):
        assert marker in script or marker in styles


def test_mode_neutral_scene_assets_are_small_decodable_landscape_webps() -> None:
    for path in (
        "/static/art/deployment-counter.webp",
        "/static/art/shared-table.webp",
    ):
        response = client.get(path)
        content = response.content

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/webp"
        assert len(content) < 150 * 1024
        assert content[:4] == b"RIFF"
        assert content[8:16] == b"WEBPVP8 "
        assert int.from_bytes(content[4:8], "little") + 8 == len(content)
        assert content[23:26] == b"\x9d\x01\x2a"
        width = int.from_bytes(content[26:28], "little") & 0x3FFF
        height = int.from_bytes(content[28:30], "little") & 0x3FFF
        assert (width, height) == (720, 400)

    assert client.get("/static/art/deployment-counter.png").status_code == 404
    assert client.get("/static/art/shared-table.png").status_code == 404


def test_scene_art_uses_a_nine_by_five_mobile_viewport_without_cropping_bias() -> None:
    styles = client.get("/static/styles.css").text

    assert "deployment-counter.png" not in styles
    assert "shared-table.png" not in styles
    for selector, filename in (
        (".prep-workbench__art", "deployment-counter.webp"),
        (".shared-table-scene__art", "shared-table.webp"),
    ):
        rule = styles.split(f"{selector} {{", 1)[1].split("}", 1)[0]
        assert f"url('/static/art/{filename}')" in rule
        assert "aspect-ratio: 9 / 5" in rule
        assert "background-position: center, center" in rule
        assert "background-size: cover, cover" in rule


def test_first_run_tutorial_finishes_after_confirming_food() -> None:
    script = client.get("/static/app.js").text
    deployment_source = script.split("function startPrivateDeployment", 1)[1].split(
        "function playHitSequence", 1
    )[0]
    confirm_source = script.split("function biteAndConfirm", 1)[1].split(
        'app.addEventListener("click"', 1
    )[0]

    assert 'localStorage.setItem("witch-food-tutorial", "done")' not in deployment_source
    assert 'localStorage.setItem("witch-food-tutorial", "done")' in confirm_source


def test_home_page_defines_an_inline_favicon() -> None:
    page = client.get("/").text

    assert 'rel="icon"' in page
    assert 'href="data:image/svg+xml,' in page
    assert "餐盘" in page or "%E9%A4%90%E7%9B%98" in page
    assert "M13 37 32 8l19 29" not in page


def test_realistic_food_assets_are_served_and_rendered() -> None:
    for kind in ("fry", "nugget", "donut", "cookie", "onion-ring", "mochi"):
        response = client.get(f"/static/art/foods/{kind}.png")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    assert "snack-piece__image" in client.get("/static/app.js").text


def test_client_supports_pointer_drag_and_four_sauce_layers() -> None:
    script = client.get("/static/app.js").text
    styles = client.get("/static/styles.css").text

    for marker in (
        "MAX_SAUCES = 4",
        "pointerdown",
        "pointermove",
        "pointerup",
        "sauce-drag-ghost",
        "food-drop-target",
        "sauce-layer--3",
    ):
        assert marker in script or marker in styles


def test_drop_target_is_the_food_not_the_whole_operation_card() -> None:
    script = client.get("/static/app.js").text

    assert 'class="food-operation food-drop-target' not in script
    assert 'class="food-operation__food food-drop-target"' in script
    assert 'aria-label="食物内部调料投放区"' in script


def test_recipe_title_counts_all_repeated_and_mixed_sauces() -> None:
    effects = client.get("/static/effects.js").text

    assert "names.every" in effects
    assert '3: "三倍"' in effects
    assert '4: "四倍"' in effects
    assert 'return names.join(" × ")' in effects


def test_character_reaction_stage_is_served_as_an_articulated_svg() -> None:
    response = client.get("/static/character-reaction.mjs")
    food = client.get("/static/food-assembly.mjs")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        ("text/javascript", "application/javascript")
    )
    for marker in (
        "characterReactionMarkup",
        "data-character-reaction",
        'data-bone="torso"',
        'data-bone="head"',
        'data-bone="left-arm"',
        'data-bone="right-arm"',
        'data-prop="food"',
        'data-effect="fire"',
    ):
        assert marker in response.text
    assert food.status_code == 200
    assert 'data-food-state="${state}"' in food.text
    assert 'build("bitten")' in food.text
    assert "/static/art/foods/" not in response.text
    assert "/static/art/foods/" not in food.text
    assert 'id="character-reaction"' not in response.text


def test_character_reaction_styles_define_food_and_full_body_motion() -> None:
    page = client.get("/").text
    response = client.get("/static/character-reaction.css")
    styles = response.text

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/css")
    assert 'href="/static/character-reaction.css"' in page
    assert page.index('href="/static/styles.css"') < page.index(
        'href="/static/character-reaction.css"'
    )
    for marker in (
        '[data-phase="reach"]',
        '[data-phase="bite"]',
        '[data-phase="burst"]',
        '[data-phase="recover"]',
        "reaction-fire-burst",
        "reaction-mouth-fan",
        "prefers-reduced-motion",
    ):
        assert marker in styles


def test_finished_round_uses_character_playback_instead_of_static_face() -> None:
    script = client.get("/static/app.js").text

    assert 'from "/static/character-reaction.mjs"' in script
    assert "characterReactionMarkup" in script
    assert "playCharacterReaction" in script
    assert 'data-action="replay-reaction"' in script

    finished = script.split("function renderFinished", 1)[1].split(
        "function gameHeader", 1
    )[0]
    assert "characterReactionMarkup({ victim, snackKind: replay.snackKind })" in finished
    assert "cartoon-face" not in finished
    assert "brave-face" not in finished


def test_character_reaction_playback_can_be_cancelled_skipped_and_replayed() -> None:
    script = client.get("/static/app.js").text
    flow_script = client.get("/static/finished-reaction-flow.mjs")

    playback = script.split("function playHitSequence", 1)[1].split(
        "function replayDeployment", 1
    )[0]
    assert "finishedReactionFlow.beginOutcome(outcomeKey, sauces, replay)" in playback

    cleanup = script.split("function clearReactionTimers", 1)[1].split(
        "function startCountdown", 1
    )[0]
    assert "finishedReactionFlow.leaveRoute()" in cleanup
    assert "finishedReactionFlow.cancelPlayback()" in cleanup

    replay = script.split("function replayCharacterReaction", 1)[1].split(
        "function clearReactionTimers", 1
    )[0]
    assert "finishedReactionFlow.replay" in replay

    click_handler = script.split('app.addEventListener("click"', 1)[1].split(
        'app.addEventListener("submit"', 1
    )[0]
    assert 'action === "skip-effect"' in click_handler
    assert "finishedReactionFlow.skip();" in click_handler
    assert 'action === "replay-reaction"' in click_handler
    assert "replayCharacterReaction();" in click_handler

    assert flow_script.status_code == 200
    for marker in (
        'querySelector("[data-character-reaction]")',
        'stage.dataset.phase = "notice"',
        'stage.dataset.foodBitten = "false"',
        'classList.remove("deployment-replay--active")',
        "stage.scrollIntoView",
    ):
        assert marker in flow_script.text


def test_legacy_static_face_styles_are_removed_without_losing_reveal_layout() -> None:
    styles = client.get("/static/styles.css").text

    for obsolete in (
        ".cartoon-face",
        ".face__",
        ".brave-button",
        ".reaction--chili",
        ".reaction--mustard",
        ".reaction--sour",
        ".reaction--sticky",
    ):
        assert obsolete not in styles

    for shared in (
        ".reaction-stage",
        ".reaction-stage--hidden",
        ".reaction-caption",
        ".victim-label",
        ".deployment-replay",
        ".result-card",
        ".skip-effect",
    ):
        assert shared in styles


def test_finished_result_focus_state_and_shared_giggle_animation_are_preserved() -> None:
    script = client.get("/static/app.js").text
    styles = client.get("/static/styles.css").text

    assert 'hidden aria-hidden="true" inert' in script
    assert "createFinishedReactionFlow" in script
    assert "replaceApp" in script
    assert "syncFinishedControls" in script
    assert script.count("app.innerHTML =") == 1
    assert script.count("replaceApp(`") == 8
    finished = script.split("function renderFinished", 1)[1].split(
        "function syncFinishedControls", 1
    )[0]
    assert finished.index("finishedReactionFlow.isCurrentOutcome") < finished.index(
        "replaceApp(`"
    )
    assert "@keyframes giggle" in styles


def test_finished_result_is_a_live_focus_target_for_explicit_skip_only() -> None:
    script = client.get("/static/app.js").text
    flow = client.get("/static/finished-reaction-flow.mjs").text
    finished = script.split("function renderFinished", 1)[1].split(
        "function syncFinishedControls", 1
    )[0]

    assert 'role="status"' in finished
    assert 'aria-live="polite"' in finished
    assert 'tabindex="-1"' in finished
    assert "preventScroll: true" in flow


def test_reaction_feedback_is_optional_phase_driven_and_wired_to_user_gestures() -> None:
    feedback = client.get("/static/reaction-feedback.mjs")
    script = client.get("/static/app.js").text
    flow = client.get("/static/finished-reaction-flow.mjs").text

    assert feedback.status_code == 200
    assert feedback.headers["content-type"].startswith("text/javascript")
    for marker in (
        "primeReactionAudio",
        "handleReactionFeedback",
        'phase === "bite"',
        'phase !== "burst"',
        "mustard:",
        "sour:",
        "sticky:",
        "vibrate",
    ):
        assert marker in feedback.text

    assert 'from "/static/reaction-feedback.mjs"' in script
    assert "primeReactionAudio" in script
    assert "handleReactionFeedback" in script
    assert 'app.addEventListener("pointerdown"' in script
    assert 'app.addEventListener("click"' in script
    assert "onReactionPhase: handleReactionFeedback" in script
    assert "onReactionPhase" in flow
