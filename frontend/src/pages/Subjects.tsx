import { FormEvent, useEffect, useState } from "react";
import { api, Subject } from "../api";
import { DeleteButton } from "../components/ActionButtons";
import { BulkBar, SelectAllCell, SelectCell, setAll, toggleId } from "../components/BulkSelect";
import { useConfirm } from "../components/ConfirmProvider";
import PageTitle from "../components/PageTitle";

export default function Subjects() {
  const [rows, setRows] = useState<Subject[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const confirm = useConfirm();
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
        <BulkBar
          count={selected.size}
          onDelete={async () => {
            const ok = await confirm({
              title: "Delete subjects",
              message: `Delete ${selected.size} subject(s)? Subjects used by an exam cannot be deleted.`,
            });
            if (!ok) return;
            setErr("");
            try {
              for (const id of selected) await api.del(`/api/subjects/${id}`);
              setSelected(new Set());
              load();
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Could not delete subject");
            }
          }}
        />
        <table>
          <thead>
            <tr>
              <SelectAllCell
                checked={rows.length > 0 && rows.every((s) => selected.has(s.id))}
                indeterminate={rows.some((s) => selected.has(s.id))}
                onChange={(on) => setSelected(setAll(rows.map((s) => s.id), on))}
              />
              <th>Name</th><th>Code</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <SelectCell checked={selected.has(s.id)} onChange={(on) => setSelected(toggleId(selected, s.id, on))} label={`Select ${s.name}`} />
                <td>{s.name}</td>
                <td>{s.code}</td>
                <td>
                  <DeleteButton
                    onClick={async () => {
                      const ok = await confirm({ title: "Delete subject", message: `Delete “${s.name}”? This cannot be undone.` });
                      if (!ok) return;
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
