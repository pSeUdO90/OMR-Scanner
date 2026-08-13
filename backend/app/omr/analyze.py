from __future__ import annotations

import cv2
import numpy as np

from .layouts import _digit_grid
from .processor import align_sheet, read_digit_grid


EXAM_TARGETS = [
    {"value": "", "label": "Ignore"},
    {"value": "exam_date", "label": "Exam Date"},
    {"value": "test_id", "label": "Test ID"},
    {"value": "test_no", "label": "Test No"},
]


def _cluster_1d(values: list[float], gap: float) -> list[list[float]]:
    if not values:
        return []
    ordered = sorted(values)
    groups: list[list[float]] = [[ordered[0]]]
    for value in ordered[1:]:
        if value - groups[-1][-1] <= gap:
            groups[-1].append(value)
        else:
            groups.append([value])
    return groups


def _detect_circles(gray: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    binary = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 6
    )
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    pts = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 20 or area > 400:
            continue
        peri = cv2.arcLength(contour, True)
        if peri < 12:
            continue
        circularity = 4 * np.pi * area / (peri * peri)
        x, y, bw, bh = cv2.boundingRect(contour)
        aspect = bw / max(bh, 1)
        if circularity < 0.55 or not (0.65 < aspect < 1.45) or not (8 <= bw <= 26):
            continue
        pts.append((x + bw / 2.0, y + bh / 2.0, max(bw, bh) / 2.0))
    if not pts:
        return np.zeros((0, 3), dtype=float)
    return np.array(pts, dtype=float)


def _grids_from_circles(circles: np.ndarray, w: int, h: int) -> list[dict]:
    if len(circles) < 12:
        return []
    grids: list[dict] = []
    for y_min, y_max in ((0.0, 0.50), (0.42, 1.0)):
        band = circles[(circles[:, 1] / h >= y_min) & (circles[:, 1] / h <= y_max)]
        if len(band) < 12:
            continue
        grids.extend(_grids_in_band(band, w, h))
    uniq = []
    for grid in grids:
        if grid["cols"] < 2:
            continue
        if any(abs(grid["cx"] - u["cx"]) < 0.05 and abs(grid["cy"] - u["cy"]) < 0.05 for u in uniq):
            continue
        uniq.append(grid)
    return _merge_header_digit_grids(uniq)


def _grids_in_band(circles: np.ndarray, w: int, h: int) -> list[dict]:
    xs = circles[:, 0]
    x_groups = _cluster_1d(xs.tolist(), 14.0)
    columns = []
    for group in x_groups:
        mean_x = float(np.mean(group))
        pts = circles[np.abs(circles[:, 0] - mean_x) <= 12]
        if len(pts) < 6:
            continue
        ys = sorted(pts[:, 1].tolist())
        diffs = np.diff(ys)
        if len(diffs):
            typical = float(np.percentile(diffs, 40))
            y_gap = max(6.0, min(14.0, typical * 0.75 if typical > 0 else 10.0))
        else:
            y_gap = 10.0
        y_groups = _cluster_1d(ys, y_gap)
        rows = [float(np.mean(g)) for g in y_groups]
        if len(rows) < 6:
            continue
        columns.append(
            {
                "x": mean_x,
                "y0": min(rows),
                "y1": max(rows),
                "rows": rows,
                "r": float(np.median(pts[:, 2])),
            }
        )
    columns.sort(key=lambda c: c["x"])
    grids: list[dict] = []
    current: list[dict] = []

    def flush() -> None:
        if len(current) < 1:
            current.clear()
            return
        xs_c = [c["x"] for c in current]
        y0 = float(np.median([c["y0"] for c in current]))
        y1 = float(np.median([c["y1"] for c in current]))
        row_n = int(round(np.median([len(c["rows"]) for c in current])))
        pitches = np.diff(xs_c)
        col_pitch = float(np.median(pitches)) if len(pitches) else 20.0
        row_pitch = (y1 - y0) / max(row_n - 1, 1)
        grids.append(
            {
                "cols": len(current),
                "rows": row_n,
                "x0": xs_c[0] / w,
                "x1": xs_c[-1] / w,
                "y0": y0 / h,
                "y1": y1 / h,
                "cx": float(np.mean(xs_c)) / w,
                "cy": ((y0 + y1) / 2) / h,
                "col_pitch": col_pitch / w,
                "row_pitch": row_pitch / h,
                "r": float(np.median([c["r"] for c in current])) / min(w, h),
            }
        )
        current.clear()

    for col in columns:
        if not current:
            current.append(col)
            continue
        dx = col["x"] - current[-1]["x"]
        expected = float(np.median(np.diff([c["x"] for c in current]))) if len(current) > 1 else 40.0
        y_overlap = min(col["y1"], current[-1]["y1"]) - max(col["y0"], current[-1]["y0"])
        span = max(col["y1"] - col["y0"], current[-1]["y1"] - current[-1]["y0"], 1)
        if dx < max(36.0, expected * 1.6) and y_overlap > 0.4 * span:
            current.append(col)
        else:
            flush()
            current.append(col)
    flush()
    return grids


