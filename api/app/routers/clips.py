from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
    get_device_by_token,
    get_user_from_bearer_or_query,
    require_internal_token,
    user_can_access_venue,
    user_can_view_venue,
)
from app.config import get_settings
from app.db import get_db
from app.media_client import media_client
from app.models import Ad, Camera, Clip, Device, User
from app.schemas import ClipCreate, ClipOut, ClipStatusUpdate

router = APIRouter(prefix="/clips", tags=["clips"])
settings = get_settings()


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return None


MAX_BOTTOM_ADS = 3


def _ads_for_camera(db: Session, cam: Camera) -> dict[str, Any]:
    """One top banner + up to 3 bottom sponsors. Each strip uses the most specific
    level that has active ads: camera, then venue (all cameras), then global."""
    ads = (
        db.query(Ad)
        .filter(Ad.active.is_(True))
        .order_by(Ad.sort_order.asc(), Ad.id.desc())
        .all()
    )
    levels: dict[int, dict[str, list[str]]] = {0: {}, 1: {}, 2: {}}
    for ad in ads:
        if ad.camera_id is not None:
            if ad.camera_id != cam.id:
                continue
            level = 0
        elif ad.venue_id is not None:
            if ad.venue_id != cam.venue_id:
                continue
            level = 1
        else:
            level = 2
        if not (Path(settings.ads_path) / ad.file_path).is_file():
            continue
        levels[level].setdefault(ad.placement or "bottom", []).append(ad.file_path)

    def pick(placement: str) -> list[str]:
        for level in (0, 1, 2):
            if levels[level].get(placement):
                return levels[level][placement]
        return []

    top = pick("top")
    return {"top_image": top[0] if top else None, "bottom_images": pick("bottom")[:MAX_BOTTOM_ADS]}


def clip_to_out(clip: Clip) -> ClipOut:
    download = None
    if clip.status == "ready" and clip.file_path:
        download = f"/clips/{clip.id}/download"
    return ClipOut(
        id=clip.id,
        camera_id=clip.camera_id,
        venue_id=clip.venue_id,
        triggered_by_user_id=clip.triggered_by_user_id,
        triggered_by_device_id=clip.triggered_by_device_id,
        source=clip.source,
        started_at=clip.started_at,
        ended_at=clip.ended_at,
        duration_sec=clip.duration_sec,
        file_path=clip.file_path,
        status=clip.status,
        error_message=clip.error_message,
        created_at=clip.created_at,
        download_url=download,
        camera_name=clip.camera.name if clip.camera else None,
        venue_name=clip.venue.name if clip.venue else None,
    )


@router.get("", response_model=list[ClipOut])
def list_clips(
    venue_id: Optional[int] = None,
    camera_id: Optional[int] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    from_date: Optional[datetime] = Query(default=None, alias="from"),
    to_date: Optional[datetime] = Query(default=None, alias="to"),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Clip).order_by(Clip.created_at.desc())
    if user.role == "player":
        if venue_id is None:
            return []
        if status is None:
            status = "ready"
    if venue_id is not None:
        if not user_can_view_venue(user, venue_id):
            raise HTTPException(status_code=403, detail="Forbidden")
        q = q.filter(Clip.venue_id == venue_id)
    if camera_id is not None:
        q = q.filter(Clip.camera_id == camera_id)
    if status:
        q = q.filter(Clip.status == status)
    if source:
        q = q.filter(Clip.source == source)
    if from_date:
        q = q.filter(Clip.created_at >= from_date)
    if to_date:
        q = q.filter(Clip.created_at <= to_date)

    clips = q.limit(limit).all()
    if user.role in ("superadmin", "admin"):
        return [clip_to_out(c) for c in clips]
    return [clip_to_out(c) for c in clips if user_can_view_venue(user, c.venue_id)]


