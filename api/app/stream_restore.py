import asyncio
import logging

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.media_client import media_client
from app.models import Camera

logger = logging.getLogger(__name__)


async def restore_active_streams() -> None:
    """Re-attach FFmpeg workers for cameras marked active/streaming after restarts."""
    db: Session = SessionLocal()
    try:
        cameras = (
            db.query(Camera)
            .filter(Camera.active.is_(True))
            .filter(Camera.status.in_(("streaming", "error", "idle")))
            .all()
        )
        # Prefer ones that should be live
        targets = [c for c in cameras if c.status == "streaming" or c.active]
        # Only auto-restore previously streaming or all active? Use active=True always for field use.
        targets = [c for c in cameras if c.active]
        for cam in targets:
            try:
                status = await media_client.stream_status(cam.id)
                if status and status.get("status") == "streaming":
                    if cam.status != "streaming":
                        cam.status = "streaming"
                        db.commit()
                    continue
                await media_client.start_stream(cam.id, cam.rtsp_url, cam.buffer_seconds or 30)
                cam.status = "streaming"
                db.commit()
                logger.info("Restored stream camera_id=%s", cam.id)
            except Exception as exc:
                cam.status = "error"
                db.commit()
                logger.warning("Failed to restore camera_id=%s: %s", cam.id, exc)
    finally:
        db.close()


async def stream_watchdog_loop(stop: asyncio.Event) -> None:
    """Every 20s, ensure active cameras still have a live media worker."""
    await asyncio.sleep(5)
    while not stop.is_set():
        try:
            await restore_active_streams()
        except Exception:
            logger.exception("stream watchdog failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=20)
        except asyncio.TimeoutError:
            continue
