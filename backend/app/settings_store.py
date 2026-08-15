from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

from .database import DATA_DIR, UPLOAD_DIR
from .models import AppSettings, Exam

DEFAULT_PROCESSED_DIR = DATA_DIR / "processed"
MAX_LOGO_BYTES = 1024 * 1024
ALLOWED_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}
DEFAULT_LOGO_CANDIDATES = [
    Path(__file__).resolve().parents[2] / "frontend" / "public" / "logo.svg",
    Path(__file__).resolve().parents[2] / "frontend" / "dist" / "logo.svg",
]


def get_settings(db: Session) -> AppSettings:
    row = db.query(AppSettings).order_by(AppSettings.id).first()
    if row is None:
        row = AppSettings(processed_images_dir=str(DEFAULT_PROCESSED_DIR), role_permissions_json="{}", logo_path="")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def processed_root(db: Session) -> Path:
    row = get_settings(db)
    raw = (row.processed_images_dir or "").strip() or str(DEFAULT_PROCESSED_DIR)
    path = Path(raw).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def exam_folder_name(exam: Exam) -> str:
    name = re.sub(r'[<>:"/\\\\|?*]+', "-", exam.name or "exam")
    name = re.sub(r"\s+", " ", name).strip(" .") or f"exam-{exam.id}"
    return name[:80]


def exam_processed_dir(db: Session, exam: Exam) -> Path:
    dest = processed_root(db) / exam_folder_name(exam)
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def default_logo_path() -> Path:
    for path in DEFAULT_LOGO_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError("Default logo is missing")


def resolve_logo_path(db: Session) -> Path:
    row = get_settings(db)
    custom = Path(row.logo_path) if (row.logo_path or "").strip() else None
    if custom and custom.exists():
        return custom
    return default_logo_path()
