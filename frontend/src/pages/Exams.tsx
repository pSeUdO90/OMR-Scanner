import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam, Layout, Student, Subject } from "../api";
import { DeleteButton, EditLink } from "../components/ActionButtons";
import ExamForm, { ExamFormState } from "../components/ExamForm";
import PageTitle from "../components/PageTitle";

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [maps, setMaps] = useState<{ subject_id?: number; subject?: string; start_q: number; end_q: number }[]>([]);
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
    test_id: "",
    test_no: "",
    class_name: "",
    section: "",
    batch: "",
  });

  useEffect(() => {
    Promise.all([
      api.get("/api/exams"),
      api.get("/api/layouts"),
      api.get("/api/subjects"),
      api.get("/api/students"),
      api.get("/api/exams/next-test-id"),
    ]).then(([examRows, layoutRows, subjectRows, studentRows, nextId]: [Exam[], Layout[], Subject[], Student[], { test_id: string }]) => {
      setExams(examRows);
      setLayouts(layoutRows);
      setSubjects(subjectRows);
      setStudents(studentRows);
      const layout = layoutRows[0];
      setForm((f) => ({ ...f, test_id: nextId.test_id, layout_id: f.layout_id || layout?.id || 0 }));
      if (layout) {
        const byName = Object.fromEntries(subjectRows.map((s) => [s.name, s.id]));
        setMaps(
          (layout.preview?.default_maps || []).map((m) => ({
            subject_id: byName[m.subject] || subjectRows[0]?.id || 0,
            subject: m.subject,
            start_q: m.start_q,
            end_q: m.end_q,
          }))
        );
      }
    });
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api.post("/api/exams", { ...form, subject_maps: maps, answer_key: {} });
      const nextId = await api.get("/api/exams/next-test-id");
      setForm((f) => ({ ...f, name: "", test_id: nextId.test_id }));
      setExams(await api.get("/api/exams"));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not create exam");
    }
  };

  return (
    <>
      <PageTitle icon="exams" subtitle="Test ID is assigned automatically. Class, section, and batch come from the student list.">
        Create exam
      </PageTitle>
      <ExamForm
        form={form}
        setForm={setForm}
        maps={maps}
        setMaps={setMaps}
        layouts={layouts}
        subjects={subjects}
        students={students}
        submitLabel="Create exam"
        onSubmit={onSubmit}
        err={err}
      />
      <div className="card">
        <h3>All exams</h3>
        <table>
          <thead><tr><th>Exam Name</th><th>Date</th><th>Class</th><th>Section</th><th>Batch</th><th>Type</th><th>Test ID</th><th>Layout</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td><Link to={`/exams/${exam.id}`}>{exam.name}</Link></td>
                <td>{exam.exam_date}</td>
                <td>{exam.class_name || "—"}</td>
                <td>{exam.section || "—"}</td>
                <td>{exam.batch || "—"}</td>
                <td>{exam.exam_type}</td>
                <td>{exam.test_id || "—"}</td>
                <td>{exam.layout_name}</td>
                <td>{exam.status}</td>
                <td className="row-actions">
                  <EditLink to={`/exams/${exam.id}?tab=edit`}>Edit</EditLink>
                  <Link className="btn secondary" to={`/exams/${exam.id}?tab=evaluation`}>Evaluate</Link>
                  <DeleteButton
                    onClick={async () => {
                      if (!confirm(`Delete exam “${exam.name}”? This cannot be undone.`)) return;
                      try {
                        await api.del(`/api/exams/${exam.id}`);
                        setExams(await api.get("/api/exams"));
                      } catch (error) {
                        setErr(error instanceof Error ? error.message : "Could not delete exam");
                      }
                    }}
                  >
                    Delete
                  </DeleteButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
