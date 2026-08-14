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
            "Timing marks on both edges. Name grid, 8-digit roll, "
            "Physics 01–45, Chemistry 46–90, Biology 91–180. Options A–D."
        ),
        "page_width": 1654,
        "page_height": 2339,
        "options": "ABCD",
        "total_questions": 180,
        "timing_marks": {"side_margin": 0.045, "min_count": 12},
        "roll": _digit_grid(8, (0.778, 0.3173), 0.025, 0.0138, 0.0055),
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
        "name_text": {"x": 0.08, "y": 0.12},
        "date_text": {"x": 0.76, "y": 0.12},
        "questions": questions,
        "default_maps": default_maps
        or [{"subject": "Paper", "code": "PAP", "start_q": 1, "end_q": total_questions}],
    }


A4_WIDTH_PX = 1654
A4_HEIGHT_PX = 2339
A4_WIDTH_MM = 210
A4_HEIGHT_MM = 297
BUBBLE_DIAMETER_MM = 4.0


def bubble_radius_norm(page_width_mm: float = A4_WIDTH_MM) -> float:
    """Bubble radius as a fraction of page width (processor uses r_px = nr * min(w, h))."""
    return (BUBBLE_DIAMETER_MM / 2.0) / float(page_width_mm or A4_WIDTH_MM)


def predefined_a4_blocks(
    *,
    total_questions: int,
    columns: int,
    options: str = "ABCD",
    roll_cols: int = 8,
) -> list[dict[str, Any]]:
    """Standard A4 Gyana Vikash-style block placement."""
    total_questions = max(1, min(int(total_questions), 400))
    columns = max(1, min(int(columns), 6))
    roll_cols = max(4, min(int(roll_cols), 12))
    options = "".join(ch for ch in (options or "ABCD").upper() if ch in "ABCDEF") or "ABCD"
    per_col = (total_questions + columns - 1) // columns
    blocks: list[dict[str, Any]] = [
        {"id": "pre-name", "kind": "name", "cols": 22, "rows": 26, "x0": 0.07, "y0": 0.085, "x1": 0.60, "y1": 0.40},
        {"id": "pre-roll", "kind": "roll", "cols": roll_cols, "rows": 10, "x0": 0.63, "y0": 0.085, "x1": 0.935, "y1": 0.255},
        {"id": "pre-test-no", "kind": "test_no", "cols": 3, "rows": 10, "x0": 0.63, "y0": 0.275, "x1": 0.76, "y1": 0.40, "map_to": "test_no"},
        {"id": "pre-test-id", "kind": "test_id", "cols": 4, "rows": 10, "x0": 0.775, "y0": 0.275, "x1": 0.935, "y1": 0.40, "map_to": "test_id"},
        {"id": "pre-date", "kind": "date", "cols": 6, "rows": 10, "x0": 0.63, "y0": 0.42, "x1": 0.935, "y1": 0.545, "map_to": "exam_date"},
    ]
    left, right, top, bottom = 0.07, 0.935, 0.57, 0.945
    gap = 0.012
    width = (right - left - gap * (columns - 1)) / columns
    q = 1
    for i in range(columns):
        end = min(q + per_col - 1, total_questions)
        x0 = left + i * (width + gap)
        blocks.append(
            {
                "id": f"pre-answers-{i + 1}",
                "kind": "answers",
                "start_q": q,
                "end_q": end,
                "x0": x0,
                "y0": top,
                "x1": x0 + width,
                "y1": bottom,
                "options": options,
            }
        )
        q = end + 1
        if q > total_questions:
            break
    return sanitize_blocks(blocks, total_questions=total_questions, options=options)


