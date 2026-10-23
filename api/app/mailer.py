"""Send mail via SMTP; optional IMAP login test (same mailbox credentials)."""

from __future__ import annotations

import imaplib
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.email_settings import EmailConfig

logger = logging.getLogger(__name__)


def _smtp_ssl(cfg: EmailConfig) -> bool:
    return bool(cfg.use_ssl or cfg.smtp_port == 465)


def send_email(
    cfg: EmailConfig,
    to: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    if not cfg.configured:
        raise RuntimeError("E-mail não configurado. Vá em Configurações e informe o servidor SMTP/IMAP.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg.from_name or "ONL Sports", cfg.from_email or cfg.username))
    msg["To"] = to
    msg.set_content(text_body)
    if html_body:
        # Lightweight HTML alternative — same size class as plain text, no images/assets.
        msg.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    if _smtp_ssl(cfg):
        with smtplib.SMTP_SSL(cfg.host, cfg.smtp_port, timeout=30, context=context) as smtp:
            smtp.login(cfg.username, cfg.password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(cfg.host, cfg.smtp_port, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(cfg.username, cfg.password)
            smtp.send_message(msg)
    logger.info("E-mail enviado para %s (%s)", to, subject)


def test_imap(cfg: EmailConfig) -> str:
    """Login via IMAP to validate host/user/password (does not send mail)."""
    if not cfg.host or not cfg.username or not cfg.password:
        raise RuntimeError("Informe host, usuário e senha para testar o IMAP.")
    context = ssl.create_default_context()
    with imaplib.IMAP4_SSL(cfg.host, cfg.imap_port, ssl_context=context) as imap:
        typ, _ = imap.login(cfg.username, cfg.password)
        if typ != "OK":
            raise RuntimeError("Falha no login IMAP")
        imap.logout()
    return "IMAP conectado com sucesso"


def test_smtp(cfg: EmailConfig) -> str:
    if not cfg.configured:
        raise RuntimeError("Informe host, usuário, senha e remetente para testar o SMTP.")
    context = ssl.create_default_context()
    if _smtp_ssl(cfg):
        with smtplib.SMTP_SSL(cfg.host, cfg.smtp_port, timeout=30, context=context) as smtp:
            smtp.login(cfg.username, cfg.password)
    else:
        with smtplib.SMTP(cfg.host, cfg.smtp_port, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(cfg.username, cfg.password)
    return "SMTP conectado com sucesso"
