#!/usr/bin/env python3
"""CLI for scanning and grading OMR bubble sheets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2

from omr_scanner import OMRScanner


def parse_answer_key(raw: str, num_questions: int) -> list[int]:
    values = [int(item.strip()) for item in raw.split(",")]
    if len(values) != num_questions:
        raise ValueError(f"Expected {num_questions} answer-key values, got {len(values)}")
    return values


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan and grade an OMR bubble sheet image.")
    parser.add_argument("--image", type=Path, required=True, help="Path to bubble sheet image")
    parser.add_argument("--questions", type=int, default=5)
    parser.add_argument("--choices", type=int, default=4)
    parser.add_argument(
        "--answer-key",
        type=str,
        default="0,1,2,3,0",
        help="Comma-separated correct choice index per question",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output")
    args = parser.parse_args()

    if not args.image.exists():
        raise SystemExit(f"Image not found: {args.image}")

    answer_key = parse_answer_key(args.answer_key, args.questions)
    scanner = OMRScanner(args.questions, args.choices, answer_key)
    image = cv2.imread(str(args.image))
    if image is None:
        raise SystemExit(f"Failed to read image: {args.image}")

    result = scanner.scan(image)

    if args.json:
        print(
            json.dumps(
                {
                    "answers": result.answers,
                    "score": result.score,
                    "total": result.total,
                    "percentage": result.percentage,
                },
                indent=2,
            )
        )
        return

    print(f"Detected answers: {result.answers}")
    print(f"Score: {result.score}/{result.total} ({result.percentage}%)")


if __name__ == "__main__":
    main()
