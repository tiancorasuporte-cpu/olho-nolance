from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import (
    hash_password,
    managed_venue_ids,
    parse_venue_ids,
    require_roles,
    serialize_venue_ids,
)
from app.db import get_db
from app.models import User, Venue
from app.schemas import UserCreate, UserOut, UserUpdate
from app.serializers import user_to_out

router = APIRouter(prefix="/users", tags=["users"])

VENUE_ROLES = ("admin", "operator")


def _can_see(current: User, target: User) -> bool:
    if target.id == current.id:
        return True
    scope = managed_venue_ids(current)
    if scope is None:
        return target.role != "superadmin" or current.role == "superadmin"
    ids = set(parse_venue_ids(target.venue_ids))
    return target.role in VENUE_ROLES and bool(ids) and ids <= scope


def _check_assignment(db: Session, current: User, role: str, venue_ids: list[int]) -> list[int]:
    """Validate role + venues the current user may grant; returns the normalized venue list."""
    if role == "superadmin" and current.role != "superadmin":
        raise HTTPException(status_code=403, detail="Apenas superadmin cria superadmin")
    if role not in VENUE_ROLES:
        venue_ids = []
    venue_ids = sorted(set(venue_ids))
    if venue_ids and db.query(Venue).filter(Venue.id.in_(venue_ids)).count() != len(venue_ids):
        raise HTTPException(status_code=400, detail="Quadra não encontrada")
    if role == "operator" and not venue_ids:
        raise HTTPException(status_code=400, detail="Vincule o operador a pelo menos uma quadra")
    scope = managed_venue_ids(current)
    if scope is not None:
        if role not in VENUE_ROLES:
            raise HTTPException(status_code=403, detail="Você só pode cadastrar admins e operadores das suas quadras")
        if not venue_ids:
            raise HTTPException(status_code=400, detail="Escolha ao menos uma das suas quadras")
        if not set(venue_ids) <= scope:
            raise HTTPException(status_code=403, detail="Você só pode vincular às suas quadras")
    return venue_ids


def _visible_user(db: Session, current: User, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user or not _can_see(current, user):
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "superadmin")),
):
    users = db.query(User).order_by(User.id).all()
    return [user_to_out(u) for u in users if _can_see(current, u)]


@router.post("", response_model=UserOut)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "superadmin")),
):
    venue_ids = _check_assignment(db, current, body.role, body.venue_ids)
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        active=body.active,
        venue_ids=serialize_venue_ids(venue_ids),
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
    user = _visible_user(db, current, user_id)
    if user.role == "superadmin" and current.role != "superadmin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if body.role is not None or body.venue_ids is not None:
        role = body.role or user.role
        venue_ids: Optional[list[int]] = (
            body.venue_ids if body.venue_ids is not None else parse_venue_ids(user.venue_ids)
        )
        if user.id == current.id and (role != user.role or set(venue_ids or []) != set(parse_venue_ids(user.venue_ids))):
            raise HTTPException(status_code=400, detail="Você não pode alterar o próprio perfil ou quadras")
        user.venue_ids = serialize_venue_ids(_check_assignment(db, current, role, venue_ids or []))
        user.role = role
    if body.name is not None:
        user.name = body.name
    if body.password is not None:
        user.password_hash = hash_password(body.password)
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
    user = _visible_user(db, current, user_id)
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if user.role == "superadmin" and current.role != "superadmin":
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(user)
    db.commit()
    return {"ok": True}
