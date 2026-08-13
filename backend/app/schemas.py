from datetime import date, datetime

from pydantic import BaseModel, Field


class StudentIn(BaseModel):
    roll_no: str
    name: str
    gender: str = ""
    class_name: str = ""
    section: str = ""
    session: str = ""


class StudentOut(StudentIn):
    id: int

    model_config = {"from_attributes": True}


class SubjectIn(BaseModel):
    name: str
    code: str = ""


class SubjectOut(SubjectIn):
    id: int

    model_config = {"from_attributes": True}


class LayoutOut(BaseModel):
    id: int
    slug: str
    name: str
    description: str
    total_questions: int
    options: str
    is_builtin: bool
    has_sample: bool = False
    field_map: dict[str, str] = Field(default_factory=dict)
    analysis: list[dict] = Field(default_factory=list)
    preview: dict | None = None

    model_config = {"from_attributes": True}


class SubjectMapIn(BaseModel):
    subject_id: int
    start_q: int
    end_q: int


class SubjectMapOut(SubjectMapIn):
    id: int
    subject_name: str = ""

    model_config = {"from_attributes": True}


class ExamIn(BaseModel):
    name: str
    exam_date: date
    exam_type: str = "Unit Test"
    duration_minutes: int = 180
    correct_marks: float = 4.0
    wrong_marks: float = -1.0
    unattempted_marks: float = 0.0
    layout_id: int
    test_id: str = ""
    test_no: str = ""
    class_name: str = ""
    section: str = ""
    batch: str = ""
    subject_maps: list[SubjectMapIn] = Field(default_factory=list)
    answer_key: dict[str, str] = Field(default_factory=dict)


class ExamOut(BaseModel):
    id: int
    name: str
    exam_date: date
    exam_type: str
    duration_minutes: int
    correct_marks: float
    wrong_marks: float
    unattempted_marks: float
    layout_id: int
    layout_name: str = ""
    total_questions: int = 0
    status: str
    created_at: datetime
    subject_maps: list[SubjectMapOut] = []
    answer_key: dict[str, str] = {}
    sheet_count: int = 0
    evaluated_count: int = 0
    has_sample: bool = False
    test_id: str = ""
    test_no: str = ""
    class_name: str = ""
    section: str = ""
    batch: str = ""
    grace_questions: list[int] = Field(default_factory=list)
    field_map: dict[str, str] = Field(default_factory=dict)
    analysis: list[dict] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class GraceIn(BaseModel):
    questions: list[int] | str = Field(default_factory=list)


class AnswerKeyIn(BaseModel):
    answer_key: dict[str, str] | None = None
    key_string: str | None = None


class SheetOut(BaseModel):
    id: int
    exam_id: int
    student_id: int | None
    student_name: str = ""
    filename: str
    status: str
    detected_roll: str
    error_message: str
    raw_score: float
    max_score: float
    right_count: int
    wrong_count: int
    left_count: int
    invalid_count: int

    model_config = {"from_attributes": True}


class RwlSubject(BaseModel):
    subject_id: int | None
    subject_name: str
    start_q: int
    end_q: int
    right: int
    wrong: int
    left: int
    invalid: int
    attempted: int
    total: int
    accuracy: float
    score: float
    max_score: float


class StudentResult(BaseModel):
    sheet_id: int
    roll_no: str
    name: str
    class_name: str = ""
    section: str = ""
    right: int
    wrong: int
    left: int
    invalid: int
    score: float
    max_score: float
    percentage: float
    rank: int | None = None
    subjects: list[RwlSubject] = []


class ExamAnalytics(BaseModel):
    exam_id: int
    exam_name: str
    published: bool
    appeared: int
    average_score: float
    highest_score: float
    lowest_score: float
    overall_rwl: RwlSubject
    subjects: list[RwlSubject]
    results: list[StudentResult]
    item_analysis: list[dict]
