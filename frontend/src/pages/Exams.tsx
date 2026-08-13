import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam, Layout, Subject } from "../api";

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [maps, setMaps] = useState<{ subject_id: number; start_q: number; end_q: number }[]>([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    name: "",
    exam_date: new Date().toISOString().slice(0, 10),
    exam_type: "Unit Test",
    duration_minutes: 180,
    correct_marks: 4,
    wrong_marks: -1,
    unattempted_marks: 0,
    layout_id: 0,
  });

  useEffect(() => {
    Promise.all([api.get("/api/exams"), api.get("/api/layouts"), api.get("/api/subjects")]).then(
      ([examRows, layoutRows, subjectRows]: [Exam[], Layout[], Subject[]]) => {
        setExams(examRows);
        setLayouts(layoutRows);
        setSubjects(subjectRows);
        const layout = layoutRows[0];
        if (layout) {
          setForm((f) => (f.layout_id ? f : { ...f, layout_id: layout.id }));
          applyLayout(layout, subjectRows);
        }
      }
    );
  }, []);

  const applyLayout = (layout: Layout, subjectRows: Subject[]) => {
    const byName = Object.fromEntries(subjectRows.map((s) => [s.name, s.id]));
    setMaps(
      (layout.preview?.default_maps || []).map((m) => ({
        subject_id: byName[m.subject] || subjectRows[0]?.id || 0,
        start_q: m.start_q,
        end_q: m.end_q,
      }))
    );
  };

  const selectedLayout = layouts.find((l) => l.id === form.layout_id);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api.post("/api/exams", { ...form, subject_maps: maps, answer_key: {} });
      setForm((f) => ({ ...f, name: "" }));
      setExams(await api.get("/api/exams"));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not create exam");
    }
  };

  return (
    <>
      <h2>Create exam</h2>
      <p className="muted">Exam Name, Date, Type, Marking Scheme, Duration, OMR layout, and start–end question map per subject.</p>
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
                applyLayout(l, subjects);
              }}
            >
              {l.name} ({l.total_questions} Q)
            </button>
          ))}
        </div>
        {selectedLayout && <p className="muted">{selectedLayout.description}</p>}
        <h3>Questions per subject</h3>
        <p className="muted">Set start and end question numbers. Count is calculated automatically.</p>
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
            <label>No. of questions
              <input readOnly value={Math.max(0, m.end_q - m.start_q + 1)} />
            </label>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => setMaps([...maps, { subject_id: subjects[0]?.id || 0, start_q: 1, end_q: 10 }])}>Add subject range</button>
        {" "}
        <button type="submit">Create exam</button>
        {err && <p className="error">{err}</p>}
      </form>
      <div className="card">
        <h3>All exams</h3>
        <table>
          <thead><tr><th>Exam Name</th><th>Date</th><th>Type</th><th>Layout</th><th>Status</th></tr></thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td><Link to={`/exams/${exam.id}`}>{exam.name}</Link></td>
                <td>{exam.exam_date}</td>
                <td>{exam.exam_type}</td>
                <td>{exam.layout_name}</td>
                <td>{exam.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
