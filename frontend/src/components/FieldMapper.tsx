import { useState } from "react";
import { AnalysisField, FIELD_TARGETS } from "../api";

export default function FieldMapper({
  analysis,
  fieldMap,
  onSave,
}: {
  analysis: AnalysisField[];
  fieldMap: Record<string, string>;
  onSave: (next: Record<string, string>) => Promise<void>;
}) {
  const [map, setMap] = useState<Record<string, string>>({ ...fieldMap });
  const [msg, setMsg] = useState("");
  const mappable = analysis.filter((f) => f.mappable);
  if (!analysis.length) return null;
  return (
    <div>
      <h3>Mapped OMR fields</h3>
      <p className="muted">These classes come from blocks you drew on the sample. Map Date, Test ID, and Test No to exam data if needed.</p>
      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th>Detected on sample</th>
            <th>Read value</th>
            <th>Map to exam</th>
          </tr>
        </thead>
        <tbody>
          {analysis.map((field) => (
            <tr key={field.key}>
              <td>
                <span className={`field-class field-class-${field.key}`}>{field.class || field.label}</span>
              </td>
              <td>{field.detected ? field.detail : "Not found"}</td>
              <td>{field.value || "—"}</td>
              <td>
                {field.mappable ? (
                  <select
                    value={map[field.key] || ""}
                    onChange={(e) => setMap({ ...map, [field.key]: e.target.value })}
                  >
                    {FIELD_TARGETS.map((t) => (
                      <option key={t.value || "ignore"} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">Fixed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {mappable.length > 0 && (
        <p>
          <button
            type="button"
            onClick={async () => {
              await onSave(map);
              setMsg("Field mapping saved.");
            }}
          >
            Save field mapping
          </button>
          {msg && <span className="muted"> {msg}</span>}
        </p>
      )}
    </div>
  );
}
