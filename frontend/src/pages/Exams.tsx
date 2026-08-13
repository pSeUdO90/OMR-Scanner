import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam, Layout, Subject } from "../api";

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [maps, setMaps] = useState<{ subject_id: number; start_q: number; end_q: number }[]>([]);
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

  const load = () => {
    api.get("/api/exams").then(setExams);
    api.get("/api/layouts").then((rows: Layout[]) => {
      setLayouts(rows);
      if (rows[0] && !form.layout_id) {
        setForm((f) => ({ ...f, layout_id: rows[0].id }));
        applyLayout(rows[0], subjects);
      }
    });
    api.get("/api/subjects").then(setSubjects);
  };
  useEffect(() => { load(); }, []);

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/api/exams", { ...form, subject_maps: maps, answer_key: {} });
    load();
  };

  return (
    <>
      <h2>Create exam</h2>
      <form className="card" onSubmit={onSubmit}>
        <div className="row">
          <label>Exam name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Date<input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} /></label>
          <label>Type
            <select value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
              {["Unit Test", "Term", "Annual", "NEET Mock", "JEE Mock", "Custom"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Duration (min)<input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></label>
        </div>
        <div className="row">
          <label>Marks for correct<input type="number" step="0.5" value={form.correct_marks} onChange={(e) => setForm({ ...form, correct_marks: Number(e.target.value) })} /></label>
          <label>Marks for wrong<input type="number" step="0.5" value={form.wrong_marks} onChange={(e) => setForm({ ...form, wrong_marks: Number(e.target.value) })} /></label>
          <label>Marks for left/unattempted<input type="number" step="0.5" value={form.unattempted_marks} onChange={(e) => setForm({ ...form, unattempted_marks: Number(e.target.value) })} /></label>
          <label>OMR layout
            <select
              value={form.layout_id}
              onChange={(e) => {
                const id = Number(e.target.value);
                setForm({ ...form, layout_id: id });
                const layout = layouts.find((l) => l.id === id);
                if (layout) applyLayout(layout, subjects);
              }}
            >
              {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
        <h3>Question mapping</h3>
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
            <label>Start Q<input type="number" value={m.start_q} onChange={(e) => {
              const next = [...maps];
              next[i] = { ...m, start_q: Number(e.target.value) };
              setMaps(next);
            }} /></label>
            <label>End Q<input type="number" value={m.end_q} onChange={(e) => {
              const next = [...maps];
              next[i] = { ...m, end_q: Number(e.target.value) };
              setMaps(next);
            }} /></label>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => setMaps([...maps, { subject_id: subjects[0]?.id || 0, start_q: 1, end_q: 10 }])}>Add subject range</button>
        {" "}
        <button type="submit">Create exam</button>
      </form>
      <div className="card">
        <h3>All exams</h3>
        <table>
          <thead><tr><th>Name</th><th>Date</th><th>Type</th><th>Layout</th><th>Status</th></tr></thead>
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
