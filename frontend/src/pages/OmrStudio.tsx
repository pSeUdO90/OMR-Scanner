import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import OmrCanvas from "../omrStudio/OmrCanvas";
import { mappingFromDom, mappingFromGeometry } from "../omrStudio/exportMapping";
import { BUBBLE_CELL_MARGIN_MM, BUBBLE_DIAMETER_MM, CELL_MM } from "../omrStudio/geometry";
import { StudioBlock, addDigitBlock, buildDefaultBlocks, defaultConfig, StudioConfig } from "../omrStudio/layoutEngine";

export default function OmrStudio() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<StudioConfig>(defaultConfig());
  const [blocks, setBlocks] = useState<StudioBlock[]>(() => buildDefaultBlocks(defaultConfig()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [jsonText, setJsonText] = useState("");
  const [msg, setMsg] = useState("");
  const selected = blocks.find((block) => block.id === selectedId) || null;

  useEffect(() => {
    document.documentElement.classList.add("omr-studio-active");
    return () => document.documentElement.classList.remove("omr-studio-active");
  }, []);

  const rebuild = (next: StudioConfig) => {
    setConfig(next);
    setBlocks(buildDefaultBlocks(next));
    setSelectedId(null);
    setJsonText("");
  };

  const mapping = useMemo(() => mappingFromGeometry(blocks), [blocks]);

  const copyJson = async () => {
    const page = pageRef.current?.querySelector("[data-omr-page='a4']");
    const doc = page ? mappingFromDom(page, blocks) : mapping;
    const text = JSON.stringify(doc, null, 2);
    setJsonText(text);
    await navigator.clipboard.writeText(text);
    setMsg("Mapping JSON copied. Coordinates are percentages of the A4 canvas.");
  };

  const updateSelected = (patch: Partial<StudioBlock>) => {
    if (!selected) return;
    setBlocks(blocks.map((block) => (block.id === selected.id ? { ...block, ...patch } : block)));
  };

  return (
    <div className="omr-studio">
      <aside className="omr-studio-sidebar no-print">
        <p className="muted"><Link to="/layouts">← OMR layouts</Link></p>
        <h2>A4 OMR Studio</h2>
        <p className="muted">
          {CELL_MM} mm grid · {BUBBLE_DIAMETER_MM} mm bubbles · {BUBBLE_CELL_MARGIN_MM.toFixed(1)} mm optical gap
        </p>
        <label>
          Sheet title
          <input value={config.title} onChange={(e) => setConfig({ ...config, title: e.target.value })} />
        </label>
        <label>
          Question count
          <input
            type="number"
            min={10}
            max={200}
            value={config.questionCount}
            onChange={(e) => rebuild({ ...config, questionCount: Number(e.target.value) })}
          />
        </label>
        <label>
          Column count
          <select
            value={config.questionColumns}
            onChange={(e) => rebuild({ ...config, questionColumns: Number(e.target.value) })}
          >
            <option value={1}>1 column</option>
            <option value={2}>2 columns</option>
            <option value={3}>3 columns</option>
            <option value={4}>4 columns</option>
          </select>
        </label>
        <label>
          Option set
          <select
            value={config.optionSet}
            onChange={(e) => rebuild({ ...config, optionSet: e.target.value as StudioConfig["optionSet"] })}
          >
            <option value="ABCD">4-option (A–D)</option>
            <option value="ABCDE">5-option (A–E)</option>
          </select>
        </label>
        <label>
          Roll digits
          <input
            type="number"
            min={4}
            max={12}
            value={config.rollCols}
            onChange={(e) => rebuild({ ...config, rollCols: Number(e.target.value) })}
          />
        </label>
        <label>
          Subject code digits
          <input
            type="number"
            min={2}
            max={6}
            value={config.subjectCols}
            onChange={(e) => rebuild({ ...config, subjectCols: Number(e.target.value) })}
          />
        </label>
        <label>
          Test series digits
          <input
            type="number"
            min={2}
            max={6}
            value={config.seriesCols}
            onChange={(e) => rebuild({ ...config, seriesCols: Number(e.target.value) })}
          />
        </label>
        <label className="omr-check">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show 6.5 mm grid (screen only)
        </label>
        <p>
          <button type="button" onClick={() => setBlocks(addDigitBlock(blocks, "Custom ID"))}>
            Add metadata block
          </button>
        </p>
        <p>
          <button type="button" onClick={() => window.print()}>Print sheet</button>
        </p>
        <p>
          <button type="button" onClick={copyJson}>Copy mapping JSON</button>
        </p>
        {msg && <p>{msg}</p>}
        {selected && (
          <div className="omr-inspector">
            <h3>Block inspector</h3>
            <p className="muted">{selected.label}</p>
            <label>
              blockId
              <input value={selected.blockId} onChange={(e) => updateSelected({ blockId: e.target.value })} />
            </label>
            <label>
              dbColumnBinding
              <input value={selected.dbColumnBinding} onChange={(e) => updateSelected({ dbColumnBinding: e.target.value })} />
            </label>
          </div>
        )}
        {jsonText && (
          <textarea className="omr-json" readOnly value={jsonText} rows={12} />
        )}
      </aside>
      <div className="omr-studio-stage" onClick={() => setSelectedId(null)}>
        <div className="omr-a4-frame" ref={pageRef}>
          <OmrCanvas
            title={config.title}
            blocks={blocks}
            selectedId={selectedId}
            showGrid={showGrid}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    </div>
  );
}
