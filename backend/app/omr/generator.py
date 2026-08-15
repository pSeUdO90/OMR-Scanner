from __future__ import annotations

import cv2
import numpy as np

from .layouts import clone_layout


def _draw_timing_marks(canvas: np.ndarray, layout: dict) -> None:
    h, w = canvas.shape[:2]
    count = 42
    for i in range(count):
        y = int((0.03 + i * 0.022) * h)
        for x_frac in (0.018, 0.972):
            x = int(x_frac * w)
            cv2.rectangle(canvas, (x - 10, y - 8), (x + 10, y + 8), (20, 20, 20), -1)


def _fill_bubble(canvas: np.ndarray, nx: float, ny: float, nr: float, filled: bool, *, draw_empty: bool = True) -> None:
    if not filled and not draw_empty:
        return
    h, w = canvas.shape[:2]
    cx, cy = int(nx * w), int(ny * h)
    r = max(4, int(nr * min(w, h)))
    color = (15, 15, 15) if filled else (170, 90, 200)
    thickness = -1 if filled else 1
    cv2.circle(canvas, (cx, cy), r, color, thickness)


def _grid_digits(value: str, cols: int) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if cols <= 0:
        return ""
    return digits.zfill(cols)[-cols:]


def _fill_digit_grid(canvas: np.ndarray, grid: dict | None, value: str, *, draw_empty: bool = True) -> None:
    if not grid:
        return
    cols = int(grid.get("cols") or 0)
    value = _grid_digits(value, cols)
    for bubble in grid.get("bubbles") or []:
        filled = bool(cols) and value[bubble["col"]] == bubble["digit"]
        _fill_bubble(canvas, bubble["x"], bubble["y"], bubble["r"], filled, draw_empty=draw_empty)


def _put_text(canvas: np.ndarray, text: str, box: dict | None, default: tuple[float, float]) -> None:
    if not text:
        return
    h, w = canvas.shape[:2]
    nx, ny = (box or {}).get("x", default[0]), (box or {}).get("y", default[1])
    cv2.putText(
        canvas,
        text[:42],
        (int(float(nx) * w), int(float(ny) * h)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (20, 20, 20),
        2,
        cv2.LINE_AA,
    )


def date_digits(exam_date, cols: int) -> str:
    text = str(exam_date or "")
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) >= 8:
        # YYYYMMDD -> DDMMYY or DDMMYYYY
        yyyy, mm, dd = digits[:4], digits[4:6], digits[6:8]
        packed = f"{dd}{mm}{yyyy}" if cols >= 8 else f"{dd}{mm}{yyyy[2:]}"
        return _grid_digits(packed, cols)
    return _grid_digits(digits, cols)


def prefill_on_layout_sample(
    sample: np.ndarray,
    layout: dict,
    *,
    roll: str,
    student_name: str = "",
    test_id: str = "",
    test_no: str = "",
    exam_date: str = "",
) -> np.ndarray:
    """Fill student fields onto the uploaded OMR layout image/PDF page."""
    layout = clone_layout(layout)
    w, h = int(layout["page_width"]), int(layout["page_height"])
    canvas = cv2.resize(sample, (w, h), interpolation=cv2.INTER_CUBIC)
    date_grid = layout.get("date")
    cols = int((date_grid or {}).get("cols") or 6)
    _fill_digit_grid(canvas, layout.get("roll"), roll, draw_empty=False)
    _fill_digit_grid(canvas, layout.get("test_id"), test_id, draw_empty=False)
    _fill_digit_grid(canvas, layout.get("test_no"), test_no, draw_empty=False)
    _fill_digit_grid(canvas, date_grid, date_digits(exam_date, cols), draw_empty=False)
    _put_text(canvas, student_name, layout.get("name_text"), (0.10, 0.078))
    printed = str(exam_date or "")
    if printed:
        _put_text(canvas, printed, layout.get("date_text"), (0.72, 0.078))
    return canvas


