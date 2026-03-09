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

# Attach MessageHandler (registers all socket events)
message_handler = MessageHandler(sio)

# ─── ASGI App (FastAPI + Socket.IO) ──────────────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@app.on_event("startup")
def startup():
    create_tables()
    print("✅ WatchParty backend started")
    print(f"   Allowed Origins: {ALLOWED_ORIGINS}")
    print(f"   Database: {settings.DATABASE_URL[:30]}...")


if __name__ == "__main__":
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
