from typing import Any, Optional

import httpx

from app.config import get_settings


class MediaClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _headers(self) -> dict[str, str]:
        return {"X-Internal-Token": self.settings.media_internal_token}

    async def start_stream(self, camera_id: int, rtsp_url: str, buffer_seconds: int = 30) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{self.settings.media_internal_url}/internal/streams/start",
                headers=self._headers(),
                json={
                    "camera_id": camera_id,
                    "rtsp_url": rtsp_url,
                    "buffer_seconds": buffer_seconds,
                },
            )
            r.raise_for_status()
            return r.json()

    async def stop_stream(self, camera_id: int) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{self.settings.media_internal_url}/internal/streams/stop",
                headers=self._headers(),
                json={"camera_id": camera_id},
            )
            r.raise_for_status()
            return r.json()

    async def create_clip(
        self,
        camera_id: int,
        clip_id: int,
        duration_sec: int,
        venue_id: int,
        top_image: Optional[str] = None,
        bottom_images: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "camera_id": camera_id,
            "clip_id": clip_id,
            "duration_sec": duration_sec,
            "venue_id": venue_id,
            "top_image": top_image,
            "bottom_images": bottom_images or [],
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{self.settings.media_internal_url}/internal/clip",
                headers=self._headers(),
                json=payload,
            )
            r.raise_for_status()
            return r.json()

    async def stream_status(self, camera_id: int) -> Optional[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{self.settings.media_internal_url}/internal/streams/{camera_id}",
                headers=self._headers(),
            )
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()


media_client = MediaClient()
