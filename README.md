# 🎬 WatchParty

> Watch YouTube videos together in perfect real-time sync.

## Final Update (Production)

The app is now fully working in production.

- Frontend (Netlify): `https://watchpartyt.netlify.app/`
- Backend (Render): `https://watchparty-youtube.onrender.com/`

**Live App:** `https://watchpartyt.netlify.app/`

---

## Features

- 🔴 **Real-time sync** — Play, pause, seek, and change video synced across all participants via WebSockets
- 🎭 **Role-based access control** — Host, Moderator, and Participant roles with enforced permissions
- 👑 **Host management** — Assign roles, remove participants, transfer host
- 💬 **Group chat** — Real-time chat with role badges
- 💾 **Persistent rooms** — Room state (video, position) saved in PostgreSQL
- 🔗 **Room codes** — Share 8-character codes or direct links

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Python + FastAPI |
| WebSockets | python-socketio (Socket.IO) |
| Database | PostgreSQL (Render) / SQLite (local dev) |
| Video | YouTube IFrame API |
| Deploy | Render (backend) + Netlify (frontend) |

---

## Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────────────────┐
│   React Frontend    │         │      FastAPI + Socket.IO         │
│                     │         │                                  │
│  SocketContext  ────┼─────────┼──► MessageHandler               │
│  (socket.io-client) │  WS     │      ├── RoomRegistry           │
│                     │         │      ├── Room (OOP)              │
│  VideoPlayer ───────┼─────────┼──►   │    ├── Participant       │
│  (YT IFrame API)    │  HTTP   │      │    ├── VideoState         │
│                     │         │      │    └── Role permissions   │
│  ParticipantsPanel  │         │      └── DB persist (SQLAlchemy) │
│  ChatPanel          │         │                                  │
└─────────────────────┘         └──────────────┬───────────────────┘
                                               │
                                        ┌──────▼──────┐
                                        │  PostgreSQL  │
                                        │  (rooms,     │
                                        │  participants│
                                        └─────────────┘
```

### WebSocket Flow

1. Client connects → `join_room` → server creates/loads `Room` in memory, assigns role
2. Host/Mod presses play → `play` event → `MessageHandler` validates permission via `Room`
3. `Room.play()` updates `VideoState` → server emits `sync_state` to all room members
4. Each client's `SocketContext` receives `sync_state` → `VideoPlayer` calls `syncPlay(time)`
5. YouTube IFrame API syncs all players to the exact same position

### OOP WebSocket Server Design

```
MessageHandler          — registers all Socket.IO events, orchestrates logic
  └── RoomRegistry      — in-memory store of active rooms (socket_id → room_id map)
       └── Room          — full room state, participant management, permission checks
            ├── Participant — role, username, socketId, permissions
            ├── VideoState  — currentTime, isPlaying, videoId, estimated playback
            └── Role (Enum) — HOST / MODERATOR / PARTICIPANT with permission methods
```

---

## Local Development

- Python 3.11.9
- Node.js 22.13.1
- PostgreSQL (or SQLite for dev — auto-used if no `DATABASE_URL` set)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — set FRONTEND_URL=http://localhost:5173 for local dev

python main.py
# Runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install

cp .env.example .env
# VITE_API_URL=http://localhost:8000
# VITE_WS_URL=http://localhost:8000

npm run dev
# Runs on http://localhost:5173
```

---

## Deployment

### Backend → Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect repo, set **Root Directory** to `backend`
4. **Build command:** `pip install -r requirements.txt`
5. **Start command:** `uvicorn main:socket_app --host 0.0.0.0 --port $PORT`
6. Add a **PostgreSQL** database from Render dashboard
7. Set env vars:
   - `DATABASE_URL` → from Render Postgres (Internal URL)
   - `FRONTEND_URL` → your Netlify URL
   - `SECRET_KEY` → any random string

### Frontend → Netlify

1. Go to [netlify.com](https://netlify.com) → New site → Import from GitHub
2. Set **Base directory** to `frontend`
3. **Build command:** `npm run build`
4. **Publish directory:** `dist`
5. Set env vars:
   - `VITE_API_URL` → your Render backend URL
   - `VITE_WS_URL` → your Render backend URL

---

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join_room` | Client→Server | Join a room; get assigned Host (if creator) or Participant |
| `leave_room` | Client→Server | Leave room; auto-promotes next host if needed |
| `play` | Client→Server | Host/Mod only; broadcasts `sync_state` |
| `pause` | Client→Server | Host/Mod only; broadcasts `sync_state` |
| `seek` | Client→Server | Host/Mod only; broadcasts `sync_state` |
| `change_video` | Client→Server | Host/Mod only; loads new YouTube video for all |
| `assign_role` | Client→Server | Host only; promotes/demotes participant |
| `remove_participant` | Client→Server | Host only; kicks user |
| `transfer_host` | Client→Server | Host only; passes host to another user |
| `chat_message` | Client↔Server | Chat message broadcast |
| `sync_state` | Server→Clients | Broadcast video state to entire room |
| `user_joined` | Server→Clients | New participant joined with role info |
| `user_left` | Server→Clients | Participant left, may include new host |
| `role_assigned` | Server→Clients | Role update for a participant |
| `host_transferred` | Server→Clients | Host role changed |
| `kicked` | Server→Client | You were removed from the room |

---

## Role Permissions

| Action | Host | Moderator | Participant |
|--------|------|-----------|-------------|
| Play/Pause/Seek | ✅ | ✅ | ❌ |
| Change video | ✅ | ✅ | ❌ |
| Assign roles | ✅ | ❌ | ❌ |
| Remove participant | ✅ | ❌ | ❌ |
| Transfer host | ✅ | ❌ | ❌ |
| Chat | ✅ | ✅ | ✅ |

---

## Bonus Features Implemented

- ✅ **OOP WebSocket server** — `Room`, `Participant`, `VideoState`, `MessageHandler`, `RoomRegistry` classes
- ✅ **Transfer host** — Host can pass control to any participant
- ✅ **Persistent rooms** — Video state saved to PostgreSQL; rooms survive server restarts
- ✅ **Auto host promotion** — When host leaves, oldest moderator/participant auto-promotes
- ✅ **Text chat** — Real-time group chat with role badges

---

## Future Architecture Note

I also looked into adding a Redis + Nginx architecture for scaling and reliability.

- Redis can be used for shared pub/sub, room state caching, and Socket.IO coordination across multiple backend instances.
- Nginx can be used as a reverse proxy/load balancer in front of FastAPI/Socket.IO with correct WebSocket upgrade handling.

I will continue learning this setup and implement it in a future update.

---

## Top 3 Challenges Faced

1. Socket.IO connection stuck in production until transport handling was fixed.
The key issue was realtime handshake behavior across Netlify and Render. Allowing polling-first negotiation (instead of forcing websocket-first) resolved the connection flow.

2. Frontend production fallback accidentally pointed to localhost.
When deployment environment variables were missing or inconsistent, API and socket clients fell back to `http://localhost:8000`, which broke hosted usage.

3. Cross-origin consistency between HTTP and realtime layers.
HTTP endpoints worked, but websocket reliability required explicit and consistent origin configuration for FastAPI CORS and Socket.IO CORS across local and production domains.
