import { FormEvent, useEffect, useState } from "react";
import { api, Student } from "../api";

const empty = { roll_no: "", name: "", gender: "", class_name: "", section: "", session: "2025-26" };

export default function Students() {
  const [rows, setRows] = useState<Student[]>([]);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState("");
  const load = () => api.get("/api/students").then(setRows);
  useEffect(() => { load(); }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post("/api/students", form);
    setForm(empty);
    load();
  };

  const onUpload = async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    const res = await api.post("/api/students/import", data);
    setMsg(`Imported ${res.total} rows (${res.created} new, ${res.updated} updated).`);
    load();
  };

  return (
    <>
      <h2>Student list</h2>
      <p className="muted">Roll no, name, gender, class, section, session. Upload an XLSX using the template columns.</p>
      <div className="card">
        <div className="row">
          <a className="btn" href="/api/students/template.xlsx">Download XLSX template</a>
          <label>
            Upload XLSX
            <input type="file" accept=".xlsx" onChange={(e) => e.target.files && onUpload(e.target.files[0])} />
          </label>
        </div>
        {msg && <p>{msg}</p>}
      </div>
      <form className="card" onSubmit={onSubmit}>
        <h3>Add student</h3>
        <div className="row">
          {(["roll_no", "name", "gender", "class_name", "section", "session"] as const).map((key) => (
            <label key={key}>
              {key.replace("_", " ")}
              <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === "roll_no" || key === "name"} />
            </label>
          ))}
          <button type="submit">Save</button>
        </div>
      </form>
      <div className="card">
        <table>
          <thead>
            <tr><th>Roll</th><th>Name</th><th>Gender</th><th>Class</th><th>Section</th><th>Session</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.roll_no}</td><td>{s.name}</td><td>{s.gender}</td><td>{s.class_name}</td><td>{s.section}</td><td>{s.session}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
