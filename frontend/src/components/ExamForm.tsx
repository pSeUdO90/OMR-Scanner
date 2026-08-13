import { FormEvent, useMemo } from "react";
import { Exam, Layout, Student, Subject } from "../api";
import SubjectMapsEditor, { SubjectMapRow } from "./SubjectMapsEditor";

export type ExamFormState = {
  name: string;
  exam_date: string;
  exam_type: string;
  duration_minutes: number;
  correct_marks: number;
  wrong_marks: number;
  unattempted_marks: number;
  layout_id: number;
  test_id: string;
  test_no: string;
  class_name: string;
  section: string;
  batch: string;
};

export function examToForm(exam: Exam): ExamFormState {
  return {
    name: exam.name,
    exam_date: exam.exam_date,
    exam_type: exam.exam_type,
    duration_minutes: exam.duration_minutes,
    correct_marks: exam.correct_marks,
    wrong_marks: exam.wrong_marks,
    unattempted_marks: exam.unattempted_marks,
    layout_id: exam.layout_id,
    test_id: exam.test_id || "",
    test_no: exam.test_no || "",
    class_name: exam.class_name || "",
    section: exam.section || "",
    batch: exam.batch || "",
  };
}

export default function ExamForm({
  form,
  setForm,
  maps,
  setMaps,
  layouts,
  subjects,
  students = [],
  submitLabel,
  onSubmit,
  err,
  locked = false,
}: {
  form: ExamFormState;
  setForm: (next: ExamFormState) => void;
  maps: SubjectMapRow[];
  setMaps: (next: SubjectMapRow[]) => void;
  layouts: Layout[];
  subjects: Subject[];
  students?: Student[];
  submitLabel: string;
  onSubmit: (e: FormEvent) => void;
  err: string;
  locked?: boolean;
}) {
  const applyLayout = (layout: Layout) => {
    const byName = Object.fromEntries(subjects.map((s) => [s.name, s.id]));
    setMaps(
      (layout.preview?.default_maps || []).map((m) => ({
        subject_id: byName[m.subject] || subjects[0]?.id || 0,
        subject: m.subject,
        start_q: m.start_q,
        end_q: m.end_q,
      }))
    );
  };
  const selectedLayout = layouts.find((l) => l.id === form.layout_id);
  const classes = useMemo(() => [...new Set(students.map((s) => s.class_name).filter(Boolean))].sort(), [students]);
  const sections = useMemo(
    () => [...new Set(students.filter((s) => !form.class_name || s.class_name === form.class_name).map((s) => s.section).filter(Boolean))].sort(),
    [students, form.class_name]
  );
  const batches = useMemo(
    () => [...new Set(students.filter((s) => {
      if (form.class_name && s.class_name !== form.class_name) return false;
      if (form.section && s.section !== form.section) return false;
      return Boolean(s.session);
    }).map((s) => s.session))].sort(),
    [students, form.class_name, form.section]
  );
  return (
    <form className="card" onSubmit={onSubmit}>
      {locked && <p className="error">This exam has been evaluated. Only the answer key can still be changed.</p>}
      <div className="row">
        <label>Exam Name<input disabled={locked} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Date<input disabled={locked} type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} /></label>
        <label>Type of Exam
          <select disabled={locked} value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
            {["Unit Test", "Term", "Annual", "NEET Mock", "JEE Mock", "Custom"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Duration (minutes)<input disabled={locked} type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></label>
      </div>
      <div className="row">
        <label>Test ID<input value={form.test_id || "0001"} disabled readOnly /></label>
        <label>Test No<input disabled={locked} value={form.test_no} onChange={(e) => setForm({ ...form, test_no: e.target.value })} /></label>
        <label>Class
          <select disabled={locked} value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value, section: "", batch: "" })}>
            <option value="">All classes</option>
            {classes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Section
          <select disabled={locked} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value, batch: "" })}>
            <option value="">All sections</option>
            {sections.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Batch
          <select disabled={locked} value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })}>
            <option value="">All batches</option>
            {batches.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <h3>Marking scheme</h3>
      <div className="row">
        <label>Correct<input disabled={locked} type="number" step="0.5" value={form.correct_marks} onChange={(e) => setForm({ ...form, correct_marks: Number(e.target.value) })} /></label>
        <label>Wrong<input disabled={locked} type="number" step="0.5" value={form.wrong_marks} onChange={(e) => setForm({ ...form, wrong_marks: Number(e.target.value) })} /></label>
        <label>Left / unattempted<input disabled={locked} type="number" step="0.5" value={form.unattempted_marks} onChange={(e) => setForm({ ...form, unattempted_marks: Number(e.target.value) })} /></label>
      </div>
      <h3>OMR layout</h3>
      <div className="grid">
        {layouts.map((l) => (
          <button
            key={l.id}
            type="button"
            disabled={locked}
            className={form.layout_id === l.id ? "" : "ghost"}
            onClick={() => {
              setForm({ ...form, layout_id: l.id });
              applyLayout(l);
            }}
          >
            {l.name} ({l.total_questions} Q)
          </button>
        ))}
      </div>
      {selectedLayout && <p className="muted">{selectedLayout.description}</p>}
      <SubjectMapsEditor maps={maps} setMaps={setMaps} subjects={subjects} locked={locked} />
      {!locked && <p><button type="submit">{submitLabel}</button></p>}
      {err && <p className="error">{err}</p>}
    </form>
  );
}
