"""Copy WatchParty data from the old database into Neon.

What is copied:  `rooms` (id, code, name, current video/time, flags, timestamps).
What is not:     `room_participants` - rows are tied to live socket ids, so they are
                 meaningless after a restart and are rebuilt when people rejoin.
                 `rooms.host_id` is reset to NULL for the same reason (the next
                 person to join claims the room).

Usage (from the backend/ directory):

    # target = DATABASE_URL from .env (the DIRECT Neon URL, not the pooled one)
    python scripts/migrate_to_neon.py --source "postgresql://user:pass@old-host/db?sslmode=require"
    python scripts/migrate_to_neon.py --source sqlite:///./watchparty.db
    python scripts/migrate_to_neon.py --source "$OLD_URL" --dry-run

It is safe to run more than once: rooms are upserted by primary key.
"""
import argparse
import os
import sys

# Allow `python scripts/migrate_to_neon.py` from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, inspect
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.database import Base, make_engine, normalize_db_url
from models.room import Room  # noqa: F401  (also registers RoomParticipant on Base)

COPY_COLUMNS = [
    "id", "code", "name", "current_video_id", "current_time",
    "is_playing", "is_active", "created_at", "updated_at",
]


def mask(url: str) -> str:
    """Hide the password when printing a URL."""
    if "@" not in url or "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    creds, host = rest.rsplit("@", 1)
    user = creds.split(":", 1)[0]
    return f"{scheme}://{user}:***@{host}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate WatchParty rooms into Neon.")
    parser.add_argument("--source", default=os.getenv("SOURCE_DATABASE_URL"),
                        help="Old database URL (or set SOURCE_DATABASE_URL).")
    parser.add_argument("--target", default=settings.DATABASE_URL,
                        help="Neon DIRECT url (default: DATABASE_URL from .env).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Read the source and report, but write nothing.")
    args = parser.parse_args()

    if not args.source:
        print("error: pass --source or set SOURCE_DATABASE_URL", file=sys.stderr)
        return 2

    source_url, target_url = normalize_db_url(args.source), normalize_db_url(args.target)
    if source_url == target_url:
        print("error: source and target are the same database", file=sys.stderr)
        return 2
    if target_url.startswith("sqlite"):
        print("error: target is SQLite - set DATABASE_URL in .env to your Neon DIRECT url, "
              "or pass --target", file=sys.stderr)
        return 2

    print(f"source: {mask(source_url)}")
    print(f"target: {mask(target_url)}")

    src_engine = make_engine(source_url)
    dst_engine = make_engine(target_url)

    if not inspect(src_engine).has_table(Room.__tablename__):
        print("error: source has no 'rooms' table - nothing to migrate", file=sys.stderr)
        return 1

    src = sessionmaker(bind=src_engine)()
    dst = sessionmaker(bind=dst_engine)()
    try:
        rooms = src.query(Room).all()
        print(f"found {len(rooms)} room(s) in source")

        if args.dry_run:
            for r in rooms:
                print(f"  would copy {r.code}  {r.name!r}  active={r.is_active}")
            print("dry run - nothing written")
            return 0

        Base.metadata.create_all(bind=dst_engine)
        print("target schema ready")

        for r in rooms:
            values = {c: getattr(r, c) for c in COPY_COLUMNS}
            dst.merge(Room(**values, host_id=None))
        dst.commit()

        # Verify
        src_count = src.query(func.count(Room.id)).scalar()
        dst_count = dst.query(func.count(Room.id)).scalar()
        src_codes = {c for (c,) in src.query(Room.code).all()}
        dst_codes = {c for (c,) in dst.query(Room.code).all()}
        missing = src_codes - dst_codes
        print(f"rooms: source={src_count} target={dst_count}")
        if missing:
            print(f"error: {len(missing)} room code(s) missing in target: {sorted(missing)}", file=sys.stderr)
            return 1
        print("done - every source room exists in Neon")
        return 0
    except Exception as exc:
        dst.rollback()
        print(f"error: migration failed, nothing was committed: {exc}", file=sys.stderr)
        return 1
    finally:
        src.close()
        dst.close()
        src_engine.dispose()
        dst_engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
