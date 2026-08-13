import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, Student } from "../api";

const empty = { roll_no: "", name: "", gender: "M", class_name: "", section: "", session: "2025-26" };
const labels: Record<string, string> = {
  roll_no: "Roll no",
  name: "Student Name",
  gender: "Gender",
  class_name: "Class",
  section: "Section",
  session: "Session",
};

export default function Students() {
  const [rows, setRows] = useState<Student[]>([]);
  const [form, setForm] = useState(empty);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api.get("/api/students").then(setRows);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) =>
      [s.roll_no, s.name, s.gender, s.class_name, s.section, s.session]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api.post("/api/students", form);
      setForm(empty);
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save student");
    }
  };

  const onUpload = async (file: File) => {
    setErr("");
    const data = new FormData();
    data.append("file", file);
    try {
      const res = await api.post("/api/students/import", data);
      setMsg(`Imported ${res.total} rows (${res.created} new, ${res.updated} updated).`);
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "XLSX import failed");
    }
  };

  return (
    <>
      <h2>Student list</h2>
      <p className="muted">Roll no, Student Name, Gender, Class, Section, Session. Use the upload button for an XLSX sheet.</p>
      <div className="card">
        <div className="row">
          <a className="btn" href="/api/students/template.xlsx">Download XLSX template</a>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => e.target.files && onUpload(e.target.files[0])}
          />
          <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
            Upload XLSX sheet
          </button>
          <label>
            Search students
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Roll, name, gender, class, section, or session"
            />
          </label>
        </div>
        {msg && <p>{msg}</p>}
        {err && <p className="error">{err}</p>}
      </div>
      <form className="card" onSubmit={onSubmit}>
        <h3>Add student</h3>
        <div className="row">
          {(["roll_no", "name", "gender", "class_name", "section", "session"] as const).map((key) => (
            <label key={key}>
              {labels[key]}
              {key === "gender" ? (
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              ) : (
                <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === "roll_no" || key === "name"} />
              )}
            </label>
          ))}
          <button type="submit">Save student</button>
        </div>
      </form>
      <div className="card">
        <table>
          <thead>
            <tr><th>Roll no</th><th>Student Name</th><th>Gender</th><th>Class</th><th>Section</th><th>Session</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.roll_no}</td><td>{s.name}</td><td>{s.gender}</td><td>{s.class_name}</td><td>{s.section}</td><td>{s.session}</td>
                <td>
                  <Link to={`/students/${s.id}`}>View</Link>
                  {" · "}
                  <button type="button" className="ghost" onClick={async () => { await api.del(`/api/students/${s.id}`); load(); }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted">No students match that search.</p>}
      </div>
    </>
  );
}
