from pathlib import Path


ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "omrStudio"


def test_omr_studio_geometry_spec():
    page_w, page_h = 210.0, 297.0
    cell = 6.5
    cols, rows = 32, 45
    bubble = 4.5
    assert abs((cell - bubble) / 2 - 1.0) < 1e-9
    assert abs(cols * cell - 208.0) < 1e-9
    assert abs(rows * cell - 292.5) < 1e-9
    origin_x = (page_w - cols * cell) / 2
    origin_y = (page_h - rows * cell) / 2
    assert origin_x > 0
    assert origin_y > 0
    inset = 5.0
    tl_x_pct = inset / page_w * 100
    tl_y_pct = inset / page_h * 100
    assert 2.0 < tl_x_pct < 4.0
    assert 1.0 < tl_y_pct < 3.0
    source = (ROOT / "geometry.ts").read_text()
    assert "BUBBLE_DIAMETER_MM = 4.5" in source
    assert "CELL_MM = 6.5" in source
    assert "GRID_COLS = 32" in source
    assert "GRID_ROWS = 45" in source
    assert "FIDUCIAL_MM = 8" in source
    assert "TIMING_WIDTH_MM = 5" in source
    assert "TIMING_HEIGHT_MM = 2.5" in source


def test_omr_studio_export_schema_strings():
    export = (ROOT / "exportMapping.ts").read_text()
    for key in (
        "documentMetadata",
        "pageSize",
        "widthMm",
        "heightMm",
        "referenceAnchorTopLeft",
        "dataBlocks",
        "blockId",
        "dbColumnBinding",
        "blockType",
        "GRID_DIGIT",
        "GRID_MCQ",
        "isColumnMajor",
        "boundsRelative",
        "centerRelative",
        "gridPosition",
    ):
        assert key in export
    engine = (ROOT / "layoutEngine.ts").read_text()
    assert "roll_number_grid" in engine
    assert "candidates.roll_number" in engine
    assert "Math.min(6," in engine
    assert "clampBlockOrigin" in engine
    studio = (ROOT.parent / "pages" / "OmrStudio.tsx").read_text()
    assert "[1, 2, 3, 4, 5, 6]" in studio
    assert "Export JSON" in studio
    assert "Quality check" in studio
    assert "Sync with horizontal bubble rows" in studio
    canvas = (ROOT / "OmrCanvas.tsx").read_text()
    assert "onPointerDown" in canvas
    assert "onMove" in canvas
    layouts = (ROOT.parent / "pages" / "Layouts.tsx").read_text()
    assert "Edit Layout" in layouts
    assert "layout-thumb" in layouts
    assert "Design A4 OMR sheet" not in layouts
    assert "captureSheetThumbnail" in (ROOT / "thumbnail.ts").read_text()
