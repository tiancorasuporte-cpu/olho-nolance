"""Create and verify one-time e-mail codes."""

from __future__ import annotations

import logging
import random
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import hash_password, verify_password
from app.email_settings import get_email_config
from app.mailer import send_email
from app.models import EmailCode

logger = logging.getLogger(__name__)

CODE_TTL_MIN = 30
RESEND_COOLDOWN_SEC = 45
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


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def issue_code(db: Session, email: str, purpose: str, user_id: int | None = None) -> str:
    email = validate_email(email)
    now = datetime.now(timezone.utc)
    recent = (
        db.query(EmailCode)
        .filter(EmailCode.email == email, EmailCode.purpose == purpose, EmailCode.used_at.is_(None))
        .order_by(EmailCode.created_at.desc())
        .first()
    )
    if recent and recent.created_at:
        created = _aware(recent.created_at)
        if created and (now - created).total_seconds() < RESEND_COOLDOWN_SEC:
            wait = int(RESEND_COOLDOWN_SEC - (now - created).total_seconds())
            raise HTTPException(
                status_code=429,
                detail=f"Aguarde {max(wait, 1)}s antes de pedir outro código",
            )

    # Only the newest unused code should remain valid — avoids two codes in the inbox.
    for old in (
        db.query(EmailCode)
        .filter(EmailCode.email == email, EmailCode.purpose == purpose, EmailCode.used_at.is_(None))
        .all()
    ):
        old.used_at = now

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
    logger.info("Código %s emitido para %s (user_id=%s)", purpose, email, user_id)
    return code


def verify_code(db: Session, email: str, purpose: str, code: str) -> EmailCode:
    email = validate_email(email)
    # Keep digits only (paste from e-mail may include spaces or punctuation)
    code = re.sub(r"\D", "", (code or "").strip())
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=400, detail="Digite o código de 6 números")

    now = datetime.now(timezone.utc)
    rows = (
        db.query(EmailCode)
        .filter(
            EmailCode.email == email,
            EmailCode.purpose == purpose,
            EmailCode.used_at.is_(None),
        )
        .order_by(EmailCode.created_at.desc())
        .limit(8)
        .all()
    )
    if not rows:
        # Maybe the only codes were already used
        used = (
            db.query(EmailCode)
            .filter(EmailCode.email == email, EmailCode.purpose == purpose, EmailCode.used_at.isnot(None))
            .order_by(EmailCode.used_at.desc())
            .first()
        )
        if used:
            raise HTTPException(
                status_code=400,
                detail="Este código já foi usado. Peça um novo código ou faça login se já confirmou.",
            )
        raise HTTPException(
            status_code=400,
            detail="Nenhum código ativo. Clique em Reenviar código.",
        )

    for row in rows:
        exp = _aware(row.expires_at)
        if exp and exp < now:
            continue
        if verify_password(code, row.code_hash):
            row.used_at = now
            db.commit()
            return row

    # Wrong code or all expired
    latest = rows[0]
    exp = _aware(latest.expires_at)
    if exp and exp < now:
        raise HTTPException(
            status_code=400,
            detail="Código expirado. Clique em Reenviar código.",
        )
    raise HTTPException(
        status_code=400,
        detail="Código incorreto. Confira o e-mail mais recente ou reenvie o código.",
    )


def send_code_email(db: Session, email: str, purpose: str, code: str) -> None:
    cfg = get_email_config(db)
    pretty = f"{code[0:3]}-{code[3:6]}"
    if purpose == "register":
        subject = f"ONL Sports — seu código: {pretty}"
        body = (
            f"Olá!\n\n"
            f"Seu código de confirmação é:\n\n"
            f"    {pretty}\n\n"
            f"(ou {code} sem o traço)\n\n"
            f"Ele vale por {CODE_TTL_MIN} minutos.\n\n"
            "Se você não pediu este cadastro, ignore este e-mail.\n\n"
            "ONL Sports"
        )
    elif purpose == "reset":
        subject = f"ONL Sports — redefinir senha: {pretty}"
        body = (
            f"Olá!\n\n"
            f"Seu código para redefinir a senha é:\n\n"
            f"    {pretty}\n\n"
            f"(ou {code} sem o traço)\n\n"
            f"Ele vale por {CODE_TTL_MIN} minutos.\n\n"
            "Se você não pediu a troca, ignore este e-mail.\n\n"
            "ONL Sports"
        )
    else:
        subject = f"ONL Sports — código: {pretty}"
        body = f"Seu código é: {pretty}\n\nONL Sports"
    try:
        send_email(cfg, email, subject, body)
    except Exception as exc:
        logger.exception("Falha ao enviar e-mail para %s", email)
        raise HTTPException(status_code=503, detail=f"Falha ao enviar e-mail: {exc}") from exc