def generate_designed_sheet(
    layout: dict,
    roll: str = "",
    answers: dict[int, str] | None = None,
    *,
    student_name: str = "",
    test_id: str = "",
    test_no: str = "",
    exam_date: str = "",
) -> np.ndarray:
    """Render a printable A4 OMR from predefined/manual data blocks."""
    layout = clone_layout(layout)
    w, h = int(layout.get("page_width") or 1654), int(layout.get("page_height") or 2339)
    canvas = np.full((h, w, 3), 255, dtype=np.uint8)
    crimson = (53, 14, 166)
    midnight = (45, 26, 5)
    teal = (135, 129, 6)
    cv2.rectangle(canvas, (8, 8), (w - 9, h - 9), crimson, 5)
    _draw_timing_marks(canvas, layout)
    school = str(layout.get("school_name") or "GYANA VIKASH ENGLISH MEDIUM SCHOOL, BERHAMPUR")
    cv2.putText(canvas, school[:62], (int(0.07 * w), int(0.038 * h)), cv2.FONT_HERSHEY_SIMPLEX, 0.62, crimson, 2, cv2.LINE_AA)
    subtitle = f"{layout.get('name') or 'OMR'}  ·  A4  ·  {layout.get('total_questions')} Q  ·  {layout.get('options', 'ABCD')}"
    cv2.putText(canvas, subtitle[:70], (int(0.07 * w), int(0.058 * h)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, midnight, 1, cv2.LINE_AA)
    if student_name:
        _put_text(canvas, student_name, layout.get("name_text"), (0.07, 0.072))

    answers = answers or {}
    for block in layout.get("blocks") or []:
        _draw_block_frame(canvas, block, midnight)
        kind = block["kind"]
        if kind == "name":
            _draw_name_block(canvas, layout.get("name") or {}, student_name)
        elif kind in ("roll", "test_no", "test_id", "date"):
            value = {"roll": roll, "test_id": test_id, "test_no": test_no, "date": date_digits(exam_date, int(block.get("cols") or 6))}[kind]
            _fill_digit_grid(canvas, layout.get(kind), value)
            _draw_digit_row_labels(canvas, block)
        elif kind == "answers":
            _draw_answer_headers(canvas, block, layout.get("options") or "ABCD")

    for question in layout.get("questions") or []:
        marked = answers.get(int(question["number"]), "")
        opts = question["options"]
        if opts:
            qx = int((opts[0]["x"] - 0.018) * w)
            qy = int(opts[0]["y"] * h + 4)
            cv2.putText(canvas, f"{question['number']:02d}", (max(8, qx), qy), cv2.FONT_HERSHEY_SIMPLEX, 0.28, teal, 1, cv2.LINE_AA)
        for opt in opts:
            _fill_bubble(canvas, opt["x"], opt["y"], opt["r"], opt["label"] == marked)
    return canvas


def _draw_block_frame(canvas: np.ndarray, block: dict, color: tuple[int, int, int]) -> None:
    h, w = canvas.shape[:2]
    x0, y0 = int(block["x0"] * w), int(block["y0"] * h)
    x1, y1 = int(block["x1"] * w), int(block["y1"] * h)
    cv2.rectangle(canvas, (x0, y0), (x1, y1), color, 1)
    label = str(block.get("label") or block.get("kind") or "")
    cv2.putText(canvas, label, (x0, max(16, y0 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.38, color, 1, cv2.LINE_AA)


def _draw_digit_row_labels(canvas: np.ndarray, block: dict) -> None:
    h, w = canvas.shape[:2]
    rows = int(block.get("rows") or 10)
    y0, y1 = block["y0"], block["y1"]
    x0 = block["x0"]
    row_h = (y1 - y0) / rows
    for d in range(min(rows, 10)):
        y = int((y0 + (d + 0.5) * row_h) * h + 4)
        cv2.putText(canvas, str(d), (int(x0 * w) - 14, y), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (40, 40, 40), 1, cv2.LINE_AA)


def _draw_answer_headers(canvas: np.ndarray, block: dict, options: str) -> None:
    h, w = canvas.shape[:2]
    letters = options or "ABCD"
    n = len(letters)
    x0, x1, y0 = block["x0"], block["x1"], block["y0"]
    col_w = (x1 - x0) / n
    for j, letter in enumerate(letters):
        x = int((x0 + (j + 0.5) * col_w) * w - 4)
        cv2.putText(canvas, letter, (x, int(y0 * h) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (40, 40, 40), 1, cv2.LINE_AA)


def _draw_name_block(canvas: np.ndarray, grid: dict, student_name: str) -> None:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    name = "".join(ch for ch in (student_name or "").upper() if ch in letters)
    for bubble in grid.get("bubbles") or []:
        col = int(bubble.get("col") or 0)
        filled = col < len(name) and bubble.get("letter") == name[col]
        _fill_bubble(canvas, bubble["x"], bubble["y"], bubble["r"], filled)
    h, w = canvas.shape[:2]
    box = grid.get("box") or {}
    rows = int(grid.get("rows") or 26)
    if box and rows:
        y0, y1, x0 = float(box["y0"]), float(box["y1"]), float(box["x0"])
        row_h = (y1 - y0) / rows
        for r, letter in enumerate(letters[:rows]):
            y = int((y0 + (r + 0.5) * row_h) * h + 4)
            cv2.putText(canvas, letter, (int(x0 * w) - 14, y), cv2.FONT_HERSHEY_SIMPLEX, 0.28, (40, 40, 40), 1, cv2.LINE_AA)


def generate_sheet(
    layout: dict,
    roll: str,
    answers: dict[int, str],
    *,
    student_name: str = "",
    test_id: str = "",
    test_no: str = "",
    exam_date: str = "",
) -> np.ndarray:
    if layout.get("designed") or layout.get("blocks"):
        return generate_designed_sheet(
            layout,
            roll,
            answers,
            student_name=student_name,
            test_id=test_id,
            test_no=test_no,
            exam_date=exam_date,
        )
    layout = clone_layout(layout)
    w, h = int(layout["page_width"]), int(layout["page_height"])
    canvas = np.full((h, w, 3), 255, dtype=np.uint8)
    magenta = (90, 30, 180)
    cv2.rectangle(canvas, (0, 0), (w - 1, h - 1), magenta, 6)
    _draw_timing_marks(canvas, layout)
    cv2.putText(
        canvas,
        "GYANA VIKASH ENGLISH MEDIUM SCHOOL, BERHAMPUR",
        (int(0.08 * w), int(0.035 * h)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        magenta,
        2,
        cv2.LINE_AA,
    )
    if student_name:
        cv2.putText(
            canvas,
            student_name[:40],
            (int(0.08 * w), int(0.06 * h)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (40, 40, 40),
            1,
            cv2.LINE_AA,
        )

    _fill_digit_grid(canvas, layout.get("roll"), roll)
    _fill_digit_grid(canvas, layout.get("test_id"), test_id)
    _fill_digit_grid(canvas, layout.get("test_no"), test_no)

    for question in layout["questions"]:
        marked = answers.get(int(question["number"]), "")
        for opt in question["options"]:
            _fill_bubble(canvas, opt["x"], opt["y"], opt["r"], opt["label"] == marked)

    return canvas
