import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Layout, Subject } from "../api";
import { DeleteButton, EditLink, ViewLink } from "../components/ActionButtons";
import { BulkBar, SelectAllCell, SelectCell, setAll, toggleId } from "../components/BulkSelect";
import { useConfirm } from "../components/ConfirmProvider";
import SubjectMapsEditor, { SubjectMapRow } from "../components/SubjectMapsEditor";
import PageTitle from "../components/PageTitle";

export default function Layouts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Layout[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const confirm = useConfirm();
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
      const created = await api.post("/api/layouts", data) as Layout;
      navigate(`/layouts/${created.id}?tab=map`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not create layout");
    }
  };

  const onDelete = async (layout: Layout) => {
    const ok = await confirm({
      title: "Delete layout",
      message: `Delete “${layout.name}”? Layouts used by an exam cannot be deleted.`,
    });
    if (!ok) return;
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
      <PageTitle icon="layouts" subtitle="Create a sheet in A4 OMR Studio, or map a printed sample. Saved studio sheets appear below with a thumbnail.">
        OMR layouts
      </PageTitle>
      <p className="card">
        <Link className="btn-view" to="/layouts/studio">Open A4 OMR Studio</Link>
        <span className="muted"> Design, print, export JSON, and save to this list.</span>
      </p>
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
      <div className="card">
        <h3>Saved layouts</h3>
        <BulkBar
          count={selected.size}
          onDelete={async () => {
            const ok = await confirm({
              title: "Delete layouts",
              message: `Delete ${selected.size} layout(s)? Layouts used by an exam cannot be deleted.`,
            });
            if (!ok) return;
            setErr("");
            try {
              for (const id of selected) await api.del(`/api/layouts/${id}`);
              setSelected(new Set());
              setMsg("Deleted selected layouts.");
              load();
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Could not delete layout");
            }
          }}
        />
        <table>
          <thead>
            <tr>
              <SelectAllCell
                checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                indeterminate={rows.some((r) => selected.has(r.id))}
                onChange={(on) => setSelected(setAll(rows.map((r) => r.id), on))}
              />
              <th></th>
              <th>Name</th><th>Questions</th><th>Options</th><th>Type</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((layout) => (
              <tr key={layout.id}>
                <SelectCell checked={selected.has(layout.id)} onChange={(on) => setSelected(toggleId(selected, layout.id, on))} label={`Select ${layout.name}`} />
                <td>
                  {layout.has_sample ? (
                    <img className="layout-thumb" src={`/api/layouts/${layout.id}/sample`} alt={`${layout.name} thumbnail`} />
                  ) : (
                    <span className="muted">No preview</span>
                  )}
                </td>
                <td>{layout.name}</td>
                <td>{layout.total_questions}</td>
                <td>{layout.options}</td>
                <td>{layout.is_studio ? "OMR Studio" : layout.is_builtin ? "built-in" : "custom"}</td>
                <td className="row-actions">
                  <ViewLink to={`/layouts/${layout.id}`}>View</ViewLink>
                  {layout.is_studio ? (
                    <EditLink to={`/layouts/studio/${layout.id}`}>Edit Layout</EditLink>
                  ) : (
                    <EditLink to={`/layouts/${layout.id}?tab=map`}>Map blocks</EditLink>
                  )}
                  <DeleteButton onClick={() => onDelete(layout)}>Delete</DeleteButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
