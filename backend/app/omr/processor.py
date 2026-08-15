from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from .de_skew_engine import OMRAlignmentError, align_omr_array
from .layouts import clone_layout
from .studio_render import apply_studio_eval_layout


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
        area = cw * ch
        if 15 < area < 8000 and ch < h * 0.05:
            aspect = ch / max(cw, 1)
            wide_bar = 0.18 < aspect < 0.85 and cw >= 8
            tall_bar = 1.15 < aspect < 12 and cw >= 3
            if wide_bar or tall_bar:
                marks.append((x0 + x + cw / 2.0, y + ch / 2.0))
    marks.sort(key=lambda p: p[1])
    return marks


def align_sheet(image: np.ndarray, layout: dict) -> np.ndarray:
    gray = _to_gray(image)
    dst_w, dst_h = int(layout["page_width"]), int(layout["page_height"])
    try:
        warped, _meta = align_omr_array(image, layout, debug=False)
        return _to_gray(warped)
    except OMRAlignmentError:
        pass
    if layout.get("studio"):
        warped = _align_studio_fiducials(gray, layout, dst_w, dst_h)
        if warped is not None:
            return warped
        if gray.shape[1] == dst_w and gray.shape[0] == dst_h:
            return gray
        return cv2.resize(gray, (dst_w, dst_h))
    if layout.get("designed"):
        if gray.shape[1] == dst_w and gray.shape[0] == dst_h:
            return gray
        return cv2.resize(gray, (dst_w, dst_h))
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 8
    )
    left = _find_timing_marks(binary, "left")
    right = _find_timing_marks(binary, "right")
    if len(left) >= 50 and len(right) >= 50:
        src = np.float32([left[0], right[0], right[-1], left[-1]])
        dst = np.float32([[0, 0], [dst_w - 1, 0], [dst_w - 1, dst_h - 1], [0, dst_h - 1]])
        matrix = cv2.getPerspectiveTransform(src, dst)
        return cv2.warpPerspective(gray, matrix, (dst_w, dst_h))
    return cv2.resize(gray, (dst_w, dst_h))


def _align_studio_fiducials(gray: np.ndarray, layout: dict, dst_w: int, dst_h: int) -> np.ndarray | None:
    geo = layout.get("studio_geometry") or {}
    page_w = float(geo.get("pageWidthMm") or layout.get("page_width_mm") or 210)
    page_h = float(geo.get("pageHeightMm") or layout.get("page_height_mm") or 297)
    size = float(geo.get("fiducialMm") or 8)
    inset = float(geo.get("fiducialInsetMm") or 5)
    expected = [
        (inset + size / 2, inset + size / 2),
        (page_w - inset - size / 2, inset + size / 2),
        (page_w - inset - size / 2, page_h - inset - size / 2),
        (inset + size / 2, page_h - inset - size / 2),
    ]
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 8)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape
    min_area = (0.012 * min(w, h)) ** 2
    max_area = (0.08 * min(w, h)) ** 2
    squares = []
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        area = cw * ch
        if area < min_area or area > max_area:
            continue
        aspect = cw / max(ch, 1)
        if 0.65 < aspect < 1.45:
            squares.append((x + cw / 2.0, y + ch / 2.0))
    if len(squares) < 4:
        return None
    src = []
    used = set()
    for ex, ey in expected:
        tx, ty = ex / page_w * w, ey / page_h * h
        best = None
        best_d = 1e18
        for i, (sx, sy) in enumerate(squares):
            if i in used:
                continue
            d = (sx - tx) ** 2 + (sy - ty) ** 2
            if d < best_d:
                best_d = d
                best = i
        if best is None:
            return None
        used.add(best)
        src.append(squares[best])
    dst = np.float32([(ex / page_w * (dst_w - 1), ey / page_h * (dst_h - 1)) for ex, ey in expected])
    matrix = cv2.getPerspectiveTransform(np.float32(src), dst)
    return cv2.warpPerspective(gray, matrix, (dst_w, dst_h))


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


def read_choice(gray: np.ndarray, options: list[dict], *, min_fill: float = 0.45) -> tuple[str | None, dict[str, float]]:
    ratios = {opt["label"]: bubble_fill_ratio(gray, opt["x"], opt["y"], opt["r"]) for opt in options}
    ranked = sorted(ratios.items(), key=lambda item: -item[1])
    if not ranked or ranked[0][1] < min_fill:
        return None, ratios
    if len(ranked) > 1 and ranked[1][1] > min_fill - 0.05 and ranked[0][1] - ranked[1][1] < 0.12:
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
        choice, _ = read_choice(gray, options, min_fill=0.28)
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
    if layout.get("roll"):
        for bubble in layout["roll"].get("bubbles", []):
            cx, cy = int(bubble["x"] * w), int(bubble["y"] * h)
            r = max(3, int(bubble["r"] * min(w, h)))
            digit = str(bubble.get("digit", ""))
            col = int(bubble.get("col", 0))
            marked = len(roll) > col and roll[col] == digit
            color = (40, 180, 80) if marked else (180, 180, 180)
            cv2.circle(overlay, (cx, cy), r + 1, color, 1)
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
    layout = clone_layout(json.loads(config_json))
    if layout.get("studio"):
        apply_studio_eval_layout(layout)
    return layout
