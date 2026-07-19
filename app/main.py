from pathlib import Path

from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.domain import RuleError
from app.protocol import ProtocolError, command_type, serialize_room
from app.service import GameService, Room, RoomError


BASE_DIR = Path(__file__).parent


class ConnectionHub:
    def __init__(self) -> None:
        self.sockets: dict[str, WebSocket] = {}

    def register(self, player_id: str, socket: WebSocket) -> None:
        self.sockets[player_id] = socket

    def unregister(self, player_id: str, socket: WebSocket) -> None:
        if self.sockets.get(player_id) is socket:
            self.sockets.pop(player_id, None)

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


def create_app(service: GameService | None = None) -> FastAPI:
    game_service = service or GameService()
    hub = ConnectionHub()
    application = FastAPI(title="Witch Fries Prototype")
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
    async def websocket_endpoint(socket: WebSocket, player: str = "") -> None:
        if not player:
            await socket.close(code=1008, reason="缺少玩家标识")
            return
        await socket.accept()
        hub.register(player, socket)
        room = game_service.room_for(player)
        if room is not None:
            room.connected.add(player)
            await hub.send(player, serialize_room(room, viewer_id=player))
        elif player in game_service.queue:
            await hub.send(player, {"type": "matching"})
        else:
            await hub.send(player, {"type": "home"})

        try:
            while True:
                payload = await socket.receive_json()
                try:
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
            hub.unregister(player, socket)
            connected_room = game_service.room_for(player)
            if connected_room is not None:
                connected_room.connected.discard(player)

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
        room.connected.add(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "room.join":
        code = payload.get("code")
        if not isinstance(code, str):
            raise ProtocolError("请输入六位房间码")
        room = service.join_room(player_id, code)
        room.connected.add(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "match.join":
        result = service.join_queue(player_id)
        if result.status == "waiting":
            await hub.send(player_id, {"type": "matching"})
        else:
            room = _require_room(service, player_id)
            room.connected.update(room.players)
            await hub.broadcast_room(room)
        return

    if kind == "match.cancel":
        service.cancel_queue(player_id)
        await hub.send(player_id, {"type": "home"})
        return

    if kind == "recipe.lock":
        room = _require_started_room(service, player_id)
        room.game.lock_recipe(
            player_id, int(payload.get("position")), payload.get("sauces", [])
        )
        await hub.broadcast_room(room)
        return

    if kind == "fry.pick":
        room = _require_started_room(service, player_id)
        room.game.pick(player_id, int(payload.get("position")))
        await hub.broadcast_room(room)
        return

    if kind == "rematch.request":
        room = _require_started_room(service, player_id)
        room.game.request_rematch(player_id)
        await hub.broadcast_room(room)
        return

    if kind == "room.leave":
        service.leave(player_id)
        await hub.send(player_id, {"type": "home"})
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
