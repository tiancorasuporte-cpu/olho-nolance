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


def _code_email_bodies(purpose: str, code: str) -> tuple[str, str, str]:
    """Return subject, plain text, html. HTML is tiny (no images) — no perf impact."""
    if purpose == "register":
        title = "Confirme seu e-mail"
        lead = "Use este código para ativar sua conta de participante:"
        subject = f"ONL Sports - codigo {code}"
    elif purpose == "reset":
        title = "Redefinir senha"
        lead = "Use este código para criar uma nova senha:"
        subject = f"ONL Sports - redefinir senha {code}"
    else:
        title = "Seu codigo"
        lead = "Seu codigo ONL Sports:"
        subject = f"ONL Sports - codigo {code}"

    text = (
        f"ONL Sports\n\n{title}\n\n{lead}\n\n"
        f"  {code}\n\n"
        f"Valido por {CODE_TTL_MIN} minutos.\n"
        "Digite so os 6 numeros na tela (sem espacos).\n\n"
        "Se voce nao pediu isso, ignore este e-mail.\n"
    )
    html = f"""\
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#eee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#1b1b1b;border:1px solid #333;border-radius:16px;padding:28px 24px;">
        <tr><td align="center" style="font-size:22px;font-weight:700;color:#ff6b00;letter-spacing:0.04em;">ONL SPORTS</td></tr>
        <tr><td align="center" style="padding-top:18px;font-size:18px;font-weight:700;color:#fff;">{title}</td></tr>
        <tr><td align="center" style="padding-top:10px;font-size:14px;color:#aaa;line-height:1.45;">{lead}</td></tr>
        <tr><td align="center" style="padding:22px 0 8px;">
          <div style="display:inline-block;background:#111;border:1px solid #ff6b00;border-radius:12px;padding:14px 22px;
                      font-size:32px;font-weight:700;letter-spacing:0.28em;color:#fff;font-family:Consolas,Menlo,monospace;">
            {code}
          </div>
        </td></tr>
        <tr><td align="center" style="font-size:13px;color:#888;padding-top:8px;">
          Valido por {CODE_TTL_MIN} minutos · digite so os 6 numeros
        </td></tr>
        <tr><td align="center" style="font-size:12px;color:#666;padding-top:20px;">
          Se voce nao pediu este e-mail, pode ignorar.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""
    return subject, text, html


def send_code_email(db: Session, email: str, purpose: str, code: str) -> None:
    cfg = get_email_config(db)
    subject, text, html = _code_email_bodies(purpose, code)
    try:
        send_email(cfg, email, subject, text, html)
    except Exception as exc:
        logger.exception("Falha ao enviar e-mail para %s", email)
        raise HTTPException(status_code=503, detail=f"Falha ao enviar e-mail: {exc}") from exc
