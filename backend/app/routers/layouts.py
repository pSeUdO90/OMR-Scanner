import json
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import UPLOAD_DIR, get_db
from ..models import Exam, OmrLayout
from ..omr.analyze import analyze_layout_config, classify_sample_image
from ..omr.layouts import RETIRED_LAYOUT_SLUGS, custom_grid_layout, layout_preview
from ..omr.processor import load_image
from ..omr.sample_file import sample_to_image_bytes
from ..schemas import LayoutOut

router = APIRouter(prefix="/api/layouts", tags=["layouts"])


def _layout_out(row: OmrLayout, *, with_image: bool = False, image=None) -> LayoutOut:
    config = json.loads(row.config_json)
    item = LayoutOut.model_validate(row)
    item.preview = layout_preview(config)
    item.has_sample = bool(getattr(row, "sample_path", ""))
    item.field_map = json.loads(getattr(row, "field_map_json", None) or "{}")
    img = image
    if img is None and with_image and item.has_sample and Path(row.sample_path).exists():
        try:
            img = load_image(row.sample_path)
        except Exception:
            img = None
    item.analysis = analyze_layout_config(config, img)
    return item


@router.get("", response_model=list[LayoutOut])
def list_layouts(db: Session = Depends(get_db)):
    return [_layout_out(row) for row in db.query(OmrLayout).filter(~OmrLayout.slug.in_(RETIRED_LAYOUT_SLUGS)).order_by(OmrLayout.id).all()]


@router.get("/{layout_id}", response_model=LayoutOut)
def get_layout(layout_id: int, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row:
        raise HTTPException(404, "Layout not found")
    return _layout_out(row, with_image=True)


def _store_sample(slug: str, filename: str, raw: bytes) -> str:
    image_bytes, suffix = sample_to_image_bytes(filename, raw)
    dest_dir = UPLOAD_DIR / "layouts"
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored = dest_dir / f"{slug}-{uuid4().hex[:8]}{suffix}"
    stored.write_bytes(image_bytes)
    return str(stored)


def _subject_maps_from_form(raw: str, total_questions: int) -> list[dict]:
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        data = []
    maps = []
    for item in data if isinstance(data, list) else []:
        name = str(item.get("subject") or item.get("subject_name") or "").strip()
        if not name:
            continue
        start_q = int(item.get("start_q") or 1)
        end_q = int(item.get("end_q") or total_questions)
        maps.append(
            {
                "subject": name,
                "code": str(item.get("code") or name[:3].upper()),
                "start_q": start_q,
                "end_q": max(start_q, end_q),
            }
        )
    return maps or [{"subject": "Paper", "code": "PAP", "start_q": 1, "end_q": total_questions}]


@router.post("", response_model=LayoutOut)
async def create_layout(
    name: str = Form(...),
    description: str = Form(""),
    total_questions: int = Form(...),
    columns: int = Form(4),
    options: str = Form("ABCD"),
    subject_maps: str = Form("[]"),
    sample: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    raw = await sample.read()
    if not raw:
        raise HTTPException(400, "PDF/JPG of the sample OMR must be uploaded")
    slug_base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "custom-layout"
    slug = slug_base
    n = 2
    while db.query(OmrLayout).filter(OmrLayout.slug == slug).first():
        slug = f"{slug_base}-{n}"
        n += 1
    try:
        sample_path = _store_sample(slug, sample.filename or "sample.jpg", raw)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    config = custom_grid_layout(
        name=name,
        slug=slug,
        total_questions=total_questions,
        columns=columns,
        options="".join(ch for ch in options.upper() if ch in "ABCDEF") or "ABCD",
        description=description,
        default_maps=_subject_maps_from_form(subject_maps, total_questions),
    )
    sample_image = None
    try:
        sample_image = load_image(sample_path)
        config, _ = classify_sample_image(sample_image, config)
    except Exception:
        sample_image = None
    row = OmrLayout(
        slug=slug,
        name=name,
        description=description or config["description"],
        total_questions=config["total_questions"],
        options=config["options"],
        config_json=json.dumps(config),
        is_builtin=False,
        sample_path=sample_path,
        field_map_json=json.dumps({"date": "exam_date", "test_id": "test_id", "test_no": "test_no"}),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _layout_out(row, with_image=True, image=sample_image)


@router.put("/{layout_id}", response_model=LayoutOut)
async def update_layout(
    layout_id: int,
    name: str = Form(...),
    description: str = Form(""),
    total_questions: int = Form(...),
    columns: int = Form(4),
    options: str = Form("ABCD"),
    subject_maps: str = Form("[]"),
    sample: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    row = db.get(OmrLayout, layout_id)
    if not row:
        raise HTTPException(404, "Layout not found")
    row.name = name
    row.description = description or row.description
    maps = _subject_maps_from_form(subject_maps, total_questions)
    previous = json.loads(row.config_json)
    if not row.is_builtin:
        config = custom_grid_layout(
            name=name,
            slug=row.slug,
            total_questions=total_questions,
            columns=columns,
            options="".join(ch for ch in options.upper() if ch in "ABCDEF") or "ABCD",
            description=description,
            default_maps=maps,
        )
        for key in ("roll", "test_no", "test_id", "date", "name", "detected_answer_columns"):
            if key in previous:
                config[key] = previous[key]
        row.total_questions = config["total_questions"]
        row.options = config["options"]
        row.config_json = json.dumps(config)
    else:
        config = json.loads(row.config_json)
        config["name"] = name
        config["description"] = row.description
        config["default_maps"] = maps
        row.config_json = json.dumps(config)
    sample_image = None
    if sample and sample.filename:
        raw = await sample.read()
        if raw:
            try:
                row.sample_path = _store_sample(row.slug, sample.filename, raw)
                sample_image = load_image(row.sample_path)
                config, _ = classify_sample_image(sample_image, json.loads(row.config_json))
                row.config_json = json.dumps(config)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            except Exception:
                sample_image = None
    db.commit()
    db.refresh(row)
    return _layout_out(row, with_image=True, image=sample_image)


@router.post("/{layout_id}/field-map")
def save_field_map(layout_id: int, payload: dict, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row:
        raise HTTPException(404, "Layout not found")
    mapping = payload.get("field_map") or payload
    row.field_map_json = json.dumps(mapping)
    db.commit()
    return {"ok": True, "field_map": mapping}


@router.delete("/{layout_id}")
def delete_layout(layout_id: int, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row:
        raise HTTPException(404, "Layout not found")
    used = db.query(Exam).filter(Exam.layout_id == layout_id).first()
    if used:
        raise HTTPException(409, "Layout Associated with Exam. Cannot be Deleted")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/{layout_id}/sample")
def layout_sample(layout_id: int, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row or not getattr(row, "sample_path", "") or not Path(row.sample_path).exists():
        raise HTTPException(404, "No sample OMR uploaded for this layout")
    return FileResponse(row.sample_path)
