export type DataBlock = {
  id: string;
  kind: string;
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cols?: number;
  rows?: number;
  start_q?: number;
  end_q?: number;
  map_to?: string;
};

export const BLOCK_KINDS = [
  { kind: "roll", label: "Roll No", unique: true, digit: true, defaultCols: 8, color: "#A60E35" },
  { kind: "name", label: "Candidate Name", unique: true, digit: false, defaultCols: 22, defaultRows: 26, color: "#10BBC3" },
  { kind: "test_no", label: "Test No", unique: true, digit: true, defaultCols: 3, color: "#FEA24F" },
  { kind: "test_id", label: "Test ID", unique: true, digit: true, defaultCols: 4, color: "#FEA24F" },
  { kind: "date", label: "Date", unique: true, digit: true, defaultCols: 6, color: "#068187" },
  { kind: "answers", label: "Answer column", unique: false, digit: false, color: "#A5D6A7" },
];

export const FIELD_TARGETS = [
  { value: "", label: "Ignore" },
  { value: "exam_date", label: "Exam Date" },
  { value: "test_id", label: "Test ID" },
  { value: "test_no", label: "Test No" },
];
