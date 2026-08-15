import { memo, PointerEvent, useEffect, useMemo, useRef } from "react";
import {
  BUBBLE_STROKE_PT,
  cellCenter,
  cellOrigin,
  fiducialRect,
  gridOrigin,
  mmToCell,
  timingMark,
  timingRows,
  type SheetGeometry,
} from "./geometry";
import { bubbleRowsForBlocks, clampBlockOrigin, type StudioBlock } from "./layoutEngine";

const PT_TO_MM = 25.4 / 72;

function clientToMm(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { xMm: 0, yMm: 0 };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { xMm: p.x, yMm: p.y };
}

function rectPath(x: number, y: number, w: number, h: number) {
  return `M${x} ${y}h${w}v${h}h${-w}z`;
}

function OmrCanvas({
  title,
  blocks,
  selectedId,
  showGrid,
  geometry,
  onSelect,
  onMove,
}: {
  title: string;
  blocks: StudioBlock[];
  selectedId: string | null;
  showGrid: boolean;
  geometry: SheetGeometry;
  onSelect: (id: string | null) => void;
  onMove: (id: string, col0: number, row0: number) => void;
}) {
  const g = geometry;
  const stroke = BUBBLE_STROKE_PT * PT_TO_MM;
  const radius = g.bubbleDiameterMm / 2;
  const origin = useMemo(() => gridOrigin(g), [g]);
  const rows = useMemo(() => timingRows(g, bubbleRowsForBlocks(blocks)), [g, blocks]);
  const timingPath = useMemo(
    () =>
      rows
        .flatMap((row) => {
          const left = timingMark("left", row, g);
          const right = timingMark("right", row, g);
          return [rectPath(left.xMm, left.yMm, left.widthMm, left.heightMm), rectPath(right.xMm, right.yMm, right.widthMm, right.heightMm)];
        })
        .join(""),
    [rows, g],
  );
  const drag = useRef<{
    id: string;
    pointerId: number;
    offsetCol: number;
    offsetRow: number;
    cols: number;
    rows: number;
  } | null>(null);
  const moveFrame = useRef(0);
  const pendingMove = useRef<{ id: string; col0: number; row0: number } | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  useEffect(() => () => {
    if (moveFrame.current) cancelAnimationFrame(moveFrame.current);
  }, []);

  const flushMove = () => {
    moveFrame.current = 0;
    const next = pendingMove.current;
    if (next) onMove(next.id, next.col0, next.row0);
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const hit = (event.target as Element | null)?.closest?.("[data-studio-id]");
    const id = hit?.getAttribute("data-studio-id");
    if (!id) return;
    const block = blocksRef.current.find((item) => item.id === id);
    const svg = event.currentTarget;
    if (!block) return;
    event.stopPropagation();
    event.preventDefault();
    const { xMm, yMm } = clientToMm(svg, event.clientX, event.clientY);
    const cell = mmToCell(xMm, yMm, g);
    drag.current = {
      id: block.id,
      pointerId: event.pointerId,
      offsetCol: cell.col - block.col0,
      offsetRow: cell.row - block.row0,
      cols: block.cols,
      rows: block.rows,
    };
    svg.setPointerCapture(event.pointerId);
    onSelect(block.id);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const { xMm, yMm } = clientToMm(event.currentTarget, event.clientX, event.clientY);
    const cell = mmToCell(xMm, yMm, g);
    const next = clampBlockOrigin(cell.col - session.offsetCol, cell.row - session.offsetRow, session.cols, session.rows, g);
    pendingMove.current = { id: session.id, col0: next.col0, row0: next.row0 };
    if (!moveFrame.current) moveFrame.current = requestAnimationFrame(flushMove);
  };

  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      if (moveFrame.current) {
        cancelAnimationFrame(moveFrame.current);
        flushMove();
      }
      drag.current = null;
    }
  };

  const gridW = g.gridCols * g.cellMm;
  const gridH = g.gridRows * g.cellMm;

  return (
    <svg
      className="omr-a4-svg"
      viewBox={`0 0 ${g.pageWidthMm} ${g.pageHeightMm}`}
      width={`${g.pageWidthMm}mm`}
      height={`${g.pageHeightMm}mm`}
      xmlns="http://www.w3.org/2000/svg"
      data-omr-page="a4"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <defs>
        <circle id="omr-bubble-sym" r={radius} fill="none" stroke="#000000" strokeWidth={stroke} />
        {showGrid && (
          <pattern
            id="omr-grid-pattern"
            width={g.cellMm}
            height={g.cellMm}
            patternUnits="userSpaceOnUse"
            x={origin.xMm}
            y={origin.yMm}
          >
            <path d={`M ${g.cellMm} 0 H 0 V ${g.cellMm}`} fill="none" stroke="#10BBC3" strokeWidth="0.12" />
          </pattern>
        )}
      </defs>
      <rect x="0" y="0" width={g.pageWidthMm} height={g.pageHeightMm} fill="#ffffff" />
      {(["TL", "TR", "BL", "BR"] as const).map((id) => {
        const box = fiducialRect(id, g);
        return (
          <rect
            key={id}
            data-fiducial={id}
            x={box.xMm}
            y={box.yMm}
            width={box.widthMm}
            height={box.heightMm}
            fill="#000000"
          />
        );
      })}
      <path className="omr-timing" d={timingPath} fill="#000000" />
      {showGrid && (
        <rect
          className="omr-grid-cell"
          x={origin.xMm}
          y={origin.yMm}
          width={gridW}
          height={gridH}
          fill="url(#omr-grid-pattern)"
          pointerEvents="none"
        />
      )}
      <text x={g.pageWidthMm / 2} y="18" textAnchor="middle" fontSize="4.2" fontFamily="system-ui, Roboto, Arial, sans-serif" fill="#000">
        {title}
      </text>
      <text x={g.pageWidthMm / 2} y="23" textAnchor="middle" fontSize="2.4" fontFamily="system-ui, Roboto, Arial, sans-serif" fill="#000">
        {g.pageWidthMm}×{g.pageHeightMm} mm · {g.cellMm} mm grid · {g.bubbleDiameterMm} mm bubbles
      </text>
      {blocks.map((block) => (
        <g
          key={block.id}
          data-block-id={block.blockId}
          data-studio-id={block.id}
          className={selectedId === block.id ? "omr-block selected" : "omr-block"}
        >
          <rect
            x={cellOrigin(block.col0, block.row0, g).xMm}
            y={cellOrigin(block.col0, block.row0, g).yMm}
            width={block.cols * g.cellMm}
            height={block.rows * g.cellMm}
            fill={selectedId === block.id ? "rgba(16,187,195,0.08)" : "transparent"}
            stroke={selectedId === block.id ? "#10BBC3" : "none"}
            strokeWidth="0.35"
            className="omr-block-hit"
          />
          <text
            x={cellOrigin(block.col0, block.row0, g).xMm}
            y={cellOrigin(block.col0, block.row0, g).yMm - 3.2}
            fontSize="2.2"
            fontFamily="system-ui, Roboto, Arial, sans-serif"
            fill="#000"
          >
            {block.label}
          </text>
          {block.blockType === "GRID_MCQ" ? (
            <McqBubbles block={block} geometry={g} />
          ) : block.blockType === "GRID_NAME" ? (
            <NameBubbles block={block} geometry={g} />
          ) : (
            <DigitBubbles block={block} geometry={g} />
          )}
        </g>
      ))}
    </svg>
  );
}

