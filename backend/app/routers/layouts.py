import json
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import UPLOAD_DIR, get_db
from ..models import OmrLayout
from ..omr.layouts import custom_grid_layout, layout_preview
from ..omr.sample_file import sample_to_image_bytes
from ..schemas import LayoutOut

router = APIRouter(prefix="/api/layouts", tags=["layouts"])


def _layout_out(row: OmrLayout) -> LayoutOut:
    item = LayoutOut.model_validate(row)
    item.preview = layout_preview(json.loads(row.config_json))
    item.has_sample = bool(getattr(row, "sample_path", ""))
    return item


@router.get("", response_model=list[LayoutOut])
def list_layouts(db: Session = Depends(get_db)):
    return [_layout_out(row) for row in db.query(OmrLayout).order_by(OmrLayout.id).all()]


@router.post("", response_model=LayoutOut)
async def create_layout(
    name: str = Form(...),
    description: str = Form(""),
    total_questions: int = Form(...),
    columns: int = Form(4),
    options: str = Form("ABCD"),
    sample: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    raw = await sample.read()
    if not raw:
        raise HTTPException(400, "PDF/JPG of the sample OMR must be uploaded")
    try:
        image_bytes, suffix = sample_to_image_bytes(sample.filename or "sample.jpg", raw)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    slug_base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "custom-layout"
    slug = slug_base
    n = 2
    while db.query(OmrLayout).filter(OmrLayout.slug == slug).first():
        slug = f"{slug_base}-{n}"
        n += 1
    config = custom_grid_layout(
        name=name,
        slug=slug,
        total_questions=total_questions,
        columns=columns,
        options="".join(ch for ch in options.upper() if ch in "ABCDEF") or "ABCD",
        description=description,
    )
    dest_dir = UPLOAD_DIR / "layouts"
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored = dest_dir / f"{slug}-{uuid4().hex[:8]}{suffix}"
    stored.write_bytes(image_bytes)
    row = OmrLayout(
        slug=slug,
        name=name,
        description=description or config["description"],
        total_questions=config["total_questions"],
        options=config["options"],
        config_json=json.dumps(config),
        is_builtin=False,
        sample_path=str(stored),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _layout_out(row)


@router.get("/{layout_id}/sample")
def layout_sample(layout_id: int, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row or not getattr(row, "sample_path", "") or not Path(row.sample_path).exists():
        raise HTTPException(404, "No sample OMR uploaded for this layout")
    return FileResponse(row.sample_path)
