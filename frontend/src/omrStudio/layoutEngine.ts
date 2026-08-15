import { CONTENT_COL0, CONTENT_COL1, CONTENT_ROW0, CONTENT_ROW1, type SheetGeometry, DEFAULT_GEOMETRY } from "./geometry";

export type BlockType = "GRID_DIGIT" | "GRID_MCQ";

export type StudioBlock = {
  id: string;
  blockId: string;
  dbColumnBinding: string;
  blockType: BlockType;
  label: string;
  col0: number;
  row0: number;
  cols: number;
  rows: number;
  options?: string;
  startQ?: number;
  endQ?: number;
};

export type StudioConfig = {
  title: string;
  questionCount: number;
  questionColumns: number;
  optionSet: "ABCD" | "ABCDE";
  rollCols: number;
  subjectCols: number;
  seriesCols: number;
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultConfig(): StudioConfig {
  return {
    title: "Gyana Vikash OMR",
    questionCount: 100,
    questionColumns: 4,
    optionSet: "ABCD",
    rollCols: 8,
    subjectCols: 3,
    seriesCols: 3,
  };
}

function contentBounds(g: SheetGeometry = DEFAULT_GEOMETRY) {
  return {
    col0: g.contentCol0 ?? CONTENT_COL0,
    col1: g.contentCol1 ?? CONTENT_COL1,
    row0: g.contentRow0 ?? CONTENT_ROW0,
    row1: g.contentRow1 ?? CONTENT_ROW1,
  };
}

function fits(col0: number, row0: number, cols: number, rows: number, g: SheetGeometry = DEFAULT_GEOMETRY) {
  const b = contentBounds(g);
  return col0 >= b.col0 && row0 >= b.row0 && col0 + cols - 1 <= b.col1 && row0 + rows - 1 <= b.row1;
}

export function buildDefaultBlocks(config: StudioConfig, g: SheetGeometry = DEFAULT_GEOMETRY): StudioBlock[] {
  const questionCount = Math.max(10, Math.min(200, Math.round(config.questionCount)));
  const questionColumns = Math.max(1, Math.min(6, Math.round(config.questionColumns)));
  const options = config.optionSet === "ABCDE" ? "ABCDE" : "ABCD";
  const rollCols = Math.max(4, Math.min(12, Math.round(config.rollCols)));
  const subjectCols = Math.max(2, Math.min(6, Math.round(config.subjectCols)));
  const seriesCols = Math.max(2, Math.min(6, Math.round(config.seriesCols)));
  const b = contentBounds(g);

  const blocks: StudioBlock[] = [];
  let cursor = b.col0;
  const metaRow = b.row0;

  const digitSpecs: Array<Omit<StudioBlock, "id" | "col0" | "row0" | "rows">> = [
    {
      blockId: "roll_number_grid",
      dbColumnBinding: "candidates.roll_number",
      blockType: "GRID_DIGIT",
      label: "Roll Number",
      cols: rollCols,
    },
    {
      blockId: "subject_code_grid",
      dbColumnBinding: "exams.subject_code",
      blockType: "GRID_DIGIT",
      label: "Subject Code",
      cols: subjectCols,
    },
    {
      blockId: "test_series_grid",
      dbColumnBinding: "exams.test_series",
      blockType: "GRID_DIGIT",
      label: "Test Series",
      cols: seriesCols,
    },
  ];

  for (const spec of digitSpecs) {
    if (!fits(cursor, metaRow, spec.cols, 10, g)) break;
    blocks.push({
      ...spec,
      id: uid(spec.blockId),
      col0: cursor,
      row0: metaRow,
      rows: 10,
    });
    cursor += spec.cols + 1;
  }

  const mcqRow0 = metaRow + 12;
  const available = b.col1 - b.col0 + 1;
  const optionCount = options.length;
  const unit = 1 + optionCount;
  let gap = 1;
  while (questionColumns * unit + (questionColumns - 1) * gap > available && gap > 0) gap -= 1;

  const perCol = Math.ceil(questionCount / questionColumns);
  let q = 1;
  for (let i = 0; i < questionColumns; i++) {
    const endQ = Math.min(questionCount, q + perCol - 1);
    const rows = endQ - q + 1;
    const col0 = b.col0 + i * (unit + gap);
    if (!fits(col0, mcqRow0, unit, rows, g)) break;
    blocks.push({
      id: uid("mcq"),
      blockId: `mcq_column_${i + 1}`,
      dbColumnBinding: `student_responses.q_${String(q).padStart(2, "0")}_to_${String(endQ).padStart(2, "0")}`,
      blockType: "GRID_MCQ",
      label: `Questions ${q}–${endQ}`,
      col0,
      row0: mcqRow0,
      cols: unit,
      rows,
      options,
      startQ: q,
      endQ,
    });
    q = endQ + 1;
    if (q > questionCount) break;
  }
  return blocks;
}

export function addDigitBlock(blocks: StudioBlock[], label = "Custom ID", g: SheetGeometry = DEFAULT_GEOMETRY): StudioBlock[] {
  const cols = 4;
  const rows = 10;
  const b = contentBounds(g);
  for (let row = b.row0; row <= b.row1 - rows + 1; row++) {
    for (let col = b.col0; col <= b.col1 - cols + 1; col++) {
      const overlap = blocks.some(
        (block) =>
          col < block.col0 + block.cols + 1 &&
          col + cols + 1 > block.col0 &&
          row < block.row0 + block.rows + 1 &&
          row + rows + 1 > block.row0,
      );
      if (overlap) continue;
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "custom_id";
      return [
        ...blocks,
        {
          id: uid("meta"),
          blockId: `${slug}_grid`,
          dbColumnBinding: `candidates.${slug}`,
          blockType: "GRID_DIGIT",
          label,
          col0: col,
          row0: row,
          cols,
          rows,
        },
      ];
    }
  }
  return blocks;
}

export function bubbleRowsForBlocks(blocks: StudioBlock[]): number[] {
  const rows = new Set<number>();
  for (const block of blocks) {
    for (let r = 0; r < block.rows; r++) rows.add(block.row0 + r);
  }
  return [...rows].sort((a, b) => a - b);
}

export function clampBlockOrigin(
  col0: number,
  row0: number,
  cols: number,
  rows: number,
  g: SheetGeometry = DEFAULT_GEOMETRY,
) {
  const maxCol = Math.max(0, g.gridCols - cols);
  const maxRow = Math.max(0, g.gridRows - rows);
  return {
    col0: Math.max(0, Math.min(maxCol, Math.round(col0))),
    row0: Math.max(0, Math.min(maxRow, Math.round(row0))),
  };
}
