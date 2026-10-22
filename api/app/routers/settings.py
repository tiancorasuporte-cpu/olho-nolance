from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_global_admin
from app.db import get_db
from app.email_settings import EmailConfig, email_config_public, get_email_config, save_email_config
from app.mailer import test_imap, test_smtp
from app.models import User
from app.retention import MAX_RETENTION_DAYS, get_retention_days, purge_expired_clips, set_retention_days
from app.schemas import MessageOut

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsOut(BaseModel):
    clip_retention_days: int


class SettingsUpdate(BaseModel):
    clip_retention_days: int = Field(ge=0, le=MAX_RETENTION_DAYS)


class SettingsSaved(SettingsOut):
    removed_clips: int


class EmailSettingsOut(BaseModel):
    host: str = ""
    smtp_port: int = 587
    imap_port: int = 993
    username: str = ""
    from_email: str = ""
    from_name: str = "ONL Sports"
    use_ssl: bool = False
    configured: bool = False
    password_set: bool = False


class EmailSettingsUpdate(BaseModel):
    host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    imap_port: int = Field(default=993, ge=1, le=65535)
    username: str = ""
    password: str = ""
    from_email: str = ""
    from_name: str = "ONL Sports"
    use_ssl: bool = False


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


@router.get("/email", response_model=EmailSettingsOut)
def read_email_settings(db: Session = Depends(get_db), _: User = Depends(require_global_admin)):
    return EmailSettingsOut(**email_config_public(get_email_config(db)))


@router.put("/email", response_model=EmailSettingsOut)
def update_email_settings(
    body: EmailSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_global_admin),
):
    cfg = EmailConfig(
        host=body.host.strip(),
        smtp_port=body.smtp_port,
        imap_port=body.imap_port,
        username=body.username.strip(),
        password=body.password,
        from_email=(body.from_email or body.username).strip(),
        from_name=(body.from_name or "ONL Sports").strip(),
        use_ssl=body.use_ssl,
    )
    saved = save_email_config(db, cfg, keep_password=not bool(body.password))
    return EmailSettingsOut(**email_config_public(saved))


@router.post("/email/test-imap", response_model=MessageOut)
def email_test_imap(db: Session = Depends(get_db), _: User = Depends(require_global_admin)):
    try:
        return MessageOut(message=test_imap(get_email_config(db)))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/email/test-smtp", response_model=MessageOut)
def email_test_smtp(db: Session = Depends(get_db), _: User = Depends(require_global_admin)):
    try:
        return MessageOut(message=test_smtp(get_email_config(db)))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