def a4_design_layout(
    name: str,
    slug: str,
    total_questions: int,
    columns: int,
    options: str = "ABCD",
    description: str = "",
    default_maps: list[dict[str, Any]] | None = None,
    roll_cols: int = 8,
    blocks: list[dict[str, Any]] | None = None,
    school_name: str = "GYANA VIKASH ENGLISH MEDIUM SCHOOL, BERHAMPUR",
) -> dict[str, Any]:
    options = "".join(ch for ch in (options or "ABCD").upper() if ch in "ABCDEF") or "ABCD"
    total_questions = max(1, min(int(total_questions), 400))
    columns = max(1, min(int(columns), 6))
    placed = blocks if blocks is not None else predefined_a4_blocks(
        total_questions=total_questions,
        columns=columns,
        options=options,
        roll_cols=roll_cols,
    )
    config = {
        "slug": slug,
        "name": name,
        "description": description or f"A4 OMR design with {total_questions} questions.",
        "page_width": A4_WIDTH_PX,
        "page_height": A4_HEIGHT_PX,
        "page_width_mm": A4_WIDTH_MM,
        "page_height_mm": A4_HEIGHT_MM,
        "options": options,
        "total_questions": total_questions,
        "answer_columns": columns,
        "designed": True,
        "bubble_diameter_mm": BUBBLE_DIAMETER_MM,
        "school_name": school_name,
        "timing_marks": {"side_margin": 0.045, "min_count": 12},
        "default_maps": default_maps
        or [{"subject": "Paper", "code": "PAP", "start_q": 1, "end_q": total_questions}],
        "name_text": {"x": 0.07, "y": 0.062},
        "date_text": {"x": 0.63, "y": 0.062},
    }
    return apply_blocks_to_config(config, placed)


BUILTIN_LAYOUTS: list[dict[str, Any]] = []
RETIRED_LAYOUT_SLUGS = ("gyana-vikash-180", "standard-100", "jee-main-90")


def layout_preview(layout: dict[str, Any]) -> dict[str, Any]:
    return {
        "slug": layout["slug"],
        "total_questions": layout["total_questions"],
        "options": layout["options"],
        "default_maps": layout.get("default_maps", []),
        "roll_cols": layout.get("roll", {}).get("cols", 0),
        "designed": bool(layout.get("designed")),
        "page": "A4",
    }


def clone_layout(layout: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(layout)


DIGIT_KINDS = ("roll", "test_no", "test_id", "date")
UNIQUE_KINDS = ("roll", "name", "test_no", "test_id", "date")
BLOCK_LABELS = {
    "roll": "Roll No",
    "name": "Candidate Name",
    "test_no": "Test No",
    "test_id": "Test ID",
    "date": "Date",
    "answers": "Answer bubbles",
}


def _norm_box(block: dict[str, Any]) -> tuple[float, float, float, float]:
    x0 = float(block["x0"])
    y0 = float(block["y0"])
    x1 = float(block["x1"])
    y1 = float(block["y1"])
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    x0 = min(1.0, max(0.0, x0))
    y0 = min(1.0, max(0.0, y0))
    x1 = min(1.0, max(0.0, x1))
    y1 = min(1.0, max(0.0, y1))
    if x1 - x0 < 0.004:
        x1 = min(1.0, x0 + 0.004)
    if y1 - y0 < 0.004:
        y1 = min(1.0, y0 + 0.004)
    return x0, y0, x1, y1


def digit_grid_from_box(
    cols: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    rows: int = 10,
    radius: float | None = None,
) -> dict[str, Any]:
    cols = max(1, int(cols))
    rows = max(1, int(rows))
    col_w = (x1 - x0) / cols
    row_h = (y1 - y0) / rows
    if radius is None:
        radius = bubble_radius_norm()
    bubbles = []
    for c in range(cols):
        for d in range(min(rows, 10)):
            bubbles.append(
                {
                    "col": c,
                    "digit": str(d),
                    "x": x0 + (c + 0.5) * col_w,
                    "y": y0 + (d + 0.5) * row_h,
                    "r": radius,
                }
            )
    return {"cols": cols, "bubbles": bubbles, "box": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}}


def name_grid_from_box(
    cols: int,
    rows: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    radius: float | None = None,
) -> dict[str, Any]:
    cols = max(1, int(cols))
    rows = max(1, min(26, int(rows)))
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    col_w = (x1 - x0) / cols
    row_h = (y1 - y0) / rows
    if radius is None:
        radius = bubble_radius_norm()
    bubbles = []
    for c in range(cols):
        for r in range(rows):
            bubbles.append(
                {
                    "col": c,
                    "letter": letters[r],
                    "x": x0 + (c + 0.5) * col_w,
                    "y": y0 + (r + 0.5) * row_h,
                    "r": radius,
                }
            )
    return {"cols": cols, "rows": rows, "bubbles": bubbles, "box": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}}


