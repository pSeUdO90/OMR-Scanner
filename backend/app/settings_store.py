from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

from .database import DATA_DIR
from .models import AppSettings, Exam

DEFAULT_PROCESSED_DIR = DATA_DIR / "processed"


def get_settings(db: Session) -> AppSettings:
    row = db.query(AppSettings).order_by(AppSettings.id).first()
    if row is None:
        row = AppSettings(processed_images_dir=str(DEFAULT_PROCESSED_DIR))
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
