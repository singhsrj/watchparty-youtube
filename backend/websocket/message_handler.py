import socketio
import logging
from typing import Dict, Optional
from sqlalchemy.orm import Session

from websocket.room import Room, RoomError, PermissionError, NotFoundError
from websocket.participant import Role
from models.room import Room as RoomModel, RoomParticipant
from core.database import SessionLocal

logger = logging.getLogger(__name__)


class RoomRegistry:
    """Manages all active in-memory rooms."""

    def __init__(self):
        self._rooms: Dict[str, Room] = {}          # room_id -> Room
        self._socket_to_room: Dict[str, str] = {}  # socket_id -> room_id

    def get_room_by_id(self, room_id: str) -> Optional[Room]:
        return self._rooms.get(room_id)

    def get_room_by_code(self, code: str) -> Optional[Room]:
        for room in self._rooms.values():
            if room.room_code == code:
                return room
        return None

    def get_room_by_socket(self, socket_id: str) -> Optional[Room]:
        room_id = self._socket_to_room.get(socket_id)
        if room_id:
            return self._rooms.get(room_id)
        return None

    def register(self, room: Room):
        self._rooms[room.room_id] = room

    def map_socket(self, socket_id: str, room_id: str):
        self._socket_to_room[socket_id] = room_id

    def unmap_socket(self, socket_id: str):
        self._socket_to_room.pop(socket_id, None)

    def remove_room(self, room_id: str):
        self._rooms.pop(room_id, None)


