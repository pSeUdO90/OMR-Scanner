from pathlib import Path

import cv2
import numpy as np
import pytest

from app.omr.de_skew_engine import ERROR_MIN_FIDUCIALS, OMRAlignmentError, align_omr_array, align_omr_sheet
from app.omr.processor import parse_layout
from app.omr.studio_render import generate_studio_sheet


def _studio_config():
    return {
        "studio": True,
        "name": "Deskew Test",
        "options": "ABCD",
        "questions": [],
        "studio_config": {"title": "Deskew Header Title", "rollCols": 7},
        "studio_geometry": {
            "pageWidthMm": 210,
            "pageHeightMm": 297,
            "cellMm": 6.5,
            "gridCols": 32,
            "gridRows": 45,
            "bubbleDiameterMm": 4.5,
            "marginTopMm": 8,
            "marginRightMm": 8,
            "marginBottomMm": 8,
            "marginLeftMm": 8,
            "fiducialMm": 8,
            "fiducialInsetMm": 5,
        },
        "studio_blocks": [
            {
                "blockType": "GRID_DIGIT",
                "blockId": "roll_number_grid",
                "dbColumnBinding": "candidates.roll_number",
                "label": "Roll Number",
                "col0": 24,
                "row0": 4,
                "cols": 7,
                "rows": 10,
            },
            {
                "blockType": "GRID_MCQ",
                "blockId": "mcq_column_1",
                "label": "Physics",
                "col0": 3,
                "row0": 16,
                "cols": 5,
                "rows": 8,
                "options": "ABCD",
                "startQ": 1,
                "endQ": 8,
            },
        ],
    }


