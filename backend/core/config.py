from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Direct (non-pooled) connection. Used for schema creation and migrations,
    # and as the runtime connection if DATABASE_URL_POOLED is not set.
    DATABASE_URL: str = "sqlite:///./watchparty.db"
    # Neon pooled (PgBouncer) connection. Preferred for the running app.
    DATABASE_URL_POOLED: Optional[str] = None
    FRONTEND_URL: str = "https://watchpartyt.netlify.app"
    SECRET_KEY: str = "dev-secret-key"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