function DigitBubbles({ block, geometry: g }: { block: StudioBlock; geometry: SheetGeometry }) {
  const dateHeaders = ["D", "D", "M", "M", "Y", "Y", "Y", "Y"];
  const originY = cellOrigin(block.col0, block.row0, g).yMm;
  const nodes = [];
  let targetId = 1;
  for (let col = 0; col < block.cols; col++) {
    const header = cellCenter(block.col0 + col, block.row0, g);
    const caption = block.blockType === "GRID_DATE" && col < dateHeaders.length ? dateHeaders[col] : String(col + 1);
    nodes.push(
      <text key={`h-${col}`} x={header.xMm} y={originY - 1} textAnchor="middle" fontSize="1.8" fill="#000">
        {caption}
      </text>
    );
    for (let row = 0; row < block.rows; row++) {
      const center = cellCenter(block.col0 + col, block.row0 + row, g);
      const id = targetId++;
      nodes.push(
        <g key={`d-${col}-${row}`} data-target-id={id}>
          {col === 0 && (
            <text x={center.xMm - g.cellMm * 0.72} y={center.yMm + 0.7} fontSize="1.7" fill="#000">
              {row % 10}
            </text>
          )}
          <use href="#omr-bubble-sym" x={center.xMm} y={center.yMm} />
        </g>
      );
    }
  }
  return <>{nodes}</>;
}

