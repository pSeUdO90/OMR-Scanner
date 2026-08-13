from __future__ import annotations

from copy import deepcopy
from typing import Any


def _q_column(start: int, end: int, x0: float, y0: float, y1: float) -> list[dict[str, Any]]:
    count = end - start + 1
    pitch = (y1 - y0) / max(count - 1, 1)
    questions = []
    option_dx = 0.028
    radius = 0.0052
    for i, q in enumerate(range(start, end + 1)):
        y = y0 + i * pitch
        options = []
        for j, letter in enumerate("ABCD"):
            options.append(
                {"label": letter, "x": x0 + 0.035 + j * option_dx, "y": y, "r": radius}
            )
        questions.append({"number": q, "options": options})
    return questions


def _digit_grid(cols: int, origin: tuple[float, float], col_pitch: float, row_pitch: float, radius: float) -> dict:
    bubbles = []
    ox, oy = origin
    for c in range(cols):
        for d in range(10):
            bubbles.append(
                {"col": c, "digit": str(d), "x": ox + c * col_pitch, "y": oy + d * row_pitch, "r": radius}
            )
    return {"cols": cols, "bubbles": bubbles}


def gyana_vikash_180() -> dict[str, Any]:
    questions = []
    questions += _q_column(1, 45, 0.07, 0.455, 0.905)
    questions += _q_column(46, 90, 0.29, 0.455, 0.905)
    questions += _q_column(91, 135, 0.51, 0.455, 0.905)
    questions += _q_column(136, 180, 0.73, 0.455, 0.905)
    return {
        "slug": "gyana-vikash-180",
        "name": "Gyana Vikash 180 (PCB)",
        "description": (
            "A4 magenta OMR used by Gyana Vikash English Medium School, Berhampur. "
            "Timing marks on both edges. Name grid (30×A–Z), 10-digit roll, "
            "Physics 01–45, Chemistry 46–90, Biology 91–180. Options A–D."
        ),
        "page_width": 1654,
        "page_height": 2339,
        "options": "ABCD",
        "total_questions": 180,
        "timing_marks": {"side_margin": 0.045, "min_count": 12},
        "roll": _digit_grid(10, (0.64, 0.095), 0.026, 0.0145, 0.005),
        "test_no": _digit_grid(3, (0.64, 0.265), 0.026, 0.0145, 0.005),
        "test_id": _digit_grid(3, (0.74, 0.265), 0.026, 0.0145, 0.005),
        "date": _digit_grid(6, (0.64, 0.355), 0.026, 0.012, 0.0048),
        "questions": questions,
        "default_maps": [
            {"subject": "Physics", "code": "PHY", "start_q": 1, "end_q": 45},
            {"subject": "Chemistry", "code": "CHE", "start_q": 46, "end_q": 90},
            {"subject": "Biology", "code": "BIO", "start_q": 91, "end_q": 180},
        ],
    }


def standard_100() -> dict[str, Any]:
    questions = []
    questions += _q_column(1, 25, 0.08, 0.22, 0.90)
    questions += _q_column(26, 50, 0.30, 0.22, 0.90)
    questions += _q_column(51, 75, 0.52, 0.22, 0.90)
    questions += _q_column(76, 100, 0.74, 0.22, 0.90)
    return {
        "slug": "standard-100",
        "name": "Standard 100 MCQ",
        "description": "Four columns of 25 questions, A–D, with a 10-digit roll grid at the top.",
        "page_width": 1654,
        "page_height": 2339,
        "options": "ABCD",
        "total_questions": 100,
        "timing_marks": {"side_margin": 0.045, "min_count": 12},
        "roll": _digit_grid(10, (0.35, 0.05), 0.028, 0.012, 0.0048),
        "questions": questions,
        "default_maps": [
            {"subject": "Paper", "code": "PAP", "start_q": 1, "end_q": 100},
        ],
    }


def jee_main_90() -> dict[str, Any]:
    questions = []
    questions += _q_column(1, 30, 0.12, 0.22, 0.90)
    questions += _q_column(31, 60, 0.40, 0.22, 0.90)
    questions += _q_column(61, 90, 0.68, 0.22, 0.90)
    return {
        "slug": "jee-main-90",
        "name": "JEE Main 90 (PCM)",
        "description": "Three subject columns of 30 questions with 10-digit roll number.",
        "page_width": 1654,
        "page_height": 2339,
        "options": "ABCD",
        "total_questions": 90,
        "timing_marks": {"side_margin": 0.045, "min_count": 12},
        "roll": _digit_grid(10, (0.35, 0.05), 0.028, 0.012, 0.0048),
        "questions": questions,
        "default_maps": [
            {"subject": "Physics", "code": "PHY", "start_q": 1, "end_q": 30},
            {"subject": "Chemistry", "code": "CHE", "start_q": 31, "end_q": 60},
            {"subject": "Mathematics", "code": "MAT", "start_q": 61, "end_q": 90},
        ],
    }


def custom_grid_layout(
    name: str,
    slug: str,
    total_questions: int,
    columns: int,
    options: str = "ABCD",
    description: str = "",
    default_maps: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    columns = max(1, min(columns, 6))
    total_questions = max(1, min(total_questions, 400))
    per_col = (total_questions + columns - 1) // columns
    questions = []
    xs = [0.08 + i * (0.84 / columns) for i in range(columns)]
    q = 1
    for col in range(columns):
        end = min(q + per_col - 1, total_questions)
        questions += _q_column(q, end, xs[col], 0.22, 0.90)
        q = end + 1
        if q > total_questions:
            break
    return {
        "slug": slug,
        "name": name,
        "description": description or f"Custom layout with {total_questions} questions in {columns} columns.",
        "page_width": 1654,
        "page_height": 2339,
        "options": options or "ABCD",
        "total_questions": total_questions,
        "timing_marks": {"side_margin": 0.045, "min_count": 12},
        "roll": _digit_grid(10, (0.08, 0.05), 0.028, 0.012, 0.0048),
        "test_id": _digit_grid(3, (0.50, 0.05), 0.026, 0.012, 0.0048),
        "test_no": _digit_grid(3, (0.62, 0.05), 0.026, 0.012, 0.0048),
        "date": _digit_grid(6, (0.76, 0.05), 0.022, 0.012, 0.0045),
        "questions": questions,
        "default_maps": default_maps
        or [{"subject": "Paper", "code": "PAP", "start_q": 1, "end_q": total_questions}],
    }


BUILTIN_LAYOUTS: list[dict[str, Any]] = []
RETIRED_LAYOUT_SLUGS = ("gyana-vikash-180", "standard-100", "jee-main-90")


def layout_preview(layout: dict[str, Any]) -> dict[str, Any]:
    return {
        "slug": layout["slug"],
        "total_questions": layout["total_questions"],
        "options": layout["options"],
        "default_maps": layout.get("default_maps", []),
        "roll_cols": layout.get("roll", {}).get("cols", 0),
    }


def clone_layout(layout: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(layout)
