from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./watchparty.db"
    FRONTEND_URL: str = "http://localhost:5173"
    SECRET_KEY: str = "dev-secret-key"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