def questions_from_answer_box(
    start_q: int,
    end_q: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    options: str = "ABCD",
    radius: float | None = None,
) -> list[dict[str, Any]]:
    start_q = max(1, int(start_q))
    end_q = max(start_q, int(end_q))
    letters = "".join(ch for ch in (options or "ABCD").upper() if ch in "ABCDEF") or "ABCD"
    count = end_q - start_q + 1
    nopt = len(letters)
    row_h = (y1 - y0) / count
    col_w = (x1 - x0) / nopt
    if radius is None:
        radius = bubble_radius_norm()
    questions = []
    for i, q in enumerate(range(start_q, end_q + 1)):
        y = y0 + (i + 0.5) * row_h
        opts = [
            {"label": letter, "x": x0 + (j + 0.5) * col_w, "y": y, "r": radius}
            for j, letter in enumerate(letters)
        ]
        questions.append({"number": q, "options": opts})
    return questions


def sanitize_blocks(raw: list | None, *, total_questions: int, options: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    seen_unique: set[str] = set()
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or item.get("key") or "").strip()
        if kind not in BLOCK_LABELS:
            continue
        if kind in UNIQUE_KINDS and kind in seen_unique:
            continue
        if kind in UNIQUE_KINDS:
            seen_unique.add(kind)
        x0, y0, x1, y1 = _norm_box(item)
        block: dict[str, Any] = {
            "id": str(item.get("id") or f"{kind}-{len(blocks) + 1}"),
            "kind": kind,
            "label": BLOCK_LABELS[kind],
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "map_to": str(item.get("map_to") or ""),
        }
        if kind in DIGIT_KINDS:
            block["cols"] = max(1, min(16, int(item.get("cols") or (8 if kind == "roll" else 6 if kind == "date" else 3))))
            block["rows"] = 10
        elif kind == "name":
            block["cols"] = max(1, min(40, int(item.get("cols") or 22)))
            block["rows"] = max(10, min(30, int(item.get("rows") or 26)))
        else:
            start_q = int(item.get("start_q") or 1)
            end_q = int(item.get("end_q") or total_questions)
            block["start_q"] = max(1, start_q)
            block["end_q"] = max(block["start_q"], min(total_questions, end_q))
            block["options"] = options
        if kind in ("test_no", "test_id", "date") and not block["map_to"]:
            block["map_to"] = {"test_no": "test_no", "test_id": "test_id", "date": "exam_date"}[kind]
        blocks.append(block)
    return blocks


def apply_blocks_to_config(config: dict[str, Any], blocks: list[dict[str, Any]]) -> dict[str, Any]:
    config = deepcopy(config)
    options = config.get("options") or "ABCD"
    total_questions = int(config.get("total_questions") or 1)
    clean = sanitize_blocks(blocks, total_questions=total_questions, options=options)
    config["blocks"] = clean
    config["bubble_diameter_mm"] = BUBBLE_DIAMETER_MM
    radius = bubble_radius_norm(float(config.get("page_width_mm") or A4_WIDTH_MM))
    for kind in DIGIT_KINDS:
        config.pop(kind, None)
    config.pop("name", None)
    answer_questions: list[dict[str, Any]] = []
    for block in clean:
        kind = block["kind"]
        x0, y0, x1, y1 = block["x0"], block["y0"], block["x1"], block["y1"]
        if kind in DIGIT_KINDS:
            config[kind] = digit_grid_from_box(block["cols"], x0, y0, x1, y1, block.get("rows") or 10, radius=radius)
        elif kind == "name":
            config["name"] = {k: block[k] for k in ("cols", "rows", "x0", "y0", "x1", "y1")}
            config["name"]["bubbles"] = name_grid_from_box(
                block["cols"], block["rows"], x0, y0, x1, y1, radius=radius
            )["bubbles"]
        elif kind == "answers":
            answer_questions.extend(
                questions_from_answer_box(block["start_q"], block["end_q"], x0, y0, x1, y1, options, radius=radius)
            )
    if answer_questions:
        by_number: dict[int, dict[str, Any]] = {}
        for question in answer_questions:
            by_number[int(question["number"])] = question
        config["questions"] = [by_number[n] for n in sorted(by_number)]
        config["total_questions"] = max(int(config.get("total_questions") or 1), max(by_number))
    return config
