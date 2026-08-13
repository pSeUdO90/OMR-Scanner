import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam, Layout, Subject } from "../api";
import ExamForm, { ExamFormState } from "../components/ExamForm";

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [maps, setMaps] = useState<{ subject_id: number; start_q: number; end_q: number }[]>([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<ExamFormState>({
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
          const byName = Object.fromEntries(subjectRows.map((s) => [s.name, s.id]));
          setMaps(
            (layout.preview?.default_maps || []).map((m) => ({
              subject_id: byName[m.subject] || subjectRows[0]?.id || 0,
              start_q: m.start_q,
              end_q: m.end_q,
            }))
          );
        }
      }
    );
  }, []);

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
      <ExamForm
        form={form}
        setForm={setForm}
        maps={maps}
        setMaps={setMaps}
        layouts={layouts}
        subjects={subjects}
        submitLabel="Create exam"
        onSubmit={onSubmit}
        err={err}
      />
      <div className="card">
        <h3>All exams</h3>
        <table>
          <thead><tr><th>Exam Name</th><th>Date</th><th>Type</th><th>Layout</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td><Link to={`/exams/${exam.id}`}>{exam.name}</Link></td>
                <td>{exam.exam_date}</td>
                <td>{exam.exam_type}</td>
                <td>{exam.layout_name}</td>
                <td>{exam.status}</td>
                <td>
                  <Link to={`/exams/${exam.id}?tab=edit`}>Edit</Link>
                  {" · "}
                  <Link to={`/exams/${exam.id}?tab=evaluation`}>Evaluate</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