def _merge_header_digit_grids(grids: list[dict]) -> list[dict]:
    header = []
    rest = []
    for grid in grids:
        digit_like = 6 <= grid["rows"] <= 14 and grid["cx"] >= 0.55 and grid["cy"] < 0.52
        if digit_like:
            header.append(grid)
        else:
            rest.append(grid)
    if len(header) < 2:
        return grids
    header.sort(key=lambda g: g["x0"])
    merged = dict(header[0])
    for grid in header[1:]:
        y_overlap = min(merged["y1"], grid["y1"]) - max(merged["y0"], grid["y0"])
        span = max(merged["y1"] - merged["y0"], grid["y1"] - grid["y0"], 0.01)
        if y_overlap <= 0.35 * span:
            rest.append(grid)
            continue
        gap = grid["x0"] - merged["x1"]
        extra = int(round(gap / max(merged["col_pitch"], 0.012))) - 1
        extra = max(0, extra)
        merged["cols"] = merged["cols"] + extra + grid["cols"]
        merged["x1"] = grid["x1"]
        merged["y0"] = min(merged["y0"], grid["y0"])
        merged["y1"] = max(merged["y1"], grid["y1"])
        merged["cx"] = (merged["x0"] + merged["x1"]) / 2
        merged["cy"] = (merged["y0"] + merged["y1"]) / 2
        merged["col_pitch"] = (merged["x1"] - merged["x0"]) / max(merged["cols"] - 1, 1)
        merged["row_pitch"] = (merged["y1"] - merged["y0"]) / max(merged["rows"] - 1, 1)
    if 6 <= merged["cols"] <= 10:
        return [merged] + rest
    return grids


def _classify_grid(grid: dict) -> str:
    cols, rows = grid["cols"], grid["rows"]
    cx, cy = grid["cx"], grid["cy"]
    if 18 <= rows <= 32 and cols >= 8 and cy < 0.50 and cx < 0.65:
        return "name"
    if 6 <= rows <= 14 and 4 <= cols <= 6 and cx >= 0.70 and cy >= 0.45:
        return "date"
    if 6 <= rows <= 14 and 6 <= cols <= 10 and cx >= 0.55 and cy < 0.52:
        return "roll"
    if 6 <= rows <= 14 and 2 <= cols <= 4 and cx >= 0.55 and cy < 0.62:
        return "test_block"
    if 6 <= rows <= 14 and cols == 6 and cx >= 0.50:
        return "date"
    if rows >= 20 and cols >= 3 and cy >= 0.42:
        return "answers"
    if 6 <= rows <= 14 and cols >= 6 and cx >= 0.58:
        return "roll"
    if cols == 6 and 6 <= rows <= 14:
        return "date"
    if 2 <= cols <= 4 and 6 <= rows <= 14 and cx >= 0.55:
        return "test_block"
    return "other"


