from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app, _ensure_columns
from app.models import OmrLayout, Student
from app.omr.generator import generate_sheet
from app.omr.layouts import gyana_vikash_180
from app.omr.processor import evaluate_image
from app.seed import seed_reference_data
import json


def setup_module():
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
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


def _pcb_layout(client: TestClient):
    layouts = client.get("/api/layouts").json()
    existing = next((item for item in layouts if item["slug"] == "test-pcb-180"), None)
    if existing:
        return existing
    cfg = gyana_vikash_180()
    cfg["slug"] = "test-pcb-180"
    cfg["name"] = "Test PCB 180"
    with SessionLocal() as db:
        row = OmrLayout(
            slug="test-pcb-180",
            name="Test PCB 180",
            description="Test layout",
            total_questions=180,
            options="ABCD",
            config_json=json.dumps(cfg),
            is_builtin=False,
        )
        db.add(row)
        db.commit()
        layout_id = row.id
    return client.get(f"/api/layouts/{layout_id}").json()


def test_student_import_and_exam_flow(tmp_path):
    client = TestClient(app)
    with SessionLocal() as db:
        if not db.query(Student).filter(Student.roll_no == "2400100001").first():
            db.add(Student(roll_no="2400100001", name="Aarav Mishra", gender="M", class_name="12", section="A", session="2025-26"))
            db.commit()

    slugs = {item["slug"] for item in client.get("/api/layouts").json()}
    assert "gyana-vikash-180" not in slugs
    assert "standard-100" not in slugs
    assert "jee-main-90" not in slugs
    gyana = _pcb_layout(client)
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
            "test_no": "12",
            "class_name": "12",
            "section": "A",
            "batch": "2025-26",
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
    created_test_id = exam.json()["test_id"]
    assert created_test_id.isdigit() and len(created_test_id) >= 4
    assert exam.json()["class_name"] == "12"
    assert exam.json()["batch"] == "2025-26"
    before = len(client.get("/api/exams").json())
    edited = client.put(
        f"/api/exams/{exam_id}",
        json={
            "name": "NEET Mock 1",
            "exam_date": "2026-08-13",
            "exam_type": "NEET Mock",
            "duration_minutes": 200,
            "correct_marks": 4,
            "wrong_marks": -1,
            "unattempted_marks": 0,
            "layout_id": gyana["id"],
            "test_no": "13",
            "class_name": "12",
            "section": "A",
            "batch": "2025-26",
            "subject_maps": [
                {"subject_id": subjects["Physics"], "start_q": 1, "end_q": 45},
                {"subject_id": subjects["Chemistry"], "start_q": 46, "end_q": 90},
                {"subject_id": subjects["Biology"], "start_q": 91, "end_q": 180},
            ],
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["id"] == exam_id
    assert edited.json()["duration_minutes"] == 200
    assert edited.json()["name"] == "NEET Mock 1"
    assert edited.json()["test_id"] == created_test_id
    assert len(client.get("/api/exams").json()) == before
    key_upload = client.post(
        f"/api/exams/{exam_id}/answer-key/upload",
        files={"file": ("key.txt", b"ABCD" * 45, "text/plain")},
    )
    assert key_upload.status_code == 200, key_upload.text
    sample = client.post(f"/api/exams/{exam_id}/sample-sheet", data={"roll": "2400100001"})
    assert sample.status_code == 200, sample.text
    evaluated = client.post(f"/api/exams/{exam_id}/evaluate")
    assert evaluated.status_code == 200, evaluated.text
    results = client.get(f"/api/exams/{exam_id}/results").json()
    assert results["appeared"] == 1
    assert results["results"][0]["right"] == 180
    assert results["overall_rwl"]["right"] == 180
    assert results["results"][0]["score"] == 720
    grace = client.put(f"/api/exams/{exam_id}/grace", json={"questions": "2, 3, 10-12"})
    assert grace.status_code == 200, grace.text
    assert grace.json()["grace_questions"] == [2, 3, 10, 11, 12]
    results = client.get(f"/api/exams/{exam_id}/results").json()
    assert results["results"][0]["score"] == 720
    assert results["results"][0]["right"] == 180
    locked = client.put(
        f"/api/exams/{exam_id}",
        json={
            "name": "Should not change",
            "exam_date": "2026-08-13",
            "exam_type": "NEET Mock",
            "layout_id": gyana["id"],
        },
    )
    assert locked.status_code == 409
    assert client.get(f"/api/exams/{exam_id}").json()["name"] == "NEET Mock 1"
    published = client.post(f"/api/exams/{exam_id}/publish")
    assert published.status_code == 200
    csv_body = client.get(f"/api/exams/{exam_id}/results.csv")
    assert csv_body.status_code == 200
    assert b"Aarav Mishra" in csv_body.content
    assert b"Physics R" in csv_body.content
    xlsx_body = client.get(f"/api/exams/{exam_id}/results.xlsx")
    assert xlsx_body.status_code == 200, xlsx_body.text
    assert xlsx_body.content[:2] == b"PK"
    blocked = client.delete(f"/api/subjects/{subjects['Physics']}")
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "Subject Associated with Exam. Cannot be Deleted"
    free = client.post("/api/subjects", json={"name": "TempDeleteMe", "code": "TMP"})
    assert free.status_code == 200
    ok = client.delete(f"/api/subjects/{free.json()['id']}")
    assert ok.status_code == 200
    from io import BytesIO
    from PIL import Image
    buf = BytesIO()
    Image.new("RGB", (48, 48), (5, 26, 45)).save(buf, format="JPEG")
    created_layout = client.post(
        "/api/layouts",
        data={"name": "Custom 20", "description": "Test", "total_questions": 20, "columns": 2, "options": "ABCD", "subject_maps": '[{"subject":"Physics","start_q":1,"end_q":10},{"subject":"Chemistry","start_q":11,"end_q":20}]'},
        files={"sample": ("sheet.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert created_layout.status_code == 200, created_layout.text
    assert created_layout.json()["has_sample"] is True
    assert created_layout.json()["total_questions"] == 20
    preview_maps = created_layout.json()["preview"]["default_maps"]
    assert preview_maps[0]["subject"] == "Physics"
    assert preview_maps[1]["end_q"] == 20
    keys = {item["key"] for item in created_layout.json()["analysis"]}
    assert {"roll", "test_id", "test_no", "date", "answers"} <= keys
    mapped = client.post(
        f"/api/layouts/{created_layout.json()['id']}/field-map",
        json={"field_map": {"date": "exam_date", "test_id": "test_id", "test_no": "test_no"}},
    )
    assert mapped.status_code == 200
    extra = client.post(
        "/api/exams",
        json={
            "name": "Custom paper",
            "exam_date": "2026-08-13",
            "exam_type": "Unit Test",
            "layout_id": created_layout.json()["id"],
            "test_id": "C-1",
            "test_no": "1",
        },
    )
    assert extra.status_code == 200, extra.text
    assert extra.json()["test_id"] != created_test_id
    pdf = client.get(f"/api/exams/{extra.json()['id']}/prefilled-omr")
    assert pdf.status_code == 200, pdf.text
    assert pdf.content[:4] == b"%PDF"
    options = client.get("/api/students/options").json()
    assert "classes" in options
    used_layout = client.delete(f"/api/layouts/{created_layout.json()['id']}")
    assert used_layout.status_code == 409
    assert used_layout.json()["detail"] == "Layout Associated with Exam. Cannot be Deleted"
    removed = client.delete(f"/api/exams/{extra.json()['id']}")
    assert removed.status_code == 200
    assert client.get(f"/api/exams/{extra.json()['id']}").status_code == 404
    unused_layout = client.delete(f"/api/layouts/{created_layout.json()['id']}")
    assert unused_layout.status_code == 200
    student = next(s for s in client.get("/api/students").json() if s["roll_no"] == "2400100001")
    history = client.get(f"/api/students/{student['id']}/results").json()
    assert history["student"]["name"] == "Aarav Mishra"
    neet = next(row for row in history["exams"] if row["exam_id"] == exam_id)
    assert neet["right"] == 180
    assert neet["overall_rwl"]["right"] == 180
    assert neet["score"] == 720
    assert neet["subjects"]
