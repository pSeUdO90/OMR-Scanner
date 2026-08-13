from __future__ import annotations

import json

from sqlalchemy.orm import Session

from .models import OmrLayout, Subject
from .omr.layouts import BUILTIN_LAYOUTS


def seed_reference_data(db: Session) -> None:
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
            )
        )
    db.commit()
