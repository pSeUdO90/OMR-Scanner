from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppUser, UserSession
from ..security import create_session, get_current_user, hash_password, require_admin, verify_password
from ..settings_store import DEFAULT_PROCESSED_DIR, get_settings, processed_root

router = APIRouter(prefix="/api", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class UserIn(BaseModel):
    username: str
    password: str = ""
    display_name: str = ""
    role: str = "user"
    is_active: bool = True


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class SettingsIn(BaseModel):
    processed_images_dir: str = Field(default="")


def _user_out(user: AppUser) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name or user.username,
        role=user.role,
        is_active=bool(user.is_active),
    )


@router.post("/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(AppUser).filter(AppUser.username == payload.username.strip()).one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    token = create_session(db, user)
    return {"token": token, "user": _user_out(user)}


@router.post("/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    header = request.headers.get("authorization") or ""
    token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else None
    if token:
        db.query(UserSession).filter(UserSession.token == token).delete()
        db.commit()
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def me(user: AppUser = Depends(get_current_user)):
    return _user_out(user)


@router.get("/users", response_model=list[UserOut])
def list_users(_: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    return [_user_out(row) for row in db.query(AppUser).order_by(AppUser.username).all()]


@router.post("/users", response_model=UserOut)
def create_user(payload: UserIn, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(400, "Username and password are required")
    if payload.role not in ("admin", "user"):
        raise HTTPException(400, "Role must be admin or user")
    if db.query(AppUser).filter(AppUser.username == username).first():
        raise HTTPException(409, "Username already exists")
    row = AppUser(
        username=username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip() or username,
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _user_out(row)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserIn, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.query(AppUser).filter(AppUser.id == user_id).one_or_none()
    if not row:
        raise HTTPException(404, "User not found")
    username = payload.username.strip()
    if not username:
        raise HTTPException(400, "Username is required")
    if payload.role not in ("admin", "user"):
        raise HTTPException(400, "Role must be admin or user")
    taken = db.query(AppUser).filter(AppUser.username == username, AppUser.id != user_id).first()
    if taken:
        raise HTTPException(409, "Username already exists")
    if row.role == "admin" and payload.role != "admin":
        admins = db.query(AppUser).filter(AppUser.role == "admin", AppUser.is_active.is_(True)).count()
        if admins <= 1:
            raise HTTPException(400, "Keep at least one admin account")
    row.username = username
    row.display_name = payload.display_name.strip() or username
    row.role = payload.role
    row.is_active = payload.is_active
    if payload.password:
        row.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(row)
    return _user_out(row)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.query(AppUser).filter(AppUser.id == user_id).one_or_none()
    if not row:
        raise HTTPException(404, "User not found")
    if row.id == current.id:
        raise HTTPException(400, "You cannot delete your own account")
    if row.role == "admin":
        admins = db.query(AppUser).filter(AppUser.role == "admin", AppUser.is_active.is_(True)).count()
        if admins <= 1:
            raise HTTPException(400, "Keep at least one admin account")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/settings")
def read_settings(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_settings(db)
    root = str(processed_root(db))
    return {
        "processed_images_dir": row.processed_images_dir or str(DEFAULT_PROCESSED_DIR),
        "resolved_dir": root,
        "default_dir": str(DEFAULT_PROCESSED_DIR),
    }


@router.put("/settings")
def save_settings(payload: SettingsIn, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    row = get_settings(db)
    path = payload.processed_images_dir.strip() or str(DEFAULT_PROCESSED_DIR)
    row.processed_images_dir = path
    db.commit()
    root = processed_root(db)
    return {
        "processed_images_dir": row.processed_images_dir,
        "resolved_dir": str(root),
        "default_dir": str(DEFAULT_PROCESSED_DIR),
    }
