import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, Layout, Subject } from "../api";
import { EditButton } from "../components/ActionButtons";
import FieldMapper from "../components/FieldMapper";
import SubjectMapsEditor, { SubjectMapRow } from "../components/SubjectMapsEditor";

export default function LayoutDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "view";
  const [layout, setLayout] = useState<Layout | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    total_questions: 100,
    columns: 4,
    options: "ABCD",
  });
  const [maps, setMaps] = useState<SubjectMapRow[]>([]);

  const load = async () => {
    const [row, subjectRows] = await Promise.all([
      api.get(`/api/layouts/${id}`),
      api.get("/api/subjects"),
    ]);
    setLayout(row);
    setSubjects(subjectRows);
    setForm({
      name: row.name,
      description: row.description,
      total_questions: row.total_questions,
      columns: 4,
      options: row.options,
    });
    const byName = Object.fromEntries(subjectRows.map((s: Subject) => [s.name, s.id]));
    setMaps(
      (row.preview?.default_maps || []).map((m: { subject: string; start_q: number; end_q: number }) => ({
        subject_id: byName[m.subject],
        subject: m.subject,
        start_q: m.start_q,
        end_q: m.end_q,
      }))
    );
  };
  useEffect(() => { load(); }, [id]);

  if (!layout) return <p>Loading…</p>;

  const onEdit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const data = new FormData();
    data.append("name", form.name);
    data.append("description", form.description);
    data.append("total_questions", String(form.total_questions));
    data.append("columns", String(form.columns));
    data.append("options", form.options);
    data.append("subject_maps", JSON.stringify(maps.map((m) => ({
      subject: subjects.find((s) => s.id === m.subject_id)?.name || m.subject,
      start_q: m.start_q,
      end_q: m.end_q,
    }))));
    const file = fileRef.current?.files?.[0];
    if (file) data.append("sample", file);
    try {
      await api.put(`/api/layouts/${id}`, data);
      setMsg("Layout updated.");
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not update layout");
    }
  };

  return (
    <>
      <p className="muted"><Link to="/layouts">← OMR layouts</Link></p>
      <h2>{layout.name}</h2>
      <div className="tabs">
        <button type="button" className={tab === "view" ? "active" : ""} onClick={() => setParams({ tab: "view" })}>View</button>
        <EditButton className={tab === "edit" ? "active" : ""} onClick={() => setParams({ tab: "edit" })}>Edit</EditButton>
      </div>
      {tab === "view" && (
        <>
          <div className="card">
            <p className="muted">{layout.description}</p>
            <p>{layout.total_questions} questions · options {layout.options}{layout.is_builtin ? " · built-in" : " · custom"}</p>
            <ul>
              {(layout.preview?.default_maps || []).map((m) => (
                <li key={`${m.subject}-${m.start_q}`}>{m.subject}: Q{m.start_q}–Q{m.end_q} ({m.end_q - m.start_q + 1} questions)</li>
              ))}
            </ul>
            {layout.has_sample && (
              <img className="sample-preview" src={`/api/layouts/${layout.id}/sample`} alt={`${layout.name} sample`} />
            )}
          </div>
          <div className="card">
            <FieldMapper
              analysis={layout.analysis || []}
              fieldMap={layout.field_map || {}}
              onSave={async (next) => {
                await api.post(`/api/layouts/${id}/field-map`, { field_map: next });
                load();
              }}
            />
          </div>
        </>
      )}
      {tab === "edit" && (
        <form className="card" onSubmit={onEdit}>
          <div className="row">
            <label>Layout name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Total questions<input type="number" min={1} value={form.total_questions} onChange={(e) => setForm({ ...form, total_questions: Number(e.target.value) })} disabled={layout.is_builtin} /></label>
            <label>Columns<input type="number" min={1} max={6} value={form.columns} onChange={(e) => setForm({ ...form, columns: Number(e.target.value) })} disabled={layout.is_builtin} /></label>
            <label>Options<input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} disabled={layout.is_builtin} /></label>
          </div>
          <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <SubjectMapsEditor maps={maps} setMaps={setMaps} subjects={subjects} />
          <p className="muted">Replace the sample OMR (PDF or JPG) if needed.</p>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" />
          <p><button type="submit">Save layout</button></p>
          {msg && <p>{msg}</p>}
          {err && <p className="error">{err}</p>}
        </form>
      )}
    </>
  );
}
