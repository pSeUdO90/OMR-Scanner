import { CONTENT_COL0, CONTENT_COL1, CONTENT_ROW0, CONTENT_ROW1 } from "./geometry";

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

function fits(col0: number, row0: number, cols: number, rows: number) {
  return (
    col0 >= CONTENT_COL0 &&
    row0 >= CONTENT_ROW0 &&
    col0 + cols - 1 <= CONTENT_COL1 &&
    row0 + rows - 1 <= CONTENT_ROW1
  );
}

export function buildDefaultBlocks(config: StudioConfig): StudioBlock[] {
  const questionCount = Math.max(10, Math.min(200, Math.round(config.questionCount)));
  const questionColumns = Math.max(1, Math.min(4, Math.round(config.questionColumns)));
  const options = config.optionSet === "ABCDE" ? "ABCDE" : "ABCD";
  const rollCols = Math.max(4, Math.min(12, Math.round(config.rollCols)));
  const subjectCols = Math.max(2, Math.min(6, Math.round(config.subjectCols)));
  const seriesCols = Math.max(2, Math.min(6, Math.round(config.seriesCols)));

  const blocks: StudioBlock[] = [];
  let cursor = CONTENT_COL0;
  const metaRow = CONTENT_ROW0;

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
    if (!fits(cursor, metaRow, spec.cols, 10)) break;
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
  const available = CONTENT_COL1 - CONTENT_COL0 + 1;
  const optionCount = options.length;
  const unit = 1 + optionCount;
  let gap = 1;
  while (questionColumns * unit + (questionColumns - 1) * gap > available && gap > 0) gap -= 1;

  const perCol = Math.ceil(questionCount / questionColumns);
  let q = 1;
  for (let i = 0; i < questionColumns; i++) {
    const endQ = Math.min(questionCount, q + perCol - 1);
    const rows = endQ - q + 1;
    const col0 = CONTENT_COL0 + i * (unit + gap);
    if (!fits(col0, mcqRow0, unit, rows)) break;
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

export function addDigitBlock(blocks: StudioBlock[], label = "Custom ID"): StudioBlock[] {
  const cols = 4;
  const rows = 10;
  for (let row = CONTENT_ROW0; row <= CONTENT_ROW1 - rows + 1; row++) {
    for (let col = CONTENT_COL0; col <= CONTENT_COL1 - cols + 1; col++) {
      const overlap = blocks.some((block) =>
        col < block.col0 + block.cols + 1 &&
        col + cols + 1 > block.col0 &&
        row < block.row0 + block.rows + 1 &&
        row + rows + 1 > block.row0
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