def _skew(image: np.ndarray, angle: float = 8.0, perspective: float = 0.04) -> np.ndarray:
    h, w = image.shape[:2]
    pad = int(0.12 * max(w, h))
    canvas = cv2.copyMakeBorder(image, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    ch, cw = canvas.shape[:2]
    center = (cw / 2, ch / 2)
    rot = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(canvas, rot, (cw, ch), borderValue=(255, 255, 255))
    src = np.float32([[0, 0], [cw - 1, 0], [cw - 1, ch - 1], [0, ch - 1]])
    inset = perspective * min(cw, ch)
    dst = np.float32(
        [
            [inset, inset * 0.4],
            [cw - 1 - inset * 0.3, inset],
            [cw - 1 - inset * 0.2, ch - 1 - inset * 0.5],
            [inset * 0.6, ch - 1 - inset * 0.2],
        ]
    )
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(rotated, matrix, (cw, ch), borderValue=(255, 255, 255))


def _blank_corner(image: np.ndarray, which: str) -> np.ndarray:
    out = image.copy()
    h, w = out.shape[:2]
    boxes = {
        "TL": (0, 0, int(0.12 * w), int(0.12 * h)),
        "TR": (int(0.88 * w), 0, w, int(0.12 * h)),
        "BL": (0, int(0.88 * h), int(0.12 * w), h),
        "BR": (int(0.88 * w), int(0.88 * h), w, h),
    }
    x0, y0, x1, y1 = boxes[which]
    out[y0:y1, x0:x1] = 255
    return out


def test_aligns_skewed_studio_sheet(tmp_path: Path):
    config = _studio_config()
    layout = parse_layout(__import__("json").dumps(config))
    original = generate_studio_sheet(config)
    skewed = _skew(original, angle=11.0)
    aligned, meta = align_omr_array(skewed, layout, debug=True)
    assert aligned.shape[1] == layout["page_width"]
    assert aligned.shape[0] == layout["page_height"]
    assert meta["confidence"] > 0.5
    assert abs(meta["skew_angle"]) > 0.5
    src = tmp_path / "input_scan.png"
    dest_debug = tmp_path / "debug.png"
    cv2.imwrite(str(src), skewed)
    warped, meta2 = align_omr_sheet(str(src), layout, debug=True, debug_path=dest_debug)
    assert dest_debug.exists()
    debug = cv2.imread(str(dest_debug))
    assert debug is not None
    assert warped.shape[0] == layout["page_height"]


def test_extrapolates_missing_fiducial():
    config = _studio_config()
    layout = parse_layout(__import__("json").dumps(config))
    original = generate_studio_sheet(config)
    damaged = _blank_corner(original, "BR")
    aligned, meta = align_omr_array(damaged, layout)
    assert aligned.shape[1] == layout["page_width"]
    assert meta["used_extrapolated_corner"] is True
    assert meta["method"] == "fiducials"


def test_raises_when_fewer_than_three_fiducials():
    config = _studio_config()
    layout = parse_layout(__import__("json").dumps(config))
    original = generate_studio_sheet(config)
    damaged = _blank_corner(_blank_corner(original, "BR"), "BL")
    with pytest.raises(OMRAlignmentError, match="Could not locate minimum fiducial markers"):
        align_omr_array(damaged, layout)


def test_rotates_upside_down_scan():
    config = _studio_config()
    layout = parse_layout(__import__("json").dumps(config))
    original = generate_studio_sheet(config)
    flipped = cv2.rotate(original, cv2.ROTATE_180)
    aligned, meta = align_omr_array(flipped, layout)
    assert aligned.shape[0] == layout["page_height"]
    gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    top = gray[: int(0.12 * h), int(0.15 * w) : int(0.85 * w)].mean()
    bottom = gray[int(0.88 * h) :, int(0.15 * w) : int(0.85 * w)].mean()
    assert top <= bottom + 8 or meta["rotated_180"] is True


def test_process_omr_endpoint(tmp_path: Path):
    import json
    from conftest import TestClient
    from app.database import SessionLocal
    from app.main import app, _ensure_columns
    from app.models import OmrLayout, Base
    from app.database import engine
    from app.seed import seed_reference_data

    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    with SessionLocal() as db:
        seed_reference_data(db)

    client = TestClient(app)
    config = _studio_config()
    config["name"] = "Process OMR Layout"
    with SessionLocal() as db:
        row = db.query(OmrLayout).filter(OmrLayout.slug == "process-omr-layout").one_or_none()
        if row is None:
            row = OmrLayout(
                slug="process-omr-layout",
                name="Process OMR Layout",
                description="",
                total_questions=8,
                options="ABCD",
                config_json=json.dumps(config),
                is_builtin=False,
                is_finalized=True,
            )
            db.add(row)
        else:
            row.config_json = json.dumps(config)
            row.is_finalized = True
        db.commit()
        layout_id = row.id
    exam = client.post(
        "/api/exams",
        json={
            "name": "Process OMR Exam",
            "exam_date": "2026-08-15",
            "exam_type": "Unit Test",
            "layout_id": layout_id,
            "answer_key": {str(q): "A" for q in range(1, 9)},
        },
    )
    assert exam.status_code == 200, exam.text
    exam_id = exam.json()["id"]
    layout = parse_layout(json.dumps(config))
    skewed = _skew(generate_studio_sheet(config), angle=9.0)
    scan = tmp_path / "scan.png"
    cv2.imwrite(str(scan), skewed)
    uploaded = client.post(
        f"/api/exams/{exam_id}/sheets",
        files=[("files", ("scan.png", scan.read_bytes(), "image/png"))],
    )
    assert uploaded.status_code == 200, uploaded.text
    processed = client.post(f"/api/exams/{exam_id}/process-omr")
    assert processed.status_code == 200, processed.text
    body = processed.json()
    assert body["processed"] == 1
    assert body["failed"] == 0
    assert body["results"][0]["ok"] is True
    assert body["results"][0]["method"] == "fiducials"
    exported = Path(body["results"][0]["exported_path"])
    assert exported.exists()
    assert "Process OMR Exam" in str(exported.parent)

