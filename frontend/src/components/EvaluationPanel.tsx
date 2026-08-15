import { useEffect, useMemo, useRef, useState } from "react";
import { api, Exam, getToken, Student } from "../api";
import { BulkBar, SelectAllCell, SelectCell, setAll, toggleId } from "./BulkSelect";
import { useConfirm } from "./ConfirmProvider";

type Sheet = {
  id: number;
  filename: string;
  status: string;
  detected_roll: string;
  student_name: string;
  student_id?: number | null;
  raw_score: number;
  max_score: number;
  right_count: number;
  wrong_count: number;
  left_count: number;
  error_message: string;
};

const OPTIONS = ["A", "B", "C", "D"];

function FileNameCell({
  sheet,
  onView,
}: {
  sheet: Sheet;
  onView: (sheet: Sheet) => void;
}) {
  return (
    <td className="file-cell">
      <span>{sheet.filename}</span>
      <button
        type="button"
        className="icon-btn"
        title="View sheet"
        aria-label="View sheet"
        onClick={() => onView(sheet)}
      >
        <img src="/view.png" alt="" width={22} height={22} />
      </button>
    </td>
  );
}

export default function EvaluationPanel({
  exam,
  sheets,
  keyString,
  setKeyString,
  onReload,
}: {
  exam: Exam;
  sheets: Sheet[];
  keyString: string;
  setKeyString: (value: string) => void;
  onReload: () => void;
}) {
  const [processRows, setProcessRows] = useState<{ id: number; filename: string; status: string; detail: string }[]>([]);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const keyRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const id = exam.id;
  const total = exam.total_questions || 40;
  const [answers, setAnswers] = useState<Record<string, string>>(exam.answer_key || {});
  const [graceText, setGraceText] = useState((exam.grace_questions || []).join(", "));
  const [students, setStudents] = useState<Student[]>([]);
  const [assigning, setAssigning] = useState<Record<number, number>>({});
  const [viewSheet, setViewSheet] = useState<Sheet | null>(null);
  const [selectedMatched, setSelectedMatched] = useState<Set<number>>(new Set());
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<number>>(new Set());
  const confirm = useConfirm();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAnswers(exam.answer_key || {});
    setGraceText((exam.grace_questions || []).join(", "));
  }, [exam.id, exam.answer_key, exam.grace_questions]);

  useEffect(() => {
    api.get("/api/students").then(setStudents);
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const groups = useMemo(() => {
    if (exam.subject_maps?.length) {
      return exam.subject_maps.map((m) => ({
        title: m.subject_name,
        questions: Array.from({ length: Math.max(0, m.end_q - m.start_q + 1) }, (_, i) => m.start_q + i),
      }));
    }
    return [{ title: "All questions", questions: Array.from({ length: total }, (_, i) => i + 1) }];
  }, [exam.subject_maps, total]);

  const filled = Array.from({ length: total }, (_, i) => answers[String(i + 1)]).filter((letter) => letter && "ABCD".includes(letter)).length;
  const keyComplete = total > 0 && filled === total;
  const matched = sheets.filter((s) => s.status !== "unmatched");
  const unmatched = sheets.filter((s) => s.status === "unmatched");

  const persistKey = async (next: Record<string, string>) => {
    setErr("");
    const payload: Record<string, string> = {};
    for (let q = 1; q <= total; q += 1) {
      const letter = next[String(q)];
      if (letter) payload[String(q)] = letter;
    }
    await api.put(`/api/exams/${id}/answer-key`, { answer_key: payload });
    setKeyString(Array.from({ length: total }, (_, i) => payload[String(i + 1)] || "").join(""));
    setMsg(`Answer key saved (${Object.keys(payload).length} questions). Sheets re-evaluated.`);
    onReload();
  };

  const saveKey = async () => persistKey(answers);

  const exportKey = () => {
    const rows = ["question,answer"];
    for (let q = 1; q <= total; q += 1) {
      rows.push(`${q},${answers[String(q)] || ""}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(exam.name || "exam").replace(/\s+/g, "-").toLowerCase()}-answer-key.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Answer Key Exported.");
  };

  const selectOption = (question: number, letter: string) => {
    const next = { ...answers, [String(question)]: letter };
    setAnswers(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistKey(next).catch((error) => {
        setErr(error instanceof Error ? error.message : "Could not save answer key");
      });
    }, 300);
  };

  return (
    <>
      <details className="card answer-key-card">
        <summary className="answer-key-toolbar">
          <div className="answer-key-heading">
            <span className="answer-key-toggle" aria-hidden="true" />
            <div>
              <h3>Answer Key</h3>
              <p className="answer-key-marked">{filled}/{total} Marked.</p>
              <p className="muted">Tap A–D For Each Question. Sheets Re-Evaluate When The Key Is Saved.</p>
            </div>
          </div>
          <div className="row" style={{ flex: "0 0 auto" }} onClick={(e) => e.stopPropagation()}>
            <input
              ref={keyRef}
              type="file"
              accept="image/*,.txt,.csv"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const data = new FormData();
                data.append("file", file);
                try {
                  const updated = await api.post(`/api/exams/${id}/answer-key/upload`, data);
                  const letters = Object.entries(updated.answer_key || {})
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([, v]) => v)
                    .join("");
                  setKeyString(letters);
                  setMsg(`Answer key uploaded (${letters.length} questions).`);
                  onReload();
                } catch (error) {
                  setErr(error instanceof Error ? error.message : "Key upload failed");
                }
              }}
            />
            <button type="button" className="secondary" onClick={() => keyRef.current?.click()}>Upload Key File</button>
            <button type="button" className="secondary" onClick={exportKey}>Export Answer Key</button>
            <button type="button" onClick={saveKey}>Save Answer Key</button>
          </div>
        </summary>
        {groups.map((group) => (
          <section className="key-block" key={group.title}>
            <h4>{group.title}</h4>
            <div className="key-grid">
              {group.questions.map((q) => (
                <div className="key-item" key={q}>
                  <strong>Q{String(q).padStart(2, "0")}</strong>
                  <div className="key-opts">
                    {OPTIONS.map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        className={answers[String(q)] === letter ? "opt on" : "opt"}
                        onClick={() => selectOption(q, letter)}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </details>
      <div className="eval-split-row">
        <div className="card eval-compact-card">
          <h3>Grace Questions</h3>
          <p className="muted">Question numbers with full marks. Use commas or ranges, for example 12, 18, 40-42.</p>
          <div className="eval-inline-fields">
            <label>
              Question Numbers
              <input
                value={graceText}
                onChange={(e) => setGraceText(e.target.value)}
                placeholder="e.g. 12, 18, 40-42"
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                setErr("");
                try {
                  await api.put(`/api/exams/${id}/grace`, { questions: graceText });
                  setMsg("Grace Questions Saved.");
                  onReload();
                } catch (error) {
                  setErr(error instanceof Error ? error.message : "Could not save grace questions");
                }
              }}
            >
              Save
            </button>
          </div>
        </div>
        <div className="card eval-compact-card">
          <h3>Upload Scanned OMR Sheets</h3>
          <p className="muted">
            {keyComplete ? "Upload completed OMR scans, then Process OMR to de-skew before evaluation." : "Mark every question in the Answer Key to enable upload."}
          </p>
          <input
            ref={scanRef}
            type="file"
            multiple
            accept="image/*"
            hidden
            onChange={async (e) => {
              if (!keyComplete || !e.target.files?.length) return;
              const data = new FormData();
              for (const file of Array.from(e.target.files)) data.append("files", file);
              try {
                await fetch(`/api/exams/${id}/sheets`, {
                  method: "POST",
                  headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined,
                  body: data,
                }).then((r) => {
                  if (!r.ok) throw new Error("Upload failed");
                  return r.json();
                });
                setMsg(`Uploaded ${e.target.files.length} sheet(s).`);
                onReload();
              } catch (error) {
                setErr(error instanceof Error ? error.message : "Upload failed");
              }
            }}
          />
          <div className="eval-inline-fields eval-actions">
            <button type="button" disabled={!keyComplete} onClick={() => scanRef.current?.click()}>
              Upload Sheets
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!sheets.length || processing}
              onClick={async () => {
                setErr("");
                setProcessing(true);
                const queue = sheets.map((sheet) => ({
                  id: sheet.id,
                  filename: sheet.filename,
                  status: "pending",
                  detail: "Waiting",
                }));
                setProcessRows(queue);
                let failed = 0;
                for (let i = 0; i < queue.length; i += 1) {
                  const sheet = queue[i];
                  setProcessRows((rows) =>
                    rows.map((row) => (row.id === sheet.id ? { ...row, status: "processing", detail: "Processing…" } : row)),
                  );
                  try {
                    const res = await api.post(`/api/exams/${id}/sheets/${sheet.id}/process`);
                    setProcessRows((rows) =>
                      rows.map((row) =>
                        row.id === sheet.id
                          ? { ...row, status: "done", detail: `Saved${res.exported_path ? ` · ${res.exported_path}` : ""}` }
                          : row,
                      ),
                    );
                  } catch (error) {
                    failed += 1;
                    const message = error instanceof Error ? error.message : "Failed";
                    setProcessRows((rows) =>
                      rows.map((row) => (row.id === sheet.id ? { ...row, status: "error", detail: message } : row)),
                    );
                  }
                }
                setProcessing(false);
                if (failed) setErr(`Process OMR finished with ${failed} failure(s).`);
                else setMsg(`Process OMR aligned ${queue.length} sheet(s).`);
                onReload();
              }}
            >
              {processing ? "Processing…" : "Process OMR"}
            </button>
          </div>
          {processRows.length > 0 && (
            <div className="process-progress">
              <p className="muted">
                {processRows.filter((row) => row.status === "done").length}/{processRows.length} sheets processed
              </p>
              <div className="process-bar">
                <span
                  style={{
                    width: `${(processRows.filter((row) => row.status === "done" || row.status === "error").length / processRows.length) * 100}%`,
                  }}
                />
              </div>
              <ul>
                {processRows.map((row) => (
                  <li key={row.id} className={`process-${row.status}`}>
                    <strong>{row.filename}</strong>
                    <span>{row.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="card eval-compact-card">
          <h3>Evaluate</h3>
          <p className="muted">
            {keyComplete ? "Score uploaded sheets against the saved Answer Key." : "Mark every question in the Answer Key to enable evaluation."}
          </p>
          <div className="eval-inline-fields eval-actions">
            <button
              type="button"
              disabled={!keyComplete}
              onClick={async () => {
                if (!keyComplete) return;
                setErr("");
                try {
                  const res = await api.post(`/api/exams/${id}/evaluate`);
                  setMsg(`Evaluated ${res.evaluated} sheet(s).`);
                  onReload();
                } catch (error) {
                  setErr(error instanceof Error ? error.message : "Evaluation failed");
                }
              }}
            >
              Evaluate Uploaded OMR Sheets
            </button>
            <button
              type="button"
              className="btn-delete"
              onClick={async () => {
                const ok = await confirm({
                  title: "Reset OMR Data",
                  message: "Clear all uploaded OMR sheets and scores for this exam? The answer key and exam details will be kept.",
                });
                if (!ok) return;
                setErr("");
                try {
                  const res = await api.post(`/api/exams/${id}/reset-omr`);
                  setMsg(`OMR data cleared (${res.removed} sheet(s) removed).`);
                  setViewSheet(null);
                  onReload();
                } catch (error) {
                  setErr(error instanceof Error ? error.message : "Could not reset OMR data");
                }
              }}
            >
              Reset OMR Data
            </button>
          </div>
        </div>
      </div>
      {(msg || err) && (
        <p className={err ? "error" : ""}>{err || msg}</p>
      )}
      <div className="card">
        <h3>Matched Sheets</h3>
        <BulkBar
          count={selectedMatched.size}
          onDelete={async () => {
            const ok = await confirm({
              title: "Delete sheets",
              message: `Delete ${selectedMatched.size} matched sheet(s)? This cannot be undone.`,
            });
            if (!ok) return;
            await api.post(`/api/exams/${id}/sheets/bulk-delete`, { ids: [...selectedMatched] });
            setSelectedMatched(new Set());
            onReload();
          }}
        />
        <table>
          <thead>
            <tr>
              <SelectAllCell
                checked={matched.length > 0 && matched.every((s) => selectedMatched.has(s.id))}
                indeterminate={matched.some((s) => selectedMatched.has(s.id))}
                onChange={(on) => setSelectedMatched(setAll(matched.map((s) => s.id), on))}
              />
              <th>File</th><th>Roll</th><th>Student</th><th>R/W/L</th><th>Score</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {matched.map((s) => (
              <tr key={s.id}>
                <SelectCell checked={selectedMatched.has(s.id)} onChange={(on) => setSelectedMatched(toggleId(selectedMatched, s.id, on))} label={`Select ${s.filename}`} />
                <FileNameCell sheet={s} onView={setViewSheet} />
                <td>{s.detected_roll}</td>
                <td>{s.student_name}</td>
                <td><span className="pill R">{s.right_count}</span> <span className="pill W">{s.wrong_count}</span> <span className="pill L">{s.left_count}</span></td>
                <td>{s.raw_score}/{s.max_score}</td>
                <td>{s.status}{s.error_message ? ` — ${s.error_message}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {matched.length === 0 && <p className="muted">No matched sheets yet.</p>}
      </div>
      <div className="card">
        <h3>Unmatched OMR sheets</h3>
        <p className="muted">Scanned sheets whose roll number is not in the student list. Assign a student to move the file into Matched Sheets.</p>
        <BulkBar
          count={selectedUnmatched.size}
          onDelete={async () => {
            const ok = await confirm({
              title: "Delete sheets",
              message: `Delete ${selectedUnmatched.size} unmatched sheet(s)? This cannot be undone.`,
            });
            if (!ok) return;
            await api.post(`/api/exams/${id}/sheets/bulk-delete`, { ids: [...selectedUnmatched] });
            setSelectedUnmatched(new Set());
            onReload();
          }}
        />
        <table>
          <thead>
            <tr>
              <SelectAllCell
                checked={unmatched.length > 0 && unmatched.every((s) => selectedUnmatched.has(s.id))}
                indeterminate={unmatched.some((s) => selectedUnmatched.has(s.id))}
                onChange={(on) => setSelectedUnmatched(setAll(unmatched.map((s) => s.id), on))}
              />
              <th>File</th><th>Detected roll</th><th>Assign student</th><th>R/W/L</th><th>Score</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {unmatched.map((s) => (
              <tr key={s.id}>
                <SelectCell checked={selectedUnmatched.has(s.id)} onChange={(on) => setSelectedUnmatched(toggleId(selectedUnmatched, s.id, on))} label={`Select ${s.filename}`} />
                <FileNameCell sheet={s} onView={setViewSheet} />
                <td>{s.detected_roll || "—"}</td>
                <td>
                  <div className="assign-row">
                    <select
                      value={assigning[s.id] || ""}
                      onChange={(e) => setAssigning({ ...assigning, [s.id]: Number(e.target.value) })}
                    >
                      <option value="">Select student</option>
                      {students.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.roll_no} — {st.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!assigning[s.id]}
                      onClick={async () => {
                        setErr("");
                        try {
                          await api.put(`/api/exams/${id}/sheets/${s.id}/assign`, { student_id: assigning[s.id] });
                          setMsg(`Assigned ${s.filename} to the selected student.`);
                          onReload();
                        } catch (error) {
                          setErr(error instanceof Error ? error.message : "Could not assign sheet");
                        }
                      }}
                    >
                      Assign
                    </button>
                  </div>
                </td>
                <td><span className="pill R">{s.right_count}</span> <span className="pill W">{s.wrong_count}</span> <span className="pill L">{s.left_count}</span></td>
                <td>{s.raw_score}/{s.max_score}</td>
                <td>{s.error_message || "Not assigned to this exam"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {unmatched.length === 0 && <p className="muted">No unmatched sheets.</p>}
      </div>
      {viewSheet && (
        <div className="sheet-modal" role="dialog" aria-modal="true" aria-label={`View ${viewSheet.filename}`}>
          <div className="sheet-modal-card">
            <div className="sheet-modal-bar">
              <strong>{viewSheet.filename}</strong>
              <button type="button" className="secondary" onClick={() => setViewSheet(null)}>Close</button>
            </div>
            <img
              className="sheet-modal-img"
              src={`/api/exams/${id}/sheets/${viewSheet.id}/image?t=${viewSheet.id}`}
              alt={viewSheet.filename}
            />
          </div>
        </div>
      )}
    </>
  );
}
