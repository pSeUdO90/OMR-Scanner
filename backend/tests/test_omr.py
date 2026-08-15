from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
import base64
import json

from app.database import Base, engine, SessionLocal
from app.main import app, _ensure_columns
from app.models import OmrLayout, Student
from app.omr.generator import generate_sheet
from app.omr.layouts import gyana_vikash_180
from app.omr.processor import evaluate_image, load_image, save_image
from app.seed import seed_reference_data


def setup_module():
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    with SessionLocal() as db:
        seed_reference_data(db)


def test_round_trip_gyana_layout():
    layout = gyana_vikash_180()
    answers = {q: "ABCD"[(q - 1) % 4] for q in range(1, 181)}
    image = generate_sheet(layout, "24001001", answers)
    result = evaluate_image(image, layout)
    assert result["roll"] == "24001001"
    assert result["answers"]["1"] == "A"
    assert result["answers"]["2"] == "B"
    assert result["answers"]["180"] == "D"
    blanks = sum(1 for v in result["answers"].values() if not v)
    assert blanks == 0


def test_left_and_wrong_detection():
    layout = gyana_vikash_180()
    answers = {1: "A", 2: "C"}
    image = generate_sheet(layout, "12345678", answers)
    result = evaluate_image(image, layout)
    assert result["roll"] == "12345678"
    assert result["answers"]["1"] == "A"
    assert result["answers"]["2"] == "C"
    assert result["answers"]["3"] == ""


def test_real_gyana_scan_reads_eight_digit_roll():
    path = Path(__file__).resolve().parent / "fixtures" / "gyana_roll_24001001.jpg"
    result = evaluate_image(load_image(path), gyana_vikash_180())
    assert result["roll"] == "24001001"


def test_a4_designed_sheet_round_trip():
    from app.omr.generator import generate_designed_sheet
    from app.omr.layouts import a4_design_layout, predefined_a4_blocks

    blocks = predefined_a4_blocks(total_questions=40, columns=2, options="ABCD", roll_cols=8)
    kinds = {b["kind"] for b in blocks}
    assert {"roll", "name", "test_no", "test_id", "date", "answers"} <= kinds
    layout = a4_design_layout("A4 Design", "a4-design-test", 40, 2, "ABCD", roll_cols=8)
    assert layout["page_width_mm"] == 210
    assert layout["page_height_mm"] == 297
    assert layout["designed"] is True
    assert layout["roll"]["cols"] == 8
    radius = layout["roll"]["bubbles"][0]["r"]
    diameter_mm = 2 * radius * layout["page_width_mm"]
    assert abs(diameter_mm - 4.0) < 0.05
    assert abs(layout["questions"][0]["options"][0]["r"] * 2 * layout["page_width_mm"] - 4.0) < 0.05
    image = generate_designed_sheet(layout, "24001001", {1: "A", 40: "D"})
    assert abs(image.shape[0] / image.shape[1] - 297 / 210) < 0.02
    result = evaluate_image(image, layout)
    assert result["roll"] == "24001001"
    assert result["answers"]["1"] == "A"
    assert result["answers"]["40"] == "D"
    client = TestClient(app)
    created = client.post(
        "/api/layouts/design",
        json={"name": "A4 API Sheet", "description": "Designed", "total_questions": 20, "columns": 2, "options": "ABCD", "roll_cols": 8},
    )
    assert created.status_code == 200, created.text
    assert created.json()["has_sample"] is True
    assert any(b["kind"] == "roll" for b in created.json()["blocks"])
    sheet = client.get(f"/api/layouts/{created.json()['id']}/blank-sheet")
    assert sheet.status_code == 200
    pdf = client.get(f"/api/layouts/{created.json()['id']}/blank-sheet.pdf")
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"
    assert client.delete(f"/api/layouts/{created.json()['id']}").status_code == 200


