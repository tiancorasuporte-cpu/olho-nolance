from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, user_can_view_venue
from app.db import get_db
from app.models import User, Venue
from app.schemas import VenueCreate, VenueOut, VenueUpdate

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("", response_model=list[VenueOut])
def list_venues(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Venue).order_by(Venue.name)
    venues = q.all()
    if user.role in ("superadmin", "admin"):
        return venues
    if user.role == "player":
        return [v for v in venues if v.active]
    return [v for v in venues if user_can_view_venue(user, v.id)]


@router.post("", response_model=VenueOut)
def create_venue(
    body: VenueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    venue = Venue(
        name=body.name,
        city=(body.city or "").strip() or None,
        description=body.description,
        active=body.active,
    )
    db.add(venue)
    db.commit()
    db.refresh(venue)
    return venue


@router.get("/{venue_id}", response_model=VenueOut)
def get_venue(venue_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if not user_can_view_venue(user, venue.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return venue


@router.patch("/{venue_id}", response_model=VenueOut)
def update_venue(
    venue_id: int,
    body: VenueUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if body.name is not None:
        venue.name = body.name
    if body.city is not None:
        venue.city = body.city.strip() or None
    if body.description is not None:
        venue.description = body.description
    if body.active is not None:
        venue.active = body.active
    db.commit()
    db.refresh(venue)
    return venue


@router.delete("/{venue_id}")
def delete_venue(
    venue_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    db.delete(venue)
    db.commit()
    return {"ok": True}
