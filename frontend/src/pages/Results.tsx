import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import PageTitle from "../components/PageTitle";

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
    class_name: string;
    section: string;
    right: number;
    wrong: number;
    left: number;
    invalid: number;
    score: number;
    max_score: number;
    percentage: number;
    subjects: Rwl[];
  }[];
  item_analysis: { question_no: number; correct: string; right: number; wrong: number; left: number; invalid: number; difficulty: number }[];
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
  const [err, setErr] = useState("");
  const load = () => api.get(`/api/exams/${id}/results`).then(setData);
  useEffect(() => { load(); }, [id]);
  if (!data) return <p>Loading…</p>;
  return (
    <>
      <PageTitle icon="results" subtitle="Right, Wrong, Left (unattempted). Invalid means more than one bubble was filled.">
        RWL analysis — {data.exam_name}
      </PageTitle>
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
          setErr("");
          try {
            await api.post(`/api/exams/${id}/publish`);
            setMsg("Results published.");
            load();
          } catch (error) {
            setErr(error instanceof Error ? error.message : "Publish failed");
          }
        }}>Publish results</button>{" "}
        <a className="btn" href={`/api/exams/${id}/results.csv`}>Download RWL CSV</a>
        {data.published && <span className="pill R"> Published</span>}
        {msg && <p>{msg}</p>}
        {err && <p className="error">{err}</p>}
      </div>
      <div className="card">
        <h3>Rank list</h3>
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Roll no</th><th>Name</th><th>R</th><th>W</th><th>L</th><th>Score</th><th>%</th>
              {data.subjects.map((s) => <th key={s.subject_name}>{s.subject_name} R/W/L</th>)}
            </tr>
          </thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.roll_no + r.rank}>
                <td>{r.rank}</td><td>{r.roll_no}</td><td>{r.name}</td>
                <td>{r.right}</td><td>{r.wrong}</td><td>{r.left}</td>
                <td>{r.score}/{r.max_score}</td><td>{r.percentage}</td>
                {data.subjects.map((s) => {
                  const sub = r.subjects.find((x) => x.subject_name === s.subject_name);
                  return <td key={s.subject_name}>{sub ? `${sub.right}/${sub.wrong}/${sub.left}` : "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Item analysis</h3>
        <p className="muted">Difficulty is the share of students who did not get the item right.</p>
        <table>
          <thead><tr><th>Q</th><th>Key</th><th>R</th><th>W</th><th>L</th><th>I</th><th>Difficulty</th></tr></thead>
          <tbody>
            {data.item_analysis.slice(0, 60).map((item) => (
              <tr key={item.question_no}>
                <td>{item.question_no}</td>
                <td>{item.correct}</td>
                <td>{item.right}</td>
                <td>{item.wrong}</td>
                <td>{item.left}</td>
                <td>{item.invalid}</td>
                <td>{item.difficulty}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.item_analysis.length > 60 && <p className="muted">Showing first 60 items. Download the CSV for the full rank list.</p>}
      </div>
    </>
  );
}
