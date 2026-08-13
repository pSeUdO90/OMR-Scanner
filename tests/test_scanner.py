from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from omr_scanner import OMRScanner
from scripts.generate_sample_sheet import create_bubble_sheet


@pytest.fixture()
def sample_sheet(tmp_path: Path) -> Path:
    answers = [0, 1, 2, 3, 0]
    output = tmp_path / "sheet.png"
    create_bubble_sheet(5, 4, answers, output)
    return output


def test_scan_detects_all_marked_answers(sample_sheet: Path) -> None:
    scanner = OMRScanner(5, 4, [0, 1, 2, 3, 0])
    image = cv2.imread(str(sample_sheet))
    assert image is not None

    result = scanner.scan(image)
    assert result.answers == [0, 1, 2, 3, 0]
    assert result.score == 5
    assert result.total == 5
    assert result.percentage == 100.0


def test_scan_grades_partial_credit(sample_sheet: Path) -> None:
    scanner = OMRScanner(5, 4, [1, 1, 2, 3, 1])
    image = cv2.imread(str(sample_sheet))
    assert image is not None

    result = scanner.scan(image)
    assert result.score == 3
    assert result.percentage == 60.0


def test_scanner_rejects_invalid_answer_key() -> None:
    with pytest.raises(ValueError):
        OMRScanner(3, 4, [0, 1])


def test_imports() -> None:
    import cv2 as cv2_module
    import numpy as np_module

    assert cv2_module.__version__
    assert np_module.__version__
