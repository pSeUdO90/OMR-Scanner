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


def generate_sheet(
    layout: dict,
    roll: str,
    answers: dict[int, str],
    *,
    student_name: str = "",
    test_id: str = "",
    test_no: str = "",
) -> np.ndarray:
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
