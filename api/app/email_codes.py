"""Create and verify one-time e-mail codes."""

from __future__ import annotations

import random
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import hash_password, verify_password
from app.email_settings import get_email_config
from app.mailer import send_email
from app.models import EmailCode

CODE_TTL_MIN = 15
RESEND_COOLDOWN_SEC = 60
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def validate_email(value: str) -> str:
    email = normalize_email(value)
    if not EMAIL_RE.match(email) or len(email) > 255:
        raise HTTPException(status_code=400, detail="E-mail inválido")
    return email


def _generate_code() -> str:
    return f"{random.SystemRandom().randint(0, 999999):06d}"


def issue_code(db: Session, email: str, purpose: str, user_id: int | None = None) -> str:
    email = validate_email(email)
    now = datetime.now(timezone.utc)
    recent = (
        db.query(EmailCode)
        .filter(EmailCode.email == email, EmailCode.purpose == purpose, EmailCode.used_at.is_(None))
        .order_by(EmailCode.created_at.desc())
        .first()
    )
    if recent and recent.created_at and (now - recent.created_at).total_seconds() < RESEND_COOLDOWN_SEC:
        raise HTTPException(status_code=429, detail="Aguarde um minuto antes de pedir outro código")

    code = _generate_code()
    row = EmailCode(
        email=email,
        purpose=purpose,
        code_hash=hash_password(code),
        user_id=user_id,
        expires_at=now + timedelta(minutes=CODE_TTL_MIN),
    )
    db.add(row)
    db.commit()
    return code


def verify_code(db: Session, email: str, purpose: str, code: str) -> EmailCode:
    email = validate_email(email)
    code = (code or "").strip()
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=400, detail="Código inválido")

    now = datetime.now(timezone.utc)
    rows = (
        db.query(EmailCode)
        .filter(
            EmailCode.email == email,
            EmailCode.purpose == purpose,
            EmailCode.used_at.is_(None),
            EmailCode.expires_at >= now,
        )
        .order_by(EmailCode.created_at.desc())
        .limit(5)
        .all()
    )
    for row in rows:
        if verify_password(code, row.code_hash):
            row.used_at = now
            db.commit()
            return row
    raise HTTPException(status_code=400, detail="Código inválido ou expirado")


def send_code_email(db: Session, email: str, purpose: str, code: str) -> None:
    cfg = get_email_config(db)
    if purpose == "register":
        subject = "ONL Sports — confirme seu e-mail"
        body = (
            f"Olá!\n\nSeu código de confirmação é: {code}\n\n"
            f"Ele vale por {CODE_TTL_MIN} minutos.\n\n"
            "Se você não pediu este cadastro, ignore este e-mail.\n\nONL Sports"
        )
    elif purpose == "reset":
        subject = "ONL Sports — redefinição de senha"
        body = (
            f"Olá!\n\nSeu código para redefinir a senha é: {code}\n\n"
            f"Ele vale por {CODE_TTL_MIN} minutos.\n\n"
            "Se você não pediu a troca, ignore este e-mail.\n\nONL Sports"
        )
    else:
        subject = "ONL Sports — código"
        body = f"Seu código é: {code}\n\nONL Sports"
    try:
        send_email(cfg, email, subject, body)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falha ao enviar e-mail: {exc}") from exc
