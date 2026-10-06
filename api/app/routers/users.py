from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password, require_roles, serialize_venue_ids
from app.db import get_db
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate
from app.serializers import user_to_out

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "superadmin")),
):
    users = db.query(User).order_by(User.id).all()
    return [user_to_out(u) for u in users]


@router.post("", response_model=UserOut)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "superadmin")),
):
    if body.role == "superadmin" and current.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can create superadmin")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        active=body.active,
        venue_ids=serialize_venue_ids(body.venue_ids),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "superadmin")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role == "superadmin" and current.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can set superadmin")
    if body.name is not None:
        user.name = body.name
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        user.role = body.role
    if body.venue_ids is not None:
        user.venue_ids = serialize_venue_ids(body.venue_ids)
    if body.active is not None:
        user.active = body.active
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "superadmin")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if user.role == "superadmin" and current.role != "superadmin":
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(user)
    db.commit()
    return {"ok": True}
