import { StudioBlock } from "./layoutEngine";
import {
  BUBBLE_RADIUS_MM,
  BUBBLE_STROKE_PT,
  CELL_MM,
  GRID_COLS,
  GRID_ROWS,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  cellCenter,
  cellOrigin,
  fiducialRect,
  timingMark,
  timingRows,
} from "./geometry";

const PT_TO_MM = 25.4 / 72;

export default function OmrCanvas({
  title,
  blocks,
  selectedId,
  showGrid,
  onSelect,
}: {
  title: string;
  blocks: StudioBlock[];
  selectedId: string | null;
  showGrid: boolean;
  onSelect: (id: string | null) => void;
}) {
  const stroke = BUBBLE_STROKE_PT * PT_TO_MM;
  return (
    <svg
      className="omr-a4-svg"
      viewBox={`0 0 ${PAGE_WIDTH_MM} ${PAGE_HEIGHT_MM}`}
      width="210mm"
      height="297mm"
      xmlns="http://www.w3.org/2000/svg"
      data-omr-page="a4"
    >
      <rect x="0" y="0" width={PAGE_WIDTH_MM} height={PAGE_HEIGHT_MM} fill="#ffffff" />
      {(["TL", "TR", "BL", "BR"] as const).map((id) => {
        const box = fiducialRect(id);
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
      {timingRows().map((row) =>
        (["left", "right"] as const).map((side) => {
          const mark = timingMark(side, row);
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
        Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);
          const origin = cellOrigin(col, row);
          return (
            <rect
              key={`g-${col}-${row}`}
              className="omr-grid-cell"
              x={origin.xMm}
              y={origin.yMm}
              width={CELL_MM}
              height={CELL_MM}
              fill="none"
              stroke="#10BBC3"
              strokeWidth="0.12"
            />
          );
        })}
      <text x={PAGE_WIDTH_MM / 2} y="18" textAnchor="middle" fontSize="4.2" fontFamily="Roboto, Arial, sans-serif" fill="#000">
        {title}
      </text>
      <text x={PAGE_WIDTH_MM / 2} y="23" textAnchor="middle" fontSize="2.4" fontFamily="Roboto, Arial, sans-serif" fill="#000">
        A4 210×297 mm · 6.5 mm grid · 4.5 mm bubbles
      </text>
      {blocks.map((block) => (
        <g
          key={block.id}
          data-block-id={block.blockId}
          className={selectedId === block.id ? "omr-block selected" : "omr-block"}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(block.id);
          }}
        >
          <rect
            x={cellOrigin(block.col0, block.row0).xMm}
            y={cellOrigin(block.col0, block.row0).yMm}
            width={block.cols * CELL_MM}
            height={block.rows * CELL_MM}
            fill={selectedId === block.id ? "rgba(16,187,195,0.08)" : "transparent"}
            stroke={selectedId === block.id ? "#10BBC3" : "none"}
            strokeWidth="0.35"
            className="omr-block-hit"
          />
          <text
            x={cellOrigin(block.col0, block.row0).xMm}
            y={cellOrigin(block.col0, block.row0).yMm - 3.2}
            fontSize="2.2"
            fontFamily="Roboto, Arial, sans-serif"
            fill="#000"
          >
            {block.label}
          </text>
          {block.blockType === "GRID_DIGIT" ? (
            <DigitBubbles block={block} stroke={stroke} />
          ) : (
            <McqBubbles block={block} stroke={stroke} />
          )}
        </g>
      ))}
    </svg>
  );
}

function DigitBubbles({ block, stroke }: { block: StudioBlock; stroke: number }) {
  const nodes = [];
  let targetId = 1;
  for (let col = 0; col < block.cols; col++) {
    const header = cellCenter(block.col0 + col, block.row0);
    nodes.push(
      <text key={`h-${col}`} x={header.xMm} y={cellOrigin(block.col0, block.row0).yMm - 1} textAnchor="middle" fontSize="1.8" fill="#000">
        {col + 1}
      </text>
    );
    for (let row = 0; row < block.rows; row++) {
      const center = cellCenter(block.col0 + col, block.row0 + row);
      const id = targetId++;
      nodes.push(
        <g key={`d-${col}-${row}`} data-target-id={id}>
          {col === 0 && (
            <text x={center.xMm - CELL_MM * 0.72} y={center.yMm + 0.7} fontSize="1.7" fill="#000">
              {row % 10}
            </text>
          )}
          <circle
            cx={center.xMm}
            cy={center.yMm}
            r={BUBBLE_RADIUS_MM}
            fill="none"
            stroke="#000000"
            strokeWidth={stroke}
          />
        </g>
      );
    }
  }
  return <>{nodes}</>;
}

function McqBubbles({ block, stroke }: { block: StudioBlock; stroke: number }) {
  const options = block.options || "ABCD";
  const startQ = block.startQ || 1;
  const nodes = [];
  let targetId = 1;
  for (let c = 0; c < options.length; c++) {
    const header = cellCenter(block.col0 + 1 + c, block.row0);
    nodes.push(
      <text key={`oh-${c}`} x={header.xMm} y={cellOrigin(block.col0, block.row0).yMm - 1} textAnchor="middle" fontSize="1.8" fill="#000">
        {options[c]}
      </text>
    );
  }
  for (let r = 0; r < block.rows; r++) {
    const label = cellCenter(block.col0, block.row0 + r);
    nodes.push(
      <text key={`q-${r}`} x={label.xMm} y={label.yMm + 0.7} textAnchor="middle" fontSize="1.7" fill="#000">
        {String(startQ + r).padStart(2, "0")}
      </text>
    );
    for (let c = 0; c < options.length; c++) {
      const center = cellCenter(block.col0 + 1 + c, block.row0 + r);
      const id = targetId++;
      nodes.push(
        <circle
          key={`b-${r}-${c}`}
          data-target-id={id}
          cx={center.xMm}
          cy={center.yMm}
          r={BUBBLE_RADIUS_MM}
          fill="none"
          stroke="#000000"
          strokeWidth={stroke}
        />
      );
    }
  }
  return <>{nodes}</>;
}
