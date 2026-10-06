import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_user_from_bearer_or_query, require_roles
from app.config import get_settings
from app.db import get_db
from app.models import Ad, User, Venue
from app.schemas import AdOut, AdUpdate

router = APIRouter(prefix="/ads", tags=["ads"])
settings = get_settings()

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def ad_to_out(ad: Ad) -> AdOut:
    return AdOut(
        id=ad.id,
        title=ad.title,
        file_path=ad.file_path,
        venue_id=ad.venue_id,
        duration_sec=ad.duration_sec,
        placement=ad.placement or "bottom",
        sort_order=ad.sort_order,
        active=ad.active,
        created_at=ad.created_at,
        image_url=f"/ads/{ad.id}/image",
    )


@router.get("", response_model=list[AdOut])
def list_ads(
    active_only: bool = False,
    venue_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Ad).order_by(Ad.sort_order.asc(), Ad.id.desc())
    if active_only:
        q = q.filter(Ad.active.is_(True))
    ads = q.all()
    if venue_id is not None:
        ads = [a for a in ads if a.venue_id is None or a.venue_id == venue_id]
    return [ad_to_out(a) for a in ads]


@router.post("", response_model=AdOut)
async def create_ad(
    title: str = Form(...),
    duration_sec: int = Form(8),
    placement: str = Form("bottom"),
    sort_order: int = Form(0),
    venue_id: int | None = Form(None),
    active: bool = Form(True),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "superadmin")),
):
    if venue_id is not None and not db.get(Venue, venue_id):
        raise HTTPException(status_code=400, detail="Venue not found")

    if placement not in ("top", "bottom"):
        raise HTTPException(status_code=400, detail="placement deve ser top ou bottom")

    suffix = Path(file.filename or "ad.jpg").suffix.lower()
    if suffix not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Use JPG, PNG, WEBP ou GIF")

    ads_dir = Path(settings.ads_path)
    ads_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{suffix}"
    dest = ads_dir / name
    content = await file.read()
    if len(content) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem maior que 12MB")
    dest.write_bytes(content)

    ad = Ad(
        title=title.strip() or "Propaganda",
        file_path=name,
        venue_id=venue_id,
        duration_sec=max(3, min(duration_sec, 120)),
        placement=placement,
        sort_order=sort_order,
        active=active,
    )
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return ad_to_out(ad)


@router.patch("/{ad_id}", response_model=AdOut)
def update_ad(
    ad_id: int,
    body: AdUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "superadmin")),
):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    if body.title is not None:
        ad.title = body.title
    if body.venue_id is not None:
        if body.venue_id == 0:
            ad.venue_id = None
        else:
            if not db.get(Venue, body.venue_id):
                raise HTTPException(status_code=400, detail="Venue not found")
            ad.venue_id = body.venue_id
    if body.duration_sec is not None:
        ad.duration_sec = max(3, min(body.duration_sec, 120))
    if body.placement is not None:
        ad.placement = body.placement
    if body.sort_order is not None:
        ad.sort_order = body.sort_order
    if body.active is not None:
        ad.active = body.active
    db.commit()
    db.refresh(ad)
    return ad_to_out(ad)


@router.delete("/{ad_id}")
def delete_ad(
    ad_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "superadmin")),
):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    path = Path(settings.ads_path) / ad.file_path
    db.delete(ad)
    db.commit()
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
    return {"ok": True}


@router.get("/{ad_id}/image")
def get_ad_image(
    ad_id: int,
    access_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_user_from_bearer_or_query),
):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    path = Path(settings.ads_path) / ad.file_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing")
    media = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media)
