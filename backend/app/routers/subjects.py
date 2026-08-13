from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ExamSubjectMap, Subject
from ..schemas import SubjectIn, SubjectOut

router = APIRouter(prefix="/api/subjects", tags=["subjects"])

ASSOCIATED_MESSAGE = "Subject Associated with Exam. Cannot be Deleted"


@router.get("", response_model=list[SubjectOut])
def list_subjects(db: Session = Depends(get_db)):
    return db.query(Subject).order_by(Subject.name).all()


@router.post("", response_model=SubjectOut)
def create_subject(payload: SubjectIn, db: Session = Depends(get_db)):
    if db.query(Subject).filter(Subject.name == payload.name).first():
        raise HTTPException(400, "Subject already exists")
    subject = Subject(**payload.model_dump())
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.delete("/{subject_id}")
def delete_subject(subject_id: int, db: Session = Depends(get_db)):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(404, "Subject not found")
    attached = db.query(ExamSubjectMap).filter(ExamSubjectMap.subject_id == subject_id).first()
    if attached:
        raise HTTPException(409, ASSOCIATED_MESSAGE)
    db.delete(subject)
    db.commit()
    return {"ok": True}
