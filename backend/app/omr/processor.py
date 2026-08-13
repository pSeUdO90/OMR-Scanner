from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from .layouts import clone_layout


def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def _find_timing_marks(binary: np.ndarray, side: str) -> list[tuple[float, float]]:
    h, w = binary.shape
    x0, x1 = (0, int(0.08 * w)) if side == "left" else (int(0.92 * w), w)
    roi = binary[:, x0:x1]
    contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    marks: list[tuple[float, float]] = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        aspect = ch / max(cw, 1)
        area = cw * ch
        if 1.15 < aspect < 10 and 15 < area < 8000 and ch < h * 0.05:
            marks.append((x0 + x + cw / 2.0, y + ch / 2.0))
    marks.sort(key=lambda p: p[1])
    return marks


def align_sheet(image: np.ndarray, layout: dict) -> np.ndarray:
    gray = _to_gray(image)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 8
    )
    left = _find_timing_marks(binary, "left")
    right = _find_timing_marks(binary, "right")
    dst_w, dst_h = int(layout["page_width"]), int(layout["page_height"])
    min_count = int(layout.get("timing_marks", {}).get("min_count", 8))
    if len(left) >= min_count and len(right) >= min_count:
        src = np.float32([left[0], right[0], right[-1], left[-1]])
        dst = np.float32([[0, 0], [dst_w - 1, 0], [dst_w - 1, dst_h - 1], [0, dst_h - 1]])
        matrix = cv2.getPerspectiveTransform(src, dst)
        return cv2.warpPerspective(gray, matrix, (dst_w, dst_h))
    return cv2.resize(gray, (dst_w, dst_h))


def bubble_fill_ratio(gray: np.ndarray, nx: float, ny: float, nr: float) -> float:
    h, w = gray.shape
    r = max(3, int(nr * min(w, h)))
    inner = max(2, int(r * 0.55))
    cx, cy = int(nx * w), int(ny * h)
    x0, y0 = max(cx - inner, 0), max(cy - inner, 0)
    x1, y1 = min(cx + inner + 1, w), min(cy + inner + 1, h)
    roi = gray[y0:y1, x0:x1]
    if roi.size == 0:
        return 0.0
    mask = np.zeros_like(roi)
    cv2.circle(mask, (cx - x0, cy - y0), inner, 255, -1)
    dark = (roi < 120) & (mask > 0)
    return float(dark.sum()) / float(max(int((mask > 0).sum()), 1))


def read_choice(gray: np.ndarray, options: list[dict]) -> tuple[str | None, dict[str, float]]:
    ratios = {opt["label"]: bubble_fill_ratio(gray, opt["x"], opt["y"], opt["r"]) for opt in options}
    ranked = sorted(ratios.items(), key=lambda item: -item[1])
    if not ranked or ranked[0][1] < 0.45:
        return None, ratios
    if len(ranked) > 1 and ranked[1][1] > 0.40 and ranked[0][1] - ranked[1][1] < 0.12:
        return "MULTI", ratios
    return ranked[0][0], ratios


def read_digit_grid(gray: np.ndarray, grid: dict) -> str:
    cols = int(grid["cols"])
    by_col: dict[int, list[dict]] = {c: [] for c in range(cols)}
    for bubble in grid["bubbles"]:
        by_col[int(bubble["col"])].append(bubble)
    digits = []
    for c in range(cols):
        options = [{"label": b["digit"], "x": b["x"], "y": b["y"], "r": b["r"]} for b in by_col[c]]
        choice, _ = read_choice(gray, options)
        digits.append(choice if choice and choice != "MULTI" else "")
    return "".join(digits)


def evaluate_image(image: np.ndarray, layout: dict) -> dict:
    aligned = align_sheet(image, layout)
    overlay = cv2.cvtColor(aligned, cv2.COLOR_GRAY2BGR)
    h, w = aligned.shape
    answers: dict[str, str] = {}
    for question in layout["questions"]:
        marked, _ = read_choice(aligned, question["options"])
        answers[str(question["number"])] = marked or ""
        for opt in question["options"]:
            cx, cy = int(opt["x"] * w), int(opt["y"] * h)
            r = max(3, int(opt["r"] * min(w, h)))
            color = (40, 180, 80) if marked == opt["label"] else (180, 180, 180)
            if marked == "MULTI":
                color = (40, 40, 220)
            cv2.circle(overlay, (cx, cy), r + 2, color, 1)
    roll = read_digit_grid(aligned, layout["roll"]) if layout.get("roll") else ""
    return {"roll": roll, "answers": answers, "overlay": overlay, "aligned": aligned}


def load_image(path: str | Path) -> np.ndarray:
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    return image


def save_image(path: str | Path, image: np.ndarray) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    ext = Path(path).suffix or ".png"
    ok, buf = cv2.imencode(ext, image)
    if not ok:
        raise ValueError(f"Could not encode image: {path}")
    Path(path).write_bytes(buf.tobytes())


def parse_layout(config_json: str) -> dict:
    return clone_layout(json.loads(config_json))
