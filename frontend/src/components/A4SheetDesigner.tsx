import { PointerEvent, useMemo, useRef, useState } from "react";
import { BLOCK_KINDS, DataBlock, FIELD_TARGETS } from "../blockKinds";

type KindInfo = (typeof BLOCK_KINDS)[number];

function kindInfo(kind: string): KindInfo {
  return BLOCK_KINDS.find((item) => item.kind === kind) || BLOCK_KINDS[0];
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normBox(x0: number, y0: number, x1: number, y1: number) {
  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

function newId() {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function bubbleDots(block: DataBlock, options: string) {
  const dots: { x: number; y: number }[] = [];
  const w = block.x1 - block.x0;
  const h = block.y1 - block.y0;
  if (block.kind === "answers") {
    const rows = Math.max(1, (block.end_q || 1) - (block.start_q || 1) + 1);
    const cols = Math.max(2, options.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({ x: block.x0 + ((c + 0.5) / cols) * w, y: block.y0 + ((r + 0.5) / rows) * h });
      }
    }
    return dots;
  }
  const cols = Math.max(1, block.cols || 1);
  const rows = Math.max(1, block.rows || (kindInfo(block.kind).digit ? 10 : 26));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push({ x: block.x0 + ((c + 0.5) / cols) * w, y: block.y0 + ((r + 0.5) / rows) * h });
    }
  }
  return dots;
}

