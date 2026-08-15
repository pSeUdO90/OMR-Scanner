"""Rasterize an A4 OMR Studio layout from stored geometry and blocks."""

from __future__ import annotations

import cv2
import numpy as np

DPI = 200
MM_PER_INCH = 25.4

DEFAULT_GEOMETRY = {
    "pageWidthMm": 210,
    "pageHeightMm": 297,
    "cellMm": 6.5,
    "gridCols": 32,
    "gridRows": 45,
    "bubbleDiameterMm": 4.5,
    "fiducialMm": 8,
    "fiducialInsetMm": 5,
    "fiducialKeepoutMm": 5,
    "timingWidthMm": 5,
    "timingHeightMm": 2.5,
    "syncTimingToBubbleRows": True,
    "extraTimingRows": 0,
    "marginTopMm": 8,
    "marginRightMm": 8,
    "marginBottomMm": 8,
    "marginLeftMm": 8,
}


def _num(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _geo(config: dict) -> dict:
    raw = config.get("studio_geometry") or {}
    geo = {**DEFAULT_GEOMETRY, **raw}
    for key, default in DEFAULT_GEOMETRY.items():
        geo[key] = _num(geo.get(key), default) if not isinstance(default, bool) else bool(geo.get(key, default))
    geo["syncTimingToBubbleRows"] = bool(raw.get("syncTimingToBubbleRows", True) if "syncTimingToBubbleRows" in raw else True)
    return geo


def _px(mm: float) -> int:
    return max(1, int(round(mm * DPI / MM_PER_INCH)))


def _origin(g: dict) -> tuple[float, float]:
    left = g["marginLeftMm"]
    top = g["marginTopMm"]
    inner_w = max(0.0, g["pageWidthMm"] - left - g["marginRightMm"])
    inner_h = max(0.0, g["pageHeightMm"] - top - g["marginBottomMm"])
    used_w = g["gridCols"] * g["cellMm"]
    used_h = g["gridRows"] * g["cellMm"]
    return left + max(0.0, (inner_w - used_w) / 2), top + max(0.0, (inner_h - used_h) / 2)


def _cell_center(col: float, row: float, g: dict) -> tuple[float, float]:
    ox, oy = _origin(g)
    return ox + (col + 0.5) * g["cellMm"], oy + (row + 0.5) * g["cellMm"]


def _cell_origin(col: float, row: float, g: dict) -> tuple[float, float]:
    ox, oy = _origin(g)
    return ox + col * g["cellMm"], oy + row * g["cellMm"]


def _put(canvas: np.ndarray, text: str, x_mm: float, y_mm: float, scale: float = 0.32, anchor: str = "left") -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    thickness = 1
    size = cv2.getTextSize(text, font, scale, thickness)[0]
    x = _px(x_mm)
    y = _px(y_mm)
    if anchor == "middle":
        x -= size[0] // 2
    cv2.putText(canvas, text, (x, y), font, scale, (0, 0, 0), thickness, cv2.LINE_AA)


def _circle(canvas: np.ndarray, x_mm: float, y_mm: float, r_mm: float) -> None:
    cv2.circle(canvas, (_px(x_mm), _px(y_mm)), max(2, _px(r_mm)), (0, 0, 0), 1, cv2.LINE_AA)


def _fiducials(canvas: np.ndarray, g: dict) -> None:
    size = g["fiducialMm"]
    inset = g["fiducialInsetMm"]
    w, h = g["pageWidthMm"], g["pageHeightMm"]
    boxes = [
        (inset, inset),
        (w - inset - size, inset),
        (inset, h - inset - size),
        (w - inset - size, h - inset - size),
    ]
    for x, y in boxes:
        cv2.rectangle(canvas, (_px(x), _px(y)), (_px(x + size), _px(y + size)), (0, 0, 0), -1)


def _timing_rows(g: dict, blocks: list[dict]) -> list[int]:
    if g["syncTimingToBubbleRows"] and blocks:
        rows = sorted({int(block["row0"]) + r for block in blocks for r in range(int(block.get("rows") or 0))})
        extra = int(round(g["extraTimingRows"]))
        if extra and rows:
            last = rows[-1]
            rows.extend([last + i + 1 for i in range(extra) if last + i + 1 < int(g["gridRows"])])
        return [r for r in rows if 0 <= r < int(g["gridRows"])]
    return list(range(int(g["gridRows"])))


def _timing(canvas: np.ndarray, g: dict, blocks: list[dict]) -> None:
    for row in _timing_rows(g, blocks):
        cy = _cell_center(0, row, g)[1]
        y = cy - g["timingHeightMm"] / 2
        left_x = g["fiducialInsetMm"]
        right_x = g["pageWidthMm"] - g["fiducialInsetMm"] - g["timingWidthMm"]
        for x in (left_x, right_x):
            cv2.rectangle(
                canvas,
                (_px(x), _px(y)),
                (_px(x + g["timingWidthMm"]), _px(y + g["timingHeightMm"])),
                (0, 0, 0),
                -1,
            )


def _draw_digit_block(canvas: np.ndarray, block: dict, g: dict, *, date: bool) -> None:
    radius = g["bubbleDiameterMm"] / 2
    headers = ["D", "D", "M", "M", "Y", "Y", "Y", "Y"] if date else None
    cols, rows = int(block["cols"]), int(block["rows"])
    ox, oy = _cell_origin(block["col0"], block["row0"], g)
    _put(canvas, str(block.get("label") or ""), ox, oy - 2.4, 0.28)
    for col in range(cols):
        cx, _ = _cell_center(block["col0"] + col, block["row0"], g)
        caption = headers[col] if headers and col < len(headers) else str(col + 1)
        _put(canvas, caption, cx, oy - 0.6, 0.22, "middle")
        for row in range(rows):
            x, y = _cell_center(block["col0"] + col, block["row0"] + row, g)
            if col == 0:
                _put(canvas, str(row % 10), x - g["cellMm"] * 0.72, y + 0.8, 0.22)
            _circle(canvas, x, y, radius)


def _draw_name_block(canvas: np.ndarray, block: dict, g: dict) -> None:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    radius = g["bubbleDiameterMm"] / 2
    cols, rows = int(block["cols"]), int(block["rows"])
    ox, oy = _cell_origin(block["col0"], block["row0"], g)
    _put(canvas, str(block.get("label") or ""), ox, oy - 2.4, 0.28)
    for col in range(cols):
        cx, _ = _cell_center(block["col0"] + col, block["row0"], g)
        _put(canvas, str(col + 1), cx, oy - 0.6, 0.22, "middle")
        for row in range(rows):
            x, y = _cell_center(block["col0"] + col, block["row0"] + row, g)
            if col == 0:
                _put(canvas, letters[row % 26], x - g["cellMm"] * 0.72, y + 0.8, 0.22)
            _circle(canvas, x, y, radius)


def _draw_mcq_block(canvas: np.ndarray, block: dict, g: dict) -> None:
    options = str(block.get("options") or "ABCD")
    start_q = int(block.get("startQ") or 1)
    end_q = int(block.get("endQ") or start_q + int(block.get("rows") or 1) - 1)
    row_count = min(int(block.get("rows") or 1), max(1, end_q - start_q + 1))
    radius = g["bubbleDiameterMm"] / 2
    ox, oy = _cell_origin(block["col0"], block["row0"], g)
    _put(canvas, str(block.get("label") or ""), ox, oy - 2.4, 0.28)
    for c, letter in enumerate(options):
        cx, _ = _cell_center(block["col0"] + 1 + c, block["row0"], g)
        _put(canvas, letter, cx, oy - 0.6, 0.22, "middle")
    for r in range(row_count):
        lx, ly = _cell_center(block["col0"], block["row0"] + r, g)
        _put(canvas, f"{start_q + r:02d}", lx, ly + 0.8, 0.22, "middle")
        for c in range(len(options)):
            x, y = _cell_center(block["col0"] + 1 + c, block["row0"] + r, g)
            _circle(canvas, x, y, radius)


def generate_studio_sheet(config: dict) -> np.ndarray:
    g = _geo(config)
    w, h = _px(g["pageWidthMm"]), _px(g["pageHeightMm"])
    canvas = np.full((h, w, 3), 255, dtype=np.uint8)
    _fiducials(canvas, g)
    blocks = list(config.get("studio_blocks") or [])
    _timing(canvas, g, blocks)
    studio = config.get("studio_config") or {}
    title = str(studio.get("title") or config.get("name") or "OMR")
    _put(canvas, title, g["pageWidthMm"] / 2, 12, 0.45, "middle")
    for raw in blocks:
        block = {
            **raw,
            "col0": int(raw.get("col0") or 3),
            "row0": int(raw.get("row0") or 3),
            "cols": int(raw.get("cols") or 5),
            "rows": int(raw.get("rows") or 10),
        }
        kind = block.get("blockType") or "GRID_DIGIT"
        if kind == "GRID_MCQ":
            _draw_mcq_block(canvas, block, g)
        elif kind == "GRID_NAME":
            _draw_name_block(canvas, block, g)
        else:
            _draw_digit_block(canvas, block, g, date=kind == "GRID_DATE")
    return canvas
