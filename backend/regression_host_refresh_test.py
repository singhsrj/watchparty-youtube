"""Regression: a host (or moderator) who refreshes must keep their role.

A refresh = old socket disconnects, a new socket joins with the same clientId.
Run the backend first (python main.py), then: python regression_host_refresh_test.py
"""
import asyncio

import httpx
import socketio

BASE_URL = "http://127.0.0.1:8000"
failures = []


def check(name, ok, details=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{': ' + str(details) if details else ''}")
    if not ok:
        failures.append(name)


async def create_room():
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.post(f"{BASE_URL}/api/rooms/", json={"name": "Refresh", "username": "seed"})
        r.raise_for_status()
        return r.json()["id"]


async def connect(username, room_id, client_id):
    sio = socketio.AsyncClient(reconnection=False)
    state = {"you": None, "participants": []}

    @sio.on("room_joined")
    async def _joined(data):
        state["you"] = data["you"]
        state["participants"] = data["room"]["participants"]

    @sio.on("user_joined")
    async def _uj(data):
        state["participants"] = data["participants"]

    @sio.on("user_left")
    async def _ul(data):
        state["participants"] = data["participants"]

    await sio.connect(BASE_URL, transports=["websocket"])
    await sio.emit("join_room", {"roomId": room_id, "username": username, "clientId": client_id})
    for _ in range(40):
        if state["you"]:
            break
        await asyncio.sleep(0.05)
    return sio, state


def roles(state):
    return {p["username"]: p["role"] for p in state["participants"]}


async def main():
    # 1) Solo host refreshes: old socket disconnects first, then new one joins.
    room = await create_room()
    sio, st = await connect("Host", room, "host-1")
    check("1. first joiner is host", st["you"]["role"] == "host")
    await sio.disconnect()
    await asyncio.sleep(0.3)
    sio, st = await connect("Host", room, "host-1")
    check("1. solo host keeps host after refresh", st["you"]["role"] == "host", st["you"]["role"])
    await sio.disconnect()

    # 2) Host refreshes while others are present (old disconnects first).
    room = await create_room()
    host, hst = await connect("Host", room, "host-2")
    guest, gst = await connect("Guest", room, "guest-2")
    check("2. guest is participant", gst["you"]["role"] == "participant")
    await host.disconnect()
    await asyncio.sleep(0.5)
    host, hst = await connect("Host", room, "host-2")
    check("2. host keeps host with guest present", hst["you"]["role"] == "host", hst["you"]["role"])
    await asyncio.sleep(0.3)
    check("2. guest still participant", roles(gst).get("Guest") == "participant", roles(gst))
    check("2. no duplicate host entry", [p["username"] for p in hst["participants"]].count("Host") == 1)
    check("2. only one host in list", list(roles(hst).values()).count("host") == 1, roles(hst))

    # 3) New socket joins BEFORE the old one disconnects (race).
    host2, hst2 = await connect("Host", room, "host-2")
    check("3. rejoin before old disconnect keeps host", hst2["you"]["role"] == "host", hst2["you"]["role"])
    await host.disconnect()  # the stale socket finally goes away
    await asyncio.sleep(0.5)
    await host2.emit("play", {"currentTime": 1.0})
    await asyncio.sleep(0.3)
    check("3. new socket is still the single host", list(roles(gst).values()).count("host") == 1, roles(gst))

    # 4) Moderator keeps role across refresh.
    mod_id = next(p["socketId"] for p in hst2["participants"] if p["username"] == "Guest")
    await host2.emit("assign_role", {"userId": mod_id, "role": "moderator"})
    await asyncio.sleep(0.3)
    await guest.disconnect()
    await asyncio.sleep(0.3)
    guest, gst = await connect("Guest", room, "guest-2")
    check("4. moderator keeps role after refresh", gst["you"]["role"] == "moderator", gst["you"]["role"])

    # 5) Deliberate transfer: old host must NOT reclaim on refresh.
    new_host_sid = gst["you"]["socketId"]
    await host2.emit("transfer_host", {"userId": new_host_sid})
    await asyncio.sleep(0.3)
    await host2.disconnect()
    await asyncio.sleep(0.3)
    host3, h3 = await connect("Host", room, "host-2")
    check("5. old host does not reclaim after transfer", h3["you"]["role"] == "participant", h3["you"]["role"])

    # 6) Duplicate join from same socket still fine (existing behaviour).
    room = await create_room()
    s, st = await connect("Solo", room, "solo-1")
    await s.emit("join_room", {"roomId": room, "username": "Solo", "clientId": "solo-1"})
    await asyncio.sleep(0.3)
    check("6. duplicate join keeps host", st["you"]["role"] == "host")

    for c in (guest, host3, s):
        if c.connected:
            await c.disconnect()

    print("\nOverall:", "FAIL" if failures else "PASS")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    asyncio.run(main())