export default function A4SheetDesigner({
  blocks,
  setBlocks,
  options,
  totalQuestions,
}: {
  blocks: DataBlock[];
  setBlocks: (next: DataBlock[]) => void;
  options: string;
  totalQuestions: number;
}) {
  const [tool, setTool] = useState("roll");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: "draw" | "move" | "resize";
    handle?: string;
    startX: number;
    startY: number;
    orig?: DataBlock;
  } | null>(null);

  const selected = blocks.find((b) => b.id === selectedId) || null;
  const nextAnswerStart = useMemo(() => {
    const answerBlocks = blocks.filter((b) => b.kind === "answers");
    if (!answerBlocks.length) return 1;
    return Math.max(...answerBlocks.map((b) => b.end_q || 0)) + 1;
  }, [blocks]);

  const point = (event: PointerEvent) => {
    const el = surface.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const upsert = (block: DataBlock) => {
    const meta = kindInfo(block.kind);
    const next = meta.unique ? blocks.filter((item) => item.kind !== block.kind || item.id === block.id) : blocks.slice();
    const index = next.findIndex((item) => item.id === block.id);
    if (index >= 0) next[index] = block;
    else next.push(block);
    setBlocks(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const { x, y } = point(event);
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle;
    const blockId = target.dataset.blockId;
    if (handle && selected) {
      drag.current = { mode: "resize", handle, startX: x, startY: y, orig: selected };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (blockId) {
      const orig = blocks.find((b) => b.id === blockId);
      setSelectedId(blockId);
      if (orig) {
        drag.current = { mode: "move", startX: x, startY: y, orig };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    setSelectedId(null);
    drag.current = { mode: "draw", startX: x, startY: y };
    setDraft({ x0: x, y0: y, x1: x, y1: y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { x, y } = point(event);
    const current = drag.current;
    if (current.mode === "draw") {
      setDraft(normBox(current.startX, current.startY, x, y));
      return;
    }
    if (!current.orig) return;
    const orig = current.orig;
    if (current.mode === "move") {
      const dx = x - current.startX;
      const dy = y - current.startY;
      const bw = orig.x1 - orig.x0;
      const bh = orig.y1 - orig.y0;
      const x0 = clamp(orig.x0 + dx);
      const y0 = clamp(orig.y0 + dy);
      upsert({ ...orig, x0, y0, x1: clamp(x0 + bw), y1: clamp(y0 + bh) });
      return;
    }
    let { x0, y0, x1, y1 } = orig;
    const handle = current.handle || "";
    if (handle.includes("w")) x0 = x;
    if (handle.includes("e")) x1 = x;
    if (handle.includes("n")) y0 = y;
    if (handle.includes("s")) y1 = y;
    upsert({ ...orig, ...normBox(x0, y0, x1, y1) });
  };

  const onPointerUp = () => {
    if (drag.current?.mode === "draw" && draft) {
      const w = draft.x1 - draft.x0;
      const h = draft.y1 - draft.y0;
      if (w > 0.015 && h > 0.015) {
        const meta = kindInfo(tool);
        const block: DataBlock = {
          id: newId(),
          kind: tool,
          label: meta.label,
          ...draft,
          cols: meta.defaultCols,
          rows: meta.defaultRows || (meta.digit ? 10 : undefined),
          start_q: tool === "answers" ? nextAnswerStart : undefined,
          end_q: tool === "answers" ? Math.min(totalQuestions, nextAnswerStart + 44) : undefined,
          map_to: tool === "date" ? "exam_date" : tool === "test_id" ? "test_id" : tool === "test_no" ? "test_no" : "",
        };
        upsert(block);
        setSelectedId(block.id);
      }
    }
    drag.current = null;
    setDraft(null);
  };

  const updateSelected = (patch: Partial<DataBlock>) => {
    if (!selected) return;
    upsert({ ...selected, ...patch });
  };

  return (
    <div className="a4-designer">
      <div>
        <div className="block-tools">
          {BLOCK_KINDS.map((item) => (
            <button
              type="button"
              key={item.kind}
              className={tool === item.kind ? "active" : ""}
              style={{ borderColor: item.color }}
              onClick={() => setTool(item.kind)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="a4-stage">
          <div
            ref={surface}
            className="a4-page"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="a4-header">Gyana Vikash · A4 OMR · 210 × 297 mm</div>
            {blocks.map((block) => (
              <div
                key={block.id}
                className={`block-rect${selectedId === block.id ? " selected" : ""}`}
                style={{
                  left: `${block.x0 * 100}%`,
                  top: `${block.y0 * 100}%`,
                  width: `${Math.max(0.4, (block.x1 - block.x0) * 100)}%`,
                  height: `${Math.max(0.4, (block.y1 - block.y0) * 100)}%`,
                  borderColor: kindInfo(block.kind).color,
                }}
                data-block-id={block.id}
              >
                <span className="block-label">{block.label}</span>
                {bubbleDots(block, options).slice(0, 800).map((dot, i) => (
                  <i
                    key={i}
                    className="a4-bubble"
                    style={{ left: `${((dot.x - block.x0) / Math.max(block.x1 - block.x0, 0.001)) * 100}%`, top: `${((dot.y - block.y0) / Math.max(block.y1 - block.y0, 0.001)) * 100}%` }}
                  />
                ))}
                {selectedId === block.id && ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => (
                  <i key={handle} className={`block-handle ${handle}`} data-handle={handle} data-block-id={block.id} />
                ))}
              </div>
            ))}
            {draft && (
              <div
                className="block-rect draft"
                style={{
                  left: `${draft.x0 * 100}%`,
                  top: `${draft.y0 * 100}%`,
                  width: `${(draft.x1 - draft.x0) * 100}%`,
                  height: `${(draft.y1 - draft.y0) * 100}%`,
                  borderColor: kindInfo(tool).color,
                }}
              />
            )}
          </div>
        </div>
      </div>
      <aside>
        <h3>Predefined blocks</h3>
        <p className="muted">A4 page. Select a type, then drag on the sheet. Use standard placement or draw your own.</p>
        <ul className="block-list">
          {blocks.map((block) => (
            <li key={block.id}>
              <button type="button" className={selectedId === block.id ? "active" : ""} onClick={() => setSelectedId(block.id)}>
                <span className={`field-class field-class-${block.kind}`}>{block.label}</span>
                {block.kind === "answers" ? ` Q${block.start_q}–Q${block.end_q}` : block.cols ? ` ${block.cols} cols` : ""}
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <div className="block-props">
            <p><strong>{selected.label}</strong></p>
            {(kindInfo(selected.kind).digit || selected.kind === "name") && (
              <label>
                Columns
                <input type="number" min={1} max={40} value={selected.cols || 1} onChange={(e) => updateSelected({ cols: Number(e.target.value) })} />
              </label>
            )}
            {selected.kind === "name" && (
              <label>
                Rows
                <input type="number" min={10} max={26} value={selected.rows || 26} onChange={(e) => updateSelected({ rows: Number(e.target.value) })} />
              </label>
            )}
            {selected.kind === "answers" && (
              <>
                <label>First question<input type="number" min={1} value={selected.start_q || 1} onChange={(e) => updateSelected({ start_q: Number(e.target.value) })} /></label>
                <label>Last question<input type="number" min={1} value={selected.end_q || totalQuestions} onChange={(e) => updateSelected({ end_q: Number(e.target.value) })} /></label>
              </>
            )}
            {["date", "test_id", "test_no"].includes(selected.kind) && (
              <label>
                Map to exam field
                <select value={selected.map_to || ""} onChange={(e) => updateSelected({ map_to: e.target.value })}>
                  {FIELD_TARGETS.map((t) => (
                    <option key={t.value || "ignore"} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
            )}
            <p>
              <button type="button" className="btn-delete" onClick={() => { setBlocks(blocks.filter((b) => b.id !== selected.id)); setSelectedId(null); }}>
                Remove block
              </button>
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
