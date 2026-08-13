from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from ..database import UPLOAD_DIR, get_db
from ..models import Exam, ExamSheet, ExamSubjectMap, OmrLayout, Subject
from ..omr.generator import generate_sheet
from ..omr.processor import evaluate_image, load_image, parse_layout, save_image
from ..schemas import AnswerKeyIn, ExamIn, ExamOut, SheetOut, SubjectMapOut
from ..scoring import build_analytics, score_sheet

router = APIRouter(prefix="/api/exams", tags=["exams"])


def _exam_out(exam: Exam) -> ExamOut:
    maps = []
    for mapping in exam.subject_maps:
        maps.append(
            SubjectMapOut(
                id=mapping.id,
                subject_id=mapping.subject_id,
                start_q=mapping.start_q,
                end_q=mapping.end_q,
                subject_name=mapping.subject.name if mapping.subject else "",
            )
        )
    sheets = exam.sheets or []
    return ExamOut(
        id=exam.id,
        name=exam.name,
        exam_date=exam.exam_date,
        exam_type=exam.exam_type,
        duration_minutes=exam.duration_minutes,
        correct_marks=exam.correct_marks,
        wrong_marks=exam.wrong_marks,
        unattempted_marks=exam.unattempted_marks,
        layout_id=exam.layout_id,
        layout_name=exam.layout.name if exam.layout else "",
        status=exam.status,
        created_at=exam.created_at,
        subject_maps=maps,
        answer_key=json.loads(exam.answer_key_json or "{}"),
        sheet_count=len(sheets),
        evaluated_count=sum(1 for s in sheets if s.status in ("evaluated", "unmatched")),
    )


def _load_exam(db: Session, exam_id: int) -> Exam:
    exam = (
        db.query(Exam)
        .options(
            joinedload(Exam.layout),
            joinedload(Exam.subject_maps).joinedload(ExamSubjectMap.subject),
            joinedload(Exam.sheets).joinedload(ExamSheet.student),
            joinedload(Exam.sheets).joinedload(ExamSheet.question_results),
        )
        .filter(Exam.id == exam_id)
        .one_or_none()
    )
    if not exam:
        raise HTTPException(404, "Exam not found")
    return exam


@router.get("", response_model=list[ExamOut])
def list_exams(db: Session = Depends(get_db)):
    exams = db.query(Exam).options(joinedload(Exam.layout), joinedload(Exam.sheets), joinedload(Exam.subject_maps).joinedload(ExamSubjectMap.subject)).order_by(Exam.id.desc()).all()
    return [_exam_out(exam) for exam in exams]


@router.post("", response_model=ExamOut)
def create_exam(payload: ExamIn, db: Session = Depends(get_db)):
    layout = db.get(OmrLayout, payload.layout_id)
    if not layout:
        raise HTTPException(400, "Layout not found")
    exam = Exam(
        name=payload.name,
        exam_date=payload.exam_date,
        exam_type=payload.exam_type,
        duration_minutes=payload.duration_minutes,
        correct_marks=payload.correct_marks,
        wrong_marks=payload.wrong_marks,
        unattempted_marks=payload.unattempted_marks,
        layout_id=payload.layout_id,
        answer_key_json=json.dumps(payload.answer_key),
        status="draft",
    )
    db.add(exam)
    db.flush()
    maps = [
        {"subject_id": m.subject_id, "start_q": m.start_q, "end_q": m.end_q}
        for m in payload.subject_maps
    ]
    if not maps:
        preview = json.loads(layout.config_json).get("default_maps", [])
        by_name = {s.name: s for s in db.query(Subject).all()}
        for item in preview:
            subject = by_name.get(item["subject"])
            if subject:
                maps.append(
                    {
                        "subject_id": subject.id,
                        "start_q": item["start_q"],
                        "end_q": item["end_q"],
                    }
                )
    for mapping in maps:
        db.add(
            ExamSubjectMap(
                exam_id=exam.id,
                subject_id=mapping["subject_id"],
                start_q=mapping["start_q"],
                end_q=mapping["end_q"],
            )
        )
    db.commit()
    return _exam_out(_load_exam(db, exam.id))


@router.get("/{exam_id}", response_model=ExamOut)
def get_exam(exam_id: int, db: Session = Depends(get_db)):
    return _exam_out(_load_exam(db, exam_id))


@router.put("/{exam_id}/answer-key", response_model=ExamOut)
def set_answer_key(exam_id: int, payload: AnswerKeyIn, db: Session = Depends(get_db)):
    exam = _load_exam(db, exam_id)
    key = payload.answer_key or {}
    if payload.key_string:
        letters = [ch.upper() for ch in payload.key_string if ch.upper() in "ABCD"]
        key = {str(i + 1): letter for i, letter in enumerate(letters)}
    exam.answer_key_json = json.dumps(key)
    db.commit()
    return _exam_out(_load_exam(db, exam_id))


