from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    buffers_path: str = "/data/buffers"
    videos_path: str = "/data/videos"
    ads_path: str = "/data/ads"
    media_internal_token: str = "media-internal-secret"
    api_internal_url: str = "http://api:8000"
    segment_time: float = 1.0
    # Short playlist for low-latency live preview (~2–4s)
    hls_list_size: int = 3
    # auto: copy H.264 cameras as-is, transcode anything else | copy | transcode
    stream_mode: str = "auto"
    # auto: NVIDIA NVENC when available, else CPU | nvenc | cpu
    clip_encoder: str = "auto"
    # Simultaneous clip renders; 0 = auto (3 with NVENC, 2 on CPU)
    clip_render_workers: int = 0


@lru_cache
def get_settings() -> Settings:
    return Settings()
