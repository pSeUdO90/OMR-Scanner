from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app
from app.models import Student
from app.omr.generator import generate_sheet
from app.omr.layouts import gyana_vikash_180
from app.omr.processor import evaluate_image
from app.seed import seed_reference_data


def setup_module():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_reference_data(db)


def test_round_trip_gyana_layout():
    layout = gyana_vikash_180()
    answers = {q: "ABCD"[(q - 1) % 4] for q in range(1, 181)}
    image = generate_sheet(layout, "2400100001", answers)
    result = evaluate_image(image, layout)
    assert result["roll"] == "2400100001"
    assert result["answers"]["1"] == "A"
    assert result["answers"]["2"] == "B"
    assert result["answers"]["180"] == "D"
    blanks = sum(1 for v in result["answers"].values() if not v)
    assert blanks == 0


def test_left_and_wrong_detection():
    layout = gyana_vikash_180()
    answers = {1: "A", 2: "C"}
    image = generate_sheet(layout, "1234567890", answers)
    result = evaluate_image(image, layout)
    assert result["roll"] == "1234567890"
    assert result["answers"]["1"] == "A"
    assert result["answers"]["2"] == "C"
    assert result["answers"]["3"] == ""


def test_student_import_and_exam_flow(tmp_path):
    client = TestClient(app)
    with SessionLocal() as db:
        if not db.query(Student).filter(Student.roll_no == "2400100001").first():
            db.add(Student(roll_no="2400100001", name="Aarav Mishra", gender="M", class_name="12", section="A", session="2025-26"))
            db.commit()

    layouts = client.get("/api/layouts").json()
    gyana = next(item for item in layouts if item["slug"] == "gyana-vikash-180")
    subjects = {row["name"]: row["id"] for row in client.get("/api/subjects").json()}
    exam = client.post(
        "/api/exams",
        json={
            "name": "NEET Mock 1",
            "exam_date": "2026-08-13",
            "exam_type": "NEET Mock",
            "duration_minutes": 180,
            "correct_marks": 4,
            "wrong_marks": -1,
            "unattempted_marks": 0,
            "layout_id": gyana["id"],
            "subject_maps": [
                {"subject_id": subjects["Physics"], "start_q": 1, "end_q": 45},
                {"subject_id": subjects["Chemistry"], "start_q": 46, "end_q": 90},
                {"subject_id": subjects["Biology"], "start_q": 91, "end_q": 180},
            ],
            "answer_key": {str(q): "ABCD"[(q - 1) % 4] for q in range(1, 181)},
        },
    )
    assert exam.status_code == 200, exam.text
    exam_id = exam.json()["id"]
    sample = client.post(f"/api/exams/{exam_id}/sample-sheet", data={"roll": "2400100001"})
    assert sample.status_code == 200, sample.text
    evaluated = client.post(f"/api/exams/{exam_id}/evaluate")
    assert evaluated.status_code == 200, evaluated.text
    results = client.get(f"/api/exams/{exam_id}/results").json()
    assert results["appeared"] == 1
    assert results["results"][0]["right"] == 180
    assert results["overall_rwl"]["right"] == 180
    published = client.post(f"/api/exams/{exam_id}/publish")
    assert published.status_code == 200
