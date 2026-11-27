from __future__ import annotations

import json
from collections import defaultdict

from sqlalchemy import insert
from sqlalchemy.orm import Session

from .models import Exam, ExamSheet, SheetQuestionResult, Student


def parse_question_numbers(value) -> list[int]:
    if value is None:
        return []
    if isinstance(value, list):
        nums = []
        for item in value:
            try:
                nums.append(int(item))
            except (TypeError, ValueError):
                continue
        return sorted(set(n for n in nums if n > 0))
    text = str(value).replace(";", ",")
    nums: set[int] = set()
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            left, right = part.split("-", 1)
            if left.strip().isdigit() and right.strip().isdigit():
                lo, hi = int(left), int(right)
                nums.update(range(min(lo, hi), max(lo, hi) + 1))
        elif part.isdigit():
            nums.add(int(part))
    return sorted(n for n in nums if n > 0)


def grace_questions(exam: Exam) -> set[int]:
    return set(parse_question_numbers(json.loads(getattr(exam, "grace_questions_json", None) or "[]")))


def parse_csv_values(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").replace(";", ",").split(",") if part.strip()]


def assigned_students(db: Session, exam: Exam) -> list[Student]:
    query = db.query(Student)
    if exam.class_name:
        query = query.filter(Student.class_name == exam.class_name)
    sections = parse_csv_values(exam.section)
    if sections:
        query = query.filter(Student.section.in_(sections))
    if exam.batch:
        query = query.filter(Student.session == exam.batch)
    return query.order_by(Student.roll_no).all()


def _roll_key(value: str) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit()).lstrip("0") or "0"


def find_student_by_roll(db: Session, detected_roll: str) -> Student | None:
    roll = (detected_roll or "").strip()
    if not roll:
        return None
    student = db.query(Student).filter(Student.roll_no == roll).one_or_none()
    if student:
        return student
    key = _roll_key(roll)
    if len(key) < 4:
        return None
    for student in db.query(Student).all():
        stored = (student.roll_no or "").strip()
        if stored == roll or _roll_key(stored) == key:
            return student
        digits = "".join(ch for ch in stored if ch.isdigit())
        detected_digits = "".join(ch for ch in roll if ch.isdigit())
        if len(detected_digits) >= 5 and (digits.endswith(detected_digits) or detected_digits.endswith(digits)):
            return student
    return None


def bind_sheet_student(db: Session, exam: Exam, sheet: ExamSheet, detected_roll: str, *, scored: bool = False) -> bool:
    roll = (detected_roll or "").strip()
    sheet.detected_roll = roll
    if getattr(sheet, "assigned_manually", False) and sheet.student_id:
        if scored:
            sheet.status = "evaluated"
            sheet.error_message = ""
        return True
    student = find_student_by_roll(db, roll)
    if student:
        sheet.student_id = student.id
        if scored:
            sheet.status = "evaluated"
            sheet.error_message = ""
        return True
    sheet.student_id = None
    if scored:
        sheet.status = "unmatched"
        sheet.error_message = (
            "Could not read roll number from the OMR sheet"
            if not roll
            else "Roll number not found in student list"
        )
    elif roll:
        sheet.status = "unmatched"
        sheet.error_message = "Roll number not found in student list"
    return False


def subject_for_question(exam: Exam, question_no: int):
    for mapping in exam.subject_maps:
        if mapping.start_q <= question_no <= mapping.end_q:
            return mapping
    return None


def score_sheet(db: Session, exam: Exam, sheet: ExamSheet, answers: dict[str, str], detected_roll: str) -> None:
    key = json.loads(exam.answer_key_json or "{}")
    sheet.answers_json = json.dumps(answers)

    db.query(SheetQuestionResult).filter(SheetQuestionResult.sheet_id == sheet.id).delete()
    right = wrong = left = invalid = 0
    score = 0.0
    max_score = 0.0

    total_q = exam.layout.total_questions if exam.layout else max((int(k) for k in key), default=0)
    grace = grace_questions(exam)
    rows: list[dict] = []
    for q in range(1, total_q + 1):
        marked = (answers.get(str(q)) or "").strip().upper()
        correct = (key.get(str(q)) or "").strip().upper()
        mapping = subject_for_question(exam, q)
        if q in grace:
            rwl = "R"
            right += 1
            score += exam.correct_marks
        elif marked in ("", None):
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
        rows.append(
            {
                "sheet_id": sheet.id,
                "question_no": q,
                "subject_id": mapping.subject_id if mapping else None,
                "marked": marked,
                "correct": correct,
                "rwl": rwl,
            }
        )
    # One statement for the whole sheet: the ORM needs the generated primary key
    # of every row, so add() emits an INSERT per question instead.
    if rows:
        db.execute(insert(SheetQuestionResult), rows)

    sheet.right_count = right
    sheet.wrong_count = wrong
    sheet.left_count = left
    sheet.invalid_count = invalid
    sheet.raw_score = round(score, 2)
    sheet.max_score = round(max_score, 2)
    bind_sheet_student(db, exam, sheet, detected_roll, scored=True)


def rescore_stored_sheets(db: Session, exam: Exam) -> None:
    for sheet in exam.sheets:
        if sheet.status not in ("evaluated", "unmatched"):
            continue
        answers = json.loads(sheet.answers_json or "{}")
        score_sheet(db, exam, sheet, answers, sheet.detected_roll)


def rwl_bucket(rows: list[SheetQuestionResult], exam: Exam, name: str, subject_id, start_q: int, end_q: int) -> dict:
    tally = {"R": 0, "W": 0, "L": 0, "I": 0}
    for row in rows:
        if row.rwl in tally:
            tally[row.rwl] += 1
    right, wrong, left, invalid = tally["R"], tally["W"], tally["L"], tally["I"]
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


def _mapping_slots(mappings: list) -> dict[int, list[int]]:
    """Map a question number to the mappings that cover it, built once."""
    slots: dict[int, list[int]] = {}
    for index, mapping in enumerate(mappings):
        for q in range(mapping.start_q, mapping.end_q + 1):
            slots.setdefault(q, []).append(index)
    return slots


def _split_by_mapping(rows: list[SheetQuestionResult], mappings: list, slots: dict[int, list[int]]) -> list[list]:
    subsets: list[list] = [[] for _ in mappings]
    for row in rows:
        for index in slots.get(row.question_no, ()):
            subsets[index].append(row)
    return subsets


def build_analytics(exam: Exam) -> dict:
    sheets = [s for s in exam.sheets if s.status in ("evaluated", "unmatched")]
    results = []
    mappings = sorted(exam.subject_maps, key=lambda m: m.start_q)
    slots = _mapping_slots(mappings)
    for sheet in sheets:
        student = sheet.student
        subjects = []
        qrows = sheet.question_results
        for mapping, subset in zip(mappings, _split_by_mapping(qrows, mappings, slots)):
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
    for mapping, subset in zip(mappings, _split_by_mapping(all_rows, mappings, slots)):
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
