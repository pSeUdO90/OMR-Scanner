import json
import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image
from sqlalchemy.orm import Session

from ..database import UPLOAD_DIR, get_db
from ..models import Exam, OmrLayout
from ..omr.analyze import analyze_layout_config, analysis_from_blocks
from ..omr.generator import generate_designed_sheet
from ..omr.layouts import (
    RETIRED_LAYOUT_SLUGS,
    a4_design_layout,
    apply_blocks_to_config,
    custom_grid_layout,
    layout_preview,
    predefined_a4_blocks,
)
from ..omr.processor import load_image, save_image
from ..omr.sample_file import sample_to_image_bytes
from ..schemas import LayoutDesignIn, LayoutOut, StudioLayoutIn

router = APIRouter(prefix="/api/layouts", tags=["layouts"])


def _layout_out(row: OmrLayout, *, with_image: bool = False, image=None) -> LayoutOut:
    config = json.loads(row.config_json)
    item = LayoutOut.model_validate(row)
    item.preview = layout_preview(config)
    item.has_sample = bool(getattr(row, "sample_path", ""))
    item.field_map = json.loads(getattr(row, "field_map_json", None) or "{}")
    item.blocks = config.get("blocks") or []
    img = image
    if img is None and with_image and item.has_sample and Path(row.sample_path).exists():
        try:
            img = load_image(row.sample_path)
        except Exception:
            img = None
    if item.blocks:
        item.analysis = analysis_from_blocks(config, img)
    else:
        item.analysis = analyze_layout_config(config, None)
    return item


def _unique_slug(db: Session, name: str) -> str:
    slug_base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "custom-layout"
    slug = slug_base
    n = 2
    while db.query(OmrLayout).filter(OmrLayout.slug == slug).first():
        slug = f"{slug_base}-{n}"
        n += 1
    return slug


def _write_designed_sample(slug: str, config: dict) -> str:
    image = generate_designed_sheet(config)
    dest_dir = UPLOAD_DIR / "layouts"
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored = dest_dir / f"{slug}-a4-{uuid4().hex[:8]}.jpg"
    save_image(stored, image)
    return str(stored)


@router.get("", response_model=list[LayoutOut])
def list_layouts(db: Session = Depends(get_db)):
    return [_layout_out(row) for row in db.query(OmrLayout).filter(~OmrLayout.slug.in_(RETIRED_LAYOUT_SLUGS)).order_by(OmrLayout.id).all()]


@router.get("/predefined-blocks")
def get_predefined_blocks(total_questions: int = 100, columns: int = 4, options: str = "ABCD", roll_cols: int = 8):
    return {
        "page_width": 1654,
        "page_height": 2339,
        "page_width_mm": 210,
        "page_height_mm": 297,
        "blocks": predefined_a4_blocks(
            total_questions=total_questions,
            columns=columns,
            options=options,
            roll_cols=roll_cols,
        ),
    }


