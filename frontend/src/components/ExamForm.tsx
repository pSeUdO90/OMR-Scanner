import { FormEvent } from "react";
import { Exam, Layout, Subject } from "../api";

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
  };
}

export default function ExamForm({
  form,
  setForm,
  maps,
  setMaps,
  layouts,
  subjects,
  submitLabel,
  onSubmit,
  err,
}: {
  form: ExamFormState;
  setForm: (next: ExamFormState) => void;
  maps: { subject_id: number; start_q: number; end_q: number }[];
  setMaps: (next: { subject_id: number; start_q: number; end_q: number }[]) => void;
  layouts: Layout[];
  subjects: Subject[];
  submitLabel: string;
  onSubmit: (e: FormEvent) => void;
  err: string;
}) {
  const applyLayout = (layout: Layout) => {
    const byName = Object.fromEntries(subjects.map((s) => [s.name, s.id]));
    setMaps(
      (layout.preview?.default_maps || []).map((m) => ({
        subject_id: byName[m.subject] || subjects[0]?.id || 0,
        start_q: m.start_q,
        end_q: m.end_q,
      }))
    );
  };
  const selectedLayout = layouts.find((l) => l.id === form.layout_id);
  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="row">
        <label>Exam Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Date<input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} /></label>
        <label>Type of Exam
          <select value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
            {["Unit Test", "Term", "Annual", "NEET Mock", "JEE Mock", "Custom"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Duration (minutes)<input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></label>
        <label>Test ID<input value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })} /></label>
        <label>Test No<input value={form.test_no} onChange={(e) => setForm({ ...form, test_no: e.target.value })} /></label>
      </div>
      <h3>Marking scheme</h3>
      <div className="row">
        <label>Correct<input type="number" step="0.5" value={form.correct_marks} onChange={(e) => setForm({ ...form, correct_marks: Number(e.target.value) })} /></label>
        <label>Wrong<input type="number" step="0.5" value={form.wrong_marks} onChange={(e) => setForm({ ...form, wrong_marks: Number(e.target.value) })} /></label>
        <label>Left / unattempted<input type="number" step="0.5" value={form.unattempted_marks} onChange={(e) => setForm({ ...form, unattempted_marks: Number(e.target.value) })} /></label>
      </div>
      <h3>OMR layout</h3>
      <div className="grid">
        {layouts.map((l) => (
          <button
            key={l.id}
            type="button"
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
      <h3>Questions per subject</h3>
      {maps.map((m, i) => (
        <div className="row" key={i}>
          <label>Subject
            <select value={m.subject_id} onChange={(e) => {
              const next = [...maps];
              next[i] = { ...m, subject_id: Number(e.target.value) };
              setMaps(next);
            }}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Start question<input type="number" min={1} value={m.start_q} onChange={(e) => {
            const next = [...maps];
            next[i] = { ...m, start_q: Number(e.target.value) };
            setMaps(next);
          }} /></label>
          <label>End question<input type="number" min={1} value={m.end_q} onChange={(e) => {
            const next = [...maps];
            next[i] = { ...m, end_q: Number(e.target.value) };
            setMaps(next);
          }} /></label>
          <label>No. of questions<input readOnly value={Math.max(0, m.end_q - m.start_q + 1)} /></label>
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => setMaps([...maps, { subject_id: subjects[0]?.id || 0, start_q: 1, end_q: 10 }])}>Add subject range</button>
      {" "}
      <button type="submit">{submitLabel}</button>
      {err && <p className="error">{err}</p>}
    </form>
  );
}
