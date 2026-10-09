import hashlib
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import is_global_admin, require_roles, user_can_manage_venue
from app.db import get_db
from app.models import Camera, Device, User, Venue
from app.schemas import DeviceCreate, DeviceOut

router = APIRouter(prefix="/devices", tags=["devices"])


def device_to_out(device: Device, token: str | None = None) -> DeviceOut:
    return DeviceOut(
        id=device.id,
        label=device.label,
        venue_id=device.venue_id,
        camera_id=device.camera_id,
        token_prefix=device.token_prefix,
        active=device.active,
        created_at=device.created_at,
        token=token,
    )


def _device_venue(db: Session, device: Device) -> Optional[int]:
    if device.camera_id is not None:
        cam = db.get(Camera, device.camera_id)
        if cam:
            return cam.venue_id
    return device.venue_id


def _can_manage_device(db: Session, user: User, device: Device) -> bool:
    if is_global_admin(user):
        return True
    return user_can_manage_venue(user, _device_venue(db, device))


def _managed_device(db: Session, user: User, device_id: int) -> Device:
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not _can_manage_device(db, user, device):
        raise HTTPException(status_code=403, detail="Forbidden")
    return device


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "superadmin")),
):
    devices = db.query(Device).order_by(Device.id.desc()).all()
    return [device_to_out(d) for d in devices if _can_manage_device(db, user, d)]


@router.post("", response_model=DeviceOut)
def create_device(
    body: DeviceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "superadmin")),
):
    venue_id = body.venue_id
    if body.camera_id:
        cam = db.get(Camera, body.camera_id)
        if not cam:
            raise HTTPException(status_code=400, detail="Camera not found")
        venue_id = cam.venue_id
    if venue_id and not db.get(Venue, venue_id):
        raise HTTPException(status_code=400, detail="Venue not found")
    if not is_global_admin(user) and not user_can_manage_venue(user, venue_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    device = Device(
        label=body.label,
        venue_id=venue_id,
        camera_id=body.camera_id,
        token_hash=token_hash,
        token_prefix=raw_token[:8],
        active=body.active,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device_to_out(device, token=raw_token)


@router.patch("/{device_id}/revoke")
def revoke_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "superadmin")),
):
    device = _managed_device(db, user, device_id)
    device.active = False
    db.commit()
    return {"ok": True}


@router.delete("/{device_id}")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "superadmin")),
):
    from app.models import Clip

    device = _managed_device(db, user, device_id)
    # keep clip history; just detach device reference
    db.query(Clip).filter(Clip.triggered_by_device_id == device_id).update(
        {Clip.triggered_by_device_id: None}
    )
    db.delete(device)
    db.commit()
    return {"ok": True}
