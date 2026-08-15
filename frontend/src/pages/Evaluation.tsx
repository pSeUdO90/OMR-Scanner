import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam } from "../api";
import { DeleteButton, EditLink } from "../components/ActionButtons";
import { useConfirm } from "../components/ConfirmProvider";
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

export default function Evaluation() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number>(0);
  const [exam, setExam] = useState<Exam | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [keyString, setKeyString] = useState("");
  const confirm = useConfirm();

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
      <PageTitle icon="evaluation" subtitle="Choose an exam, upload the answer key, then upload scanned OMR sheets and evaluate.">
        Evaluation
      </PageTitle>
      <div className="card row">
        <label>Exam
          <select value={examId} onChange={(e) => setExamId(Number(e.target.value))}>
            {exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {exam && <EditLink to={`/exams/${exam.id}?tab=edit`}>Edit</EditLink>}
        {exam && <Link className="btn secondary" to={`/exams/${exam.id}/results`}>RWL results</Link>}
        {exam && (
          <DeleteButton
            onClick={async () => {
              const ok = await confirm({ title: "Delete exam", message: `Delete exam “${exam.name}”? This cannot be undone.` });
              if (!ok) return;
              await api.del(`/api/exams/${exam.id}`);
              const rows = await api.get("/api/exams");
              setExams(rows);
              setExam(null);
              setExamId(rows[0]?.id || 0);
            }}
          >
            Delete
          </DeleteButton>
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
