from typing import Dict, Optional, List
from websocket.participant import Participant, Role
from websocket.video_state import VideoState
import time


class RoomError(Exception):
    pass


class PermissionError(RoomError):
    pass


class NotFoundError(RoomError):
    pass


class Room:
    """
    OOP representation of a watch party room.
    Manages participants, video state, roles, and broadcasts.
    """

    def __init__(self, room_id: str, room_code: str, name: str, host_socket_id: str, host_username: str):
        self.room_id = room_id
        self.room_code = room_code
        self.name = name
        self.created_at = time.time()

        self._participants: Dict[str, Participant] = {}
        self.video_state = VideoState()
        self.queue: List[str] = []

        # Add the host
        host = Participant(socket_id=host_socket_id, username=host_username, role=Role.HOST)
        self._participants[host_socket_id] = host
        self.host_socket_id = host_socket_id

    # ─── Participant Management ────────────────────────────────────────────────

    def add_participant(self, socket_id: str, username: str) -> Participant:
        existing = self._participants.get(socket_id)
        if existing:
            # Duplicate join from same socket should not downgrade role.
            if username and existing.username != username:
                existing.username = username
            return existing

        participant = Participant(socket_id=socket_id, username=username, role=Role.PARTICIPANT)
        self._participants[socket_id] = participant
        return participant

    def remove_participant(self, socket_id: str) -> Optional[Participant]:
        return self._participants.pop(socket_id, None)

    def get_participant(self, socket_id: str) -> Optional[Participant]:
        return self._participants.get(socket_id)

    def get_all_participants(self) -> List[Participant]:
        return list(self._participants.values())

    def get_participants_dict(self) -> List[dict]:
        return [p.to_dict() for p in self._participants.values()]

    def participant_count(self) -> int:
        return len(self._participants)

    def is_empty(self) -> bool:
        return len(self._participants) == 0

    # ─── Role Management ──────────────────────────────────────────────────────

    def assign_role(self, requester_socket_id: str, target_socket_id: str, role: Role) -> Participant:
        """Assign a role to a participant. Only host can do this."""
        requester = self._get_participant_or_raise(requester_socket_id)
        target = self._get_participant_or_raise(target_socket_id)

        if not requester.role.can_assign_roles():
            raise PermissionError(f"{requester.username} does not have permission to assign roles.")

        if target.role == Role.HOST:
            raise PermissionError("Cannot change the host's role directly. Use transfer_host instead.")

        if role == Role.HOST:
            raise PermissionError("Cannot assign HOST role directly. Use transfer_host instead.")

        target.role = role
        return target

    def transfer_host(self, current_host_socket_id: str, new_host_socket_id: str) -> tuple[Participant, Participant]:
        """Transfer host role to another participant."""
        current_host = self._get_participant_or_raise(current_host_socket_id)
        new_host = self._get_participant_or_raise(new_host_socket_id)

        if not current_host.role.can_transfer_host():
            raise PermissionError("Only the host can transfer host role.")

        current_host.role = Role.PARTICIPANT
        new_host.role = Role.HOST
        self.host_socket_id = new_host_socket_id

        return current_host, new_host

    def handle_host_leave(self) -> Optional[Participant]:
        """
        When host leaves, promote oldest moderator or participant to host.
        Returns the new host, or None if room is empty.
        """
        # Try to find a moderator first
        moderators = [p for p in self._participants.values() if p.role == Role.MODERATOR]
        if moderators:
            new_host = min(moderators, key=lambda p: p.joined_at)
            new_host.role = Role.HOST
            self.host_socket_id = new_host.socket_id
            return new_host

        # Fall back to oldest participant
        participants = [p for p in self._participants.values() if p.role == Role.PARTICIPANT]
        if participants:
            new_host = min(participants, key=lambda p: p.joined_at)
            new_host.role = Role.HOST
            self.host_socket_id = new_host.socket_id
            return new_host

        return None

    def kick_participant(self, requester_socket_id: str, target_socket_id: str) -> Participant:
        """Host removes a participant from the room."""
        requester = self._get_participant_or_raise(requester_socket_id)

        if not requester.role.can_remove_participants():
            raise PermissionError(f"{requester.username} does not have permission to remove participants.")

        target = self._get_participant_or_raise(target_socket_id)

        if target.role == Role.HOST:
            raise PermissionError("Cannot remove the host.")

        self._participants.pop(target_socket_id)
        return target

    # ─── Playback Control ─────────────────────────────────────────────────────

    def play(self, requester_socket_id: str, current_time: float) -> VideoState:
        self._assert_playback_permission(requester_socket_id)
        self.video_state.update_time(current_time, is_playing=True)
        return self.video_state

    def pause(self, requester_socket_id: str, current_time: float) -> VideoState:
        self._assert_playback_permission(requester_socket_id)
        self.video_state.update_time(current_time, is_playing=False)
        return self.video_state

    def seek(self, requester_socket_id: str, time: float) -> VideoState:
        self._assert_playback_permission(requester_socket_id)
        # Product behavior: seeking should always resume playback.
        self.video_state.update_time(time, is_playing=True)
        return self.video_state

    def change_video(self, requester_socket_id: str, video_id: str) -> VideoState:
        self._assert_playback_permission(requester_socket_id)
        self.video_state.video_id = video_id
        self.video_state.current_time = 0.0
        # Product behavior: newly loaded video auto-plays.
        self.video_state.is_playing = True
        self.video_state.last_updated = time.time()
        return self.video_state

    def add_to_queue(self, requester_socket_id: str, video_id: str) -> List[str]:
        self._assert_playback_permission(requester_socket_id)
        if not video_id:
            return self.queue
        self.queue.append(video_id)
        return self.queue

    def play_next_from_queue(self, requester_socket_id: str) -> Optional[VideoState]:
        self._assert_playback_permission(requester_socket_id)
        if not self.queue:
            return None

        next_video_id = self.queue.pop(0)
        return self.change_video(requester_socket_id, next_video_id)

    # ─── Serialization ────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "roomId": self.room_id,
            "roomCode": self.room_code,
            "name": self.name,
            "participants": self.get_participants_dict(),
            "videoState": self.video_state.to_dict(),
            "queue": self.queue,
            "createdAt": self.created_at,
        }

    # ─── Private Helpers ──────────────────────────────────────────────────────

    def _get_participant_or_raise(self, socket_id: str) -> Participant:
        participant = self._participants.get(socket_id)
        if not participant:
            raise NotFoundError(f"Participant with socket_id {socket_id} not found in room.")
        return participant

    def _assert_playback_permission(self, socket_id: str):
        participant = self._get_participant_or_raise(socket_id)
        if not participant.role.can_control_playback():
            raise PermissionError(f"{participant.username} does not have playback control permission.")
