import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx
import socketio

BASE_URL = "http://127.0.0.1:8000"
VIDEO_ID = "5cdFIkJhjVc"


@dataclass
class ClientState:
    name: str
    room_joined: Optional[Dict[str, Any]] = None
    you: Optional[Dict[str, Any]] = None
    sync_events: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def make_client(state: ClientState):
    client = socketio.AsyncClient(reconnection=False, logger=False, engineio_logger=False)

    @client.event
    async def connect():
        pass

    @client.event
    async def disconnect():
        pass

    @client.on("room_joined")
    async def on_room_joined(data):
        state.room_joined = data.get("room")
        state.you = data.get("you")

    @client.on("sync_state")
    async def on_sync_state(data):
        state.sync_events.append(data)

    @client.on("error")
    async def on_error(data):
        message = data.get("message") if isinstance(data, dict) else str(data)
        state.errors.append(message)

    return client


async def wait_for(predicate, timeout: float = 5.0, step: float = 0.05):
    elapsed = 0.0
    while elapsed < timeout:
        if predicate():
            return True
        await asyncio.sleep(step)
        elapsed += step
    return False


async def create_room() -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{BASE_URL}/api/rooms/",
            json={"name": "Backend Integration Room", "username": "seed"},
        )
        resp.raise_for_status()
        return resp.json()


def print_result(name: str, ok: bool, details: str = ""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}{': ' + details if details else ''}")


async def run_test():
    room = await create_room()
    room_id = room["id"]
    print(f"Created room id={room_id}, code={room['code']}")

    host_state = ClientState(name="host")
    participant_state = ClientState(name="participant")

    host = make_client(host_state)
    participant = make_client(participant_state)

    try:
        await host.connect(BASE_URL, transports=["websocket", "polling"])
        await host.emit("join_room", {"roomId": room_id, "username": "HostUser"})

        host_joined = await wait_for(lambda: host_state.you is not None)
        print_result("Host joined room", host_joined)
        if not host_joined:
            raise RuntimeError("Host failed to join room")

        host_is_host = host_state.you.get("role") == "host"
        print_result("Host role is host", host_is_host, json.dumps(host_state.you))

        await participant.connect(BASE_URL, transports=["websocket", "polling"])
        await participant.emit("join_room", {"roomId": room_id, "username": "ParticipantUser"})

        participant_joined = await wait_for(lambda: participant_state.you is not None)
        print_result("Participant joined room", participant_joined)
        if not participant_joined:
            raise RuntimeError("Participant failed to join room")

        participant_role_ok = participant_state.you.get("role") == "participant"
        print_result("Participant role is participant", participant_role_ok, json.dumps(participant_state.you))

        # Participant should not be able to control playback
        pre_error_count = len(participant_state.errors)
        await participant.emit("play", {"currentTime": 8.0})
        participant_play_blocked = await wait_for(lambda: len(participant_state.errors) > pre_error_count)
        print_result(
            "Participant play blocked",
            participant_play_blocked,
            participant_state.errors[-1] if participant_play_blocked else "No permission error emitted",
        )

        # Host sets video
        pre_sync_host = len(host_state.sync_events)
        pre_sync_participant = len(participant_state.sync_events)
        await host.emit("change_video", {"videoId": VIDEO_ID})
        got_sync_video = await wait_for(
            lambda: len(host_state.sync_events) > pre_sync_host and len(participant_state.sync_events) > pre_sync_participant
        )
        latest_video_state = host_state.sync_events[-1] if host_state.sync_events else {}
        video_set_ok = got_sync_video and latest_video_state.get("videoId") == VIDEO_ID and latest_video_state.get("isPlaying") is False
        print_result("Host change_video broadcast", video_set_ok, json.dumps(latest_video_state))

        # Host play
        pre_sync_host = len(host_state.sync_events)
        await host.emit("play", {"currentTime": 12.5})
        got_play_sync = await wait_for(lambda: len(host_state.sync_events) > pre_sync_host)
        latest_play_state = host_state.sync_events[-1] if host_state.sync_events else {}
        play_ok = got_play_sync and latest_play_state.get("isPlaying") is True
        print_result("Host play works", play_ok, json.dumps(latest_play_state))

        # Host seek
        pre_sync_host = len(host_state.sync_events)
        await host.emit("seek", {"currentTime": 33.0})
        got_seek_sync = await wait_for(lambda: len(host_state.sync_events) > pre_sync_host)
        latest_seek_state = host_state.sync_events[-1] if host_state.sync_events else {}
        seek_ok = got_seek_sync and abs(float(latest_seek_state.get("currentTime", 0.0)) - 33.0) < 0.01
        print_result("Host seek works", seek_ok, json.dumps(latest_seek_state))

        # Host pause
        pre_sync_host = len(host_state.sync_events)
        await host.emit("pause", {"currentTime": 35.0})
        got_pause_sync = await wait_for(lambda: len(host_state.sync_events) > pre_sync_host)
        latest_pause_state = host_state.sync_events[-1] if host_state.sync_events else {}
        pause_ok = got_pause_sync and latest_pause_state.get("isPlaying") is False
        print_result("Host pause works", pause_ok, json.dumps(latest_pause_state))

        # Participant should not be able to seek/pause either
        pre_error_count = len(participant_state.errors)
        await participant.emit("seek", {"currentTime": 99.0})
        seek_blocked = await wait_for(lambda: len(participant_state.errors) > pre_error_count)
        print_result(
            "Participant seek blocked",
            seek_blocked,
            participant_state.errors[-1] if seek_blocked else "No permission error emitted",
        )

        pre_error_count = len(participant_state.errors)
        await participant.emit("pause", {"currentTime": 40.0})
        pause_blocked = await wait_for(lambda: len(participant_state.errors) > pre_error_count)
        print_result(
            "Participant pause blocked",
            pause_blocked,
            participant_state.errors[-1] if pause_blocked else "No permission error emitted",
        )

        all_checks = [
            host_is_host,
            participant_role_ok,
            participant_play_blocked,
            video_set_ok,
            play_ok,
            seek_ok,
            pause_ok,
            seek_blocked,
            pause_blocked,
        ]
        print("\nOverall:", "PASS" if all(all_checks) else "FAIL")

    finally:
        if participant.connected:
            await participant.disconnect()
        if host.connected:
            await host.disconnect()


if __name__ == "__main__":
    asyncio.run(run_test())
