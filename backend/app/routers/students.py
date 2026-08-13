from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Student
from ..schemas import StudentIn, StudentOut
from ..xlsx_io import parse_students_xlsx, students_template_bytes

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("", response_model=list[StudentOut])
def list_students(db: Session = Depends(get_db)):
    return db.query(Student).order_by(Student.roll_no).all()


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


@router.post("/import")
def import_students(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = file.file.read()
    try:
        rows = parse_students_xlsx(content)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    created = updated = 0
    for row in rows:
        existing = db.query(Student).filter(Student.roll_no == row["roll_no"]).one_or_none()
        if existing:
            for key, value in row.items():
                setattr(existing, key, value)
            updated += 1
        else:
            db.add(Student(**row))
            created += 1
    db.commit()
    return {"created": created, "updated": updated, "total": created + updated}