@router.post("", response_model=ClipOut)
async def create_clip(
    body: ClipCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cam = db.get(Camera, body.camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not user_can_access_venue(user, cam.venue_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    clip = Clip(
        camera_id=cam.id,
        venue_id=cam.venue_id,
        triggered_by_user_id=user.id,
        source=body.source,
        duration_sec=cam.buffer_seconds or 30,
        status="processing",
        ended_at=datetime.now(timezone.utc),
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    await _dispatch_clip(db, clip, cam)
    return clip_to_out(clip)


async def _dispatch_clip(db: Session, clip: Clip, cam: Camera) -> None:
    """Media snapshots the buffer now and renders in its queue, then PATCHes /status."""
    try:
        result = await media_client.create_clip(
            camera_id=cam.id,
            clip_id=clip.id,
            duration_sec=clip.duration_sec,
            venue_id=cam.venue_id,
            **_ads_for_camera(db, cam),
        )
        error = None
    except Exception as exc:
        result, error = {}, str(exc)

    db.refresh(clip)
    clip.started_at = _parse_dt(result.get("started_at")) or clip.started_at
    clip.ended_at = _parse_dt(result.get("ended_at")) or clip.ended_at
    # The render callback may already have landed; never downgrade a finished clip
    if clip.status == "processing":
        if error:
            clip.status, clip.error_message = "failed", error
        else:
            clip.status = result.get("status", "processing")
            clip.file_path = result.get("file_path") or clip.file_path
            if clip.status == "failed":
                clip.error_message = result.get("error")
    db.commit()
    db.refresh(clip)


@router.post("/button", response_model=ClipOut)
async def create_clip_from_button(
    body: ClipCreate | None = None,
    camera_id: Optional[int] = None,
    db: Session = Depends(get_db),
    device: Optional[Device] = Depends(get_device_by_token),
):
    if not device:
        raise HTTPException(status_code=401, detail="X-Device-Token required")

    target_camera_id = (body.camera_id if body else None) or camera_id or device.camera_id
    if not target_camera_id:
        raise HTTPException(status_code=400, detail="camera_id required")

    cam = db.get(Camera, target_camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if device.venue_id and device.venue_id != cam.venue_id:
        raise HTTPException(status_code=403, detail="Device not allowed for this venue")
    if device.camera_id and device.camera_id != cam.id:
        raise HTTPException(status_code=403, detail="Device not allowed for this camera")

    clip = Clip(
        camera_id=cam.id,
        venue_id=cam.venue_id,
        triggered_by_device_id=device.id,
        source="button",
        duration_sec=cam.buffer_seconds or 30,
        status="processing",
        ended_at=datetime.now(timezone.utc),
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    await _dispatch_clip(db, clip, cam)
    return clip_to_out(clip)


@router.get("/{clip_id}", response_model=ClipOut)
def get_clip(clip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    clip = db.get(Clip, clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    if not user_can_view_venue(user, clip.venue_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return clip_to_out(clip)


def _clip_file(db: Session, clip_id: int, user: User) -> tuple[Clip, Path]:
    clip = db.get(Clip, clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    if not user_can_view_venue(user, clip.venue_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    if clip.status != "ready" or not clip.file_path:
        raise HTTPException(status_code=404, detail="Clip not ready")
    path = Path(clip.file_path)
    if not path.is_file():
        path = Path(settings.videos_path) / clip.file_path
    if not path.is_file():
        # relative path like venue_id/clip-id.mp4
        path = Path(settings.videos_path) / str(clip.venue_id) / f"{clip.id}.mp4"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing")
    return clip, path


@router.get("/{clip_id}/download")
def download_clip(clip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    clip, path = _clip_file(db, clip_id, user)
    return FileResponse(path, media_type="video/mp4", filename=f"clip-{clip.id}.mp4")


@router.get("/{clip_id}/video")
def stream_clip(
    clip_id: int,
    access_token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_user_from_bearer_or_query),
):
    """Inline playback for <video src="...?access_token=JWT"> (supports Range)."""
    _, path = _clip_file(db, clip_id, user)
    return FileResponse(path, media_type="video/mp4")


@router.patch("/{clip_id}/status", response_model=ClipOut)
def update_clip_status(
    clip_id: int,
    body: ClipStatusUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
):
    clip = db.get(Clip, clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    clip.status = body.status
    if body.file_path is not None:
        clip.file_path = body.file_path
    if body.error_message is not None:
        clip.error_message = body.error_message
    if body.started_at is not None:
        clip.started_at = body.started_at
    if body.ended_at is not None:
        clip.ended_at = body.ended_at
    db.commit()
    db.refresh(clip)
    return clip_to_out(clip)
