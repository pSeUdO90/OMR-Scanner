from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from omr_scanner.utils import find_document_contour, four_point_transform


@dataclass(frozen=True)
class ScanResult:
    answers: list[int]
    score: int
    total: int

    @property
    def percentage(self) -> float:
        if self.total == 0:
            return 0.0
        return round((self.score / self.total) * 100, 2)


class OMRScanner:
    """Detect filled bubbles on a multiple-choice answer sheet."""

    def __init__(self, num_questions: int, num_choices: int, answer_key: list[int]):
        if len(answer_key) != num_questions:
            raise ValueError("answer_key length must match num_questions")
        if any(choice < 0 or choice >= num_choices for choice in answer_key):
            raise ValueError("answer_key values must be within choice range")

        self.num_questions = num_questions
        self.num_choices = num_choices
        self.answer_key = answer_key

    def scan(self, image: np.ndarray) -> ScanResult:
        warped = self._extract_answer_sheet(image)
        answers = self._read_answers(warped)
        score = sum(1 for actual, expected in zip(answers, self.answer_key) if actual == expected)
        return ScanResult(answers=answers, score=score, total=self.num_questions)

    def _extract_answer_sheet(self, image: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 75, 200)

        document = find_document_contour(edged)
        if document is None:
            raise ValueError("Could not locate answer sheet contour in image")

        return four_point_transform(image, document)

    def _read_answers(self, warped: np.ndarray) -> list[int]:
        resized = cv2.resize(
            warped,
            (self.num_questions * 100, self.num_choices * 100),
            interpolation=cv2.INTER_AREA,
        )
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]

        question_columns = np.hsplit(thresh, self.num_questions)
        answers: list[int] = []

        for column in question_columns:
            bubbles = np.vsplit(column, self.num_choices)
            bubble_pixels = [cv2.countNonZero(bubble) for bubble in bubbles]
            answers.append(int(np.argmax(bubble_pixels)))

        return answers
