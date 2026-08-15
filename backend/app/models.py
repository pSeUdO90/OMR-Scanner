from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class AppUser(Base):
    __tablename__ = "app_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(160), default="")
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    token: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    user: Mapped[AppUser] = relationship(back_populates="sessions")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    processed_images_dir: Mapped[str] = mapped_column(String(500), default="")
    role_permissions_json: Mapped[str] = mapped_column(Text, default="{}")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    roll_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    gender: Mapped[str] = mapped_column(String(20), default="")
    class_name: Mapped[str] = mapped_column(String(40), default="")
    section: Mapped[str] = mapped_column(String(20), default="")
    session: Mapped[str] = mapped_column(String(40), default="")

    sheets: Mapped[list["ExamSheet"]] = relationship(back_populates="student")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    code: Mapped[str] = mapped_column(String(20), default="")

    mappings: Mapped[list["ExamSubjectMap"]] = relationship(back_populates="subject")


class OmrLayout(Base):
    __tablename__ = "omr_layouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    total_questions: Mapped[int] = mapped_column(Integer)
    options: Mapped[str] = mapped_column(String(20), default="ABCD")
    config_json: Mapped[str] = mapped_column(Text)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=True)
    sample_path: Mapped[str] = mapped_column(String(500), default="")
    field_map_json: Mapped[str] = mapped_column(Text, default="{}")
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=True)


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    exam_date: Mapped[date] = mapped_column(Date)
    exam_type: Mapped[str] = mapped_column(String(80))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=180)
    correct_marks: Mapped[float] = mapped_column(Float, default=4.0)
    wrong_marks: Mapped[float] = mapped_column(Float, default=-1.0)
    unattempted_marks: Mapped[float] = mapped_column(Float, default=0.0)
    layout_id: Mapped[int] = mapped_column(ForeignKey("omr_layouts.id"))
    answer_key_json: Mapped[str] = mapped_column(Text, default="{}")
    sample_path: Mapped[str] = mapped_column(String(500), default="")
    test_id: Mapped[str] = mapped_column(String(40), default="")
    test_no: Mapped[str] = mapped_column(String(40), default="")
    class_name: Mapped[str] = mapped_column(String(40), default="")
    section: Mapped[str] = mapped_column(String(200), default="")
    batch: Mapped[str] = mapped_column(String(40), default="")
    field_map_json: Mapped[str] = mapped_column(Text, default="{}")
    grace_marks: Mapped[float] = mapped_column(Float, default=0.0)
    grace_questions_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    layout: Mapped[OmrLayout] = relationship()
    subject_maps: Mapped[list["ExamSubjectMap"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )
    sheets: Mapped[list["ExamSheet"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )


class ExamSubjectMap(Base):
    __tablename__ = "exam_subject_maps"
    __table_args__ = (UniqueConstraint("exam_id", "subject_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    start_q: Mapped[int] = mapped_column(Integer)
    end_q: Mapped[int] = mapped_column(Integer)

    exam: Mapped[Exam] = relationship(back_populates="subject_maps")
    subject: Mapped[Subject] = relationship(back_populates="mappings")


class ExamSheet(Base):
    __tablename__ = "exam_sheets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(30), default="uploaded")
    detected_roll: Mapped[str] = mapped_column(String(32), default="")
    answers_json: Mapped[str] = mapped_column(Text, default="{}")
    error_message: Mapped[str] = mapped_column(Text, default="")
    raw_score: Mapped[float] = mapped_column(Float, default=0)
    max_score: Mapped[float] = mapped_column(Float, default=0)
    right_count: Mapped[int] = mapped_column(Integer, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    left_count: Mapped[int] = mapped_column(Integer, default=0)
    invalid_count: Mapped[int] = mapped_column(Integer, default=0)
    overlay_path: Mapped[str] = mapped_column(String(500), default="")
    assigned_manually: Mapped[bool] = mapped_column(default=False)

    exam: Mapped[Exam] = relationship(back_populates="sheets")
    student: Mapped[Student | None] = relationship(back_populates="sheets")
    question_results: Mapped[list["SheetQuestionResult"]] = relationship(
        back_populates="sheet", cascade="all, delete-orphan"
    )


class SheetQuestionResult(Base):
    __tablename__ = "sheet_question_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sheet_id: Mapped[int] = mapped_column(ForeignKey("exam_sheets.id"))
    question_no: Mapped[int] = mapped_column(Integer)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    marked: Mapped[str] = mapped_column(String(8), default="")
    correct: Mapped[str] = mapped_column(String(8), default="")
    rwl: Mapped[str] = mapped_column(String(1), default="L")

    sheet: Mapped[ExamSheet] = relationship(back_populates="question_results")
