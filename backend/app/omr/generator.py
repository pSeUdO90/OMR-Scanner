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


def _fill_bubble(canvas: np.ndarray, nx: float, ny: float, nr: float, filled: bool) -> None:
    h, w = canvas.shape[:2]
    cx, cy = int(nx * w), int(ny * h)
    r = max(4, int(nr * min(w, h)))
    color = (15, 15, 15) if filled else (170, 90, 200)
    thickness = -1 if filled else 1
    cv2.circle(canvas, (cx, cy), r, color, thickness)


def generate_sheet(
    layout: dict,
    roll: str,
    answers: dict[int, str],
    *,
    student_name: str = "",
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

    roll = roll.ljust(layout["roll"]["cols"])[: layout["roll"]["cols"]]
    for bubble in layout["roll"]["bubbles"]:
        filled = roll[bubble["col"]] == bubble["digit"]
        _fill_bubble(canvas, bubble["x"], bubble["y"], bubble["r"], filled)

    for question in layout["questions"]:
        marked = answers.get(int(question["number"]), "")
        for opt in question["options"]:
            _fill_bubble(canvas, opt["x"], opt["y"], opt["r"], opt["label"] == marked)

    return canvas
