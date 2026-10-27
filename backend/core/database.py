from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from core.config import settings


def normalize_db_url(url: str) -> str:
    """Make a provider-supplied URL usable by SQLAlchemy + psycopg2."""
    url = url.strip()
    # Some providers (Heroku/Render) still hand out the legacy scheme.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Neon only accepts TLS connections.
    if url.startswith("postgresql") and "neon.tech" in url and "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def make_engine(url: str, pooled: bool = False) -> Engine:
    url = normalize_db_url(url)
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})

    # Neon suspends idle compute and the pooler drops idle connections, so
    # test connections before use and recycle them regularly.
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=240,
        # PgBouncer already multiplexes, so keep the app-side pool small.
        pool_size=5 if pooled else 10,
        max_overflow=5,
    )


# Runtime engine: pooled Neon endpoint if configured, otherwise DATABASE_URL.
_runtime_url = settings.DATABASE_URL_POOLED or settings.DATABASE_URL
engine = make_engine(_runtime_url, pooled=bool(settings.DATABASE_URL_POOLED))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    # DDL goes over the direct connection (poolers can be awkward for schema changes).
    ddl_engine = make_engine(settings.DATABASE_URL) if settings.DATABASE_URL_POOLED else engine
    try:
        Base.metadata.create_all(bind=ddl_engine)
    finally:
        if ddl_engine is not engine:
            ddl_engine.dispose()
