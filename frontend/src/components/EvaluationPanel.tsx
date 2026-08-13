import { useRef, useState } from "react";
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

export default function EvaluationPanel({
  exam,
  sheets,
  keyString,
  setKeyString,
  onReload,
}: {
  exam: Exam;
  sheets: Sheet[];
  keyString: string;
  setKeyString: (value: string) => void;
  onReload: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const keyRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const id = exam.id;

  return (
    <>
      <div className="card">
        <h3>Upload answer key</h3>
        <p className="muted">Paste A/B/C/D in question order, or upload a text/CSV file or a filled key OMR image.</p>
        <textarea rows={4} value={keyString} onChange={(e) => setKeyString(e.target.value)} style={{ width: "100%" }} />
        <p>
          <button onClick={async () => {
            setErr("");
            try {
              await api.put(`/api/exams/${id}/answer-key`, { key_string: keyString });
              setMsg(`Answer key saved (${keyString.replace(/[^ABCD]/gi, "").length} questions).`);
              onReload();
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Could not save key");
            }
          }}>Save typed key</button>
          {" "}
          <input
            ref={keyRef}
            type="file"
            accept="image/*,.txt,.csv"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.append("file", file);
              try {
                const updated = await api.post(`/api/exams/${id}/answer-key/upload`, data);
                const letters = Object.entries(updated.answer_key || {})
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([, v]) => v)
                  .join("");
                setKeyString(letters);
                setMsg(`Answer key uploaded (${letters.length} questions).`);
                onReload();
              } catch (error) {
                setErr(error instanceof Error ? error.message : "Key upload failed");
              }
            }}
          />
          <button type="button" className="secondary" onClick={() => keyRef.current?.click()}>Upload answer key file</button>
        </p>
      </div>
      <div className="card">
        <h3>Upload scanned OMR sheets</h3>
        <input
          ref={scanRef}
          type="file"
          multiple
          accept="image/*"
          hidden
          onChange={async (e) => {
            if (!e.target.files?.length) return;
            const data = new FormData();
            for (const file of Array.from(e.target.files)) data.append("files", file);
            try {
              await fetch(`/api/exams/${id}/sheets`, { method: "POST", body: data }).then((r) => {
                if (!r.ok) throw new Error("Upload failed");
                return r.json();
              });
              setMsg(`Uploaded ${e.target.files.length} sheet(s).`);
              onReload();
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Upload failed");
            }
          }}
        />
        <button type="button" onClick={() => scanRef.current?.click()}>Upload scanned OMR sheets</button>
        {" "}
        <button className="secondary" type="button" onClick={async () => {
          const roll = prompt("Roll number to bubble on a generated practice sheet", "2400100001");
          if (!roll) return;
          const data = new FormData();
          data.append("roll", roll);
          await api.post(`/api/exams/${id}/sample-sheet`, data);
          setMsg("Generated sheet added to the scan queue.");
          onReload();
        }}>Generate filled practice sheet</button>
      </div>
      <div className="card">
        <button onClick={async () => {
          setErr("");
          try {
            const res = await api.post(`/api/exams/${id}/evaluate`);
            setMsg(`Evaluated ${res.evaluated} sheet(s).`);
            onReload();
          } catch (error) {
            setErr(error instanceof Error ? error.message : "Evaluation failed");
          }
        }}>Evaluate uploaded OMR sheets</button>
        {msg && <p>{msg}</p>}
        {err && <p className="error">{err}</p>}
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
