from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import Exam, ExamSheet, ExamSubjectMap, Student
from ..schemas import StudentIn, StudentOut
from ..scoring import rwl_bucket
from ..xlsx_io import parse_students_xlsx, students_template_bytes

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("", response_model=list[StudentOut])
def list_students(db: Session = Depends(get_db)):
    return db.query(Student).order_by(Student.roll_no).all()


@router.get("/options")
def student_field_options(db: Session = Depends(get_db)):
    rows = db.query(Student.class_name, Student.section, Student.session).all()
    classes: set[str] = set()
    sections: set[str] = set()
    batches: set[str] = set()
    per_class: dict[str, dict[str, set[str]]] = {}
    for class_name, section, session in rows:
        if section:
            sections.add(section)
        if session:
            batches.add(session)
        if not class_name:
            continue
        classes.add(class_name)
        bucket = per_class.setdefault(class_name, {"sections": set(), "batches": set()})
        if section:
            bucket["sections"].add(section)
        if session:
            bucket["batches"].add(session)
    return {
        "classes": sorted(classes),
        "sections": sorted(sections),
        "batches": sorted(batches),
        "by_class": {
            cls: {
                "sections": sorted(per_class[cls]["sections"]),
                "batches": sorted(per_class[cls]["batches"]),
            }
            for cls in sorted(classes)
        },
    }


@router.post("", response_model=StudentOut)
def create_student(payload: StudentIn, db: Session = Depends(get_db)):
    if db.query(Student).filter(Student.roll_no == payload.roll_no).first():
        raise HTTPException(400, "Roll number already exists")
    student = Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.put("/{student_id}", response_model=StudentOut)
def update_student(student_id: int, payload: StudentIn, db: Session = Depends(get_db)):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(404, "Student not found")
    taken = db.query(Student).filter(Student.roll_no == payload.roll_no, Student.id != student_id).first()
    if taken:
        raise HTTPException(400, "Roll number already exists")
    for key, value in payload.model_dump().items():
        setattr(student, key, value)
    db.commit()
    db.refresh(student)
    return student


@router.delete("/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(404, "Student not found")
    db.delete(student)
    db.commit()
    return {"ok": True}


@router.get("/template.xlsx")
def download_template():
    data = students_template_bytes()
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=students_template.xlsx"},
    )


def _students_by_roll(db: Session, rolls: list[str]) -> dict[str, Student]:
    """Look up students for many roll numbers without one query per row."""
    unique = list({roll for roll in rolls if roll})
    found: dict[str, Student] = {}
    chunk = 400
    for start in range(0, len(unique), chunk):
        batch = unique[start : start + chunk]
        for student in db.query(Student).filter(Student.roll_no.in_(batch)).all():
            found[student.roll_no] = student
    return found


@router.post("/import/preview")
def preview_student_import(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = file.file.read()
    try:
        rows = parse_students_xlsx(content)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    existing = []
    new = []
    found_by_roll = _students_by_roll(db, [row["roll_no"] for row in rows])
    for row in rows:
        found = found_by_roll.get(row["roll_no"])
        if found:
            existing.append({**row, "id": found.id, "current_name": found.name})
        else:
            new.append(row)
    return {"new": new, "existing": existing, "total": len(rows)}


@router.post("/import")
def import_students(
    file: UploadFile = File(...),
    on_conflict: str = Query("update"),
    db: Session = Depends(get_db),
):
    content = file.file.read()
    try:
        rows = parse_students_xlsx(content)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if on_conflict not in ("update", "skip"):
        raise HTTPException(400, "on_conflict must be update or skip")
    created = updated = skipped = 0
    for row in rows:
        existing = db.query(Student).filter(Student.roll_no == row["roll_no"]).one_or_none()
        if existing:
            if on_conflict == "skip":
                skipped += 1
                continue
            for key, value in row.items():
                setattr(existing, key, value)
            updated += 1
        else:
            db.add(Student(**row))
            created += 1
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "total": created + updated + skipped}


@router.get("/{student_id}", response_model=StudentOut)
def get_student(student_id: int, db: Session = Depends(get_db)):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(404, "Student not found")
    return student


@router.get("/{student_id}/results")
def student_results(student_id: int, db: Session = Depends(get_db)):
    student = (
        db.query(Student)
        .options(
            selectinload(Student.sheets).joinedload(ExamSheet.exam).joinedload(Exam.layout),
            selectinload(Student.sheets)
            .joinedload(ExamSheet.exam)
            .selectinload(Exam.subject_maps)
            .joinedload(ExamSubjectMap.subject),
            selectinload(Student.sheets).selectinload(ExamSheet.question_results),
        )
        .filter(Student.id == student_id)
        .one_or_none()
    )
    if not student:
        raise HTTPException(404, "Student not found")
    history = []
    for sheet in student.sheets:
        if sheet.status not in ("evaluated", "unmatched"):
            continue
        exam = sheet.exam
        qrows = sheet.question_results
        subjects = []
        for mapping in sorted(exam.subject_maps, key=lambda m: m.start_q):
            subset = [r for r in qrows if mapping.start_q <= r.question_no <= mapping.end_q]
            subjects.append(
                rwl_bucket(subset, exam, mapping.subject.name, mapping.subject_id, mapping.start_q, mapping.end_q)
            )
        total_q = exam.layout.total_questions if exam.layout else len(qrows)
        overall = rwl_bucket(qrows, exam, "Overall", None, 1, total_q)
        pct = (sheet.raw_score / sheet.max_score * 100) if sheet.max_score else 0
        history.append(
            {
                "exam_id": exam.id,
                "exam_name": exam.name,
                "exam_date": str(exam.exam_date),
                "exam_type": exam.exam_type,
                "test_id": getattr(exam, "test_id", "") or "",
                "test_no": getattr(exam, "test_no", "") or "",
                "status": exam.status,
                "right": sheet.right_count,
                "wrong": sheet.wrong_count,
                "left": sheet.left_count,
                "invalid": sheet.invalid_count,
                "score": sheet.raw_score,
                "max_score": sheet.max_score,
                "percentage": round(pct, 2),
                "overall_rwl": overall,
                "subjects": subjects,
            }
        )
    history.sort(key=lambda row: row["exam_date"], reverse=True)
    return {
        "student": StudentOut.model_validate(student).model_dump(),
        "exams": history,
    }
