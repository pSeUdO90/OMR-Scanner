"""A sheet must be read correctly, or reported as not read correctly.

These cover the two ways a reader can mislead the person running it: shifting a
roll number so it binds to the wrong student, and scoring a page whose bubbles
were never put back in their printed places.
"""

import cv2
import numpy as np

from app.omr.generator import generate_sheet
from app.omr.layouts import gyana_vikash_180
from app.omr.processor import (
    UNREADABLE_DIGIT,
    evaluate_image,
    read_digit_grid_columns,
)
from app.scoring import roll_is_complete


ANSWERS = {q: "ABCD"[(q - 1) % 4] for q in range(1, 181)}


def _sheet(roll: str = "20250013") -> np.ndarray:
    return generate_sheet(gyana_vikash_180(), roll, ANSWERS)


def _on_scanner_bed(sheet: np.ndarray, degrees: float, margin: float = 0.1) -> np.ndarray:
    """The sheet lying on a white bed, tilted, as a scan of it would look."""
    h, w = sheet.shape[:2]
    mx, my = int(w * margin), int(h * margin)
    bed = np.full((h + 2 * my, w + 2 * mx, 3), 255, np.uint8)
    bed[my : my + h, mx : mx + w] = sheet
    bed_h, bed_w = bed.shape[:2]
    matrix = cv2.getRotationMatrix2D((bed_w / 2, bed_h / 2), degrees, 1.0)
    return cv2.warpAffine(
        bed, matrix, (bed_w, bed_h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255),
    )


def _rub_out_roll_column(sheet: np.ndarray, column: int) -> np.ndarray:
    """Erase one roll column's mark, the way a faint pencil tick scans."""
    out = sheet.copy()
    h, w = out.shape[:2]
    for bubble in gyana_vikash_180()["roll"]["bubbles"]:
        if int(bubble["col"]) != column:
            continue
        centre = (int(bubble["x"] * w), int(bubble["y"] * h))
        cv2.circle(out, centre, int(bubble["r"] * w) + 2, (255, 255, 255), -1)
        cv2.circle(out, centre, int(bubble["r"] * w), (120, 120, 120), 1)
    return out


def test_unreadable_roll_column_holds_its_place():
    result = evaluate_image(_rub_out_roll_column(_sheet(), 4), gyana_vikash_180())
    # Dropping the column would read "2025013" and bind to whoever owns it.
    assert result["roll"] == "2025" + UNREADABLE_DIGIT + "013"
    assert result["roll_complete"] is False
    assert not roll_is_complete(result["roll"])
    assert "column 5" in result["roll_note"]


def test_roll_column_marked_twice_is_not_read_as_blank():
    layout = gyana_vikash_180()
    sheet = _sheet()
    h, w = sheet.shape[:2]
    for bubble in layout["roll"]["bubbles"]:
        if int(bubble["col"]) == 2 and str(bubble["digit"]) == "7":
            cv2.circle(sheet, (int(bubble["x"] * w), int(bubble["y"] * h)), int(bubble["r"] * w), (0, 0, 0), -1)
    columns = read_digit_grid_columns(cv2.cvtColor(sheet, cv2.COLOR_BGR2GRAY), layout["roll"])
    assert columns[2]["status"] == "multiple"
    assert columns[2]["digit"] == UNREADABLE_DIGIT
    assert [col["column"] for col in columns] == list(range(8))


def test_straight_scan_reads_every_answer():
    result = evaluate_image(_on_scanner_bed(_sheet(), 0.0), gyana_vikash_180())
    assert result["roll"] == "20250013"
    assert result["alignment"]["reliable"] is True
    assert all(result["answers"][str(q)] == ANSWERS[q] for q in ANSWERS)


def test_tilted_scan_is_straightened_before_it_is_read():
    for degrees in (-3.0, 1.0, 2.0, 5.0):
        result = evaluate_image(_on_scanner_bed(_sheet(), degrees), gyana_vikash_180())
        assert result["alignment"]["corrected"] is True, degrees
        assert result["roll"] == "20250013", degrees
        wrong = [q for q in ANSWERS if result["answers"][str(q)] != ANSWERS[q]]
        assert wrong == [], f"{degrees} deg misread {len(wrong)} answers"


def test_designed_layouts_are_straightened_too():
    """They print the same timing ladder, so they get the same correction."""
    from app.omr.generator import generate_designed_sheet
    from app.omr.layouts import a4_design_layout

    layout = a4_design_layout("A4 Design", "a4-deskew-test", 40, 2, "ABCD", roll_cols=8)
    answers = {q: "ABCD"[(q - 1) % 4] for q in range(1, 41)}
    sheet = generate_designed_sheet(layout, "20250013", answers)
    result = evaluate_image(_on_scanner_bed(sheet, 2.0), layout)
    assert result["alignment"]["corrected"] is True
    assert result["roll"] == "20250013"
    assert all(result["answers"][str(q)] == answers[q] for q in answers)


def test_tilt_that_cannot_be_corrected_is_reported_rather_than_scored_quietly():
    # Too steep to put right, so the reader must not present the result as good.
    result = evaluate_image(_on_scanner_bed(_sheet(), 12.0, margin=0.02), gyana_vikash_180())
    assert result["alignment"]["corrected"] is False
    assert result["alignment"]["reliable"] is False
    assert "tilted" in result["alignment"]["note"]
