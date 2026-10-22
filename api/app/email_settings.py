"""Persistent SMTP/IMAP settings (admin UI). Password stays in app_settings."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting

KEYS = {
    "host": "email_host",
    "smtp_port": "email_smtp_port",
    "imap_port": "email_imap_port",
    "username": "email_username",
    "password": "email_password",
    "from_email": "email_from",
    "from_name": "email_from_name",
    "use_ssl": "email_use_ssl",
}


@dataclass
class EmailConfig:
    host: str = ""
    smtp_port: int = 587
    imap_port: int = 993
    username: str = ""
    password: str = ""
    from_email: str = ""
    from_name: str = "ONL Sports"
    use_ssl: bool = False  # True = SMTP SSL (465); False = STARTTLS (587)

    @property
    def configured(self) -> bool:
        return bool(self.host and self.username and self.password and (self.from_email or self.username))

    @property
    def sender(self) -> str:
        addr = self.from_email or self.username
        name = (self.from_name or "").strip()
        return f"{name} <{addr}>" if name else addr


def _get(db: Session, key: str, default: str = "") -> str:
    row = db.get(AppSetting, key)
    return row.value if row else default


def _set(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


def get_email_config(db: Session) -> EmailConfig:
    use_ssl_raw = _get(db, KEYS["use_ssl"], "0")
    try:
        smtp_port = int(_get(db, KEYS["smtp_port"], "587") or "587")
    except ValueError:
        smtp_port = 587
    try:
        imap_port = int(_get(db, KEYS["imap_port"], "993") or "993")
    except ValueError:
        imap_port = 993
    return EmailConfig(
        host=_get(db, KEYS["host"]),
        smtp_port=smtp_port,
        imap_port=imap_port,
        username=_get(db, KEYS["username"]),
        password=_get(db, KEYS["password"]),
        from_email=_get(db, KEYS["from_email"]),
        from_name=_get(db, KEYS["from_name"], "ONL Sports") or "ONL Sports",
        use_ssl=use_ssl_raw in ("1", "true", "True", "yes"),
    )


def save_email_config(db: Session, cfg: EmailConfig, *, keep_password: bool = False) -> EmailConfig:
    current = get_email_config(db)
    password = current.password if keep_password and not cfg.password else cfg.password
    _set(db, KEYS["host"], cfg.host.strip())
    _set(db, KEYS["smtp_port"], str(cfg.smtp_port))
    _set(db, KEYS["imap_port"], str(cfg.imap_port))
    _set(db, KEYS["username"], cfg.username.strip())
    _set(db, KEYS["password"], password)
    _set(db, KEYS["from_email"], (cfg.from_email or cfg.username).strip())
    _set(db, KEYS["from_name"], (cfg.from_name or "ONL Sports").strip())
    _set(db, KEYS["use_ssl"], "1" if cfg.use_ssl else "0")
    db.commit()
    return get_email_config(db)


def email_config_public(cfg: EmailConfig) -> dict:
    """Safe payload for the admin UI (no password)."""
    data = asdict(cfg)
    data.pop("password", None)
    data["configured"] = cfg.configured
    data["password_set"] = bool(cfg.password)
    return data
