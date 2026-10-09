from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, user_can_access_venue
from app.config import get_settings
from app.db import get_db
from app.media_client import media_client
from app.models import Ad, Camera, User, Venue
from app.schemas import CameraCreate, CameraOut, CameraUpdate

router = APIRouter(prefix="/cameras", tags=["cameras"])
settings = get_settings()


def camera_to_out(cam: Camera) -> CameraOut:
    live = None
    if cam.status == "streaming":
        live = f"/live/{cam.id}/stream.ts"
    return CameraOut(
        id=cam.id,
        venue_id=cam.venue_id,
        name=cam.name,
        rtsp_url=cam.rtsp_url,
        status=cam.status,
        buffer_seconds=cam.buffer_seconds,
        active=cam.active,
        created_at=cam.created_at,
        live_url=live,
    )


@router.get("", response_model=list[CameraOut])
def list_cameras(
    venue_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Camera).order_by(Camera.id)
    if venue_id is not None:
        if not user_can_access_venue(user, venue_id):
            raise HTTPException(status_code=403, detail="Forbidden")
        q = q.filter(Camera.venue_id == venue_id)
    cameras = q.all()
    if user.role in ("superadmin", "admin"):
        return [camera_to_out(c) for c in cameras]
    return [camera_to_out(c) for c in cameras if user_can_access_venue(user, c.venue_id)]


@router.post("", response_model=CameraOut)
async def create_camera(
    body: CameraCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    venue = db.get(Venue, body.venue_id)
    if not venue:
        raise HTTPException(status_code=400, detail="Venue not found")
    cam = Camera(
        venue_id=body.venue_id,
        name=body.name,
        rtsp_url=body.rtsp_url,
        buffer_seconds=body.buffer_seconds,
        active=body.active,
        status="idle",
    )
    db.add(cam)
    db.commit()
    db.refresh(cam)

    if body.start_stream and body.active:
        try:
            await media_client.start_stream(cam.id, cam.rtsp_url, cam.buffer_seconds)
            cam.status = "streaming"
            db.commit()
            db.refresh(cam)
        except Exception as exc:
            cam.status = "error"
            db.commit()
            db.refresh(cam)
            # still return camera; UI can show error status
            print(f"Failed to start stream: {exc}")

    return camera_to_out(cam)


@router.get("/{camera_id}", response_model=CameraOut)
def get_camera(camera_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not user_can_access_venue(user, cam.venue_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return camera_to_out(cam)


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: int,
    body: CameraUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    restart = False
    if body.name is not None:
        cam.name = body.name
    if body.rtsp_url is not None and body.rtsp_url != cam.rtsp_url:
        cam.rtsp_url = body.rtsp_url
        restart = True
    if body.buffer_seconds is not None:
        cam.buffer_seconds = body.buffer_seconds
        restart = True
    if body.active is not None:
        cam.active = body.active
    if body.status is not None:
        cam.status = body.status
    db.commit()
    db.refresh(cam)

    if restart and cam.active:
        try:
            await media_client.stop_stream(cam.id)
        except Exception:
            pass
        try:
            await media_client.start_stream(cam.id, cam.rtsp_url, cam.buffer_seconds)
            cam.status = "streaming"
        except Exception:
            cam.status = "error"
        db.commit()
        db.refresh(cam)
    elif body.active is False:
        try:
            await media_client.stop_stream(cam.id)
        except Exception:
            pass
        cam.status = "idle"
        db.commit()
        db.refresh(cam)

    return camera_to_out(cam)


@router.post("/{camera_id}/start", response_model=CameraOut)
async def start_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    try:
        await media_client.start_stream(cam.id, cam.rtsp_url, cam.buffer_seconds)
        cam.status = "streaming"
        cam.active = True
    except Exception as exc:
        cam.status = "error"
        db.commit()
        raise HTTPException(status_code=502, detail=f"Media error: {exc}") from exc
    db.commit()
    db.refresh(cam)
    return camera_to_out(cam)


@router.post("/{camera_id}/stop", response_model=CameraOut)
async def stop_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    try:
        await media_client.stop_stream(cam.id)
    except Exception:
        pass
    cam.status = "idle"
    db.commit()
    db.refresh(cam)
    return camera_to_out(cam)


@router.delete("/{camera_id}")
async def delete_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    try:
        await media_client.stop_stream(cam.id)
    except Exception:
        pass
    db.query(Ad).filter(Ad.camera_id == cam.id).update(
        {Ad.camera_id: None, Ad.active: False}, synchronize_session=False
    )
    db.delete(cam)
    db.commit()
    return {"ok": True}
