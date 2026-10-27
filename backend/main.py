import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import create_tables
from routers import rooms
from websocket.message_handler import MessageHandler

ALLOWED_ORIGINS = [
    "https://watchpartyt.netlify.app",
    "http://localhost:5173",
    "http://localhost:3000",
]

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(title="WatchParty API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "watchparty-api"}


# ─── Socket.IO Server ─────────────────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
)


@sio.event
async def connect(sid, environ):
    print(f"Socket connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"Socket disconnected: {sid}")

# Attach MessageHandler (registers all socket events)
message_handler = MessageHandler(sio)

# ─── ASGI App (FastAPI + Socket.IO) ──────────────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@app.on_event("startup")
def startup():
    create_tables()
    print("✅ WatchParty backend started")
    print(f"   Allowed Origins: {ALLOWED_ORIGINS}")
    db_url = settings.DATABASE_URL_POOLED or settings.DATABASE_URL
    # Log only scheme + host, never credentials.
    db_target = db_url.split("@")[-1].split("/")[0] if "@" in db_url else db_url.split(":")[0]
    print(f"   Database: {db_url.split(':')[0]} @ {db_target}"
          f"{' (pooled)' if settings.DATABASE_URL_POOLED else ''}")


if __name__ == "__main__":
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