function NameBubbles({ block, geometry: g }: { block: StudioBlock; geometry: SheetGeometry }) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const originY = cellOrigin(block.col0, block.row0, g).yMm;
  const nodes = [];
  let targetId = 1;
  for (let col = 0; col < block.cols; col++) {
    const header = cellCenter(block.col0 + col, block.row0, g);
    nodes.push(
      <text key={`nh-${col}`} x={header.xMm} y={originY - 1} textAnchor="middle" fontSize="1.8" fill="#000">
        {col + 1}
      </text>
    );
    for (let row = 0; row < block.rows; row++) {
      const letter = letters[row % 26];
      const center = cellCenter(block.col0 + col, block.row0 + row, g);
      const id = targetId++;
      nodes.push(
        <g key={`n-${col}-${row}`} data-target-id={id}>
          {col === 0 && (
            <text x={center.xMm - g.cellMm * 0.72} y={center.yMm + 0.7} fontSize="1.7" fill="#000">
              {letter}
            </text>
          )}
          <use href="#omr-bubble-sym" x={center.xMm} y={center.yMm} />
        </g>
      );
    }
  }
  return <>{nodes}</>;
}

function McqBubbles({ block, geometry: g }: { block: StudioBlock; geometry: SheetGeometry }) {
  const options = block.options || "ABCD";
  const startQ = block.startQ || 1;
  const endQ = block.endQ || startQ + block.rows - 1;
  const questionCount = Math.max(1, endQ - startQ + 1);
  const rowCount = Math.min(block.rows, questionCount);
  const originY = cellOrigin(block.col0, block.row0, g).yMm;
  const nodes = [];
  let targetId = 1;
  for (let c = 0; c < options.length; c++) {
    const header = cellCenter(block.col0 + 1 + c, block.row0, g);
    nodes.push(
      <text key={`oh-${c}`} x={header.xMm} y={originY - 1} textAnchor="middle" fontSize="1.8" fill="#000">
        {options[c]}
      </text>
    );
  }
  for (let r = 0; r < rowCount; r++) {
    const label = cellCenter(block.col0, block.row0 + r, g);
    nodes.push(
      <text key={`q-${r}`} x={label.xMm} y={label.yMm + 0.7} textAnchor="middle" fontSize="1.7" fill="#000">
        {String(startQ + r).padStart(2, "0")}
      </text>
    );
    for (let c = 0; c < options.length; c++) {
      const center = cellCenter(block.col0 + 1 + c, block.row0 + r, g);
      const id = targetId++;
      nodes.push(
        <use
          key={`b-${r}-${c}`}
          href="#omr-bubble-sym"
          x={center.xMm}
          y={center.yMm}
          data-target-id={id}
        />
      );
    }
  }
  return <>{nodes}</>;
}

export default memo(OmrCanvas);
