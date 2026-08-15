from __future__ import annotations

import os
import re
from pathlib import Path

from sqlalchemy.orm import Session

from .database import DATA_DIR, UPLOAD_DIR
from .models import AppSettings, Exam

DEFAULT_PROCESSED_DIR = r"E:\OMR Processed Sheets"
LEGACY_PROCESSED_DIR = str(DATA_DIR / "processed")
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
        row = AppSettings(processed_images_dir=DEFAULT_PROCESSED_DIR, role_permissions_json="{}", logo_path="")
        db.add(row)
        db.commit()
        db.refresh(row)
    elif not (row.processed_images_dir or "").strip() or row.processed_images_dir == LEGACY_PROCESSED_DIR:
        row.processed_images_dir = DEFAULT_PROCESSED_DIR
        db.commit()
    return row


def processed_root(db: Session) -> Path:
    row = get_settings(db)
    raw = (row.processed_images_dir or "").strip() or DEFAULT_PROCESSED_DIR
    path = Path(raw)
    windows_path = bool(re.match(r"^[A-Za-z]:[\\/]", raw))
    if windows_path and os.name != "nt":
        return path
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
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


def list_folders(path: str) -> dict:
    raw = (path or "").strip()
    if not raw:
        if os.name == "nt":
            from string import ascii_uppercase

            drives = [f"{letter}:\\" for letter in ascii_uppercase if Path(f"{letter}:\\").exists()]
            return {"path": "", "parent": None, "dirs": drives}
        home = Path.home()
        return {"path": str(home), "parent": str(home.parent), "dirs": _child_dirs(home)}
    folder = Path(raw)
    if not folder.exists() or not folder.is_dir():
        raise FileNotFoundError(raw)
    parent = None if folder.parent == folder else str(folder.parent)
    return {"path": str(folder), "parent": parent, "dirs": _child_dirs(folder)}


def _child_dirs(folder: Path) -> list[str]:
    names = []
    try:
        for child in sorted(folder.iterdir(), key=lambda item: item.name.lower()):
            if child.is_dir() and not child.name.startswith("."):
                names.append(str(child))
    except OSError:
        return []
    return names
