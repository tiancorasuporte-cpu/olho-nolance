from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_global_admin
from app.db import get_db
from app.models import User
from app.retention import MAX_RETENTION_DAYS, get_retention_days, purge_expired_clips, set_retention_days

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsOut(BaseModel):
    clip_retention_days: int


class SettingsUpdate(BaseModel):
    clip_retention_days: int = Field(ge=0, le=MAX_RETENTION_DAYS)


class SettingsSaved(SettingsOut):
    removed_clips: int


@router.get("", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return SettingsOut(clip_retention_days=get_retention_days(db))


@router.put("", response_model=SettingsSaved)
def update_settings(
    body: SettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_global_admin),
):
    set_retention_days(db, body.clip_retention_days)
    removed = purge_expired_clips(db)
    return SettingsSaved(clip_retention_days=get_retention_days(db), removed_clips=removed)
