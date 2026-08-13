from __future__ import annotations

from .processor import align_sheet, read_digit_grid


EXAM_TARGETS = [
    {"value": "", "label": "Ignore"},
    {"value": "exam_date", "label": "Exam Date"},
    {"value": "test_id", "label": "Test ID"},
    {"value": "test_no", "label": "Test No"},
]


def analyze_layout_config(config: dict, image=None) -> list[dict]:
    gray = None
    if image is not None:
        try:
            gray = align_sheet(image, config)
        except Exception:
            gray = None
    fields = []
    if config.get("roll"):
        value = ""
        if image is not None:
            try:
                value = read_digit_grid(gray, config["roll"]) if gray is not None else ""
            except Exception:
                value = ""
        fields.append(
            {
                "key": "roll",
                "label": "Roll No",
                "detected": True,
                "detail": f"{config['roll'].get('cols', 0)}-digit bubble grid",
                "value": value,
                "mappable": False,
            }
        )
    if config.get("name") or "name" in str(config.get("description", "")).lower():
        fields.append(
            {
                "key": "name",
                "label": "Candidate Name",
                "detected": True,
                "detail": "Name grid or printed name area",
                "value": "",
                "mappable": False,
            }
        )
    for key, label, mappable in (
        ("test_id", "Test ID", True),
        ("test_no", "Test No", True),
        ("date", "Date", True),
    ):
        grid = config.get(key)
        detected = bool(grid)
        value = ""
        if detected and image is not None:
            try:
                value = read_digit_grid(gray, grid) if gray is not None else ""
            except Exception:
                value = ""
        fields.append(
            {
                "key": key,
                "label": label,
                "detected": detected,
                "detail": f"{grid.get('cols')} columns" if grid else "Not found on this layout",
                "value": value,
                "mappable": mappable,
            }
        )
    nq = int(config.get("total_questions") or len(config.get("questions") or []))
    fields.append(
        {
            "key": "answers",
            "label": "Answer bubbles",
            "detected": nq > 0,
            "detail": f"{nq} questions · options {config.get('options', 'ABCD')}",
            "value": str(nq),
            "mappable": False,
        }
    )
    return fields
