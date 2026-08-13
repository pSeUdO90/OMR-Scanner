import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

type Rwl = {
  subject_name: string;
  right: number;
  wrong: number;
  left: number;
  invalid: number;
  accuracy: number;
  score: number;
  max_score: number;
  total: number;
};

type Analytics = {
  exam_name: string;
  published: boolean;
  appeared: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  overall_rwl: Rwl;
  subjects: Rwl[];
  results: {
    rank: number;
    roll_no: string;
    name: string;
    right: number;
    wrong: number;
    left: number;
    score: number;
    max_score: number;
    percentage: number;
    subjects: Rwl[];
  }[];
};

function Bar({ r }: { r: Rwl }) {
  const t = Math.max(r.total, 1);
  return (
    <div className="bar" title={`R ${r.right} W ${r.wrong} L ${r.left}`}>
      <span className="r" style={{ width: `${(r.right / t) * 100}%` }} />
      <span className="w" style={{ width: `${(r.wrong / t) * 100}%` }} />
      <span className="l" style={{ width: `${(r.left / t) * 100}%` }} />
      <span className="i" style={{ width: `${(r.invalid / t) * 100}%` }} />
    </div>
  );
}

export default function Results() {
  const { id } = useParams();
  const [data, setData] = useState<Analytics | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => api.get(`/api/exams/${id}/results`).then(setData);
  useEffect(() => { load(); }, [id]);
  if (!data) return <p>Loading…</p>;
  return (
    <>
      <h2>RWL analysis — {data.exam_name}</h2>
      <p className="muted">Right, Wrong, Left (unattempted). Invalid means more than one bubble was filled.</p>
      <div className="grid">
        <div className="card"><div className="muted">Appeared</div><div className="stat">{data.appeared}</div></div>
        <div className="card"><div className="muted">Average</div><div className="stat">{data.average_score}</div></div>
        <div className="card"><div className="muted">Highest</div><div className="stat">{data.highest_score}</div></div>
        <div className="card"><div className="muted">Lowest</div><div className="stat">{data.lowest_score}</div></div>
      </div>
      <div className="card">
        <h3>Overall RWL</h3>
        <p>
          <span className="pill R">R {data.overall_rwl.right}</span>{" "}
          <span className="pill W">W {data.overall_rwl.wrong}</span>{" "}
          <span className="pill L">L {data.overall_rwl.left}</span>{" "}
          <span className="pill I">I {data.overall_rwl.invalid}</span>
        </p>
        <Bar r={data.overall_rwl} />
      </div>
      <div className="card">
        <h3>Subject RWL</h3>
        {data.subjects.map((s) => (
          <div key={s.subject_name} style={{ marginBottom: "0.8rem" }}>
            <strong>{s.subject_name}</strong> · accuracy {s.accuracy}% · score {s.score}/{s.max_score}
            <Bar r={s} />
          </div>
        ))}
      </div>
      <div className="card">
        <button onClick={async () => {
          await api.post(`/api/exams/${id}/publish`);
          setMsg("Results published.");
          load();
        }}>Publish results</button>
        {data.published && <span className="pill R"> Published</span>}
        {msg && <p>{msg}</p>}
      </div>
      <div className="card">
        <h3>Rank list</h3>
        <table>
          <thead><tr><th>Rank</th><th>Roll</th><th>Name</th><th>R</th><th>W</th><th>L</th><th>Score</th><th>%</th></tr></thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.roll_no + r.rank}>
                <td>{r.rank}</td><td>{r.roll_no}</td><td>{r.name}</td>
                <td>{r.right}</td><td>{r.wrong}</td><td>{r.left}</td>
                <td>{r.score}/{r.max_score}</td><td>{r.percentage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
