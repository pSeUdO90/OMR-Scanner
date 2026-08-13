from __future__ import annotations

import json
from collections import defaultdict

from sqlalchemy.orm import Session

from .models import Exam, ExamSheet, SheetQuestionResult, Student


def subject_for_question(exam: Exam, question_no: int):
    for mapping in exam.subject_maps:
        if mapping.start_q <= question_no <= mapping.end_q:
            return mapping
    return None


def score_sheet(db: Session, exam: Exam, sheet: ExamSheet, answers: dict[str, str], detected_roll: str) -> None:
    key = json.loads(exam.answer_key_json or "{}")
    sheet.detected_roll = detected_roll
    sheet.answers_json = json.dumps(answers)
    student = db.query(Student).filter(Student.roll_no == detected_roll).one_or_none()
    sheet.student_id = student.id if student else None

    db.query(SheetQuestionResult).filter(SheetQuestionResult.sheet_id == sheet.id).delete()
    right = wrong = left = invalid = 0
    score = 0.0
    max_score = 0.0

    total_q = exam.layout.total_questions if exam.layout else max((int(k) for k in key), default=0)
    for q in range(1, total_q + 1):
        marked = (answers.get(str(q)) or "").strip().upper()
        correct = (key.get(str(q)) or "").strip().upper()
        mapping = subject_for_question(exam, q)
        if marked in ("", None):
            rwl = "L"
            left += 1
            score += exam.unattempted_marks
        elif marked == "MULTI":
            rwl = "I"
            invalid += 1
            score += exam.wrong_marks
        elif correct and marked == correct:
            rwl = "R"
            right += 1
            score += exam.correct_marks
        else:
            rwl = "W"
            wrong += 1
            score += exam.wrong_marks
        if correct:
            max_score += exam.correct_marks
        db.add(
            SheetQuestionResult(
                sheet_id=sheet.id,
                question_no=q,
                subject_id=mapping.subject_id if mapping else None,
                marked=marked,
                correct=correct,
                rwl=rwl,
            )
        )

    sheet.right_count = right
    sheet.wrong_count = wrong
    sheet.left_count = left
    sheet.invalid_count = invalid
    sheet.raw_score = round(score + (getattr(exam, "grace_marks", 0) or 0), 2)
    sheet.max_score = round(max_score, 2)
    sheet.status = "evaluated" if student else "unmatched"
    sheet.error_message = "" if student else "Roll number not found in student list"


def apply_grace_to_sheet(exam: Exam, sheet: ExamSheet) -> None:
    if sheet.status not in ("evaluated", "unmatched"):
        return
    base = (
        sheet.right_count * exam.correct_marks
        + sheet.wrong_count * exam.wrong_marks
        + sheet.left_count * exam.unattempted_marks
        + sheet.invalid_count * exam.wrong_marks
    )
    sheet.raw_score = round(base + (getattr(exam, "grace_marks", 0) or 0), 2)


def rwl_bucket(rows: list[SheetQuestionResult], exam: Exam, name: str, subject_id, start_q: int, end_q: int) -> dict:
    right = sum(1 for r in rows if r.rwl == "R")
    wrong = sum(1 for r in rows if r.rwl == "W")
    left = sum(1 for r in rows if r.rwl == "L")
    invalid = sum(1 for r in rows if r.rwl == "I")
    total = len(rows)
    attempted = right + wrong + invalid
    score = right * exam.correct_marks + wrong * exam.wrong_marks + left * exam.unattempted_marks + invalid * exam.wrong_marks
    max_score = total * exam.correct_marks
    accuracy = (right / attempted * 100) if attempted else 0.0
    return {
        "subject_id": subject_id,
        "subject_name": name,
        "start_q": start_q,
        "end_q": end_q,
        "right": right,
        "wrong": wrong,
        "left": left,
        "invalid": invalid,
        "attempted": attempted,
        "total": total,
        "accuracy": round(accuracy, 2),
        "score": round(score, 2),
        "max_score": round(max_score, 2),
    }


def build_analytics(exam: Exam) -> dict:
    sheets = [s for s in exam.sheets if s.status in ("evaluated", "unmatched")]
    results = []
    for sheet in sheets:
        student = sheet.student
        subjects = []
        qrows = sheet.question_results
        for mapping in sorted(exam.subject_maps, key=lambda m: m.start_q):
            subset = [r for r in qrows if mapping.start_q <= r.question_no <= mapping.end_q]
            subjects.append(
                rwl_bucket(
                    subset,
                    exam,
                    mapping.subject.name,
                    mapping.subject_id,
                    mapping.start_q,
                    mapping.end_q,
                )
            )
        overall = rwl_bucket(qrows, exam, "Overall", None, 1, exam.layout.total_questions)
        pct = (sheet.raw_score / sheet.max_score * 100) if sheet.max_score else 0
        results.append(
            {
                "sheet_id": sheet.id,
                "roll_no": sheet.detected_roll or (student.roll_no if student else ""),
                "name": student.name if student else "Unmatched sheet",
                "class_name": student.class_name if student else "",
                "section": student.section if student else "",
                "right": sheet.right_count,
                "wrong": sheet.wrong_count,
                "left": sheet.left_count,
                "invalid": sheet.invalid_count,
                "score": sheet.raw_score,
                "max_score": sheet.max_score,
                "percentage": round(pct, 2),
                "rank": None,
                "subjects": subjects,
                "_overall": overall,
            }
        )
    results.sort(key=lambda r: (-r["score"], r["roll_no"]))
    for i, row in enumerate(results, start=1):
        row["rank"] = i

    appeared = len(results)
    scores = [r["score"] for r in results]
    all_rows = [q for s in sheets for q in s.question_results]
    overall = rwl_bucket(all_rows, exam, "Overall", None, 1, exam.layout.total_questions if exam.layout else 0)
    subject_stats = []
    for mapping in sorted(exam.subject_maps, key=lambda m: m.start_q):
        subset = [r for r in all_rows if mapping.start_q <= r.question_no <= mapping.end_q]
        subject_stats.append(
            rwl_bucket(subset, exam, mapping.subject.name, mapping.subject_id, mapping.start_q, mapping.end_q)
        )

    item = defaultdict(lambda: {"R": 0, "W": 0, "L": 0, "I": 0, "correct": ""})
    for row in all_rows:
        item[row.question_no][row.rwl] += 1
        item[row.question_no]["correct"] = row.correct
    item_analysis = [
        {
            "question_no": q,
            "correct": data["correct"],
            "right": data["R"],
            "wrong": data["W"],
            "left": data["L"],
            "invalid": data["I"],
            "difficulty": round(1 - (data["R"] / max(appeared, 1)), 3),
        }
        for q, data in sorted(item.items())
    ]

    for row in results:
        row.pop("_overall", None)

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "published": exam.status == "published",
        "appeared": appeared,
        "average_score": round(sum(scores) / appeared, 2) if appeared else 0,
        "highest_score": max(scores) if scores else 0,
        "lowest_score": min(scores) if scores else 0,
        "overall_rwl": overall,
        "subjects": subject_stats,
        "results": results,
        "item_analysis": item_analysis,
    }
