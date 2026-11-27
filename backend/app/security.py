from __future__ import annotations

import hashlib
import secrets

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import AppUser, UserSession

PBKDF2_ROUNDS = 120_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS).hex()
    return f"pbkdf2${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    if scheme != "pbkdf2":
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS).hex()
    return secrets.compare_digest(check, digest)


def create_session(db: Session, user: AppUser) -> str:
    token = secrets.token_urlsafe(32)
    db.add(UserSession(token=token, user_id=user.id))
    db.commit()
    return token


def user_from_token(db: Session, token: str | None) -> AppUser | None:
    if not token:
        return None
    user = (
        db.query(AppUser)
        .join(UserSession, UserSession.user_id == AppUser.id)
        .filter(UserSession.token == token)
        .one_or_none()
    )
    if not user or not user.is_active:
        return None
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> AppUser:
    user = getattr(request.state, "user", None)
    if user is not None:
        return user
    header = request.headers.get("authorization") or ""
    token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else None
    if not token:
        token = request.query_params.get("token") or request.cookies.get("omr_token")
    user = user_from_token(db, token)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def require_admin(user: AppUser = Depends(get_current_user)) -> AppUser:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user