def test_manual_blocks_drive_roll_reading():
    from app.omr.layouts import apply_blocks_to_config, custom_grid_layout, digit_grid_from_box

    path = Path(__file__).resolve().parent / "fixtures" / "gyana_roll_24001001.jpg"
    layout = gyana_vikash_180()
    ox, oy, pitch_x, pitch_y = 0.778, 0.3173, 0.025, 0.0138
    box = {
        "kind": "roll",
        "cols": 8,
        "x0": ox - pitch_x / 2,
        "y0": oy - pitch_y / 2,
        "x1": ox + 7 * pitch_x + pitch_x / 2,
        "y1": oy + 9 * pitch_y + pitch_y / 2,
    }
    config = apply_blocks_to_config(layout, [box])
    assert config["roll"]["cols"] == 8
    result = evaluate_image(load_image(path), config)
    assert result["roll"] == "24001001"
    rebuilt = digit_grid_from_box(8, box["x0"], box["y0"], box["x1"], box["y1"])
    assert rebuilt["cols"] == 8
    custom = custom_grid_layout("Manual", "manual-blocks", 180, 4, "ABCD")
    with_answers = apply_blocks_to_config(
        custom,
        [
            box,
            {"kind": "answers", "start_q": 1, "end_q": 45, "x0": 0.07, "y0": 0.455, "x1": 0.22, "y1": 0.90},
        ],
    )
    assert with_answers["questions"][0]["number"] == 1
    assert with_answers["questions"][-1]["number"] == 45
    assert len(with_answers["questions"][0]["options"]) == 4


