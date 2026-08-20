import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Layout } from "../api";
import { DeleteButton } from "../components/ActionButtons";
import { useConfirm } from "../components/ConfirmProvider";
import OmrCanvas from "../omrStudio/OmrCanvas";
import { mappingFromDom, mappingFromGeometry } from "../omrStudio/exportMapping";
import { cloneGeometry, type SheetGeometry } from "../omrStudio/geometry";
import {
  StudioBlock,
  BLOCK_TYPES,
  addDigitBlock,
  applyBlockType,
  applyMcqRange,
  buildDefaultBlocks,
  defaultConfig,
  StudioConfig,
} from "../omrStudio/layoutEngine";
import { qualitySummary, runQualityCheck } from "../omrStudio/qualityCheck";
import { buildStudioExportJson, parseStudioImportJson } from "../omrStudio/importStudioJson";
import { initialStudioState, hydrateStudioState, saveStudioDefault } from "../omrStudio/studioDefaults";
import { captureSheetThumbnail } from "../omrStudio/thumbnail";

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
  const { id } = useParams();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const editing = Boolean(id);
  const [ready, setReady] = useState(!editing);
  const [layoutId, setLayoutId] = useState<number | null>(id ? Number(id) : null);
  const [config, setConfig] = useState<StudioConfig>(() => (editing ? defaultConfig() : initialStudioState().config));
  const [geometry, setGeometry] = useState<SheetGeometry>(() => (editing ? cloneGeometry() : initialStudioState().geometry));
  const [blocks, setBlocks] = useState<StudioBlock[]>(() => {
    if (editing) return [];
    const start = initialStudioState();
    return start.blocks.length ? start.blocks : buildDefaultBlocks(start.config, start.geometry);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [jsonText, setJsonText] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [qaOpen, setQaOpen] = useState(false);
  const [inUse, setInUse] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("omr-studio-active");
    return () => document.documentElement.classList.remove("omr-studio-active");
  }, []);

  useEffect(() => {
    if (!id) {
      const start = initialStudioState();
      setLayoutId(null);
      setConfig(start.config);
      setGeometry(start.geometry);
      setBlocks(start.blocks.length ? start.blocks : buildDefaultBlocks(start.config, start.geometry));
      setSelectedId(null);
      setReady(true);
      setInUse(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    api.get(`/api/layouts/${id}`).then((row) => {
      const layout = row as Layout;
      if (cancelled) return;
      if (!layout.is_studio) {
        setErr("This Layout Was Not Created In OMR Studio.");
        setReady(true);
        return;
      }
      const snapshot = hydrateStudioState(layout.studio_config, layout.studio_geometry, layout.studio_blocks as StudioBlock[]);
      setLayoutId(layout.id);
      setInUse(Boolean(layout.in_use));
      setConfig(snapshot.config);
      setGeometry(snapshot.geometry);
      setBlocks(snapshot.blocks);
      setSelectedId(null);
      setErr("");
      setReady(true);
    }).catch((error) => {
      if (cancelled) return;
      setErr(error instanceof Error ? error.message : "Could Not Load Layout");
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const rebuild = (next: StudioConfig, nextGeo = geometry) => {
    if (inUse) return;
    setConfig(next);
    setGeometry(nextGeo);
    setBlocks(buildDefaultBlocks(next, nextGeo));
    setSelectedId(null);
    setJsonText("");
  };

  const patchConfig = (patch: Partial<StudioConfig>) => {
    if (inUse) return;
    const next = { ...config, ...patch };
    const changed = (Object.keys(patch) as (keyof StudioConfig)[]).some((key) => next[key] !== config[key]);
    if (!changed) return;
    rebuild(next);
  };

  const patchGeometry = (patch: Partial<SheetGeometry>) => {
    if (inUse) return;
    setGeometry((current) => ({ ...current, ...patch }));
  };

  const mapping = useMemo(() => mappingFromGeometry(blocks, geometry), [blocks, geometry]);

  const currentMapping = () => {
    const page = pageRef.current?.querySelector("[data-omr-page='a4']");
    return page ? mappingFromDom(page, blocks, geometry) : mapping;
  };

  const exportJson = () => {
    const doc = buildStudioExportJson(config, geometry, blocks, currentMapping());
    const text = JSON.stringify(doc, null, 2);
    setJsonText(text);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.title.replace(/\s+/g, "-").toLowerCase() || "omr-layout"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("JSON File Downloaded.");
  };

  const importJsonFile = (file: File | undefined) => {
    if (!file || inUse) return;
    setErr("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const snapshot = parseStudioImportJson(parsed);
        setConfig(snapshot.config);
        setGeometry(snapshot.geometry);
        setBlocks(snapshot.blocks);
        setSelectedId(null);
        setJsonText("");
        setMsg(`Imported “${snapshot.config.title}” from OMR JSON.`);
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not import OMR JSON");
      }
    };
    reader.readAsText(file);
  };

  const saveLayout = async () => {
    if (inUse) return;
    setErr("");
    try {
      const svg = pageRef.current?.querySelector("[data-omr-page='a4']") as SVGSVGElement | null;
      const thumbnail_base64 = svg ? await captureSheetThumbnail(svg) : "";
      const payload = {
        name: config.title,
        description: "A4 OMR Studio Layout",
        total_questions: config.questionCount,
        options: config.optionSet,
        config,
        geometry,
        blocks,
        mapping: currentMapping(),
        thumbnail_base64,
      };
      const saved = (
        layoutId
          ? await api.put(`/api/layouts/${layoutId}/studio`, payload)
          : await api.post("/api/layouts/studio", payload)
      ) as Layout;
      setLayoutId(saved.id);
      setMsg(`Saved “${saved.name}” To Saved Layouts.`);
      navigate("/layouts");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could Not Save Layout");
    }
  };

  const patchBlock = (id: string, patch: Partial<StudioBlock>) => {
    if (inUse) return;
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== id) return block;
        let next = { ...block, ...patch };
        if (patch.blockType && patch.blockType !== block.blockType) {
          next = applyBlockType(block, patch.blockType);
        } else if (next.blockType === "GRID_MCQ") {
          if (patch.startQ != null || patch.endQ != null) {
            next = applyMcqRange(next, next.startQ || 1, next.endQ || next.startQ || 1);
          } else if (patch.rows != null) {
            const start = Math.max(1, next.startQ || 1);
            next = applyMcqRange(next, start, start + Math.max(1, next.rows) - 1);
          } else if (patch.options != null) {
            const options = String(next.options || "ABCD").replace(/[^A-F]/gi, "").toUpperCase() || "ABCD";
            next = { ...next, options, cols: 1 + options.length };
          }
        }
        return next;
      }),
    );
  };

  const deleteBlock = async (block: StudioBlock) => {
    if (inUse) return;
    const ok = await confirm({
      title: "Delete",
      message: `Delete “${block.label}”? This Cannot Be Undone.`,
    });
    if (!ok) return;
    setBlocks(blocks.filter((item) => item.id !== block.id));
    if (selectedId === block.id) setSelectedId(null);
    setMsg("Block Deleted.");
  };

  const qa = qaOpen ? runQualityCheck(geometry, blocks) : [];
  const summary = qualitySummary(qa);
  const gap = geometry.cellMm - geometry.bubbleDiameterMm;

  if (!ready) {
    return <p className="muted">Loading Layout…</p>;
  }

  return (
    <div className="omr-studio">
      <aside className="omr-studio-sidebar no-print">
        <p className="muted"><Link to="/layouts">← OMR Layouts</Link></p>
        <h2>A4 OMR Studio</h2>
        <p className="muted omr-hint">Drag A Block On The Sheet To Place It. Position Snaps To The Grid.</p>
        {inUse && (
          <p className="notice">
            Layout Associated With Exam. Cannot Be Modified. Copy It From OMR Layouts To Edit A New Version.
          </p>
        )}
        {msg && <p className="omr-hint">{msg}</p>}
        {err && <p className="error">{err}</p>}

        <fieldset className="omr-set">
          <legend>Sheet</legend>
          <Field label="Title">
            <input disabled={inUse} value={config.title} onChange={(e) => setConfig({ ...config, title: e.target.value })} />
          </Field>
          <div className="omr-grid-2">
            <Field label="Questions">
              <input
                disabled={inUse}
                type="number"
                min={10}
                max={200}
                value={config.questionCount}
                onChange={(e) => patchConfig({ questionCount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Columns">
              <select
                disabled={inUse}
                value={config.questionColumns}
                onChange={(e) => patchConfig({ questionColumns: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Options">
              <select
                disabled={inUse}
                value={config.optionSet}
                onChange={(e) => patchConfig({ optionSet: e.target.value as StudioConfig["optionSet"] })}
              >
                <option value="ABCD">A–D</option>
                <option value="ABCDE">A–E</option>
              </select>
            </Field>
            <Field label="Roll Digits">
              <input disabled={inUse} type="number" min={4} max={12} value={config.rollCols} onChange={(e) => patchConfig({ rollCols: Number(e.target.value) })} />
            </Field>
            <Field label="Subject Digits">
              <input disabled={inUse} type="number" min={2} max={6} value={config.subjectCols} onChange={(e) => patchConfig({ subjectCols: Number(e.target.value) })} />
            </Field>
            <Field label="Series Digits">
              <input disabled={inUse} type="number" min={2} max={6} value={config.seriesCols} onChange={(e) => patchConfig({ seriesCols: Number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="omr-set">
          <legend>Page</legend>
          <div className="omr-grid-2">
            <Field label="Width Mm">
              <input disabled={inUse} type="number" min={50} step={0.1} value={geometry.pageWidthMm} onChange={(e) => patchGeometry({ pageWidthMm: Number(e.target.value) })} />
            </Field>
            <Field label="Height Mm">
              <input disabled={inUse} type="number" min={50} step={0.1} value={geometry.pageHeightMm} onChange={(e) => patchGeometry({ pageHeightMm: Number(e.target.value) })} />
            </Field>
            <Field label="Margin Top Mm">
              <input disabled={inUse} type="number" min={0} step={0.5} value={geometry.marginTopMm} onChange={(e) => patchGeometry({ marginTopMm: Number(e.target.value) })} />
            </Field>
            <Field label="Margin Right Mm">
              <input disabled={inUse} type="number" min={0} step={0.5} value={geometry.marginRightMm} onChange={(e) => patchGeometry({ marginRightMm: Number(e.target.value) })} />
            </Field>
            <Field label="Margin Bottom Mm">
              <input disabled={inUse} type="number" min={0} step={0.5} value={geometry.marginBottomMm} onChange={(e) => patchGeometry({ marginBottomMm: Number(e.target.value) })} />
            </Field>
            <Field label="Margin Left Mm">
              <input disabled={inUse} type="number" min={0} step={0.5} value={geometry.marginLeftMm} onChange={(e) => patchGeometry({ marginLeftMm: Number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="omr-set">
          <legend>Grid Matrix Unit</legend>
          <div className="omr-grid-2">
            <Field label="Cell Mm">
              <input disabled={inUse} type="number" min={2} step={0.1} value={geometry.cellMm} onChange={(e) => patchGeometry({ cellMm: Number(e.target.value) })} />
            </Field>
            <Field label="Cols">
              <input disabled={inUse} type="number" min={8} max={60} value={geometry.gridCols} onChange={(e) => patchGeometry({ gridCols: Number(e.target.value) })} />
            </Field>
            <Field label="Rows">
              <input disabled={inUse} type="number" min={8} max={80} value={geometry.gridRows} onChange={(e) => patchGeometry({ gridRows: Number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="omr-set">
          <legend>OMR Bubble</legend>
          <div className="omr-grid-2">
            <Field label="Diameter Mm">
              <input disabled={inUse} type="number" min={1} step={0.1} value={geometry.bubbleDiameterMm} onChange={(e) => patchGeometry({ bubbleDiameterMm: Number(e.target.value) })} />
            </Field>
            <Field label="Target Gap Mm">
              <input disabled={inUse} type="number" min={0} step={0.1} value={geometry.bubbleGapMm} onChange={(e) => patchGeometry({ bubbleGapMm: Number(e.target.value) })} />
            </Field>
          </div>
          <p className="muted omr-hint">Actual Gap {gap.toFixed(2)} Mm</p>
        </fieldset>

        <fieldset className="omr-set">
          <legend>Timing Tracks &amp; Corner Markers</legend>
          <div className="omr-grid-2">
            <Field label="Marker Size Mm">
              <input disabled={inUse} type="number" min={2} step={0.1} value={geometry.fiducialMm} onChange={(e) => patchGeometry({ fiducialMm: Number(e.target.value) })} />
            </Field>
            <Field label="Marker Inset Mm">
              <input disabled={inUse} type="number" min={0} step={0.1} value={geometry.fiducialInsetMm} onChange={(e) => patchGeometry({ fiducialInsetMm: Number(e.target.value) })} />
            </Field>
            <Field label="Keep-Out Mm">
              <input disabled={inUse} type="number" min={0} step={0.1} value={geometry.fiducialKeepoutMm} onChange={(e) => patchGeometry({ fiducialKeepoutMm: Number(e.target.value) })} />
            </Field>
            <Field label="Track Width Mm">
              <input disabled={inUse} type="number" min={1} step={0.1} value={geometry.timingWidthMm} onChange={(e) => patchGeometry({ timingWidthMm: Number(e.target.value) })} />
            </Field>
            <Field label="Track Height Mm">
              <input disabled={inUse} type="number" min={0.5} step={0.1} value={geometry.timingHeightMm} onChange={(e) => patchGeometry({ timingHeightMm: Number(e.target.value) })} />
            </Field>
            <Field label="Extra Rows">
              <input disabled={inUse} type="number" min={0} max={20} value={geometry.extraTimingRows} onChange={(e) => patchGeometry({ extraTimingRows: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="omr-check">
            <input
              type="checkbox"
              disabled={inUse}
              checked={geometry.syncTimingToBubbleRows}
              onChange={(e) => patchGeometry({ syncTimingToBubbleRows: e.target.checked })}
            />
            Sync With Horizontal Bubble Rows
          </label>
        </fieldset>

        <label className="omr-check">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show Grid (Screen)
        </label>

        <div className="omr-actions">
          <button type="button" disabled={inUse} className="secondary" onClick={() => setBlocks(addDigitBlock(blocks, "Custom ID", geometry))}>
            Add Block
          </button>
          <button type="button" onClick={() => window.print()}>Print Sheet</button>
          <button type="button" className="secondary" onClick={exportJson}>Export JSON</button>
          <label className="secondary omr-file-btn">
            Import OMR JSON
            <input
              type="file"
              accept="application/json,.json"
              disabled={inUse}
              hidden
              onChange={(e) => {
                importJsonFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="secondary" onClick={() => setQaOpen(true)}>Quality Check</button>
          <button type="button" disabled={inUse} className="secondary" onClick={() => {
            saveStudioDefault({ config, geometry, blocks });
            setMsg("Current Values Saved As The Default OMR Studio Layout.");
          }}>Save As Default</button>
          <button type="button" onClick={saveLayout} disabled={inUse}>Save</button>
        </div>
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
            onMove={(id, col0, row0) => {
              if (inUse) return;
              patchBlock(id, { col0, row0 });
            }}
          />
        </div>
      </div>

      <section className="omr-blocks-panel no-print">
        <h3>Blocks</h3>
        {blocks.length === 0 ? (
          <p className="muted">No Blocks Added.</p>
        ) : (
          <div className="omr-blocks-table-wrap">
            <table className="omr-blocks-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Block Id</th>
                  <th>Type</th>
                  <th>DB Binding</th>
                  <th>Col</th>
                  <th>Row</th>
                  <th>Width</th>
                  <th>Height</th>
                  <th>Start Q</th>
                  <th>End Q</th>
                  <th>Options</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((block) => (
                  <tr
                    key={block.id}
                    className={block.id === selectedId ? "selected" : ""}
                    onClick={() => setSelectedId(block.id)}
                  >
                    <td>
                      <input disabled={inUse} value={block.label} onChange={(e) => patchBlock(block.id, { label: e.target.value })} />
                    </td>
                    <td>
                      <input disabled={inUse} value={block.blockId} onChange={(e) => patchBlock(block.id, { blockId: e.target.value })} />
                    </td>
                    <td>
                      <select
                        disabled={inUse}
                        value={block.blockType}
                        onChange={(e) => patchBlock(block.id, { blockType: e.target.value as StudioBlock["blockType"] })}
                      >
                        {BLOCK_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input disabled={inUse} value={block.dbColumnBinding} onChange={(e) => patchBlock(block.id, { dbColumnBinding: e.target.value })} />
                    </td>
                    <td>
                      <input disabled={inUse} type="number" value={block.col0} onChange={(e) => patchBlock(block.id, { col0: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input disabled={inUse} type="number" value={block.row0} onChange={(e) => patchBlock(block.id, { row0: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input disabled={inUse} type="number" value={block.cols} onChange={(e) => patchBlock(block.id, { cols: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input disabled={inUse} type="number" value={block.rows} onChange={(e) => patchBlock(block.id, { rows: Number(e.target.value) })} />
                    </td>
                    <td>
                      {block.blockType === "GRID_MCQ" ? (
                        <input disabled={inUse} type="number" min={1} value={block.startQ || 1} onChange={(e) => patchBlock(block.id, { startQ: Number(e.target.value) })} />
                      ) : "—"}
                    </td>
                    <td>
                      {block.blockType === "GRID_MCQ" ? (
                        <input disabled={inUse} type="number" min={1} value={block.endQ || (block.startQ || 1) + block.rows - 1} onChange={(e) => patchBlock(block.id, { endQ: Number(e.target.value) })} />
                      ) : "—"}
                    </td>
                    <td>
                      {block.blockType === "GRID_MCQ" ? (
                        <input disabled={inUse} value={block.options || "ABCD"} onChange={(e) => patchBlock(block.id, { options: e.target.value })} />
                      ) : "—"}
                    </td>
                    <td>
                      <DeleteButton disabled={inUse} onClick={(event) => { event.stopPropagation(); deleteBlock(block); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {qaOpen && (
        <div className="modal-backdrop" onClick={() => setQaOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Quality Check</h3>
            <p className="muted">
              {summary.passed ? "Ready To Save." : "Fix Failures Before Printing."}
              {" "}{summary.ok} Ok · {summary.warn} Warn · {summary.fail} Fail
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
