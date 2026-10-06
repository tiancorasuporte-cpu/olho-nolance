import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import AppSetting, Clip

logger = logging.getLogger(__name__)
settings = get_settings()

RETENTION_KEY = "clip_retention_days"
DEFAULT_RETENTION_DAYS = 3
MAX_RETENTION_DAYS = 365
CLEANUP_INTERVAL_SEC = 5 * 60
STALE_PROCESSING_MIN = 30


def get_retention_days(db: Session) -> int:
    """Days to keep clips; 0 means keep forever."""
    row = db.get(AppSetting, RETENTION_KEY)
    if not row:
        return DEFAULT_RETENTION_DAYS
    try:
        return max(0, min(int(row.value), MAX_RETENTION_DAYS))
    except ValueError:
        return DEFAULT_RETENTION_DAYS


def set_retention_days(db: Session, days: int) -> None:
    row = db.get(AppSetting, RETENTION_KEY)
    if row:
        row.value = str(days)
    else:
        db.add(AppSetting(key=RETENTION_KEY, value=str(days)))
    db.commit()


def _clip_paths(clip: Clip) -> list[Path]:
    base = Path(settings.videos_path) / str(clip.venue_id)
    paths = [base / f"{clip.id}.mp4", base / f"{clip.id}.raw.mp4"]
    if clip.file_path:
        paths.append(Path(settings.videos_path) / clip.file_path)
    return paths


def purge_expired_clips(db: Session) -> int:
    days = get_retention_days(db)
    if days <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    expired = db.query(Clip).filter(Clip.created_at < cutoff).all()
    for clip in expired:
        for path in _clip_paths(clip):
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Could not delete %s", path)
        db.delete(clip)
    db.commit()
    if expired:
        logger.info("Retention: removed %s clips older than %s days", len(expired), days)
    return len(expired)


def fail_stale_processing(db: Session) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_PROCESSING_MIN)
    stale = db.query(Clip).filter(Clip.status == "processing", Clip.created_at < cutoff).all()
    for clip in stale:
        clip.status = "failed"
        clip.error_message = f"Tempo esgotado: o vídeo não ficou pronto em {STALE_PROCESSING_MIN} minutos"
    db.commit()
    return len(stale)


async def retention_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        db = SessionLocal()
        try:
            fail_stale_processing(db)
            purge_expired_clips(db)
        except Exception:
            logger.exception("retention cleanup failed")
        finally:
            db.close()
        try:
            await asyncio.wait_for(stop.wait(), timeout=CLEANUP_INTERVAL_SEC)
        except asyncio.TimeoutError:
            continue
