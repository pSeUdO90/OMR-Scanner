import { PointerEvent, useRef } from "react";
import {
  BUBBLE_STROKE_PT,
  cellCenter,
  cellOrigin,
  fiducialRect,
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

export default function OmrCanvas({
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
  const rows = timingRows(g, bubbleRowsForBlocks(blocks));
  const drag = useRef<{
    id: string;
    pointerId: number;
    offsetCol: number;
    offsetRow: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (event: PointerEvent<SVGGElement>, block: StudioBlock) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.stopPropagation();
    event.preventDefault();
    const { xMm, yMm } = clientToMm(svg, event.clientX, event.clientY);
    const cell = mmToCell(xMm, yMm, g);
    drag.current = {
      id: block.id,
      pointerId: event.pointerId,
      offsetCol: cell.col - block.col0,
      offsetRow: cell.row - block.row0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(block.id);
  };

  const onPointerMove = (event: PointerEvent<SVGGElement>, block: StudioBlock) => {
    const session = drag.current;
    if (!session || session.id !== block.id || session.pointerId !== event.pointerId) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const { xMm, yMm } = clientToMm(svg, event.clientX, event.clientY);
    const cell = mmToCell(xMm, yMm, g);
    const next = clampBlockOrigin(cell.col - session.offsetCol, cell.row - session.offsetRow, block.cols, block.rows, g);
    if (next.col0 === block.col0 && next.row0 === block.row0) return;
    session.moved = true;
    onMove(block.id, next.col0, next.row0);
  };

  const endDrag = (event: PointerEvent<SVGGElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return (
    <svg
      className="omr-a4-svg"
      viewBox={`0 0 ${g.pageWidthMm} ${g.pageHeightMm}`}
      width={`${g.pageWidthMm}mm`}
      height={`${g.pageHeightMm}mm`}
      xmlns="http://www.w3.org/2000/svg"
      data-omr-page="a4"
    >
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
      {rows.map((row) =>
        (["left", "right"] as const).map((side) => {
          const mark = timingMark(side, row, g);
          return (
            <rect
              key={`${side}-${row}`}
              className="omr-timing"
              x={mark.xMm}
              y={mark.yMm}
              width={mark.widthMm}
              height={mark.heightMm}
              fill="#000000"
            />
          );
        })
      )}
      {showGrid &&
        Array.from({ length: g.gridCols * g.gridRows }, (_, i) => {
          const col = i % g.gridCols;
          const row = Math.floor(i / g.gridCols);
          const origin = cellOrigin(col, row, g);
          return (
            <rect
              key={`g-${col}-${row}`}
              className="omr-grid-cell"
              x={origin.xMm}
              y={origin.yMm}
              width={g.cellMm}
              height={g.cellMm}
              fill="none"
              stroke="#10BBC3"
              strokeWidth="0.12"
            />
          );
        })}
      <text x={g.pageWidthMm / 2} y="18" textAnchor="middle" fontSize="4.2" fontFamily="Roboto, Arial, sans-serif" fill="#000">
        {title}
      </text>
      <text x={g.pageWidthMm / 2} y="23" textAnchor="middle" fontSize="2.4" fontFamily="Roboto, Arial, sans-serif" fill="#000">
        {g.pageWidthMm}×{g.pageHeightMm} mm · {g.cellMm} mm grid · {g.bubbleDiameterMm} mm bubbles
      </text>
      {blocks.map((block) => (
        <g
          key={block.id}
          data-block-id={block.blockId}
          className={selectedId === block.id ? "omr-block selected" : "omr-block"}
          onPointerDown={(event) => onPointerDown(event, block)}
          onPointerMove={(event) => onPointerMove(event, block)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={(event) => event.stopPropagation()}
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
            fontFamily="Roboto, Arial, sans-serif"
            fill="#000"
          >
            {block.label}
          </text>
          {block.blockType === "GRID_MCQ" ? (
            <McqBubbles block={block} stroke={stroke} radius={radius} geometry={g} />
          ) : block.blockType === "GRID_NAME" ? (
            <NameBubbles block={block} stroke={stroke} radius={radius} geometry={g} />
          ) : (
            <DigitBubbles block={block} stroke={stroke} radius={radius} geometry={g} />
          )}
        </g>
      ))}
    </svg>
  );
}

function DigitBubbles({
  block,
  stroke,
  radius,
  geometry: g,
}: {
  block: StudioBlock;
  stroke: number;
  radius: number;
  geometry: SheetGeometry;
}) {
  const dateHeaders = ["D", "D", "M", "M", "Y", "Y", "Y", "Y"];
  const nodes = [];
  let targetId = 1;
  for (let col = 0; col < block.cols; col++) {
    const header = cellCenter(block.col0 + col, block.row0, g);
    const caption = block.blockType === "GRID_DATE" && col < dateHeaders.length ? dateHeaders[col] : String(col + 1);
    nodes.push(
      <text key={`h-${col}`} x={header.xMm} y={cellOrigin(block.col0, block.row0, g).yMm - 1} textAnchor="middle" fontSize="1.8" fill="#000">
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
          <circle cx={center.xMm} cy={center.yMm} r={radius} fill="none" stroke="#000000" strokeWidth={stroke} />
        </g>
      );
    }
  }
  return <>{nodes}</>;
}

function NameBubbles({
  block,
  stroke,
  radius,
  geometry: g,
}: {
  block: StudioBlock;
  stroke: number;
  radius: number;
  geometry: SheetGeometry;
}) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const nodes = [];
  let targetId = 1;
  for (let col = 0; col < block.cols; col++) {
    const header = cellCenter(block.col0 + col, block.row0, g);
    nodes.push(
      <text key={`nh-${col}`} x={header.xMm} y={cellOrigin(block.col0, block.row0, g).yMm - 1} textAnchor="middle" fontSize="1.8" fill="#000">
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
          <circle cx={center.xMm} cy={center.yMm} r={radius} fill="none" stroke="#000000" strokeWidth={stroke} />
        </g>
      );
    }
  }
  return <>{nodes}</>;
}

function McqBubbles({
  block,
  stroke,
  radius,
  geometry: g,
}: {
  block: StudioBlock;
  stroke: number;
  radius: number;
  geometry: SheetGeometry;
}) {
  const options = block.options || "ABCD";
  const startQ = block.startQ || 1;
  const endQ = block.endQ || startQ + block.rows - 1;
  const questionCount = Math.max(1, endQ - startQ + 1);
  const rowCount = Math.min(block.rows, questionCount);
  const nodes = [];
  let targetId = 1;
  for (let c = 0; c < options.length; c++) {
    const header = cellCenter(block.col0 + 1 + c, block.row0, g);
    nodes.push(
      <text key={`oh-${c}`} x={header.xMm} y={cellOrigin(block.col0, block.row0, g).yMm - 1} textAnchor="middle" fontSize="1.8" fill="#000">
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
        <circle
          key={`b-${r}-${c}`}
          data-target-id={id}
          cx={center.xMm}
          cy={center.yMm}
          r={radius}
          fill="none"
          stroke="#000000"
          strokeWidth={stroke}
        />
      );
    }
  }
  return <>{nodes}</>;
}
