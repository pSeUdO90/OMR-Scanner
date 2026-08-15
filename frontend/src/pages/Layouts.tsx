import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, authFileUrl, Layout } from "../api";
import { DeleteButton, EditLink } from "../components/ActionButtons";
import { BulkBar } from "../components/BulkSelect";
import { useConfirm } from "../components/ConfirmProvider";
import PageTitle from "../components/PageTitle";

export default function Layouts() {
  const [rows, setRows] = useState<Layout[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const confirm = useConfirm();

  const load = () => {
    api.get("/api/layouts").then((list) => setRows(list as Layout[]));
  };
  useEffect(() => { load(); }, []);

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
      setSelected((cur) => {
        const next = new Set(cur);
        next.delete(layout.id);
        return next;
      });
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not delete layout");
    }
  };

  const toggle = (id: number, on: boolean) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <>
      <PageTitle icon="layouts" subtitle="Create and edit sheets in A4 OMR Studio. Saved sheets appear below.">
        OMR layouts
      </PageTitle>
      <p className="card">
        <Link className="btn-view" to="/layouts/studio">Open A4 OMR Studio</Link>
        <span className="muted"> Design, print, export JSON, and save to this list.</span>
      </p>
      {msg && <p>{msg}</p>}
      {err && <p className="error">{err}</p>}
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
        {rows.length === 0 && <p className="muted">No saved layouts yet. Open A4 OMR Studio and click Save.</p>}
        <div className="layout-grid layout-grid-3">
          {rows.map((layout) => (
            <article className="card layout-card" key={layout.id}>
              <label className="layout-select">
                <input
                  type="checkbox"
                  checked={selected.has(layout.id)}
                  onChange={(e) => toggle(layout.id, e.target.checked)}
                  aria-label={`Select ${layout.name}`}
                />
              </label>
              {layout.has_sample ? (
                <Link to={`/layouts/${layout.id}`}>
                  <img className="layout-thumb-lg" src={authFileUrl(`/api/layouts/${layout.id}/sample?v=${layout.sample_rev || 0}`)} alt={`${layout.name} thumbnail`} />
                </Link>
              ) : (
                <div className="layout-thumb-lg muted">No preview</div>
              )}
              <h3>
                <Link to={`/layouts/${layout.id}`}>{layout.name}</Link>
              </h3>
              <p className="muted">
                {layout.total_questions} questions · {layout.options}
                {layout.is_studio ? " · OMR Studio" : layout.is_builtin ? " · built-in" : " · custom"}
                {layout.in_use ? " · used in exam" : layout.is_finalized ? " · finalized" : ""}
              </p>
              <div className="actions">
                {layout.is_studio && !layout.in_use ? (
                  <EditLink to={`/layouts/studio/${layout.id}`}>Edit Layout</EditLink>
                ) : layout.is_studio && layout.in_use ? (
                  <span className="muted">Locked</span>
                ) : (
                  <EditLink to={`/layouts/${layout.id}?tab=map`}>Map blocks</EditLink>
                )}
                <a className="btn-view" href={`/api/layouts/${layout.id}/blank-sheet.pdf`} target="_blank" rel="noreferrer">
                  Print PDF
                </a>
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    setErr("");
                    try {
                      const copied = await api.post(`/api/layouts/${layout.id}/copy`) as Layout;
                      setMsg(`Copied as “${copied.name}”.`);
                      load();
                    } catch (error) {
                      setErr(error instanceof Error ? error.message : "Could not copy layout");
                    }
                  }}
                >
                  Copy
                </button>
                <DeleteButton onClick={() => onDelete(layout)}>Delete</DeleteButton>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
