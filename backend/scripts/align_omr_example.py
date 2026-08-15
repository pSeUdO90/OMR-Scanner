"""De-skew a scanned OMR image to a squared A4 template.

Example:
    python -m scripts.align_omr_example input_scan.png aligned_scan.png
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.omr.de_skew_engine import align_omr_sheet  # noqa: E402


TEMPLATE = {
    "studio": True,
    "page_width_mm": 210,
    "page_height_mm": 297,
    "dpi": 200,
    "studio_geometry": {
        "pageWidthMm": 210,
        "pageHeightMm": 297,
        "fiducialMm": 8,
        "fiducialInsetMm": 5,
    },
}


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "input_scan.png")
    dest = Path(sys.argv[2] if len(sys.argv) > 2 else "aligned_scan.png")
    config_path = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    template = json.loads(config_path.read_text()) if config_path and config_path.exists() else TEMPLATE
    aligned, meta = align_omr_sheet(str(src), template, debug=True)
    dest.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dest), aligned)
    print(
        json.dumps(
            {
                "output": str(dest),
                "skew_angle": meta["skew_angle"],
                "confidence": meta["confidence"],
                "method": meta["method"],
                "rotated_180": meta["rotated_180"],
                "debug_path": meta.get("debug_path"),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
