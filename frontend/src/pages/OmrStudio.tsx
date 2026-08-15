import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmProvider";
import OmrCanvas from "../omrStudio/OmrCanvas";
import { mappingFromDom, mappingFromGeometry } from "../omrStudio/exportMapping";
import { cloneGeometry, DEFAULT_GEOMETRY, type SheetGeometry } from "../omrStudio/geometry";
import {
  StudioBlock,
  addDigitBlock,
  buildDefaultBlocks,
  defaultConfig,
  StudioConfig,
} from "../omrStudio/layoutEngine";
import { qualitySummary, runQualityCheck } from "../omrStudio/qualityCheck";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="omr-field">
      {label}
      {children}
    </label>
  );
}

export default function OmrStudio() {
  const pageRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const [config, setConfig] = useState<StudioConfig>(defaultConfig());
  const [geometry, setGeometry] = useState<SheetGeometry>(() => cloneGeometry());
  const [blocks, setBlocks] = useState<StudioBlock[]>(() => buildDefaultBlocks(defaultConfig()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudioBlock | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [jsonText, setJsonText] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [qaOpen, setQaOpen] = useState(false);
  const selected = blocks.find((block) => block.id === selectedId) || null;

  useEffect(() => {
    document.documentElement.classList.add("omr-studio-active");
    return () => document.documentElement.classList.remove("omr-studio-active");
  }, []);

  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
  }, [selectedId, selected]);

  const rebuild = (next: StudioConfig, nextGeo = geometry) => {
    setConfig(next);
    setGeometry(nextGeo);
    setBlocks(buildDefaultBlocks(next, nextGeo));
    setSelectedId(null);
    setJsonText("");
  };

  const mapping = useMemo(() => mappingFromGeometry(blocks, geometry), [blocks, geometry]);

  const currentMapping = () => {
    const page = pageRef.current?.querySelector("[data-omr-page='a4']");
    return page ? mappingFromDom(page, blocks, geometry) : mapping;
  };

  const copyJson = async () => {
    const text = JSON.stringify(currentMapping(), null, 2);
    setJsonText(text);
    await navigator.clipboard.writeText(text);
    setMsg("Mapping JSON copied.");
  };

  const exportJson = () => {
    const text = JSON.stringify(currentMapping(), null, 2);
    setJsonText(text);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.title.replace(/\s+/g, "-").toLowerCase() || "omr-layout"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("JSON file downloaded.");
  };

  const saveLayout = async () => {
    setErr("");
    try {
      const payload = {
        name: config.title,
        description: "A4 OMR Studio layout",
        total_questions: config.questionCount,
        options: config.optionSet,
        config,
        geometry,
        blocks,
        mapping: currentMapping(),
      };
      const created = await api.post("/api/layouts/studio", payload) as { name: string };
      setMsg(`Saved “${created.name}” to the database.`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save layout");
    }
  };

  const saveBlock = () => {
    if (!draft) return;
    setBlocks(blocks.map((block) => (block.id === draft.id ? { ...draft } : block)));
    setMsg(`Saved block “${draft.label}”.`);
  };

  const deleteBlock = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: "Delete block",
      message: `Delete “${selected.label}”? This cannot be undone.`,
    });
    if (!ok) return;
    setBlocks(blocks.filter((block) => block.id !== selected.id));
    setSelectedId(null);
    setMsg("Block deleted.");
  };

  const qa = qaOpen ? runQualityCheck(geometry, blocks) : [];
  const summary = qualitySummary(qa);
  const gap = geometry.cellMm - geometry.bubbleDiameterMm;

  return (
    <div className="omr-studio">
      <aside className="omr-studio-sidebar no-print">
        <p className="muted"><Link to="/layouts">← OMR layouts</Link></p>
        <h2>A4 OMR Studio</h2>

        <fieldset className="omr-set">
          <legend>Sheet</legend>
          <Field label="Title">
            <input value={config.title} onChange={(e) => setConfig({ ...config, title: e.target.value })} />
          </Field>
          <div className="omr-grid-2">
            <Field label="Questions">
              <input
                type="number"
                min={10}
                max={200}
                value={config.questionCount}
                onChange={(e) => rebuild({ ...config, questionCount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Columns">
              <select
                value={config.questionColumns}
                onChange={(e) => rebuild({ ...config, questionColumns: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Options">
              <select
                value={config.optionSet}
                onChange={(e) => rebuild({ ...config, optionSet: e.target.value as StudioConfig["optionSet"] })}
              >
                <option value="ABCD">A–D</option>
                <option value="ABCDE">A–E</option>
              </select>
            </Field>
            <Field label="Roll digits">
              <input type="number" min={4} max={12} value={config.rollCols} onChange={(e) => rebuild({ ...config, rollCols: Number(e.target.value) })} />
            </Field>
            <Field label="Subject digits">
              <input type="number" min={2} max={6} value={config.subjectCols} onChange={(e) => rebuild({ ...config, subjectCols: Number(e.target.value) })} />
            </Field>
            <Field label="Series digits">
              <input type="number" min={2} max={6} value={config.seriesCols} onChange={(e) => rebuild({ ...config, seriesCols: Number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="omr-set">
          <legend>Page constraints</legend>
          <div className="omr-grid-2">
            <Field label="Width mm">
              <input type="number" min={50} step={0.1} value={geometry.pageWidthMm} onChange={(e) => setGeometry({ ...geometry, pageWidthMm: Number(e.target.value) })} />
            </Field>
            <Field label="Height mm">
              <input type="number" min={50} step={0.1} value={geometry.pageHeightMm} onChange={(e) => setGeometry({ ...geometry, pageHeightMm: Number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="omr-set">
          <legend>Grid matrix unit</legend>
          <div className="omr-grid-2">
            <Field label="Cell mm">
              <input type="number" min={2} step={0.1} value={geometry.cellMm} onChange={(e) => setGeometry({ ...geometry, cellMm: Number(e.target.value) })} />
            </Field>
            <Field label="Cols">
              <input type="number" min={8} max={60} value={geometry.gridCols} onChange={(e) => setGeometry({ ...geometry, gridCols: Number(e.target.value) })} />
            </Field>
            <Field label="Rows">
              <input type="number" min={8} max={80} value={geometry.gridRows} onChange={(e) => setGeometry({ ...geometry, gridRows: Number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="omr-set">
          <legend>OMR bubble</legend>
          <div className="omr-grid-2">
            <Field label="Diameter mm">
              <input type="number" min={1} step={0.1} value={geometry.bubbleDiameterMm} onChange={(e) => setGeometry({ ...geometry, bubbleDiameterMm: Number(e.target.value) })} />
            </Field>
            <Field label="Target gap mm">
              <input type="number" min={0} step={0.1} value={geometry.bubbleGapMm} onChange={(e) => setGeometry({ ...geometry, bubbleGapMm: Number(e.target.value) })} />
            </Field>
          </div>
          <p className="muted omr-hint">Actual gap {gap.toFixed(2)} mm</p>
        </fieldset>

        <fieldset className="omr-set">
          <legend>Corner markers</legend>
          <div className="omr-grid-2">
            <Field label="Size mm">
              <input type="number" min={2} step={0.1} value={geometry.fiducialMm} onChange={(e) => setGeometry({ ...geometry, fiducialMm: Number(e.target.value) })} />
            </Field>
            <Field label="Inset mm">
              <input type="number" min={0} step={0.1} value={geometry.fiducialInsetMm} onChange={(e) => setGeometry({ ...geometry, fiducialInsetMm: Number(e.target.value) })} />
            </Field>
            <Field label="Keep-out mm">
              <input type="number" min={0} step={0.1} value={geometry.fiducialKeepoutMm} onChange={(e) => setGeometry({ ...geometry, fiducialKeepoutMm: Number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="omr-set">
          <legend>Timing tracks</legend>
          <div className="omr-grid-2">
            <Field label="Width mm">
              <input type="number" min={1} step={0.1} value={geometry.timingWidthMm} onChange={(e) => setGeometry({ ...geometry, timingWidthMm: Number(e.target.value) })} />
            </Field>
            <Field label="Height mm">
              <input type="number" min={0.5} step={0.1} value={geometry.timingHeightMm} onChange={(e) => setGeometry({ ...geometry, timingHeightMm: Number(e.target.value) })} />
            </Field>
            <Field label="Extra rows">
              <input type="number" min={0} max={20} value={geometry.extraTimingRows} onChange={(e) => setGeometry({ ...geometry, extraTimingRows: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="omr-check">
            <input
              type="checkbox"
              checked={geometry.syncTimingToBubbleRows}
              onChange={(e) => setGeometry({ ...geometry, syncTimingToBubbleRows: e.target.checked })}
            />
            Sync with horizontal bubble rows
          </label>
        </fieldset>

        <label className="omr-check">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show grid (screen)
        </label>

        <div className="omr-actions">
          <button type="button" className="secondary" onClick={() => setBlocks(addDigitBlock(blocks, "Custom ID", geometry))}>
            Add metadata block
          </button>
          <button type="button" onClick={() => window.print()}>Print sheet</button>
          <button type="button" className="secondary" onClick={exportJson}>Export JSON</button>
          <button type="button" className="secondary" onClick={copyJson}>Copy JSON</button>
          <button type="button" className="secondary" onClick={() => setQaOpen(true)}>Quality check</button>
          <button type="button" onClick={saveLayout}>Save</button>
        </div>
        {msg && <p className="omr-hint">{msg}</p>}
        {err && <p className="error">{err}</p>}

        {draft && (
          <div className="omr-inspector">
            <h3>Block</h3>
            <div className="omr-grid-2">
              <Field label="Label">
                <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </Field>
              <Field label="blockId">
                <input value={draft.blockId} onChange={(e) => setDraft({ ...draft, blockId: e.target.value })} />
              </Field>
              <Field label="DB binding">
                <input value={draft.dbColumnBinding} onChange={(e) => setDraft({ ...draft, dbColumnBinding: e.target.value })} />
              </Field>
              <Field label="Col">
                <input type="number" value={draft.col0} onChange={(e) => setDraft({ ...draft, col0: Number(e.target.value) })} />
              </Field>
              <Field label="Row">
                <input type="number" value={draft.row0} onChange={(e) => setDraft({ ...draft, row0: Number(e.target.value) })} />
              </Field>
              <Field label="Width">
                <input type="number" value={draft.cols} onChange={(e) => setDraft({ ...draft, cols: Number(e.target.value) })} />
              </Field>
              <Field label="Height">
                <input type="number" value={draft.rows} onChange={(e) => setDraft({ ...draft, rows: Number(e.target.value) })} />
              </Field>
              {draft.blockType === "GRID_MCQ" && (
                <>
                  <Field label="Start Q">
                    <input type="number" value={draft.startQ || 1} onChange={(e) => setDraft({ ...draft, startQ: Number(e.target.value) })} />
                  </Field>
                  <Field label="Options">
                    <input value={draft.options || "ABCD"} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
                  </Field>
                </>
              )}
            </div>
            <div className="omr-actions">
              <button type="button" onClick={saveBlock}>Save block</button>
              <button type="button" className="btn-delete" onClick={deleteBlock}>Delete block</button>
            </div>
          </div>
        )}
        {jsonText && <textarea className="omr-json" readOnly value={jsonText} rows={8} />}
      </aside>
      <div className="omr-studio-stage" onClick={() => setSelectedId(null)}>
        <div className="omr-a4-frame" ref={pageRef} onClick={(e) => e.stopPropagation()}>
          <OmrCanvas
            title={config.title}
            blocks={blocks}
            selectedId={selectedId}
            showGrid={showGrid}
            geometry={geometry}
            onSelect={setSelectedId}
          />
        </div>
      </div>
      {qaOpen && (
        <div className="modal-backdrop" onClick={() => setQaOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Quality check</h3>
            <p className="muted">
              {summary.passed ? "Ready to save." : "Fix failures before printing."}
              {" "}{summary.ok} ok · {summary.warn} warn · {summary.fail} fail
            </p>
            <ul className="qa-list">
              {qa.map((item) => (
                <li key={item.code + item.message} className={`qa-${item.level}`}>
                  {item.level.toUpperCase()}: {item.message}
                </li>
              ))}
            </ul>
            <button type="button" className="secondary" onClick={() => setQaOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
