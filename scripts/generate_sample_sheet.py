#!/usr/bin/env python3
"""Generate a synthetic bubble sheet image for local testing."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def create_bubble_sheet(
    num_questions: int,
    num_choices: int,
    selected_answers: list[int],
    output_path: Path,
    width: int = 700,
    height: int = 900,
) -> Path:
    sheet = np.ones((height, width, 3), dtype=np.uint8) * 255
    margin = 40
    usable_width = width - (2 * margin)
    usable_height = height - (2 * margin)
    column_width = usable_width // num_questions
    row_height = usable_height // num_choices

    for question_index, choice_index in enumerate(selected_answers):
        column_x = margin + (question_index * column_width)
        for choice in range(num_choices):
            center_x = column_x + (column_width // 2)
            center_y = margin + (choice * row_height) + (row_height // 2)
            radius = min(column_width, row_height) // 4
            thickness = -1 if choice == choice_index else 2
            cv2.circle(sheet, (center_x, center_y), radius, (0, 0, 0), thickness)

    cv2.rectangle(sheet, (margin, margin), (width - margin, height - margin), (0, 0, 0), 3)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), sheet)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a synthetic OMR bubble sheet image.")
    parser.add_argument("--questions", type=int, default=5)
    parser.add_argument("--choices", type=int, default=4)
    parser.add_argument(
        "--answers",
        type=str,
        default="0,1,2,3,0",
        help="Comma-separated selected choice index per question",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("samples/generated_sheet.png"),
    )
    args = parser.parse_args()

    selected = [int(value.strip()) for value in args.answers.split(",")]
    if len(selected) != args.questions:
        raise SystemExit("Number of answers must match --questions")

    path = create_bubble_sheet(args.questions, args.choices, selected, args.output)
    print(f"Wrote sample sheet to {path}")


if __name__ == "__main__":
    main()