@router.post("/studio", response_model=LayoutOut)
def save_studio_layout(payload: StudioLayoutIn, db: Session = Depends(get_db)):
    slug = _unique_slug(db, payload.name)
    options = "".join(ch for ch in payload.options.upper() if ch in "ABCDEF") or "ABCD"
    columns = max(1, min(6, int((payload.config or {}).get("questionColumns") or 4)))
    roll_cols = max(4, min(12, int((payload.config or {}).get("rollCols") or 8)))
    maps = [{"subject": "Paper", "code": "PAP", "start_q": 1, "end_q": payload.total_questions}]
    config = a4_design_layout(
        name=payload.name,
        slug=slug,
        total_questions=payload.total_questions,
        columns=columns,
        options=options,
        description=payload.description,
        default_maps=maps,
        roll_cols=roll_cols,
    )
    config["studio"] = True
    config["studio_config"] = payload.config
    config["studio_geometry"] = payload.geometry
    config["studio_blocks"] = payload.blocks
    config["studio_mapping"] = payload.mapping
    sample_path = _write_designed_sample(slug, config)
    row = OmrLayout(
        slug=slug,
        name=payload.name,
        description=payload.description or config["description"],
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
    return _layout_out(row, with_image=True)


@router.post("/design", response_model=LayoutOut)
def create_designed_layout(payload: LayoutDesignIn, db: Session = Depends(get_db)):
    slug = _unique_slug(db, payload.name)
    options = "".join(ch for ch in payload.options.upper() if ch in "ABCDEF") or "ABCD"
    maps = _subject_maps_from_form(json.dumps(payload.subject_maps), payload.total_questions)
    config = a4_design_layout(
        name=payload.name,
        slug=slug,
        total_questions=payload.total_questions,
        columns=payload.columns,
        options=options,
        description=payload.description,
        default_maps=maps,
        roll_cols=payload.roll_cols,
        blocks=payload.blocks,
        school_name=payload.school_name,
    )
    sample_path = _write_designed_sample(slug, config)
    mapping = {
        block["kind"]: block.get("map_to") or ""
        for block in config.get("blocks") or []
        if block["kind"] in ("date", "test_id", "test_no")
    }
    row = OmrLayout(
        slug=slug,
        name=payload.name,
        description=payload.description or config["description"],
        total_questions=config["total_questions"],
        options=config["options"],
        config_json=json.dumps(config),
        is_builtin=False,
        sample_path=sample_path,
        field_map_json=json.dumps(mapping or {"date": "exam_date", "test_id": "test_id", "test_no": "test_no"}),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _layout_out(row, with_image=True)


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
    slug = _unique_slug(db, name)
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
        for key in ("roll", "test_no", "test_id", "date", "name", "blocks", "questions", "designed", "school_name", "page_width_mm", "page_height_mm", "answer_columns"):
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
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            except Exception:
                sample_image = None
    db.commit()
    db.refresh(row)
    return _layout_out(row, with_image=True, image=sample_image)


@router.post("/{layout_id}/blocks", response_model=LayoutOut)
def save_layout_blocks(layout_id: int, payload: dict, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row:
        raise HTTPException(404, "Layout not found")
    config = json.loads(row.config_json)
    blocks = payload.get("blocks")
    if not isinstance(blocks, list):
        raise HTTPException(400, "blocks must be a list of mapped regions")
    config = apply_blocks_to_config(config, blocks)
    row.config_json = json.dumps(config)
    row.total_questions = int(config.get("total_questions") or row.total_questions)
    mapping = payload.get("field_map")
    if mapping is None:
        mapping = {
            block["kind"]: block.get("map_to") or ""
            for block in config.get("blocks") or []
            if block["kind"] in ("date", "test_id", "test_no")
        }
    row.field_map_json = json.dumps(mapping)
    if config.get("designed"):
        row.sample_path = _write_designed_sample(row.slug, config)
    db.commit()
    db.refresh(row)
    return _layout_out(row, with_image=True)


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


def _blank_sheet_image(row: OmrLayout):
    config = json.loads(row.config_json)
    return generate_designed_sheet(config)


@router.get("/{layout_id}/blank-sheet")
def layout_blank_sheet(layout_id: int, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row:
        raise HTTPException(404, "Layout not found")
    image = _blank_sheet_image(row)
    dest = UPLOAD_DIR / "layouts" / f"{row.slug}-blank.jpg"
    save_image(dest, image)
    return FileResponse(dest, media_type="image/jpeg", filename=f"{row.slug}-a4-omr.jpg")


@router.get("/{layout_id}/blank-sheet.pdf")
def layout_blank_sheet_pdf(layout_id: int, db: Session = Depends(get_db)):
    row = db.get(OmrLayout, layout_id)
    if not row:
        raise HTTPException(404, "Layout not found")
    image = _blank_sheet_image(row)
    rgb = image[:, :, ::-1]
    buf = BytesIO()
    Image.fromarray(rgb).save(buf, format="PDF", resolution=200)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{row.slug}-a4-omr.pdf"'},
    )
