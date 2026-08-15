import { PointerEvent, useMemo, useRef, useState } from "react";
import { api, authFileUrl, DataBlock, Layout } from "../api";
import { BLOCK_KINDS, FIELD_TARGETS } from "../blockKinds";

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

export default function BlockEditor({
  layout,
  onSaved,
}: {
  layout: Layout;
  onSaved: (next: Layout) => void;
}) {
  const [blocks, setBlocks] = useState<DataBlock[]>(layout.blocks || []);
  const [tool, setTool] = useState("roll");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: "draw" | "move" | "resize";
    handle?: string;
    startX: number;
    startY: number;
    orig?: DataBlock;
  } | null>(null);

  const selected = blocks.find((b) => b.id === selectedId) || null;
  const info = kindInfo(tool);
  const nextAnswerStart = useMemo(() => {
    const answerBlocks = blocks.filter((b) => b.kind === "answers");
    if (!answerBlocks.length) return 1;
    return Math.max(...answerBlocks.map((b) => b.end_q || 0)) + 1;
  }, [blocks]);

  const surfaceRect = useRef<DOMRect | null>(null);
  const point = (event: PointerEvent) => {
    const el = surface.current;
    if (!el) return { x: 0, y: 0 };
    const rect = surfaceRect.current || el.getBoundingClientRect();
    surfaceRect.current = rect;
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const upsert = (block: DataBlock) => {
    const meta = kindInfo(block.kind);
    setBlocks((prev) => {
      const next = meta.unique ? prev.filter((item) => item.kind !== block.kind || item.id === block.id) : prev.slice();
      const index = next.findIndex((item) => item.id === block.id);
      if (index >= 0) next[index] = block;
      else next.push(block);
      return next;
    });
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
      const w = orig.x1 - orig.x0;
      const h = orig.y1 - orig.y0;
      const x0 = clamp(orig.x0 + dx);
      const y0 = clamp(orig.y0 + dy);
      upsert({ ...orig, x0, y0, x1: clamp(x0 + w), y1: clamp(y0 + h) });
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
      if (w > 0.01 && h > 0.01) {
        const meta = kindInfo(tool);
        const block: DataBlock = {
          id: newId(),
          kind: tool,
          label: meta.label,
          ...draft,
          cols: meta.defaultCols,
          rows: meta.defaultRows || (meta.digit ? 10 : undefined),
          start_q: tool === "answers" ? nextAnswerStart : undefined,
          end_q: tool === "answers" ? Math.min(layout.total_questions, nextAnswerStart + 44) : undefined,
          map_to: tool === "date" ? "exam_date" : tool === "test_id" ? "test_id" : tool === "test_no" ? "test_no" : "",
        };
        upsert(block);
        setSelectedId(block.id);
      }
    }
    drag.current = null;
    surfaceRect.current = null;
    setDraft(null);
  };

  const updateSelected = (patch: Partial<DataBlock>) => {
    if (!selected) return;
    upsert({ ...selected, ...patch });
  };

  const removeSelected = () => {
    if (!selected) return;
    setBlocks((prev) => prev.filter((b) => b.id !== selected.id));
    setSelectedId(null);
  };

  const save = async () => {
    setErr("");
    setSaving(true);
    try {
      const field_map = Object.fromEntries(
        blocks.filter((b) => ["date", "test_id", "test_no"].includes(b.kind)).map((b) => [b.kind, b.map_to || ""])
      );
      const saved = await api.post(`/api/layouts/${layout.id}/blocks`, { blocks, field_map }) as Layout;
      onSaved(saved);
      setBlocks(saved.blocks || blocks);
      setMsg("Data blocks saved. These regions will be used for reading OMR sheets.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save blocks");
    } finally {
      setSaving(false);
    }
  };

  const boxStyle = (block: { x0: number; y0: number; x1: number; y1: number; kind: string }, active = false) => ({
    left: `${block.x0 * 100}%`,
    top: `${block.y0 * 100}%`,
    width: `${Math.max(0.4, (block.x1 - block.x0) * 100)}%`,
    height: `${Math.max(0.4, (block.y1 - block.y0) * 100)}%`,
    borderColor: kindInfo(block.kind).color,
    zIndex: active ? 3 : 2,
  });

  return (
    <div className="block-editor">
      <div>
        <h3>Map data blocks on the sample</h3>
        <p className="muted">
          Choose a field, then drag a rectangle on the sample. Resize or move a block after selecting it.
          Saved blocks are the only regions used when reading sheets.
        </p>
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
        <div
          ref={surface}
          className="block-surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img src={authFileUrl(`/api/layouts/${layout.id}/sample`)} alt={`${layout.name} sample`} draggable={false} />
          {blocks.map((block) => (
            <div
              key={block.id}
              className={`block-rect${selectedId === block.id ? " selected" : ""}`}
              style={boxStyle(block, selectedId === block.id)}
              data-block-id={block.id}
            >
              <span className="block-label">{block.label}</span>
              {selectedId === block.id && ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => (
                <i key={handle} className={`block-handle ${handle}`} data-handle={handle} data-block-id={block.id} />
              ))}
            </div>
          ))}
          {draft && <div className="block-rect draft" style={boxStyle({ ...draft, kind: tool }, true)} />}
        </div>
      </div>
      <aside>
        <h3>Block mapping</h3>
        {!blocks.length && <p className="muted">No blocks yet. Draw Roll No, Name, Date, and each answer column.</p>}
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
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={selected.cols || 1}
                  onChange={(e) => updateSelected({ cols: Number(e.target.value) })}
                />
              </label>
            )}
            {selected.kind === "name" && (
              <label>
                Rows
                <input
                  type="number"
                  min={10}
                  max={30}
                  value={selected.rows || 26}
                  onChange={(e) => updateSelected({ rows: Number(e.target.value) })}
                />
              </label>
            )}
            {selected.kind === "answers" && (
              <>
                <label>
                  First question
                  <input
                    type="number"
                    min={1}
                    value={selected.start_q || 1}
                    onChange={(e) => updateSelected({ start_q: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Last question
                  <input
                    type="number"
                    min={1}
                    value={selected.end_q || layout.total_questions}
                    onChange={(e) => updateSelected({ end_q: Number(e.target.value) })}
                  />
                </label>
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
            <p><button type="button" className="btn-delete" onClick={removeSelected}>Remove block</button></p>
          </div>
        )}
        <p><button type="button" onClick={save} disabled={saving || !blocks.length}>{saving ? "Saving…" : "Save data blocks"}</button></p>
        {msg && <p>{msg}</p>}
        {err && <p className="error">{err}</p>}
      </aside>
    </div>
  );
}
