import { FormEvent, useEffect, useState } from "react";
import { api, Subject } from "../api";
import { DeleteButton } from "../components/ActionButtons";
import PageTitle from "../components/PageTitle";

export default function Subjects() {
  const [rows, setRows] = useState<Subject[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const load = () => api.get("/api/subjects").then(setRows);
  useEffect(() => { load(); }, []);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    await api.post("/api/subjects", { name, code });
    setName("");
    setCode("");
    load();
  };
  return (
    <>
      <PageTitle icon="subjects" subtitle="Map each subject to a question range when you create an exam. A subject used by an exam cannot be deleted.">
        Subjects
      </PageTitle>
      <form className="card row" onSubmit={onSubmit}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Code<input value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button>Add subject</button>
      </form>
      {err && <p className="error">{err}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Code</th><th></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.code}</td>
                <td>
                  <DeleteButton
                    onClick={async () => {
                      setErr("");
                      try {
                        await api.del(`/api/subjects/${s.id}`);
                        load();
                      } catch (error) {
                        setErr(error instanceof Error ? error.message : "Could not delete subject");
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
