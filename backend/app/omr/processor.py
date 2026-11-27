from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from .de_skew_engine import OMRAlignmentError, align_omr_array
from .layouts import (
    TIMING_MARK_COUNT,
    TIMING_MARK_HEIGHT_FRAC,
    TIMING_MARK_SEARCH_BAND,
    TIMING_MARK_WIDTH_FRAC,
    clone_layout,
    timing_mark_quad,
)
from .studio_render import apply_studio_eval_layout


# Stands in for a digit column that could not be resolved, so the number keeps
# its real width and callers can tell a confident read from a partial one.
UNREADABLE_DIGIT = "?"

# Below this the page is straight enough to read as it lies; above it the
# bubbles have moved far enough to change answers.
MAX_UNCORRECTED_SKEW_DEG = 0.3


def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def _ink_mask(gray: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _threshold, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return mask


def _page_box(mask: np.ndarray) -> tuple[int, int, int, int]:
    """Bounds of everything printed, so the page can be measured in its own units.

    A scan may show the page surrounded by bed or desk, and how much varies per
    scan, so positions and sizes taken as fractions of the whole frame do not
    locate anything on the page.
    """
    ink = cv2.findNonZero(mask)
    if ink is None:
        return 0, 0, mask.shape[1], mask.shape[0]
    return cv2.boundingRect(ink)


def _mark_candidates(mask: np.ndarray, side: str) -> list[tuple[float, float]]:
    """Centres of mark-sized blobs down one edge of the page.

    Sized against the page rather than filtered on bounding-box aspect: tilting
    turns a mark's box nearly square, so an aspect window centred on the upright
    shape drops marks on exactly the scans whose tilt needs measuring.
    """
    page_x, _page_y, page_w, page_h = _page_box(mask)
    band = int(TIMING_MARK_SEARCH_BAND * page_w)
    if side == "left":
        x0, x1 = max(0, page_x), min(mask.shape[1], page_x + band)
    else:
        x0, x1 = max(0, page_x + page_w - band), min(mask.shape[1], page_x + page_w)
    if x1 <= x0:
        return []
    contours, _hierarchy = cv2.findContours(
        mask[:, x0:x1], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    expected_w = TIMING_MARK_WIDTH_FRAC * page_w
    expected_h = TIMING_MARK_HEIGHT_FRAC * page_h
    found: list[tuple[float, float]] = []
    for contour in contours:
        x, y, box_w, box_h = cv2.boundingRect(contour)
        if not expected_w * 0.45 <= box_w <= expected_w * 2.6:
            continue
        if not expected_h * 0.45 <= box_h <= expected_h * 3.0:
            continue
        if box_h > page_h * 0.05:
            continue
        found.append((x0 + x + box_w / 2.0, y + box_h / 2.0))
    found.sort(key=lambda point: point[1])
    return found


# How far the page may be tilted before measuring it is hopeless, and how
# finely to search that range.
MAX_MEASURABLE_SKEW_DEG = 20.0
SKEW_SEARCH_STEP_DEG = 0.25


def _densest_column(points: list[tuple[float, float]], height: int) -> tuple[np.ndarray, float] | None:
    """The largest set of marks that line up vertically, and the tilt they imply.

    Everything printed shares the scan's rotation, so any column of page
    features measures it. The tilt is found by searching rotations for the one
    that stacks the most marks into a single column, rather than by averaging
    pairs of them: a band down the edge of a sheet also catches question numbers
    and bubbles, and averaging over those points at no column in particular.
    """
    if len(points) < 6:
        return None
    xs = np.array([p[0] for p in points], dtype=np.float64)
    ys = np.array([p[1] for p in points], dtype=np.float64)
    tolerance = max(6.0, height * 0.004)
    best: tuple[int, np.ndarray] | None = None
    for angle in np.arange(
        -MAX_MEASURABLE_SKEW_DEG, MAX_MEASURABLE_SKEW_DEG + SKEW_SEARCH_STEP_DEG, SKEW_SEARCH_STEP_DEG
    ):
        offsets = np.sort(xs - np.tan(np.radians(angle)) * ys)
        # Widest run of offsets inside one column's width.
        counts = np.searchsorted(offsets, offsets + tolerance, side="right") - np.arange(len(offsets))
        start = int(np.argmax(counts))
        count = int(counts[start])
        if best is None or count > best[0]:
            low = offsets[start]
            member_offsets = xs - np.tan(np.radians(angle)) * ys
            best = (count, (member_offsets >= low) & (member_offsets <= low + tolerance))
    if best is None or best[0] < 6:
        return None
    members = best[1]
    column_xs, column_ys = xs[members], ys[members]
    if column_ys.max() - column_ys.min() < height * 0.2:
        return None
    # Columns run down the page, so fit x against y and read the tilt off the
    # slope.
    angle = float(np.degrees(np.arctan(np.polyfit(column_ys, column_xs, 1)[0])))
    return members, angle


def _mark_columns(
    points: list[tuple[float, float]], height: int, angle: float
) -> list[list[tuple[float, float]]]:
    """Group mark centres into the columns they line up in at a known tilt."""
    if not points:
        return []
    slope = float(np.tan(np.radians(angle)))
    tolerance = max(6.0, height * 0.004)
    ordered = sorted(points, key=lambda point: point[0] - slope * point[1])
    columns: list[list[tuple[float, float]]] = [[ordered[0]]]
    for point in ordered[1:]:
        first = columns[-1][0]
        if (point[0] - slope * point[1]) - (first[0] - slope * first[1]) <= tolerance:
            columns[-1].append(point)
        else:
            columns.append([point])
    for column in columns:
        column.sort(key=lambda point: point[1])
    return columns


def find_spec_ladder(
    mask: np.ndarray, side: str, *, expected_count: int = TIMING_MARK_COUNT
) -> list[tuple[float, float]] | None:
    """The edge's timing ladder, but only when it matches the printed spec.

    A warp has to know which printed mark each detected mark is. What proves
    that here is the span: in an evenly pitched column, the number of pitches
    between the outermost marks found says how many printed marks they sit
    apart, so a span of the full printed ladder means the ends found are the
    ends printed, even if a mark in between was missed. Anything else returns
    None and leaves the caller on its existing path.
    """
    height = _page_box(mask)[3]
    candidates = _mark_candidates(mask, side)
    found = _densest_column(candidates, height)
    if found is None:
        return None
    valid: list[list[tuple[float, float]]] = []
    for column in _mark_columns(candidates, height, found[1]):
        if not expected_count * 0.8 <= len(column) <= expected_count:
            continue
        ys = np.array([p[1] for p in column], dtype=np.float64)
        if ys.max() - ys.min() < height * 0.5:
            continue
        gaps = np.diff(ys)
        pitch = float(np.median(gaps))
        if pitch <= 0 or gaps.max() > pitch * 2.5:
            continue
        if round((ys.max() - ys.min()) / pitch) != expected_count - 1:
            continue
        valid.append(column)
    if not valid:
        return None
    # Ladders are printed outside everything else, so when more than one column
    # matches, the outermost is the ladder.
    pick = min if side == "left" else max
    return pick(valid, key=lambda column: float(np.median([p[0] for p in column])))


def _spec_ladder_warp(gray: np.ndarray, dst_w: int, dst_h: int) -> np.ndarray | None:
    """De-skew onto the page by sending each ladder end to its printed position."""
    mask = _ink_mask(gray)
    left = find_spec_ladder(mask, "left")
    right = find_spec_ladder(mask, "right")
    if left is None or right is None:
        return None
    src = np.float32([left[0], right[0], right[-1], left[-1]])
    dst = np.float32([(x * (dst_w - 1), y * (dst_h - 1)) for x, y in timing_mark_quad()])
    return cv2.warpPerspective(
        gray, cv2.getPerspectiveTransform(src, dst), (dst_w, dst_h), flags=cv2.INTER_CUBIC
    )


def estimate_skew_degrees(gray: np.ndarray) -> float | None:
    """Rotation of the page, or None when nothing on it can measure one.

    Used when no warp could be applied, to tell a straight scan (where a plain
    resize is fine) from a tilted one (where the marks would be misread).
    """
    mask = _ink_mask(gray)
    height = _page_box(mask)[3]
    measured = [
        (int(found[0].sum()), found[1])
        for found in (
            _densest_column(_mark_candidates(mask, side), height) for side in ("left", "right")
        )
        if found is not None
    ]
    if not measured:
        return None
    # A column found from more marks spans more of the page and is the better
    # estimate; averaging in a short, partly found one drags it toward zero.
    best = max(measured, key=lambda item: item[0])
    agreeing = [angle for _count, angle in measured if abs(angle - best[1]) <= 0.5]
    return float(sum(agreeing) / len(agreeing))


def align_sheet_with_meta(image: np.ndarray, layout: dict) -> tuple[np.ndarray, dict]:
    """Align a scan to the layout's page size, reporting how it was done.

    The caller needs the method: a plain resize leaves any skew in place, so a
    sheet that lands there cannot be scored as confidently as a warped one.
    """
    gray = _to_gray(image)
    dst_w, dst_h = int(layout["page_width"]), int(layout["page_height"])
    try:
        warped, meta = align_omr_array(image, layout, debug=False)
        return _to_gray(warped), {
            "method": str(meta.get("method") or "fiducials"),
            "corrected": True,
            "confidence": float(meta.get("confidence") or 0.0),
            "skew_deg": float(meta.get("skew_angle") or 0.0),
        }
    except OMRAlignmentError as exc:
        reason = str(exc)

    skew_deg = estimate_skew_degrees(gray)
    if not layout.get("studio") and not layout.get("designed"):
        warped = _spec_ladder_warp(gray, dst_w, dst_h)
        if warped is not None:
            return warped, {
                "method": "spec_timing_marks",
                "corrected": True,
                "confidence": 0.75,
                "skew_deg": skew_deg if skew_deg is not None else 0.0,
            }

    if layout.get("studio"):
        warped = _align_studio_fiducials(gray, layout, dst_w, dst_h)
        if warped is not None:
            return warped, {
                "method": "studio_fiducials",
                "corrected": True,
                "confidence": 0.7,
                "skew_deg": 0.0,
            }
    resized = gray if (gray.shape[1] == dst_w and gray.shape[0] == dst_h) else cv2.resize(gray, (dst_w, dst_h))
    return resized, {
        "method": "resize",
        "corrected": False,
        "confidence": 0.0,
        "skew_deg": skew_deg,
        "reason": reason,
    }


def align_sheet(image: np.ndarray, layout: dict) -> np.ndarray:
    aligned, _meta = align_sheet_with_meta(image, layout)
    return aligned


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


def read_digit_grid_columns(gray: np.ndarray, grid: dict) -> list[dict]:
    """Read one entry per grid column, keeping unreadable columns in place.

    Every column is reported, so a column that cannot be resolved does not
    shorten the number and shift the digits after it.
    """
    cols = int(grid["cols"])
    by_col: dict[int, list[dict]] = {c: [] for c in range(cols)}
    for bubble in grid["bubbles"]:
        by_col[int(bubble["col"])].append(bubble)
    columns: list[dict] = []
    for c in range(cols):
        options = [{"label": b["digit"], "x": b["x"], "y": b["y"], "r": b["r"]} for b in by_col[c]]
        choice, _ = read_choice(gray, options, min_fill=0.28)
        if choice == "MULTI":
            columns.append({"column": c, "digit": UNREADABLE_DIGIT, "status": "multiple"})
        elif choice:
            columns.append({"column": c, "digit": choice, "status": "ok"})
        else:
            columns.append({"column": c, "digit": UNREADABLE_DIGIT, "status": "blank"})
    return columns


def describe_digit_columns(columns: list[dict]) -> str:
    """Human-readable note naming the columns that could not be read."""
    blank = [str(col["column"] + 1) for col in columns if col["status"] == "blank"]
    multiple = [str(col["column"] + 1) for col in columns if col["status"] == "multiple"]
    parts = []
    if blank:
        parts.append(f"no mark in column {', '.join(blank)}")
    if multiple:
        parts.append(f"more than one mark in column {', '.join(multiple)}")
    return "; ".join(parts)


def read_digit_grid(gray: np.ndarray, grid: dict) -> str:
    return "".join(col["digit"] for col in read_digit_grid_columns(gray, grid))


def evaluate_image(image: np.ndarray, layout: dict) -> dict:
    aligned, alignment = align_sheet_with_meta(image, layout)
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
    roll_columns = read_digit_grid_columns(aligned, layout["roll"]) if layout.get("roll") else []
    roll = "".join(col["digit"] for col in roll_columns)
    if layout.get("roll"):
        for bubble in layout["roll"].get("bubbles", []):
            cx, cy = int(bubble["x"] * w), int(bubble["y"] * h)
            r = max(3, int(bubble["r"] * min(w, h)))
            digit = str(bubble.get("digit", ""))
            col = int(bubble.get("col", 0))
            marked = len(roll) > col and roll[col] == digit
            color = (40, 180, 80) if marked else (180, 180, 180)
            cv2.circle(overlay, (cx, cy), r + 1, color, 1)
    skew = alignment.get("skew_deg")
    alignment["reliable"] = bool(
        alignment.get("corrected") or (skew is not None and abs(skew) <= MAX_UNCORRECTED_SKEW_DEG)
    )
    if not alignment["reliable"]:
        alignment["note"] = (
            f"sheet is tilted {abs(skew):.1f}° and could not be straightened"
            if skew is not None
            else "sheet could not be straightened and its tilt could not be measured"
        )
    return {
        "roll": roll,
        "roll_complete": all(col["status"] == "ok" for col in roll_columns),
        "roll_note": describe_digit_columns(roll_columns),
        "answers": answers,
        "alignment": alignment,
        "overlay": overlay,
        "aligned": aligned,
    }


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