def _pcb_layout(client: TestClient):
    cfg = gyana_vikash_180()
    cfg["slug"] = "test-pcb-180"
    cfg["name"] = "Test PCB 180"
    with SessionLocal() as db:
        row = db.query(OmrLayout).filter(OmrLayout.slug == "test-pcb-180").one_or_none()
        if row:
            row.config_json = json.dumps(cfg)
            row.total_questions = 180
            db.commit()
            layout_id = row.id
        else:
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
        if not db.query(Student).filter(Student.roll_no == "24001001").first():
            db.add(Student(roll_no="24001001", name="Aarav Mishra", gender="M", class_name="12", section="A", session="2025-26"))
        if not db.query(Student).filter(Student.roll_no == "88001122").first():
            db.add(Student(roll_no="88001122", name="Other Class", gender="F", class_name="9", section="C", session="2024-25"))
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
    sample = client.post(f"/api/exams/{exam_id}/sample-sheet", data={"roll": "24001001"})
    assert sample.status_code == 200, sample.text
    evaluated = client.post(f"/api/exams/{exam_id}/evaluate")
    assert evaluated.status_code == 200, evaluated.text
    results = client.get(f"/api/exams/{exam_id}/results").json()
    assert results["appeared"] == 1
    assert results["results"][0]["right"] == 180
    assert results["overall_rwl"]["right"] == 180
    assert results["results"][0]["score"] == 720
    flipped = {str(q): "ABCD"[(q - 1) % 4] for q in range(1, 181)}
    flipped["1"] = "B"
    rescored = client.put(f"/api/exams/{exam_id}/answer-key", json={"answer_key": flipped})
    assert rescored.status_code == 200, rescored.text
    results = client.get(f"/api/exams/{exam_id}/results").json()
    assert results["results"][0]["right"] == 179
    assert results["results"][0]["wrong"] == 1
    assert results["results"][0]["score"] == 715
    restored = client.put(
        f"/api/exams/{exam_id}/answer-key",
        json={"answer_key": {str(q): "ABCD"[(q - 1) % 4] for q in range(1, 181)}},
    )
    assert restored.status_code == 200
    results = client.get(f"/api/exams/{exam_id}/results").json()
    assert results["results"][0]["right"] == 180
    assert results["results"][0]["score"] == 720
    other_sheet = client.post(f"/api/exams/{exam_id}/sample-sheet", data={"roll": "88001122"})
    assert other_sheet.status_code == 200, other_sheet.text
    other_id = other_sheet.json()["id"]
    client.post(f"/api/exams/{exam_id}/evaluate")
    other_row = next(row for row in client.get(f"/api/exams/{exam_id}/sheets").json() if row["id"] == other_id)
    assert other_row["status"] == "evaluated"
    assert other_row["student_name"] == "Other Class"
    assert other_row["detected_roll"] == "88001122"
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
    assert {"roll", "test_id", "test_no", "date", "answers", "timing"} <= keys
    saved_blocks = client.post(
        f"/api/layouts/{created_layout.json()['id']}/blocks",
        json={
            "blocks": [
                {"kind": "roll", "cols": 8, "x0": 0.77, "y0": 0.31, "x1": 0.96, "y1": 0.45},
                {"kind": "date", "cols": 6, "x0": 0.64, "y0": 0.35, "x1": 0.78, "y1": 0.45, "map_to": "exam_date"},
                {"kind": "answers", "start_q": 1, "end_q": 20, "x0": 0.08, "y0": 0.45, "x1": 0.28, "y1": 0.90},
            ]
        },
    )
    assert saved_blocks.status_code == 200, saved_blocks.text
    assert len(saved_blocks.json()["blocks"]) == 3
    by_key = {item["key"]: item for item in saved_blocks.json()["analysis"]}
    assert by_key["roll"]["detected"] is True
    assert by_key["date"]["detected"] is True
    assert by_key["answers"]["detected"] is True
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
    from app.xlsx_io import students_template_bytes
    xlsx = students_template_bytes()
    preview = client.post("/api/students/import/preview", files={"file": ("students.xlsx", xlsx)})
    assert preview.status_code == 200, preview.text
    assert any(row["roll_no"] == "2400100001" for row in preview.json()["existing"])
    skipped = client.post("/api/students/import?on_conflict=skip", files={"file": ("students.xlsx", xlsx)})
    assert skipped.status_code == 200, skipped.text
    assert skipped.json()["skipped"] >= 1
    student = next(s for s in client.get("/api/students").json() if s["roll_no"] == "24001001")
    history = client.get(f"/api/students/{student['id']}/results").json()
    assert history["student"]["name"] == "Aarav Mishra"
    neet = next(row for row in history["exams"] if row["exam_id"] == exam_id)
    assert neet["right"] == 180
    assert neet["overall_rwl"]["right"] == 180
    assert neet["score"] == 720
    assert neet["subjects"]
    unmatched_sheet = client.post(f"/api/exams/{exam_id}/sample-sheet", data={"roll": "9999999999"})
    assert unmatched_sheet.status_code == 200, unmatched_sheet.text
    unmatched_id = unmatched_sheet.json()["id"]
    client.post(f"/api/exams/{exam_id}/evaluate")
    unmatched_rows = [row for row in client.get(f"/api/exams/{exam_id}/sheets").json() if row["id"] == unmatched_id]
    assert unmatched_rows and unmatched_rows[0]["status"] == "unmatched"
    assigned = client.put(
        f"/api/exams/{exam_id}/sheets/{unmatched_id}/assign",
        json={"student_id": student["id"]},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["status"] == "evaluated"
    assert assigned.json()["student_name"] == "Aarav Mishra"
    assert assigned.json()["assigned_manually"] is True
    image = client.get(f"/api/exams/{exam_id}/sheets/{unmatched_id}/image")
    assert image.status_code == 200
    saved_key = client.get(f"/api/exams/{exam_id}").json()["answer_key"]
    reset = client.post(f"/api/exams/{exam_id}/reset-omr")
    assert reset.status_code == 200, reset.text
    assert reset.json()["removed"] >= 1
    assert client.get(f"/api/exams/{exam_id}/sheets").json() == []
    after_reset = client.get(f"/api/exams/{exam_id}").json()
    assert after_reset["answer_key"] == saved_key
    assert after_reset["status"] == "draft"


def test_studio_layout_saves_mapping_json():
    from io import BytesIO

    buf = BytesIO()
    Image.new("RGB", (42, 60), "#ffffff").save(buf, "JPEG")
    thumb = base64.b64encode(buf.getvalue()).decode("ascii")
    client = TestClient(app)
    payload = {
        "name": "Studio Save Test",
        "description": "studio",
        "total_questions": 40,
        "options": "ABCD",
        "config": {"title": "Studio Save Test", "questionCount": 40, "questionColumns": 5, "optionSet": "ABCD", "rollCols": 8},
        "geometry": {"pageWidthMm": 210, "pageHeightMm": 297, "cellMm": 6.5, "gridCols": 32, "gridRows": 45, "bubbleDiameterMm": 4.5},
        "blocks": [{"id": "mcq-1", "blockId": "mcq_column_1", "dbColumnBinding": "student_responses.q_01_to_40", "blockType": "GRID_MCQ"}],
        "mapping": {"documentMetadata": {"pageSize": {"widthMm": 210, "heightMm": 297}}, "dataBlocks": []},
        "thumbnail_base64": thumb,
    }
    created = client.post("/api/layouts/studio", json=payload)
    assert created.status_code == 200, created.text
    row = created.json()
    assert row["name"] == "Studio Save Test"
    assert row["total_questions"] == 40
    assert row["is_studio"] is True
    assert row["has_sample"] is True
    assert row["blocks"] == []
    listed = client.get("/api/layouts").json()
    assert any(item["id"] == row["id"] and item["is_studio"] and item["has_sample"] for item in listed)
    sample = client.get(f"/api/layouts/{row['id']}/sample")
    assert sample.status_code == 200
    stored = SessionLocal().query(OmrLayout).filter(OmrLayout.id == row["id"]).one()
    config = json.loads(stored.config_json)
    assert config["studio"] is True
    assert config["studio_mapping"]["documentMetadata"]["pageSize"]["widthMm"] == 210
    assert config["studio_blocks"][0]["blockId"] == "mcq_column_1"
    assert config["studio_config"]["questionColumns"] == 5
    stored = SessionLocal().query(OmrLayout).filter(OmrLayout.id == row["id"]).one()
    first_path = stored.sample_path
    updated = client.put(
        f"/api/layouts/{row['id']}/studio",
        json={**payload, "name": "Studio Save Test Edited", "thumbnail_base64": thumb},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Studio Save Test Edited"
    stored = SessionLocal().query(OmrLayout).filter(OmrLayout.id == row["id"]).one()
    assert stored.sample_path != first_path
    assert created.json()["is_finalized"] is True
    duplicate = client.post("/api/layouts/studio", json={**payload, "name": "Studio Save Test Edited"})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Layout name already exists"
    copied = client.post(f"/api/layouts/{row['id']}/copy")
    assert copied.status_code == 200, copied.text
    assert copied.json()["name"] == "Studio Save Test Edited copy"
    assert copied.json()["is_studio"] is True
    exam = client.post(
        "/api/exams",
        json={
            "name": "Studio lock exam",
            "exam_date": "2026-08-15",
            "exam_type": "Unit Test",
            "layout_id": row["id"],
        },
    )
    assert exam.status_code == 200, exam.text
    locked = client.get(f"/api/layouts/{row['id']}").json()
    assert locked["in_use"] is True
    blocked = client.put(
        f"/api/layouts/{row['id']}/studio",
        json={**payload, "name": "Should not change", "thumbnail_base64": thumb},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "Layout Associated with Exam. Cannot be Modified"
    still = client.get(f"/api/layouts/{row['id']}").json()
    assert still["name"] == "Studio Save Test Edited"
    clone_id = copied.json()["id"]
    clone_edit = client.put(
        f"/api/layouts/{clone_id}/studio",
        json={**payload, "name": "Studio Save Test Edited copy", "thumbnail_base64": thumb},
    )
    assert clone_edit.status_code == 200, clone_edit.text
    assert client.delete(f"/api/layouts/{row['id']}").status_code == 409
    assert client.delete(f"/api/exams/{exam.json()['id']}").status_code == 200
    assert client.delete(f"/api/layouts/{row['id']}").status_code == 200
    assert client.delete(f"/api/layouts/{clone_id}").status_code == 200

