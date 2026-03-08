import asyncio

import httpx
import socketio

BASE_URL = "http://127.0.0.1:8000"


async def create_room() -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{BASE_URL}/api/rooms/",
            json={"name": "Duplicate Join Regression", "username": "seed"},
        )
        response.raise_for_status()
        payload = response.json()
        return payload["id"]


async def main():
    room_id = await create_room()

    sio = socketio.AsyncClient(reconnection=False, logger=False, engineio_logger=False)
    room_joined_events = []

    @sio.on("room_joined")
    async def on_room_joined(data):
        room_joined_events.append(data)

    await sio.connect(BASE_URL, transports=["websocket", "polling"])

    # First join: should be host
    await sio.emit("join_room", {"roomId": room_id, "username": "FirstUser"})
    await asyncio.sleep(0.3)

    # Duplicate join from same socket: should still be host
    await sio.emit("join_room", {"roomId": room_id, "username": "FirstUser"})
    await asyncio.sleep(0.3)

    await sio.disconnect()

    if len(room_joined_events) < 2:
        print("[FAIL] Expected 2 room_joined events, got", len(room_joined_events))
        raise SystemExit(1)

    first_role = room_joined_events[0].get("you", {}).get("role")
    second_role = room_joined_events[1].get("you", {}).get("role")

    print("First join role:", first_role)
    print("Second join role:", second_role)

    if first_role == "host" and second_role == "host":
        print("[PASS] Duplicate join preserves host role")
        return

    print("[FAIL] Host role was downgraded on duplicate join")
    raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
