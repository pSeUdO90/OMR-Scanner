import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam } from "../api";
import EvaluationPanel from "../components/EvaluationPanel";

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

export default function Evaluation() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number>(0);
  const [exam, setExam] = useState<Exam | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [keyString, setKeyString] = useState("");

  useEffect(() => {
    api.get("/api/exams").then((rows: Exam[]) => {
      setExams(rows);
      if (rows[0]) setExamId(rows[0].id);
    });
  }, []);

  const loadExam = async (id: number) => {
    if (!id) return;
    const e = await api.get(`/api/exams/${id}`);
    setExam(e);
    const letters = Object.entries(e.answer_key || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => v)
      .join("");
    setKeyString(letters);
    setSheets(await api.get(`/api/exams/${id}/sheets`));
  };

  useEffect(() => { loadExam(examId); }, [examId]);

  return (
    <>
      <h2>Evaluation</h2>
      <p className="muted">Choose an exam, upload the answer key, then upload scanned OMR sheets and evaluate.</p>
      <div className="card row">
        <label>Exam
          <select value={examId} onChange={(e) => setExamId(Number(e.target.value))}>
            {exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {exam && <Link className="btn" to={`/exams/${exam.id}?tab=edit`}>Edit exam</Link>}
        {exam && <Link className="btn secondary" to={`/exams/${exam.id}/results`}>RWL results</Link>}
        {exam && (
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              if (!confirm(`Delete exam “${exam.name}”? This cannot be undone.`)) return;
              await api.del(`/api/exams/${exam.id}`);
              const rows = await api.get("/api/exams");
              setExams(rows);
              setExam(null);
              setExamId(rows[0]?.id || 0);
            }}
          >
            Delete exam
          </button>
        )}
      </div>
      {exam ? (
        <EvaluationPanel exam={exam} sheets={sheets} keyString={keyString} setKeyString={setKeyString} onReload={() => loadExam(exam.id)} />
      ) : (
        <p className="muted">Create an exam first.</p>
      )}
    </>
  );
}
