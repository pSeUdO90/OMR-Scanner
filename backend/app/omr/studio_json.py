"""Parse exported OMR Studio JSON (full snapshot or mapping-only)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from ..schemas import StudioLayoutIn

VALID_BLOCK_TYPES = {"GRID_MCQ", "GRID_DIGIT", "GRID_DATE", "GRID_NAME"}

_DEFAULT_GEOMETRY = {
    "pageWidthMm": 210,
    "pageHeightMm": 297,
    "cellMm": 6.5,
    "gridCols": 32,
    "gridRows": 45,
    "bubbleDiameterMm": 4.5,
    "bubbleGapMm": 1,
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
    "contentCol0": 3,
    "contentCol1": 28,
    "contentRow0": 3,
    "contentRow1": 41,
}

_DEFAULT_CONFIG = {
    "title": "Imported OMR",
    "questionCount": 100,
    "questionColumns": 4,
    "optionSet": "ABCD",
    "rollCols": 8,
    "subjectCols": 3,
    "seriesCols": 3,
}


def _num(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _int(value: Any, default: int) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return int(default)


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _geometry_from_mapping(mapping: dict) -> dict:
    meta = _as_dict(mapping.get("documentMetadata"))
    page = _as_dict(meta.get("pageSize"))
    grid = _as_dict(meta.get("grid"))
    geo = deepcopy(_DEFAULT_GEOMETRY)
    geo["pageWidthMm"] = _num(page.get("widthMm"), geo["pageWidthMm"])
    geo["pageHeightMm"] = _num(page.get("heightMm"), geo["pageHeightMm"])
    if grid:
        geo["cellMm"] = _num(grid.get("cellMm"), geo["cellMm"])
        geo["gridCols"] = max(8, _int(grid.get("columns"), geo["gridCols"]))
        geo["gridRows"] = max(8, _int(grid.get("rows"), geo["gridRows"]))
        geo["bubbleDiameterMm"] = _num(grid.get("bubbleDiameterMm"), geo["bubbleDiameterMm"])
    return geo


def _grid_origin(geo: dict) -> tuple[float, float]:
    left = _num(geo.get("marginLeftMm"), 8)
    top = _num(geo.get("marginTopMm"), 8)
    right = _num(geo.get("marginRightMm"), 8)
    bottom = _num(geo.get("marginBottomMm"), 8)
    inner_w = max(0.0, _num(geo.get("pageWidthMm"), 210) - left - right)
    inner_h = max(0.0, _num(geo.get("pageHeightMm"), 297) - top - bottom)
    used_w = _int(geo.get("gridCols"), 32) * _num(geo.get("cellMm"), 6.5)
    used_h = _int(geo.get("gridRows"), 45) * _num(geo.get("cellMm"), 6.5)
    return left + max(0.0, (inner_w - used_w) / 2), top + max(0.0, (inner_h - used_h) / 2)


def _blocks_from_mapping(mapping: dict, geo: dict) -> list[dict]:
    data_blocks = mapping.get("dataBlocks")
    if not isinstance(data_blocks, list) or not data_blocks:
        raise ValueError("OMR JSON has no dataBlocks")
    page_w = _num(geo.get("pageWidthMm"), 210)
    page_h = _num(geo.get("pageHeightMm"), 297)
    cell = max(0.1, _num(geo.get("cellMm"), 6.5))
    ox, oy = _grid_origin(geo)
    blocks: list[dict] = []
    next_q = 1
    for index, raw in enumerate(data_blocks, start=1):
        item = _as_dict(raw)
        bounds = _as_dict(item.get("boundsRelative"))
        x_mm = _num(bounds.get("xPct"), 0) / 100.0 * page_w
        y_mm = _num(bounds.get("yPct"), 0) / 100.0 * page_h
        w_mm = _num(bounds.get("widthPct"), 0) / 100.0 * page_w
        h_mm = _num(bounds.get("heightPct"), 0) / 100.0 * page_h
        col0 = max(0, int(round((x_mm - ox) / cell)))
        row0 = max(0, int(round((y_mm - oy) / cell)))
        cols = max(1, int(round(w_mm / cell)) if w_mm else 1)
        rows = max(1, int(round(h_mm / cell)) if h_mm else 1)
        dims = _as_dict(item.get("dimensions"))
        block_type = str(item.get("blockType") or "GRID_DIGIT")
        if block_type not in VALID_BLOCK_TYPES:
            block_type = "GRID_DIGIT"
        block_id = str(item.get("blockId") or f"block_{index}")
        binding = str(item.get("dbColumnBinding") or "")
        rows = max(1, _int(dims.get("rows"), rows))
        dim_cols = _int(dims.get("cols"), cols)
        options = "ABCD"
        start_q = None
        end_q = None
        if block_type == "GRID_MCQ":
            option_n = max(1, min(6, dim_cols or 4))
            options = "ABCDEF"[:option_n]
            cols = 1 + len(options)
            start_q = next_q
            end_q = next_q + rows - 1
            next_q = end_q + 1
            if not binding:
                binding = f"student_responses.q_{start_q:02d}_to_{end_q:02d}"
        else:
            cols = max(1, dim_cols or cols)
        blocks.append(
            {
                "id": block_id,
                "blockId": block_id,
                "dbColumnBinding": binding,
                "blockType": block_type,
                "label": block_id.replace("_", " ").title(),
                "col0": col0,
                "row0": row0,
                "cols": cols,
                "rows": rows,
                **({"options": options, "startQ": start_q, "endQ": end_q} if block_type == "GRID_MCQ" else {}),
            }
        )
    return blocks


def _config_from_blocks(blocks: list[dict], title: str) -> dict:
    config = deepcopy(_DEFAULT_CONFIG)
    config["title"] = title or config["title"]
    mcq = [b for b in blocks if b.get("blockType") == "GRID_MCQ"]
    if mcq:
        ends = [_int(b.get("endQ"), 0) for b in mcq]
        config["questionCount"] = max(10, max(ends) if ends else 10)
        config["questionColumns"] = max(1, min(6, len(mcq)))
        opts = str(mcq[0].get("options") or "ABCD")
        config["optionSet"] = "ABCDE" if "E" in opts else "ABCD"
    roll = next((b for b in blocks if "roll" in str(b.get("blockId") or "").lower()), None)
    if roll:
        config["rollCols"] = max(4, min(12, _int(roll.get("cols"), 8)))
    subject = next((b for b in blocks if "subject" in str(b.get("blockId") or "").lower()), None)
    if subject:
        config["subjectCols"] = max(2, min(6, _int(subject.get("cols"), 3)))
    series = next((b for b in blocks if "series" in str(b.get("blockId") or "").lower()), None)
    if series:
        config["seriesCols"] = max(2, min(6, _int(series.get("cols"), 3)))
    return config


def studio_payload_from_json(data: Any) -> StudioLayoutIn:
    if not isinstance(data, dict):
        raise ValueError("OMR JSON must be an object")
    nested = data.get("layout") if isinstance(data.get("layout"), dict) else None
    if nested:
        data = nested

    mapping = _as_dict(data.get("mapping"))
    if not mapping and "documentMetadata" in data and "dataBlocks" in data:
        mapping = data

    config = _as_dict(data.get("config") or data.get("studio_config"))
    geometry = _as_dict(data.get("geometry") or data.get("studio_geometry"))
    blocks = data.get("blocks") if isinstance(data.get("blocks"), list) else None
    if blocks is None:
        blocks = data.get("studio_blocks") if isinstance(data.get("studio_blocks"), list) else []

    if not blocks:
        if not mapping.get("dataBlocks"):
            raise ValueError("Unrecognized OMR JSON. Export from OMR Studio or include config, geometry, and blocks.")
        if not geometry:
            geometry = _geometry_from_mapping(mapping)
        else:
            merged = deepcopy(_DEFAULT_GEOMETRY)
            merged.update(geometry)
            geometry = merged
        blocks = _blocks_from_mapping(mapping, geometry)
        title = str(config.get("title") or data.get("name") or "Imported OMR")
        config = {**_config_from_blocks(blocks, title), **config, "title": title}
    else:
        merged_geo = deepcopy(_DEFAULT_GEOMETRY)
        merged_geo.update(geometry)
        geometry = merged_geo
        merged_cfg = deepcopy(_DEFAULT_CONFIG)
        merged_cfg.update(config)
        config = merged_cfg

    title = str(config.get("title") or data.get("name") or "Imported OMR").strip() or "Imported OMR"
    config["title"] = title
    question_count = max(10, min(200, _int(config.get("questionCount"), 100)))
    config["questionCount"] = question_count
    options = str(config.get("optionSet") or data.get("options") or "ABCD").upper()
    if "E" in options:
        options = "ABCDE"
        config["optionSet"] = "ABCDE"
    else:
        options = "ABCD"
        config["optionSet"] = "ABCD"

    return StudioLayoutIn(
        name=title,
        description=str(data.get("description") or "Imported OMR JSON"),
        total_questions=question_count,
        options=options,
        config=config,
        geometry=geometry,
        blocks=blocks,
        mapping=mapping,
        thumbnail_base64=str(data.get("thumbnail_base64") or ""),
    )
