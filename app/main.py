import asyncio
import json
import mimetypes
import secrets
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.domain import RuleError
from app.protocol import ProtocolError, command_type, serialize_room
from app.recipe_data import parse_composition
from app.service import GameService, Room, RoomError


BASE_DIR = Path(__file__).parent
MAX_MESSAGE_CHARS = 128 * 1024
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("image/webp", ".webp")


class ConnectionHub:
    def __init__(self) -> None:
        self.sockets: dict[str, WebSocket] = {}
        self.credentials: dict[str, str] = {}

    def authorize(self, player_id: str, credential: str) -> bool:
        if len(credential) < 32:
            return False
        known = self.credentials.get(player_id)
        if known is None:
            self.credentials[player_id] = credential
            return True
        return secrets.compare_digest(known, credential)

    def register(self, player_id: str, socket: WebSocket) -> None:
        self.sockets[player_id] = socket

    def unregister(self, player_id: str, socket: WebSocket) -> bool:
        if self.sockets.get(player_id) is socket:
            self.sockets.pop(player_id, None)
            return True
        return False

    async def send(self, player_id: str, payload: dict[str, Any]) -> None:
        socket = self.sockets.get(player_id)
        if socket is not None:
            await socket.send_json(payload)

    async def broadcast_room(self, room: Room) -> None:
        for player_id in room.players:
            if player_id in self.sockets:
                await self.send(
                    player_id, serialize_room(room, viewer_id=player_id)
                )


async def _receive_command(socket: WebSocket) -> Any:
    message = await socket.receive()
    if message["type"] == "websocket.disconnect":
        raise WebSocketDisconnect(
            code=message.get("code", 1000),
            reason=message.get("reason"),
        )
    text = message.get("text")
    if not isinstance(text, str):
        raise ProtocolError("消息必须使用文本 JSON")
    if len(text) > MAX_MESSAGE_CHARS:
        raise ProtocolError("消息过大")
    try:
        return json.loads(text)
    except (ValueError, RecursionError) as error:
        raise ProtocolError("消息 JSON 格式或复杂度无效") from error


def create_app(service: GameService | None = None) -> FastAPI:
    game_service = service or GameService()
    hub = ConnectionHub()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        timer_task = asyncio.create_task(_timer_loop(game_service, hub))
        try:
            yield
        finally:
            timer_task.cancel()
            with suppress(asyncio.CancelledError):
                await timer_task

    application = FastAPI(title="Witch Fries Prototype", lifespan=lifespan)
    application.state.game_service = game_service
    application.state.hub = hub
    application.mount(
        "/static", StaticFiles(directory=BASE_DIR / "static"), name="static"
    )

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/")
    def home() -> FileResponse:
        return FileResponse(BASE_DIR / "static" / "index.html")

    @application.websocket("/ws")
    async def websocket_endpoint(
        socket: WebSocket, player: str = "", credential: str = ""
    ) -> None:
        if not player or not hub.authorize(player, credential):
            await socket.close(code=1008, reason="玩家身份验证失败")
            return
        await socket.accept()
        hub.register(player, socket)
        try:
            room = game_service.connect(player)
            if room is not None:
                await hub.broadcast_room(room)
            elif player in game_service.queue:
                await hub.send(player, {"type": "matching"})
            else:
                await hub.send(player, {"type": "home"})

            while True:
                try:
                    payload = await _receive_command(socket)
                    await _dispatch(
                        payload,
                        player_id=player,
                        service=game_service,
                        hub=hub,
                    )
                except (ProtocolError, RoomError, RuleError, TypeError) as error:
                    await hub.send(
                        player, {"type": "error", "message": str(error)}
                    )
        except WebSocketDisconnect:
            pass
        finally:
            if hub.unregister(player, socket):
                connected_room = game_service.disconnect(player)
                if connected_room is not None:
                    await hub.broadcast_room(connected_room)

    return application


async def _dispatch(
    payload: Any,
    *,
    player_id: str,
    service: GameService,
    hub: ConnectionHub,
) -> None:
    kind = command_type(payload)

    if kind == "room.create":
        room = service.create_room(player_id)
        service.connect(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "room.join":
        code = payload.get("code")
        if not isinstance(code, str):
            raise ProtocolError("请输入六位房间码")
        room = service.join_room(player_id, code)
        service.connect(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "practice.start":
        room = service.start_practice(player_id)
        service.connect(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "match.join":
        result = service.join_queue(player_id)
        if result.status == "waiting":
            await hub.send(player_id, {"type": "matching"})
        else:
            room = _require_room(service, player_id)
            for room_player in room.players:
                service.connect(room_player)
            await hub.broadcast_room(room)
        return

    if kind == "match.cancel":
        service.cancel_queue(player_id)
        await hub.send(player_id, {"type": "home"})
        return

    if kind == "recipe.lock":
        position = payload.get("position")
        if isinstance(position, bool) or not isinstance(position, int):
            raise ProtocolError("请选择一件食物")
        try:
            composition = parse_composition(payload.get("composition"))
        except ValueError as error:
            raise ProtocolError(str(error)) from error
        room = service.lock_recipe(player_id, position, composition)
        await hub.broadcast_room(room)
        return

    if kind == "fry.pick":
        position = payload.get("position")
        if not isinstance(position, int):
            raise ProtocolError("请选择一根薯条")
        room = _require_started_room(service, player_id)
        service.pick(player_id, position)
        await hub.broadcast_room(room)
        return

    if kind == "snack.aim":
        position = payload.get("position")
        if not isinstance(position, int):
            raise ProtocolError("请选择一件零食")
        room = service.aim(player_id, position)
        await hub.broadcast_room(room)
        return

    if kind == "gesture.send":
        key = payload.get("key")
        if not isinstance(key, str):
            raise ProtocolError("动作格式无效")
        room = service.send_gesture(player_id, key)
        await hub.broadcast_room(room)
        return

    if kind == "snack.confirm":
        room = _require_started_room(service, player_id)
        service.confirm_pick(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "rematch.request":
        room = _require_started_room(service, player_id)
        service.request_rematch(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "room.leave":
        room = service.leave(player_id)
        affected_players = room.players if room is not None else [player_id]
        for affected_player in affected_players:
            await hub.send(affected_player, {"type": "home"})
        return

    raise ProtocolError(f"不支持的操作：{kind}")


def _require_room(service: GameService, player_id: str) -> Room:
    room = service.room_for(player_id)
    if room is None:
        raise RoomError("你还没有加入房间")
    return room


def _require_started_room(service: GameService, player_id: str) -> Room:
    room = _require_room(service, player_id)
    if room.game is None:
        raise RoomError("正在等待另一名玩家")
    return room


app = create_app()


async def _publish_tick_room(
    service: GameService, hub: ConnectionHub, room: Room
) -> None:
    if service.rooms.get(room.code) is room:
        await hub.broadcast_room(room)
        return
    for player_id in room.players:
        await hub.send(player_id, {"type": "home"})


async def _timer_loop(service: GameService, hub: ConnectionHub) -> None:
    while True:
        await asyncio.sleep(0.2)
        for room in service.tick():
            await _publish_tick_room(service, hub, room)
