import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Exam } from "../api";

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
  const [exam, setExam] = useState<Exam | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [keyString, setKeyString] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const e = await api.get(`/api/exams/${id}`);
    setExam(e);
    const letters = Object.entries(e.answer_key || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => v)
      .join("");
    setKeyString(letters);
    setSheets(await api.get(`/api/exams/${id}/sheets`));
  };
  useEffect(() => { load(); }, [id]);

  if (!exam) return <p>Loading…</p>;

  return (
    <>
      <h2>{exam.name}</h2>
      <p className="muted">{exam.exam_type} · {exam.exam_date} · {exam.duration_minutes} min · +{exam.correct_marks}/{exam.wrong_marks}/{exam.unattempted_marks} · layout {exam.layout_name}</p>
      <div className="card">
        <h3>Question mapping</h3>
        {exam.subject_maps.map((m) => <p key={m.id}>{m.subject_name}: Q{m.start_q}–Q{m.end_q}</p>)}
      </div>
      <div className="card">
        <h3>Answer key</h3>
        <p className="muted">Paste a string of A/B/C/D in question order, or generate a filled key sheet.</p>
        <textarea rows={4} value={keyString} onChange={(e) => setKeyString(e.target.value)} style={{ width: "100%" }} />
        <p>
          <button onClick={async () => {
            await api.put(`/api/exams/${id}/answer-key`, { key_string: keyString });
            setMsg("Answer key saved.");
            load();
          }}>Save key</button>
        </p>
      </div>
      <div className="card">
        <h3>Upload scanned OMR sheets</h3>
        <input type="file" multiple accept="image/*" onChange={async (e) => {
          if (!e.target.files?.length) return;
          const data = new FormData();
          for (const file of Array.from(e.target.files)) data.append("files", file);
          await fetch(`/api/exams/${id}/sheets`, { method: "POST", body: data }).then((r) => r.json());
          load();
        }} />
        <p className="muted">Need a test sheet? Generate one from the current key and a roll number.</p>
        <button className="secondary" onClick={async () => {
          const roll = prompt("Roll number to bubble", "2400100001");
          if (!roll) return;
          const data = new FormData();
          data.append("roll", roll);
          await api.post(`/api/exams/${id}/sample-sheet`, data);
          load();
        }}>Generate sample filled sheet</button>
      </div>
      <div className="card">
        <button onClick={async () => {
          const res = await api.post(`/api/exams/${id}/evaluate`);
          setMsg(`Evaluated ${res.evaluated} sheet(s).`);
          load();
        }}>Evaluate uploaded sheets</button>{" "}
        <Link className="btn" to={`/exams/${id}/results`}>RWL results</Link>
        {msg && <p>{msg}</p>}
      </div>
      <div className="card">
        <h3>Sheets</h3>
        <table>
          <thead><tr><th>File</th><th>Roll</th><th>Student</th><th>R/W/L</th><th>Score</th><th>Status</th></tr></thead>
          <tbody>
            {sheets.map((s) => (
              <tr key={s.id}>
                <td>{s.filename}</td>
                <td>{s.detected_roll}</td>
                <td>{s.student_name}</td>
                <td><span className="pill R">{s.right_count}</span> <span className="pill W">{s.wrong_count}</span> <span className="pill L">{s.left_count}</span></td>
                <td>{s.raw_score}/{s.max_score}</td>
                <td>{s.status}{s.error_message ? ` — ${s.error_message}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
