import { FormEvent, useEffect, useState } from "react";
import { api, Subject } from "../api";

export default function Subjects() {
  const [rows, setRows] = useState<Subject[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const load = () => api.get("/api/subjects").then(setRows);
  useEffect(() => { load(); }, []);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/api/subjects", { name, code });
    setName("");
    setCode("");
    load();
  };
  return (
    <>
      <h2>Subjects</h2>
      <p className="muted">Map each subject to a question range when you create an exam.</p>
      <form className="card row" onSubmit={onSubmit}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Code<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button>Add subject</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Code</th></tr></thead>
          <tbody>{rows.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.code}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
