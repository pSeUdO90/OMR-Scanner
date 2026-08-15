from __future__ import annotations

import json

from sqlalchemy.orm import Session

from .models import AppUser, Exam, OmrLayout, Subject
from .omr.layouts import BUILTIN_LAYOUTS, RETIRED_LAYOUT_SLUGS, gyana_vikash_180
from .security import hash_password


def seed_reference_data(db: Session) -> None:
    leftover_exams = db.query(Exam).filter(Exam.name == "Process OMR Exam").all()
    for exam in leftover_exams:
        db.delete(exam)
    if leftover_exams:
        db.commit()
    leftover_layout = db.query(OmrLayout).filter(OmrLayout.slug == "process-omr-layout").one_or_none()
    if leftover_layout and db.query(Exam).filter(Exam.layout_id == leftover_layout.id).first() is None:
        db.delete(leftover_layout)
        db.commit()

    if db.query(Subject).count() == 0:
        for name, code in (
            ("Physics", "PHY"),
            ("Chemistry", "CHE"),
            ("Biology", "BIO"),
            ("Mathematics", "MAT"),
            ("English", "ENG"),
            ("Paper", "PAP"),
        ):
            db.add(Subject(name=name, code=code))
        db.commit()

    for slug in RETIRED_LAYOUT_SLUGS:
        row = db.query(OmrLayout).filter(OmrLayout.slug == slug).one_or_none()
        if not row:
            continue
        used = db.query(Exam).filter(Exam.layout_id == row.id).first()
        if used:
            row.is_builtin = False
            continue
        db.delete(row)
    db.commit()

    existing = {row.slug for row in db.query(OmrLayout).all()}
    for layout in BUILTIN_LAYOUTS:
        if layout["slug"] in existing:
            continue
        db.add(
            OmrLayout(
                slug=layout["slug"],
                name=layout["name"],
                description=layout["description"],
                total_questions=layout["total_questions"],
                options=layout["options"],
                config_json=json.dumps(layout),
                is_builtin=True,
                is_finalized=True,
            )
        )
    db.commit()

    calibrated_roll = gyana_vikash_180()["roll"]
    for row in db.query(OmrLayout).all():
        cfg = json.loads(row.config_json or "{}")
        if int(cfg.get("total_questions") or 0) != 180:
            continue
        if int((cfg.get("roll") or {}).get("cols") or 0) == 8:
            continue
        cfg["roll"] = calibrated_roll
        row.config_json = json.dumps(cfg)
    db.commit()

    if db.query(AppUser).filter(AppUser.username == "admin").one_or_none() is None:
        db.add(
            AppUser(
                username="admin",
                password_hash=hash_password("admin"),
                display_name="Administrator",
                role="admin",
                is_active=True,
            )
        )
        db.commit()