@router.post("/{exam_id}/sheets", response_model=list[SheetOut])
async def upload_sheets(exam_id: int, files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    exam = _load_exam(db, exam_id)
    saved = []
    dest_dir = UPLOAD_DIR / f"exam-{exam.id}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    for upload in files:
        suffix = Path(upload.filename or "sheet.png").suffix or ".png"
        stored = dest_dir / f"{uuid4().hex}{suffix}"
        stored.write_bytes(await upload.read())
        sheet = ExamSheet(
            exam_id=exam.id,
            filename=upload.filename or stored.name,
            stored_path=str(stored),
            status="uploaded",
        )
        db.add(sheet)
        db.commit()
        db.refresh(sheet)
        saved.append(_sheet_out(sheet))
    return saved


def _sheet_out(sheet: ExamSheet) -> SheetOut:
    return SheetOut(
        id=sheet.id,
        exam_id=sheet.exam_id,
        student_id=sheet.student_id,
        student_name=sheet.student.name if sheet.student else "",
        filename=sheet.filename,
        status=sheet.status,
        detected_roll=sheet.detected_roll,
        error_message=sheet.error_message,
        raw_score=sheet.raw_score,
        max_score=sheet.max_score,
        right_count=sheet.right_count,
        wrong_count=sheet.wrong_count,
        left_count=sheet.left_count,
        invalid_count=sheet.invalid_count,
    )


@router.get("/{exam_id}/sheets", response_model=list[SheetOut])
def list_sheets(exam_id: int, db: Session = Depends(get_db)):
    exam = _load_exam(db, exam_id)
    return [_sheet_out(sheet) for sheet in exam.sheets]


@router.post("/{exam_id}/evaluate")
def evaluate_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = _load_exam(db, exam_id)
    key = json.loads(exam.answer_key_json or "{}")
    if not key:
        raise HTTPException(400, "Set an answer key before evaluating")
    layout = parse_layout(exam.layout.config_json)
    evaluated = 0
    errors = []
    for sheet in exam.sheets:
        try:
            image = load_image(sheet.stored_path)
            result = evaluate_image(image, layout)
            overlay_path = str(Path(sheet.stored_path).with_name(f"overlay-{sheet.id}.png"))
            save_image(overlay_path, result["overlay"])
            sheet.overlay_path = overlay_path
            score_sheet(db, exam, sheet, result["answers"], result["roll"])
            evaluated += 1
        except Exception as exc:  # noqa: BLE001
            sheet.status = "error"
            sheet.error_message = str(exc)
            errors.append({"sheet_id": sheet.id, "error": str(exc)})
    if exam.status != "published":
        exam.status = "evaluated"
    db.commit()
    return {"evaluated": evaluated, "errors": errors}


@router.post("/{exam_id}/publish")
def publish_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = _load_exam(db, exam_id)
    if exam.status not in ("evaluated", "published"):
        raise HTTPException(400, "Evaluate sheets before publishing")
    exam.status = "published"
    db.commit()
    return {"status": "published"}


@router.get("/{exam_id}/results")
def exam_results(exam_id: int, db: Session = Depends(get_db)):
    exam = _load_exam(db, exam_id)
    return build_analytics(exam)


@router.get("/{exam_id}/sheets/{sheet_id}/overlay")
def sheet_overlay(exam_id: int, sheet_id: int, db: Session = Depends(get_db)):
    sheet = db.get(ExamSheet, sheet_id)
    if not sheet or sheet.exam_id != exam_id or not sheet.overlay_path:
        raise HTTPException(404, "Overlay not found")
    return FileResponse(sheet.overlay_path)


@router.post("/{exam_id}/sample-sheet")
def make_sample_sheet(
    exam_id: int,
    roll: str = Form(...),
    answers: str = Form(""),
    db: Session = Depends(get_db),
):
    exam = _load_exam(db, exam_id)
    layout = parse_layout(exam.layout.config_json)
    key = json.loads(exam.answer_key_json or "{}")
    parsed: dict[int, str] = {}
    if answers:
        letters = [ch.upper() for ch in answers if ch.upper() in "ABCD"]
        parsed = {i + 1: letter for i, letter in enumerate(letters)}
    elif key:
        parsed = {int(k): v for k, v in key.items()}
    image = generate_sheet(layout, roll, parsed)
    dest = UPLOAD_DIR / f"exam-{exam.id}" / f"sample-{uuid4().hex}.png"
    save_image(dest, image)
    sheet = ExamSheet(exam_id=exam.id, filename=dest.name, stored_path=str(dest), status="uploaded")
    db.add(sheet)
    db.commit()
    db.refresh(sheet)
    return _sheet_out(sheet)
