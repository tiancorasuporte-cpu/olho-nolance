from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.db import get_db
from app.email_codes import issue_code, normalize_email, send_code_email, validate_email, verify_code
from app.models import User
from app.schemas import (
    ConfirmEmailIn,
    ForgotPasswordIn,
    LoginIn,
    MessageOut,
    RegisterIn,
    ResetPasswordIn,
    TokenOut,
    UserOut,
)
from app.serializers import user_to_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _find_login_user(db: Session, login: str) -> User | None:
    login = (login or "").strip()
    if not login:
        return None
    if "@" in login:
        email = normalize_email(login)
        return db.query(User).filter(or_(User.username == login, User.email == email)).first()
    return db.query(User).filter(User.username == login).first()


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = _find_login_user(db, body.username)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    if not user.active:
        raise HTTPException(status_code=401, detail="Usuário inativo")
    if user.role == "player" and not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Confirme seu e-mail com o código enviado antes de entrar",
        )
    return TokenOut(access_token=create_access_token(user.id, user.role))


@router.post("/register", response_model=MessageOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Self-service signup for participants (players)."""
    email = validate_email(body.email)
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Informe seu nome")

    existing = db.query(User).filter(or_(User.email == email, User.username == email)).first()
    if existing:
        if existing.role == "player" and not existing.email_verified:
            existing.name = name
            existing.password_hash = hash_password(body.password)
            existing.active = True
            db.commit()
            code = issue_code(db, email, "register", existing.id)
            send_code_email(db, email, "register", code)
            return MessageOut(message="Enviamos um novo código para o seu e-mail.")
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")

    user = User(
        username=email[:64],
        email=email,
        email_verified=False,
        password_hash=hash_password(body.password),
        name=name,
        role="player",
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    code = issue_code(db, email, "register", user.id)
    send_code_email(db, email, "register", code)
    return MessageOut(message="Cadastro iniciado. Enviamos um código de confirmação para o seu e-mail.")


@router.post("/confirm", response_model=TokenOut)
def confirm_email(body: ConfirmEmailIn, db: Session = Depends(get_db)):
    email = validate_email(body.email)
    row = verify_code(db, email, "register", body.code)
    user = db.get(User, row.user_id) if row.user_id else db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.email_verified = True
    user.active = True
    if not user.email:
        user.email = email
    db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.role))


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(body: ForgotPasswordIn, db: Session = Depends(get_db)):
    email = validate_email(body.email)
    user = db.query(User).filter(User.email == email, User.active.is_(True)).first()
    # Always the same response — don't leak whether the e-mail exists.
    if user:
        code = issue_code(db, email, "reset", user.id)
        send_code_email(db, email, "reset", code)
    return MessageOut(message="Se o e-mail existir, enviamos um código para redefinir a senha.")


@router.post("/reset-password", response_model=MessageOut)
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    email = validate_email(body.email)
    row = verify_code(db, email, "reset", body.code)
    user = db.get(User, row.user_id) if row.user_id else db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.password_hash = hash_password(body.password)
    if user.role == "player":
        user.email_verified = True
    db.commit()
    return MessageOut(message="Senha atualizada. Você já pode entrar.")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_to_out(user)
