import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Exam, Layout, Student, Subject } from "../api";
import { DeleteButton, EditButton } from "../components/ActionButtons";
import { useConfirm } from "../components/ConfirmProvider";
import ExamForm, { ExamFormState, examToForm } from "../components/ExamForm";
import EvaluationPanel from "../components/EvaluationPanel";
import PageTitle from "../components/PageTitle";

type Sheet = {
  id: number;
  filename: string;
  status: string;
  detected_roll: string;
  student_name: string;
  raw_score: number;
  max_score: number;
  right_count: number;
  wrong_count: number;
  left_count: number;
  error_message: string;
};

export default function ExamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const [exam, setExam] = useState<Exam | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [keyString, setKeyString] = useState("");
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState<ExamFormState | null>(null);
  const [maps, setMaps] = useState<{ subject_id?: number; subject?: string; start_q: number; end_q: number }[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const confirm = useConfirm();

  const load = async () => {
    const [e, layoutRows, subjectRows, studentRows] = await Promise.all([
      api.get(`/api/exams/${id}`),
      api.get("/api/layouts"),
      api.get("/api/subjects"),
      api.get("/api/students"),
    ]);
    setExam(e);
    setLayouts(layoutRows);
    setSubjects(subjectRows);
    setStudents(studentRows);
    setForm(examToForm(e));
    setMaps(e.subject_maps.map((m: Exam["subject_maps"][number]) => ({
      subject_id: m.subject_id,
      subject: m.subject_name,
      start_q: m.start_q,
      end_q: m.end_q,
    })));
    const letters = Object.entries(e.answer_key || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => v)
      .join("");
    setKeyString(letters);
    setSheets(await api.get(`/api/exams/${id}/sheets`));
  };
  useEffect(() => { load(); }, [id]);

  const setTab = (next: string) => {
    const copy = new URLSearchParams(params);
    copy.set("tab", next);
    setParams(copy);
  };

  if (!exam || !form) return <p>Loading…</p>;
  const locked = exam.status === "evaluated" || exam.status === "published";

  const onEdit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const updated = await api.put(`/api/exams/${id}`, { ...form, subject_maps: maps, answer_key: exam.answer_key });
      if (updated.id !== exam.id) {
        throw new Error("Save did not update this exam");
      }
      setMsg("Exam updated.");
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not update exam");
    }
  };

  return (
    <>
      <PageTitle icon="exams">{exam.name}</PageTitle>
      <p className="muted">
        {exam.exam_type} · {exam.exam_date}
        {exam.class_name ? ` · Class ${exam.class_name}` : ""}
        {exam.section ? `-${exam.section}` : ""}
        {exam.batch ? ` · Batch ${exam.batch}` : ""}
        {exam.test_id ? ` · Test ID ${exam.test_id}` : ""}
        {exam.test_no ? ` · Test No ${exam.test_no}` : ""}
        {" · "}{exam.duration_minutes} min · marking +{exam.correct_marks}/{exam.wrong_marks}/{exam.unattempted_marks} · layout {exam.layout_name}
      </p>
      <div className="tabs">
        <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
        <EditButton className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>Edit</EditButton>
        <button type="button" className={tab === "evaluation" ? "active" : ""} onClick={() => setTab("evaluation")}>Evaluation</button>
        <Link className={tab === "results" ? "btn active" : "btn"} to={`/exams/${id}/results`}>Results</Link>
        <DeleteButton
          onClick={async () => {
                    const ok = await confirm({ title: "Delete exam", message: `Delete exam “${exam.name}”? This cannot be undone.` });
                    if (!ok) return;
            try {
              await api.del(`/api/exams/${id}`);
              navigate("/exams");
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Could not delete exam");
            }
          }}
        >
          Delete
        </DeleteButton>
      </div>

      {tab === "overview" && (
        <div className="card">
          <h3>Question mapping</h3>
          {exam.subject_maps.map((m) => (
            <p key={m.id}>{m.subject_name}: Q{m.start_q}–Q{m.end_q} ({m.end_q - m.start_q + 1} questions)</p>
          ))}
        </div>
      )}

      {tab === "edit" && (
        <>
          <h3>Edit this exam</h3>
          <p className="muted">Changes are saved on this exam. A new exam is not created.</p>
          {msg && <p>{msg}</p>}
          <ExamForm
            form={form}
            setForm={setForm}
            maps={maps}
            setMaps={setMaps}
            layouts={layouts}
            subjects={subjects}
            students={students}
            submitLabel="Save changes"
            onSubmit={onEdit}
            err={err}
            locked={locked}
          />
        </>
      )}

      {tab === "evaluation" && (
        <EvaluationPanel
          exam={exam}
          sheets={sheets}
          keyString={keyString}
          setKeyString={setKeyString}
          onReload={load}
        />
      )}
    </>
  );
}
