from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Float, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from core.database import Base


def generate_uuid():
    return str(uuid.uuid4())


def generate_room_code():
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, default=generate_uuid)
    code = Column(String(8), unique=True, nullable=False, default=generate_room_code)
    name = Column(String(100), nullable=False)
    host_id = Column(String, nullable=True)  # socket id of current host
    current_video_id = Column(String, nullable=True)
    current_time = Column(Float, default=0.0)
    is_playing = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    participants = relationship("RoomParticipant", back_populates="room", cascade="all, delete-orphan")


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    id = Column(String, primary_key=True, default=generate_uuid)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False)
    socket_id = Column(String, nullable=False)
    username = Column(String(50), nullable=False)
    role = Column(String(20), nullable=False, default="participant")  # host, moderator, participant
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)

    room = relationship("Room", back_populates="participants")
