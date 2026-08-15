import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, authFileUrl, Student } from "../api";
import { DeleteButton, EditButton, ViewLink } from "../components/ActionButtons";
import { BulkBar, SelectAllCell, SelectCell, setAll, toggleId } from "../components/BulkSelect";
import { useConfirm } from "../components/ConfirmProvider";
import PageTitle from "../components/PageTitle";

const CLASS_CHOICES = ["6", "7", "8", "9", "10", "11", "12"];
const SECTION_CHOICES = ["A", "B", "C", "D", "E", "F"];
const SESSION_CHOICES = ["2024-25", "2025-26", "2026-27"];

function mergeChoices(base: string[], extra: string[], current: string) {
  return Array.from(new Set([...base, ...extra, current].map((item) => item.trim()).filter(Boolean)));
}

const empty = {
  roll_no: "",
  name: "",
  gender: "M",
  class_name: "",
  section: "",
  session: "",
};
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
  const pendingFile = useRef<File | null>(null);
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [choices, setChoices] = useState<{ classes: string[]; sections: string[]; batches: string[] }>({
    classes: [],
    sections: [],
    batches: [],
  });
  const [conflict, setConflict] = useState<{ existing: { roll_no: string; name: string; current_name: string }[]; newCount: number } | null>(null);
  const load = () => {
    api.get("/api/students").then(setRows).catch((error) => {
      setErr(error instanceof Error ? error.message : "Could not load students");
    });
    api.get("/api/students/options").then((row) =>
      setChoices({
        classes: (row.classes as string[]) || [],
        sections: (row.sections as string[]) || [],
        batches: (row.batches as string[]) || [],
      }),
    ).catch(() => undefined);
  };
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
      if (editingId) {
        await api.put(`/api/students/${editingId}`, form);
        setEditingId(null);
      } else {
        await api.post("/api/students", form);
      }
      setForm(empty);
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save student");
    }
  };

  const finishImport = async (file: File, onConflict: "update" | "skip") => {
    const data = new FormData();
    data.append("file", file);
    const res = await api.post(`/api/students/import?on_conflict=${onConflict}`, data);
    const skipped = res.skipped ? `, ${res.skipped} ignored` : "";
    setMsg(`Imported ${res.created + res.updated} rows (${res.created} new, ${res.updated} rewritten${skipped}).`);
    load();
  };

  const onUpload = async (file: File) => {
    setErr("");
    const data = new FormData();
    data.append("file", file);
    try {
      const preview = await api.post("/api/students/import/preview", data);
      if ((preview.existing || []).length) {
        pendingFile.current = file;
        setConflict({ existing: preview.existing, newCount: (preview.new || []).length });
        return;
      }
      await finishImport(file, "update");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "XLSX import failed");
    }
  };

  return (
    <>
      <PageTitle icon="students" subtitle="Roll no, Student Name, Gender, Class, Section, Session. Use the upload button for an XLSX sheet.">
        Student list
      </PageTitle>
      <div className="card">
        <div className="row">
          <a className="btn" href={authFileUrl("/api/students/template.xlsx")}>Download XLSX template</a>
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
        <h3>{editingId ? "Edit student" : "Add student"}</h3>
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
              ) : key === "class_name" ? (
                <select value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} required>
                  <option value="">Select class</option>
                  {mergeChoices(CLASS_CHOICES, choices.classes, form.class_name).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              ) : key === "section" ? (
                <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required>
                  <option value="">Select section</option>
                  {mergeChoices(SECTION_CHOICES, choices.sections, form.section).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              ) : key === "session" ? (
                <select value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} required>
                  <option value="">Select session</option>
                  {mergeChoices(SESSION_CHOICES, choices.batches, form.session).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              ) : (
                <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === "roll_no" || key === "name"} />
              )}
            </label>
          ))}
          <button type="submit">{editingId ? "Update student" : "Save student"}</button>
          {editingId && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditingId(null);
                setForm(empty);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="card">
        <BulkBar
          count={selected.size}
          onDelete={async () => {
            const ok = await confirm({
              title: "Delete students",
              message: `Delete ${selected.size} student(s)? This cannot be undone.`,
            });
            if (!ok) return;
            for (const id of selected) await api.del(`/api/students/${id}`);
            setSelected(new Set());
            load();
          }}
        />
        <table>
          <thead>
            <tr>
              <SelectAllCell
                checked={filtered.length > 0 && filtered.every((s) => selected.has(s.id))}
                indeterminate={filtered.some((s) => selected.has(s.id))}
                onChange={(on) => setSelected(setAll(filtered.map((s) => s.id), on))}
              />
              <th>Roll no</th><th>Student Name</th><th>Gender</th><th>Class</th><th>Section</th><th>Session</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <SelectCell checked={selected.has(s.id)} onChange={(on) => setSelected(toggleId(selected, s.id, on))} label={`Select ${s.roll_no}`} />
                <td>{s.roll_no}</td><td>{s.name}</td><td>{s.gender}</td><td>{s.class_name}</td><td>{s.section}</td><td>{s.session}</td>
                <td className="row-actions">
                  <ViewLink to={`/students/${s.id}`}>View</ViewLink>
                  <EditButton
                    onClick={() => {
                      setEditingId(s.id);
                      setForm({
                        roll_no: s.roll_no,
                        name: s.name,
                        gender: s.gender || "M",
                        class_name: s.class_name,
                        section: s.section,
                        session: s.session,
                      });
                      setErr("");
                    }}
                  >
                    Edit
                  </EditButton>
                  <DeleteButton onClick={async () => {
                    const ok = await confirm({ title: "Delete student", message: `Delete “${s.name}”? This cannot be undone.` });
                    if (!ok) return;
                    await api.del(`/api/students/${s.id}`);
                    load();
                  }}>Delete</DeleteButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted">No students match that search.</p>}
      </div>
      {conflict && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Existing students found</h3>
            <p className="muted">
              {conflict.existing.length} roll number(s) already exist
              {conflict.newCount ? ` · ${conflict.newCount} new row(s) will still be added` : ""}.
              Rewrite those records or ignore them?
            </p>
            <table>
              <thead><tr><th>Roll no</th><th>Current name</th><th>Incoming name</th></tr></thead>
              <tbody>
                {conflict.existing.map((row) => (
                  <tr key={row.roll_no}>
                    <td>{row.roll_no}</td>
                    <td>{row.current_name}</td>
                    <td>{row.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row-actions">
              <button
                type="button"
                onClick={async () => {
                  if (!pendingFile.current) return;
                  try {
                    await finishImport(pendingFile.current, "update");
                    setConflict(null);
                  } catch (error) {
                    setErr(error instanceof Error ? error.message : "XLSX import failed");
                    setConflict(null);
                  }
                }}
              >
                Rewrite
              </button>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  if (!pendingFile.current) return;
                  try {
                    await finishImport(pendingFile.current, "skip");
                    setConflict(null);
                  } catch (error) {
                    setErr(error instanceof Error ? error.message : "XLSX import failed");
                    setConflict(null);
                  }
                }}
              >
                Ignore
              </button>
              <button type="button" className="ghost" onClick={() => setConflict(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
