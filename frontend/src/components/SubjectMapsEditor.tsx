import { Subject } from "../api";

export type SubjectMapRow = { subject_id?: number; subject?: string; start_q: number; end_q: number };

export default function SubjectMapsEditor({
  maps,
  setMaps,
  subjects,
  locked = false,
}: {
  maps: SubjectMapRow[];
  setMaps: (next: SubjectMapRow[]) => void;
  subjects: Subject[];
  locked?: boolean;
}) {
  const update = (index: number, patch: Partial<SubjectMapRow>) => {
    const next = [...maps];
    next[index] = { ...next[index], ...patch };
    setMaps(next);
  };
  return (
    <>
      <h3>Questions per subject</h3>
      <p className="muted">Map each subject to its question range on this OMR.</p>
      {maps.map((m, i) => (
        <div className="row" key={i}>
          <label>Subject
            <select
              disabled={locked}
              value={m.subject_id || m.subject || ""}
              onChange={(e) => {
                const value = e.target.value;
                const subject = subjects.find((s) => String(s.id) === value || s.name === value);
                update(i, {
                  subject_id: subject?.id,
                  subject: subject?.name || value,
                });
              }}
            >
              {!subjects.length && <option value={m.subject || ""}>{m.subject || "Subject"}</option>}
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Start question
            <input disabled={locked} type="number" min={1} value={m.start_q} onChange={(e) => update(i, { start_q: Number(e.target.value) })} />
          </label>
          <label>End question
            <input disabled={locked} type="number" min={1} value={m.end_q} onChange={(e) => update(i, { end_q: Number(e.target.value) })} />
          </label>
          <label>No. of questions<input readOnly value={Math.max(0, m.end_q - m.start_q + 1)} /></label>
        </div>
      ))}
      {!locked && (
        <button
          type="button"
          className="ghost"
          onClick={() => setMaps([...maps, {
            subject_id: subjects[0]?.id,
            subject: subjects[0]?.name || "Paper",
            start_q: maps.length ? maps[maps.length - 1].end_q + 1 : 1,
            end_q: maps.length ? maps[maps.length - 1].end_q + 10 : 10,
          }])}
        >
          Add subject range
        </button>
      )}
    </>
  );
}
