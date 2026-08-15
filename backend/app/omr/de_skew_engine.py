"""Fiducial-based OMR de-skew and perspective alignment."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .studio_render import DPI as STUDIO_DPI

A4_MM = (210.0, 297.0)
DEFAULT_DPI = 300

ERROR_MIN_FIDUCIALS = "OMRAlignmentError: Could not locate minimum fiducial markers for perspective correction."


class OMRAlignmentError(Exception):
    """Raised when a sheet cannot be aligned from corner fiducials or timing marks."""


def align_omr_sheet(
    input_image_path: str,
    template_config: dict,
    debug: bool = False,
    debug_path: str | Path | None = None,
) -> tuple[np.ndarray, dict]:
    """Align a scanned OMR sheet to the template page size.

    Returns the warped BGR (or gray) image and metadata:
    detected corners, skew angle, confidence, orientation, method.
    """
    image = _load(input_image_path)
    aligned, meta = align_omr_array(image, template_config, debug=debug)
    if debug:
        dest = Path(debug_path) if debug_path else Path(input_image_path).with_name(
            f"{Path(input_image_path).stem}_deskew_debug.png"
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(dest), meta["debug_image"])
        meta["debug_path"] = str(dest)
    return aligned, meta


def align_omr_array(image: np.ndarray, template_config: dict, debug: bool = False) -> tuple[np.ndarray, dict]:
    gray = _to_gray(image)
    dst_w, dst_h = _target_size(template_config)
    color = image if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    otsu, _edges = _preprocess(gray)
    squares = _detect_fiducial_squares(otsu, gray, template_config)
    prefer_fiducials = bool(template_config.get("studio") or template_config.get("studio_geometry"))
    corners, method, used_fallback = _resolve_corners(squares, otsu, gray, prefer_fiducials=prefer_fiducials)

    if corners is None:
        raise OMRAlignmentError(ERROR_MIN_FIDUCIALS)

    ordered = _order_corners(corners)
    if _page_is_upside_down(gray, ordered):
        color = cv2.rotate(color, cv2.ROTATE_180)
        gray = cv2.rotate(gray, cv2.ROTATE_180)
        otsu = cv2.rotate(otsu, cv2.ROTATE_180)
        squares = _detect_fiducial_squares(otsu, gray, template_config)
        corners, method, used_fallback = _resolve_corners(
            squares, otsu, gray, prefer_fiducials=prefer_fiducials
        )
        if corners is None:
            raise OMRAlignmentError(ERROR_MIN_FIDUCIALS)
        ordered = _order_corners(corners)
        rotated_180 = True
    else:
        rotated_180 = False

    dst = _destination_points(template_config, ordered, dst_w, dst_h, method)
    matrix = cv2.getPerspectiveTransform(ordered, dst)
    warped = cv2.warpPerspective(color, matrix, (dst_w, dst_h), flags=cv2.INTER_CUBIC)
    if warped.shape[1] != dst_w or warped.shape[0] != dst_h:
        warped = cv2.resize(warped, (dst_w, dst_h), interpolation=cv2.INTER_AREA)

    skew = _skew_angle(ordered)
    confidence = _confidence(squares, method, used_fallback)
    meta: dict[str, Any] = {
        "detected_corners": [
            {"x": float(p[0]), "y": float(p[1])} for p in ordered
        ],
        "skew_angle": float(skew),
        "confidence": float(confidence),
        "method": method,
        "rotated_180": rotated_180,
        "fiducial_count": int(len(squares)),
        "used_extrapolated_corner": bool(used_fallback),
        "target_size": [dst_w, dst_h],
    }
    if debug:
        meta["debug_image"] = _draw_debug(color, squares, ordered, skew)
    return warped, meta


def _load(path: str | Path) -> np.ndarray:
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    return image


def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def _target_size(config: dict) -> tuple[int, int]:
    geo = config.get("studio_geometry") or {}
    w = config.get("page_width") or geo.get("pageWidthPx")
    h = config.get("page_height") or geo.get("pageHeightPx")
    if w and h:
        return int(w), int(h)
    page_w = float(geo.get("pageWidthMm") or config.get("page_width_mm") or A4_MM[0])
    page_h = float(geo.get("pageHeightMm") or config.get("page_height_mm") or A4_MM[1])
    dpi = int(config.get("dpi") or (STUDIO_DPI if config.get("studio") or geo else DEFAULT_DPI))
    return (
        max(1, int(round(page_w * dpi / 25.4))),
        max(1, int(round(page_h * dpi / 25.4))),
    )


def _preprocess(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    edges = cv2.Canny(blur, 40, 120)
    return otsu, edges


def _detect_fiducial_squares(binary: np.ndarray, gray: np.ndarray, config: dict | None = None) -> list[dict]:
    h, w = gray.shape
    geo = (config or {}).get("studio_geometry") or {}
    page_w = float(geo.get("pageWidthMm") or (config or {}).get("page_width_mm") or 210)
    size_mm = float(geo.get("fiducialMm") or 8)
    expected = size_mm / page_w * w
    min_side = max(8.0, 0.55 * expected) if expected > 1 else 0.012 * min(w, h)
    max_side = min(0.12 * min(w, h), 1.7 * expected) if expected > 1 else 0.09 * min(w, h)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found: list[dict] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        x, y, cw, ch = cv2.boundingRect(contour)
        if cw < min_side or ch < min_side or cw > max_side or ch > max_side:
            continue
        aspect = cw / max(ch, 1)
        if not 0.72 <= aspect <= 1.38:
            continue
        hull = cv2.convexHull(contour)
        hull_area = float(cv2.contourArea(hull)) or 1.0
        solidity = area / hull_area
        if solidity < 0.78:
            continue
        roi = gray[y : y + ch, x : x + cw]
        if roi.size == 0 or float(roi.mean()) > 150:
            continue
        found.append(
            {
                "cx": x + cw / 2.0,
                "cy": y + ch / 2.0,
                "box": (int(x), int(y), int(cw), int(ch)),
                "area": area,
                "solidity": solidity,
            }
        )
    return found


def _assign_quadrants(squares: list[dict], w: int, h: int) -> dict[str, dict]:
    regions = {
        "TL": (0.0, 0.0, 0.38 * w, 0.38 * h),
        "TR": (0.62 * w, 0.0, float(w), 0.38 * h),
        "BL": (0.0, 0.62 * h, 0.38 * w, float(h)),
        "BR": (0.62 * w, 0.62 * h, float(w), float(h)),
    }
    corners_px = {
        "TL": (0.0, 0.0),
        "TR": (float(w), 0.0),
        "BL": (0.0, float(h)),
        "BR": (float(w), float(h)),
    }
    picked: dict[str, dict] = {}
    used: set[int] = set()
    for name, (x0, y0, x1, y1) in regions.items():
        best = None
        best_d = 1e18
        tx, ty = corners_px[name]
        for i, sq in enumerate(squares):
            if i in used:
                continue
            if not (x0 <= sq["cx"] <= x1 and y0 <= sq["cy"] <= y1):
                continue
            d = (sq["cx"] - tx) ** 2 + (sq["cy"] - ty) ** 2
            if d < best_d:
                best_d = d
                best = i
        if best is not None:
            used.add(best)
            picked[name] = squares[best]
    return picked


def _extrapolate_missing(picked: dict[str, dict]) -> tuple[dict[str, np.ndarray], bool]:
    pts = {k: np.array([v["cx"], v["cy"]], dtype=np.float32) for k, v in picked.items()}
    names = ("TL", "TR", "BR", "BL")
    if len(pts) == 4:
        return pts, False
    if len(pts) != 3:
        return pts, False
    missing = next(n for n in names if n not in pts)
    # Parallelogram: P4 = P1 + P3 - P2
    if missing == "BR":
        pts["BR"] = pts["TR"] + pts["BL"] - pts["TL"]
    elif missing == "BL":
        pts["BL"] = pts["TL"] + pts["BR"] - pts["TR"]
    elif missing == "TR":
        pts["TR"] = pts["TL"] + pts["BR"] - pts["BL"]
    else:
        pts["TL"] = pts["TR"] + pts["BL"] - pts["BR"]
    return pts, True


def _timing_corners(binary: np.ndarray) -> np.ndarray | None:
    h, w = binary.shape
    left = _timing_marks(binary, "left")
    right = _timing_marks(binary, "right")
    if len(left) < 50 or len(right) < 50:
        return None
    return np.float32([left[0], right[0], right[-1], left[-1]])


def _timing_marks(binary: np.ndarray, side: str) -> list[tuple[float, float]]:
    h, w = binary.shape
    x0, x1 = (0, int(0.08 * w)) if side == "left" else (int(0.92 * w), w)
    roi = binary[:, x0:x1]
    contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    marks: list[tuple[float, float]] = []
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        area = cw * ch
        if 15 < area < 8000 and ch < h * 0.05:
            aspect = ch / max(cw, 1)
            wide_bar = 0.18 < aspect < 0.85 and cw >= 8
            tall_bar = 1.15 < aspect < 12 and cw >= 3
            if wide_bar or tall_bar:
                marks.append((x0 + x + cw / 2.0, y + ch / 2.0))
    marks.sort(key=lambda p: p[1])
    return marks


def _resolve_corners(
    squares: list[dict],
    binary: np.ndarray,
    gray: np.ndarray,
    prefer_fiducials: bool = False,
) -> tuple[np.ndarray | None, str, bool]:
    h, w = gray.shape
    picked = _assign_quadrants(squares, w, h)
    if len(picked) >= 3:
        pts, extrapolated = _extrapolate_missing(picked)
        ordered = np.float32([pts["TL"], pts["TR"], pts["BR"], pts["BL"]])
        return ordered, "fiducials", extrapolated
    if prefer_fiducials:
        return None, "none", False
    timing = _timing_corners(binary)
    if timing is not None:
        return timing, "timing_marks", False
    return None, "none", False


def _order_corners(pts: np.ndarray) -> np.ndarray:
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    sums = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).ravel()
    tl = pts[int(np.argmin(sums))]
    br = pts[int(np.argmax(sums))]
    tr = pts[int(np.argmin(diff))]
    bl = pts[int(np.argmax(diff))]
    return np.float32([tl, tr, br, bl])


def _fiducial_dst(config: dict, dst_w: int, dst_h: int) -> np.ndarray | None:
    geo = config.get("studio_geometry") or {}
    if not (config.get("studio") or geo):
        return None
    page_w = float(geo.get("pageWidthMm") or config.get("page_width_mm") or A4_MM[0])
    page_h = float(geo.get("pageHeightMm") or config.get("page_height_mm") or A4_MM[1])
    size = float(geo.get("fiducialMm") or 8)
    inset = float(geo.get("fiducialInsetMm") or 5)
    centers = [
        (inset + size / 2, inset + size / 2),
        (page_w - inset - size / 2, inset + size / 2),
        (page_w - inset - size / 2, page_h - inset - size / 2),
        (inset + size / 2, page_h - inset - size / 2),
    ]
    return np.float32([(x / page_w * (dst_w - 1), y / page_h * (dst_h - 1)) for x, y in centers])


def _destination_points(
    config: dict, src: np.ndarray, dst_w: int, dst_h: int, method: str
) -> np.ndarray:
    if method == "fiducials":
        fid = _fiducial_dst(config, dst_w, dst_h)
        if fid is not None:
            return fid
    return np.float32([[0, 0], [dst_w - 1, 0], [dst_w - 1, dst_h - 1], [0, dst_h - 1]])


def _skew_angle(ordered: np.ndarray) -> float:
    tl, tr = ordered[0], ordered[1]
    return float(np.degrees(np.arctan2(tr[1] - tl[1], tr[0] - tl[0])))


def _confidence(squares: list[dict], method: str, extrapolated: bool) -> float:
    if method == "fiducials":
        base = 0.72 if extrapolated else 0.94
        if len(squares) >= 4:
            areas = np.array([s["area"] for s in squares], dtype=np.float32)
            spread = float(areas.std() / max(areas.mean(), 1.0))
            base -= min(0.15, spread)
        return max(0.35, min(0.99, base))
    if method == "timing_marks":
        return 0.62
    return 0.0


def _header_text_score(gray: np.ndarray, y0: float, y1: float) -> float:
    h, w = gray.shape
    ya, yb = int(y0 * h), int(y1 * h)
    xa, xb = int(0.12 * w), int(0.88 * w)
    roi = gray[max(0, ya) : max(ya + 1, yb), xa:xb]
    if roi.size == 0:
        return 0.0
    blur = cv2.GaussianBlur(roi, (3, 3), 0)
    _, binary = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    score = 0.0
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        if cw >= 18 and 3 <= ch <= 48 and cw / max(ch, 1) >= 1.8:
            score += cw * ch
    return score


def _page_is_upside_down(gray: np.ndarray, ordered: np.ndarray) -> bool:
    top = _header_text_score(gray, 0.015, 0.14)
    bottom = _header_text_score(gray, 0.86, 0.985)
    if bottom > top * 1.45 and bottom > 80:
        return True
    h, w = gray.shape
    binary, _ = _preprocess(gray)
    left = _timing_marks(binary, "left")
    if len(left) >= 10:
        ys = np.array([p[1] for p in left], dtype=np.float32)
        mean_y = float(ys.mean() / h)
        # Timing synced to bubble rows sits in the upper-middle when upright.
        if mean_y > 0.62 and bottom >= top:
            return True
    return False


def _draw_debug(color: np.ndarray, squares: list[dict], ordered: np.ndarray, skew: float) -> np.ndarray:
    vis = color.copy()
    if vis.ndim == 2:
        vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
    for sq in squares:
        x, y, cw, ch = sq["box"]
        cv2.rectangle(vis, (x, y), (x + cw, y + ch), (0, 220, 0), 3)
        cv2.circle(vis, (int(sq["cx"]), int(sq["cy"])), 4, (0, 220, 0), -1)
    for i, pt in enumerate(ordered):
        cv2.circle(vis, (int(pt[0]), int(pt[1])), 8, (0, 0, 255), 2)
        cv2.putText(vis, str(i), (int(pt[0]) + 10, int(pt[1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    cv2.putText(
        vis,
        f"skew {skew:.2f} deg",
        (24, 48),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (0, 0, 255),
        3,
        cv2.LINE_AA,
    )
    return vis
