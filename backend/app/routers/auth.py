from __future__ import annotations

from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import UPLOAD_DIR, get_db
from ..models import AppUser, UserSession
from ..security import create_session, get_current_user, hash_password, require_admin, verify_password
from ..permissions import APP_TABS, load_role_permissions, permissions_for_user, save_role_permissions
from ..settings_store import (
    ALLOWED_LOGO_TYPES,
    DEFAULT_PROCESSED_DIR,
    MAX_LOGO_BYTES,
    get_settings,
    list_folders,
    processed_root,
    resolve_logo_path,
)

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
    permissions: dict[str, list[str]] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


RESET_PASSWORD = "123456"


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


class SettingsIn(BaseModel):
    processed_images_dir: str | None = None
    role_permissions: dict | None = None


def _user_out(user: AppUser, db: Session) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name or user.username,
        role=user.role,
        is_active=bool(user.is_active),
        permissions=permissions_for_user(user, db),
    )


@router.post("/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(AppUser).filter(AppUser.username == payload.username.strip()).one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    token = create_session(db, user)
    return {"token": token, "user": _user_out(user, db)}


@router.post("/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    header = request.headers.get("authorization") or ""
    token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else None
    if token:
        db.query(UserSession).filter(UserSession.token == token).delete()
        db.commit()
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def me(user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return _user_out(user, db)


@router.get("/users", response_model=list[UserOut])
def list_users(_: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    return [_user_out(row, db) for row in db.query(AppUser).order_by(AppUser.username).all()]


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
    return _user_out(row, db)


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
    return _user_out(row, db)


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


@router.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.query(AppUser).filter(AppUser.id == user_id).one_or_none()
    if not row:
        raise HTTPException(404, "User not found")
    row.password_hash = hash_password(RESET_PASSWORD)
    db.query(UserSession).filter(UserSession.user_id == row.id).delete()
    db.commit()
    return {"ok": True, "username": row.username, "password": RESET_PASSWORD}


@router.put("/auth/password")
def change_own_password(payload: PasswordIn, user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    new_password = payload.new_password.strip()
    if len(new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    row = db.get(AppUser, user.id)
    if not row:
        raise HTTPException(404, "User not found")
    row.password_hash = hash_password(new_password)
    db.commit()
    return {"ok": True}


def _settings_body(db: Session) -> dict:
    row = get_settings(db)
    root = str(processed_root(db))
    custom = bool((row.logo_path or "").strip() and Path(row.logo_path).exists())
    rev = int(Path(row.logo_path).stat().st_mtime) if custom else 1
    return {
        "processed_images_dir": row.processed_images_dir or str(DEFAULT_PROCESSED_DIR),
        "resolved_dir": root,
        "default_dir": str(DEFAULT_PROCESSED_DIR),
        "tabs": [{"key": key, "label": label} for key, label in APP_TABS],
        "actions": ["view", "edit", "delete"],
        "roles": ["admin", "user"],
        "role_permissions": load_role_permissions(db),
        "has_custom_logo": custom,
        "logo_url": f"/api/branding/logo?v={rev}",
    }

@router.get("/settings")
def read_settings(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return _settings_body(db)


@router.get("/settings/folders")
def browse_folders(path: str = Query(""), _: AppUser = Depends(require_admin)):
    try:
        return list_folders(path)
    except FileNotFoundError:
        raise HTTPException(400, f"Folder not found: {path or DEFAULT_PROCESSED_DIR}") from None


@router.put("/settings")
def save_settings(payload: SettingsIn, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    row = get_settings(db)
    if payload.processed_images_dir is not None:
        path = payload.processed_images_dir.strip() or str(DEFAULT_PROCESSED_DIR)
        row.processed_images_dir = path
    if payload.role_permissions is not None:
        save_role_permissions(db, payload.role_permissions)
    else:
        db.commit()
    return _settings_body(db)


@router.get("/branding/logo")
def branding_logo(db: Session = Depends(get_db)):
    path = resolve_logo_path(db)
    media = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    }.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media, headers={"Cache-Control": "no-store"})


@router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    data = await file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(400, "Logo must be under 1 MB")
    ctype = (file.content_type or "").split(";")[0].strip().lower()
    name = (file.filename or "logo.png").lower()
    ext = ALLOWED_LOGO_TYPES.get(ctype)
    if not ext:
        for suffix in ALLOWED_LOGO_TYPES.values():
            if name.endswith(suffix):
                ext = suffix
                break
    if not ext:
        raise HTTPException(400, "Use a PNG, JPG, WEBP, GIF, or SVG image under 1 MB")
    if ext == ".svg":
        text = data.decode("utf-8", errors="ignore").lstrip().lower()
        if "<svg" not in text:
            raise HTTPException(400, "That file is not a valid SVG logo")
    else:
        try:
            Image.open(BytesIO(data)).verify()
        except Exception as exc:
            raise HTTPException(400, "Could not read that image") from exc
    dest_dir = UPLOAD_DIR / "branding"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"logo-{uuid4().hex}{ext}"
    dest.write_bytes(data)
    row = get_settings(db)
    old = Path(row.logo_path) if row.logo_path else None
    row.logo_path = str(dest)
    db.commit()
    if old and old.exists() and old.parent == dest_dir and old != dest:
        old.unlink(missing_ok=True)
    return _settings_body(db)


@router.delete("/settings/logo")
def reset_logo(_: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    row = get_settings(db)
    old = Path(row.logo_path) if row.logo_path else None
    row.logo_path = ""
    db.commit()
    if old and old.exists() and old.parent == (UPLOAD_DIR / "branding"):
        old.unlink(missing_ok=True)
    return _settings_body(db)
