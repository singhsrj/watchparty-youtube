from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from core.database import get_db
from models.room import Room as RoomModel, generate_uuid, generate_room_code

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


class CreateRoomRequest(BaseModel):
    name: str
    username: str


class RoomResponse(BaseModel):
    id: str
    code: str
    name: str
    currentVideoId: Optional[str] = None
    participantCount: int = 0

    model_config = {"from_attributes": True}


@router.post("/", response_model=dict)
def create_room(request: CreateRoomRequest, db: Session = Depends(get_db)):
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Room name cannot be empty")

    room = RoomModel(
        id=generate_uuid(),
        code=generate_room_code(),
        name=request.name.strip(),
        is_active=True,
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    return {
        "id": room.id,
        "code": room.code,
        "name": room.name,
        "createdAt": room.created_at.isoformat() if room.created_at else None,
    }


@router.get("/{room_id}", response_model=dict)
def get_room(room_id: str, db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter(
        RoomModel.id == room_id,
        RoomModel.is_active == True
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    active_participants = [p for p in room.participants if p.is_active]

    return {
        "id": room.id,
        "code": room.code,
        "name": room.name,
        "currentVideoId": room.current_video_id,
        "currentTime": room.current_time,
        "isPlaying": room.is_playing,
        "participantCount": len(active_participants),
        "createdAt": room.created_at.isoformat() if room.created_at else None,
    }


@router.get("/code/{code}", response_model=dict)
def get_room_by_code(code: str, db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter(
        RoomModel.code == code.upper(),
        RoomModel.is_active == True
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    return {
        "id": room.id,
        "code": room.code,
        "name": room.name,
        "currentVideoId": room.current_video_id,
        "participantCount": len([p for p in room.participants if p.is_active]),
    }


@router.delete("/{room_id}")
def close_room(room_id: str, db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter(RoomModel.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    room.is_active = False
    db.commit()
    return {"message": "Room closed"}
