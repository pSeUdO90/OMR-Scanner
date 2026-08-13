import { FormEvent, useEffect, useRef, useState } from "react";
import { api, Layout, Subject } from "../api";
import { DeleteButton, EditLink, ViewLink } from "../components/ActionButtons";
import SubjectMapsEditor, { SubjectMapRow } from "../components/SubjectMapsEditor";
import PageTitle from "../components/PageTitle";

export default function Layouts() {
  const [rows, setRows] = useState<Layout[]>([]);
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
  const [maps, setMaps] = useState<SubjectMapRow[]>([{ subject: "Paper", start_q: 1, end_q: 100 }]);

  const load = () => {
    api.get("/api/layouts").then(setRows);
    api.get("/api/subjects").then((list: Subject[]) => {
      setSubjects(list);
      if (list.length && maps.length === 1 && maps[0].subject === "Paper") {
        setMaps([{ subject_id: list[0].id, subject: list[0].name, start_q: 1, end_q: form.total_questions }]);
      }
    });
  };
  useEffect(() => { load(); }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("PDF/JPG of the sample OMR must be uploaded");
      return;
    }
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
    data.append("sample", file);
    try {
      await api.post("/api/layouts", data);
      setMsg("Layout created.");
      setForm({ ...form, name: "", description: "" });
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not create layout");
    }
  };

  const onDelete = async (layout: Layout) => {
    setErr("");
    try {
      await api.del(`/api/layouts/${layout.id}`);
      setMsg(`Deleted ${layout.name}.`);
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not delete layout");
    }
  };

  return (
    <>
      <PageTitle icon="layouts" subtitle="Create a layout from a printed sample, then map subjects to question ranges.">
        OMR layouts
      </PageTitle>
      <form className="card" onSubmit={onCreate}>
        <h3>Create a new layout</h3>
        <div className="row">
          <label>Layout name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Total questions<input type="number" min={1} value={form.total_questions} onChange={(e) => setForm({ ...form, total_questions: Number(e.target.value) })} /></label>
          <label>Columns<input type="number" min={1} max={6} value={form.columns} onChange={(e) => setForm({ ...form, columns: Number(e.target.value) })} /></label>
          <label>Options<input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} /></label>
        </div>
        <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <SubjectMapsEditor maps={maps} setMaps={setMaps} subjects={subjects} />
        <p className="muted">Sample OMR (PDF or JPG) is required.</p>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" required />
        <p><button type="submit">Create layout</button></p>
        {msg && <p>{msg}</p>}
        {err && <p className="error">{err}</p>}
      </form>
      <div className="layout-grid">
        {rows.map((layout) => (
          <div className="card layout-card" key={layout.id}>
            <h3>{layout.name}</h3>
            <p className="muted">{layout.description}</p>
            <p>{layout.total_questions} questions · options {layout.options}{layout.is_builtin ? " · built-in" : " · custom"}</p>
            <ul>
              {(layout.preview?.default_maps || []).map((m) => (
                <li key={`${m.subject}-${m.start_q}`}>{m.subject}: Q{m.start_q}–Q{m.end_q} ({m.end_q - m.start_q + 1})</li>
              ))}
            </ul>
            {layout.has_sample ? (
              <img className="sample-preview" src={`/api/layouts/${layout.id}/sample`} alt={`${layout.name} sample`} />
            ) : (
              <p className="muted">No sample image on file.</p>
            )}
            <div className="actions">
              <ViewLink to={`/layouts/${layout.id}`}>View</ViewLink>
              <EditLink to={`/layouts/${layout.id}?tab=edit`}>Edit</EditLink>
              <DeleteButton onClick={() => onDelete(layout)}>Delete</DeleteButton>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