def classify_sample_image(image, config: dict | None = None) -> tuple[dict, list[dict]]:
    """Detect bubble grids on a sample OMR and classify each field."""
    config = dict(config or {})
    if image is None:
        return config, analyze_layout_config(config, None)
    gray = align_sheet(image, config) if config.get("page_width") else None
    fields: list[dict] = []
    if gray is None:
        return config, analyze_layout_config(config, None)

    h, w = gray.shape
    circles = _detect_circles(gray)
    grids = _grids_from_circles(circles, w, h)
    classified = [(grid, _classify_grid(grid)) for grid in grids]
    classified.sort(key=lambda item: (item[0]["cy"], item[0]["cx"]))

    roll = next((g for g, kind in classified if kind == "roll"), None)
    name = next((g for g, kind in classified if kind == "name"), None)
    date = next((g for g, kind in classified if kind == "date"), None)
    answer_grids = [g for g, kind in classified if kind == "answers"]
    test_blocks = [g for g, kind in classified if kind == "test_block"]
    test_blocks.sort(key=lambda g: g["cx"])
    test_no = test_blocks[0] if test_blocks else None
    test_id = test_blocks[1] if len(test_blocks) > 1 else None
    if test_no is not None and test_id is None and test_no["cols"] >= 5:
        test_id = dict(test_no)
        left_cols = 3 if test_no["cols"] >= 6 else 2
        test_no = dict(test_no)
        test_no["cols"] = left_cols
        test_id["cols"] = max(1, test_id["cols"] - left_cols)
        test_id["x0"] = test_no["x0"] + left_cols * test_no["col_pitch"]
        test_no["x1"] = test_no["x0"] + (left_cols - 1) * test_no["col_pitch"]

    def apply_digit(key: str, grid: dict | None) -> None:
        if not grid:
            return
        row_pitch = grid["row_pitch"] or 0.013
        y0 = grid["y0"]
        if grid["rows"] > 10:
            y0 = grid["y1"] - 9 * row_pitch
        config[key] = _digit_grid(
            int(grid["cols"]),
            (grid["x0"], y0),
            grid["col_pitch"],
            row_pitch,
            grid["r"] or 0.005,
        )

    apply_digit("roll", roll)
    apply_digit("test_no", test_no)
    apply_digit("test_id", test_id)
    apply_digit("date", date)
    if name:
        config["name"] = {
            "cols": name["cols"],
            "rows": name["rows"],
            "x0": name["x0"],
            "y0": name["y0"],
            "x1": name["x1"],
            "y1": name["y1"],
        }
    if answer_grids:
        config["detected_answer_columns"] = len(answer_grids)

    def field(key: str, label: str, grid: dict | None, mappable: bool, extra: str = "") -> dict:
        detected = grid is not None
        value = ""
        detail = extra
        if grid:
            detail = f"{grid['cols']}×{grid['rows']} bubble grid · {extra}".strip(" ·")
            try:
                if key in ("roll", "test_no", "test_id", "date") and config.get(key) and gray is not None:
                    value = read_digit_grid(gray, config[key])
            except Exception:
                value = ""
        return {
            "key": key,
            "label": label,
            "class": label,
            "detected": detected,
            "detail": detail or ("Not found on this sample" if not detected else detail),
            "value": value,
            "mappable": mappable,
            "region": None if not grid else {"x0": grid["x0"], "y0": grid["y0"], "x1": grid["x1"], "y1": grid["y1"]},
        }

    binary = cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (5, 5), 0), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 8
    )
    left_ink = float(binary[:, : int(0.06 * w)].mean())
    right_ink = float(binary[:, int(0.94 * w) :].mean())
    timing = left_ink > 8 and right_ink > 8

    fields.append(field("roll", "Roll No", roll, False, "student identity"))
    fields.append(field("name", "Candidate Name", name, False, "A–Z letter grid"))
    fields.append(field("test_no", "Test No", test_no, True, "exam paper number"))
    fields.append(field("test_id", "Test ID", test_id, True, "unique test code"))
    fields.append(field("date", "Date", date, True, "DD/MM/YY"))
    nq = int(config.get("total_questions") or 0)
    ans_detail = f"{nq} questions · options {config.get('options', 'ABCD')}"
    if answer_grids:
        ans_detail = f"{len(answer_grids)} answer column(s) · {ans_detail}"
    ans_region = None
    if answer_grids:
        ans_region = {
            "x0": min(g["x0"] for g in answer_grids),
            "y0": min(g["y0"] for g in answer_grids),
            "x1": max(g["x1"] for g in answer_grids),
            "y1": max(g["y1"] for g in answer_grids),
        }
    fields.append(
        {
            "key": "answers",
            "label": "Answer bubbles",
            "class": "Answer bubbles",
            "detected": bool(answer_grids) or nq > 0,
            "detail": ans_detail,
            "value": str(nq or sum(g["rows"] for g in answer_grids)),
            "mappable": False,
            "region": ans_region,
        }
    )
    fields.append(
        {
            "key": "timing",
            "label": "Timing marks",
            "class": "Timing marks",
            "detected": timing,
            "detail": "Black alignment bars on both edges" if timing else "Not found",
            "value": "",
            "mappable": False,
            "region": None,
        }
    )
    return config, fields


def analyze_layout_config(config: dict, image=None) -> list[dict]:
    if image is not None:
        _, fields = classify_sample_image(image, config)
        return fields
    fields = []
    for key, label, mappable in (
        ("roll", "Roll No", False),
        ("name", "Candidate Name", False),
        ("test_no", "Test No", True),
        ("test_id", "Test ID", True),
        ("date", "Date", True),
    ):
        grid = config.get(key)
        fields.append(
            {
                "key": key,
                "label": label,
                "class": label,
                "detected": bool(grid),
                "detail": f"{grid.get('cols')} columns" if isinstance(grid, dict) and grid.get("cols") else ("Present" if grid else "Not classified yet — upload a sample OMR"),
                "value": "",
                "mappable": mappable,
                "region": None,
            }
        )
    nq = int(config.get("total_questions") or len(config.get("questions") or []))
    fields.append(
        {
            "key": "answers",
            "label": "Answer bubbles",
            "class": "Answer bubbles",
            "detected": nq > 0,
            "detail": f"{nq} questions · options {config.get('options', 'ABCD')}",
            "value": str(nq),
            "mappable": False,
            "region": None,
        }
    )
    fields.append(
        {
            "key": "timing",
            "label": "Timing marks",
            "class": "Timing marks",
            "detected": False,
            "detail": "Upload a sample OMR to detect alignment bars",
            "value": "",
            "mappable": False,
            "region": None,
        }
    )
    return fields
