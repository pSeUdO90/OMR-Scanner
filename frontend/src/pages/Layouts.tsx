import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Layout } from "../api";

export default function Layouts() {
  const [rows, setRows] = useState<Layout[]>([]);
  useEffect(() => { api.get("/api/layouts").then(setRows); }, []);
  return (
    <>
      <h2>OMR layouts</h2>
      <p className="muted">Select a layout when you create an exam. Gyana Vikash 180 matches the Berhampur school form: timing marks, 10-digit roll, Physics 1–45, Chemistry 46–90, Biology 91–180.</p>
      {rows.map((layout) => (
        <div className="card" key={layout.id}>
          <h3>{layout.name}</h3>
          <p className="muted">{layout.description}</p>
          <p>{layout.total_questions} questions · options {layout.options}</p>
          <ul>
            {(layout.preview?.default_maps || []).map((m) => (
              <li key={m.subject}>{m.subject}: Q{m.start_q}–Q{m.end_q} ({m.end_q - m.start_q + 1} questions)</li>
            ))}
          </ul>
          <Link to="/exams">Use this layout in a new exam →</Link>
        </div>
      ))}
    </>
  );
}
