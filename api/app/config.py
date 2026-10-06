from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://olho:olho_secret@localhost:5432/olho_nolance"
    jwt_secret: str = "change-me"
    jwt_expire_hours: int = 72
    superadmin_user: str = "superadmin"
    superadmin_password: str = "ancora"
    media_internal_url: str = "http://localhost:8001"
    media_internal_token: str = "media-internal-secret"
    videos_path: str = "/data/videos"
    ads_path: str = "/data/ads"
    cors_origins: str = "*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
