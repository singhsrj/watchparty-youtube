from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import time


class Role(str, Enum):
    HOST = "host"
    MODERATOR = "moderator"
    PARTICIPANT = "participant"

    def can_control_playback(self) -> bool:
        return self in (Role.HOST, Role.MODERATOR)

    def can_assign_roles(self) -> bool:
        return self == Role.HOST

    def can_remove_participants(self) -> bool:
        return self == Role.HOST

    def can_transfer_host(self) -> bool:
        return self == Role.HOST


@dataclass
class Participant:
    socket_id: str
    username: str
    role: Role = Role.PARTICIPANT
    joined_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "socketId": self.socket_id,
            "username": self.username,
            "role": self.role.value,
            "joinedAt": self.joined_at,
        }

    def promote_to_moderator(self):
        if self.role == Role.PARTICIPANT:
            self.role = Role.MODERATOR

    def demote_to_participant(self):
        if self.role == Role.MODERATOR:
            self.role = Role.PARTICIPANT

    def promote_to_host(self):
        self.role = Role.HOST

    def demote_from_host(self):
        self.role = Role.PARTICIPANT