class MessageHandler:
    """
    OOP WebSocket message handler.
    Encapsulates all event handling logic with clean separation of concerns.
    """

    def __init__(self, sio: socketio.AsyncServer):
        self.sio = sio
        self.registry = RoomRegistry()
        self._register_events()

    def _register_events(self):
        self.sio.on("join_room", self.handle_join_room)
        self.sio.on("leave_room", self.handle_leave_room)
        self.sio.on("play", self.handle_play)
        self.sio.on("pause", self.handle_pause)
        self.sio.on("seek", self.handle_seek)
        self.sio.on("change_video", self.handle_change_video)
        self.sio.on("assign_role", self.handle_assign_role)
        self.sio.on("remove_participant", self.handle_remove_participant)
        self.sio.on("transfer_host", self.handle_transfer_host)
        self.sio.on("request_sync", self.handle_request_sync)
        self.sio.on("disconnect", self.handle_disconnect)
        self.sio.on("chat_message", self.handle_chat_message)
        self.sio.on("add_to_queue", self.handle_add_to_queue)
        self.sio.on("video_ended", self.handle_video_ended)

    # ─── Room Lifecycle ───────────────────────────────────────────────────────

    async def handle_join_room(self, sid: str, data: dict):
        room_id = data.get("roomId")
        username = data.get("username", "Anonymous")

        if not room_id:
            await self._emit_error(sid, "roomId is required")
            return

        db = SessionLocal()
        try:
            room_model = db.query(RoomModel).filter(
                RoomModel.id == room_id,
                RoomModel.is_active == True
            ).first()

            if not room_model:
                await self._emit_error(sid, "Room not found or no longer active")
                return

            # Get or create in-memory room
            room = self.registry.get_room_by_id(room_id)
            is_first_join = room is None

            if is_first_join:
                # Restore from DB — first joiner becomes host
                room = Room(
                    room_id=room_model.id,
                    room_code=room_model.code,
                    name=room_model.name,
                    host_socket_id=sid,
                    host_username=username,
                )
                # Restore video state
                room.video_state.video_id = room_model.current_video_id or ""
                room.video_state.current_time = room_model.current_time or 0.0
                room.video_state.is_playing = False  # Always start paused on restore
                self.registry.register(room)
                already_joined = False
            else:
                already_joined = room.get_participant(sid) is not None
                room.add_participant(sid, username)

            self.registry.map_socket(sid, room_id)
            await self.sio.enter_room(sid, room_id)

            participant = room.get_participant(sid)

            # Persist participant to DB
            db_participant = RoomParticipant(
                room_id=room_id,
                socket_id=sid,
                username=username,
                role=participant.role.value,
                is_active=True
            )
            db.merge(db_participant)
            db.commit()

            # Notify the joining user
            await self.sio.emit("room_joined", {
                "room": room.to_dict(),
                "you": participant.to_dict(),
            }, to=sid)

            # Notify everyone else
            if not already_joined:
                await self.sio.emit("user_joined", {
                    "username": username,
                    "userId": sid,
                    "role": participant.role.value,
                    "participants": room.get_participants_dict(),
                }, room=room_id, skip_sid=sid)

            logger.info(f"[{room.name}] {username} ({participant.role.value}) joined — {room.participant_count()} total")

        except Exception as e:
            logger.exception(f"Error in handle_join_room: {e}")
            await self._emit_error(sid, str(e))
        finally:
            db.close()

    async def handle_leave_room(self, sid: str, data: dict = None):
        await self._handle_disconnect_for_socket(sid)

    async def handle_disconnect(self, sid: str):
        await self._handle_disconnect_for_socket(sid)

    async def _handle_disconnect_for_socket(self, sid: str):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        participant = room.get_participant(sid)
        if not participant:
            return

        username = participant.username
        was_host = participant.role == Role.HOST

        room.remove_participant(sid)
        self.registry.unmap_socket(sid)
        await self.sio.leave_room(sid, room.room_id)

        db = SessionLocal()
        try:
            db.query(RoomParticipant).filter(
                RoomParticipant.socket_id == sid,
                RoomParticipant.room_id == room.room_id
            ).delete()
            db.commit()
        finally:
            db.close()

        if room.is_empty():
            self._persist_room_state(room)
            self.registry.remove_room(room.room_id)
            logger.info(f"[{room.name}] Empty, removed from memory")
            return

        new_host = None
        if was_host:
            new_host = room.handle_host_leave()
            if new_host:
                logger.info(f"[{room.name}] Host transferred to {new_host.username}")

        await self.sio.emit("user_left", {
            "username": username,
            "userId": sid,
            "participants": room.get_participants_dict(),
            "newHost": new_host.to_dict() if new_host else None,
        }, room=room.room_id)

    # ─── Playback Events ──────────────────────────────────────────────────────

    async def handle_play(self, sid: str, data: dict):
        await self._handle_playback_event(sid, "play", data)

    async def handle_pause(self, sid: str, data: dict):
        await self._handle_playback_event(sid, "pause", data)

    async def handle_seek(self, sid: str, data: dict):
        await self._handle_playback_event(sid, "seek", data)

    async def handle_change_video(self, sid: str, data: dict):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        try:
            video_id = data.get("videoId", "")
            if not video_id:
                await self._emit_error(sid, "videoId is required")
                return

            state = room.change_video(sid, video_id)
            self._persist_room_state(room)

            await self.sio.emit("sync_state", state.to_dict(), room=room.room_id)
            logger.info(f"[{room.name}] Video changed to {video_id}")

        except PermissionError as e:
            await self._emit_error(sid, str(e))

    async def _handle_playback_event(self, sid: str, event: str, data: dict):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        try:
            current_time = data.get("currentTime", 0.0)

            if event == "play":
                state = room.play(sid, current_time)
            elif event == "pause":
                state = room.pause(sid, current_time)
            elif event == "seek":
                state = room.seek(sid, current_time)
            else:
                return

            self._persist_room_state(room)
            await self.sio.emit("sync_state", state.to_dict(), room=room.room_id)

        except PermissionError as e:
            await self._emit_error(sid, str(e))

    # ─── Role Management Events ───────────────────────────────────────────────

    async def handle_assign_role(self, sid: str, data: dict):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        try:
            target_id = data.get("userId")
            role_str = data.get("role", "").lower()

            try:
                role = Role(role_str)
            except ValueError:
                await self._emit_error(sid, f"Invalid role: {role_str}")
                return

            target = room.assign_role(sid, target_id, role)

            await self.sio.emit("role_assigned", {
                "userId": target_id,
                "username": target.username,
                "role": target.role.value,
                "participants": room.get_participants_dict(),
            }, room=room.room_id)

        except (PermissionError, NotFoundError) as e:
            await self._emit_error(sid, str(e))

    async def handle_remove_participant(self, sid: str, data: dict):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        try:
            target_id = data.get("userId")
            target = room.kick_participant(sid, target_id)

            # Force disconnect the kicked user
            await self.sio.emit("kicked", {"reason": "You were removed by the host."}, to=target_id)
            await self.sio.disconnect(target_id)

            self.registry.unmap_socket(target_id)

            await self.sio.emit("participant_removed", {
                "userId": target_id,
                "username": target.username,
                "participants": room.get_participants_dict(),
            }, room=room.room_id)

        except (PermissionError, NotFoundError) as e:
            await self._emit_error(sid, str(e))

    async def handle_transfer_host(self, sid: str, data: dict):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        try:
            new_host_id = data.get("userId")
            old_host, new_host = room.transfer_host(sid, new_host_id)

            await self.sio.emit("host_transferred", {
                "oldHostId": sid,
                "oldHostUsername": old_host.username,
                "newHostId": new_host_id,
                "newHostUsername": new_host.username,
                "participants": room.get_participants_dict(),
            }, room=room.room_id)

        except (PermissionError, NotFoundError) as e:
            await self._emit_error(sid, str(e))

    # ─── Sync & Chat ─────────────────────────────────────────────────────────

    async def handle_request_sync(self, sid: str, data: dict = None):
        """Send current video state to a single client (e.g., on late join)."""
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        await self.sio.emit("sync_state", room.video_state.to_dict(), to=sid)

    async def handle_chat_message(self, sid: str, data: dict):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        participant = room.get_participant(sid)
        if not participant:
            return

        message = data.get("message", "").strip()
        if not message or len(message) > 500:
            return

        await self.sio.emit("chat_message", {
            "userId": sid,
            "username": participant.username,
            "role": participant.role.value,
            "message": message,
            "timestamp": __import__("time").time(),
        }, room=room.room_id)

    async def handle_add_to_queue(self, sid: str, data: dict):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        try:
            video_id = (data or {}).get("videoId", "")
            if not video_id:
                await self._emit_error(sid, "videoId is required")
                return

            queue = room.add_to_queue(sid, video_id)
            await self.sio.emit("queue_updated", {"queue": queue}, room=room.room_id)
        except PermissionError as e:
            await self._emit_error(sid, str(e))

    async def handle_video_ended(self, sid: str, data: dict = None):
        room = self.registry.get_room_by_socket(sid)
        if not room:
            return

        try:
            next_state = room.play_next_from_queue(sid)
            await self.sio.emit("queue_updated", {"queue": room.queue}, room=room.room_id)

            if next_state is not None:
                self._persist_room_state(room)
                await self.sio.emit("sync_state", next_state.to_dict(), room=room.room_id)
        except PermissionError as e:
            await self._emit_error(sid, str(e))

    # ─── Helpers ─────────────────────────────────────────────────────────────

    async def _emit_error(self, sid: str, message: str):
        await self.sio.emit("error", {"message": message}, to=sid)

    def _persist_room_state(self, room: Room):
        """Persist current video state to DB."""
        db = SessionLocal()
        try:
            db.query(RoomModel).filter(RoomModel.id == room.room_id).update({
                "current_video_id": room.video_state.video_id,
                "current_time": room.video_state.current_time,
                "is_playing": room.video_state.is_playing,
            })
            db.commit()
        except Exception as e:
            logger.error(f"Failed to persist room state: {e}")
            db.rollback()
        finally:
            db.close()
