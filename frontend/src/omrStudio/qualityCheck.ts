import { DEFAULT_GEOMETRY, type SheetGeometry } from "./geometry";
import { bubbleRowsForBlocks, type StudioBlock } from "./layoutEngine";

export type QualityItem = { level: "ok" | "warn" | "fail"; code: string; message: string };

export function runQualityCheck(g: SheetGeometry, blocks: StudioBlock[]): QualityItem[] {
  const items: QualityItem[] = [];
  const push = (level: QualityItem["level"], code: string, message: string) =>
    items.push({ level, code, message });

  if (g.pageWidthMm <= 0 || g.pageHeightMm <= 0) {
    push("fail", "page", "Page width and height must be greater than 0 mm.");
  } else if (Math.abs(g.pageWidthMm - 210) > 0.5 || Math.abs(g.pageHeightMm - 297) > 0.5) {
    push("warn", "page", `Page is ${g.pageWidthMm}×${g.pageHeightMm} mm (A4 is 210×297).`);
  } else {
    push("ok", "page", "Page size is A4 (210×297 mm).");
  }

  if (g.cellMm <= 0 || g.gridCols < 1 || g.gridRows < 1) {
    push("fail", "grid", "Grid cell size, columns, and rows must be positive.");
  } else {
    const usedW = g.gridCols * g.cellMm;
    const usedH = g.gridRows * g.cellMm;
    if (usedW > g.pageWidthMm || usedH > g.pageHeightMm) {
      push("fail", "grid", `Grid ${usedW.toFixed(1)}×${usedH.toFixed(1)} mm exceeds the page.`);
    } else {
      push("ok", "grid", `Grid ${g.gridCols}×${g.gridRows} at ${g.cellMm} mm fits the page.`);
    }
  }

  if (g.bubbleDiameterMm <= 0) {
    push("fail", "bubble", "Bubble diameter must be greater than 0.");
  } else if (g.bubbleDiameterMm >= g.cellMm) {
    push("fail", "bubble", "Bubble diameter must be smaller than the grid cell.");
  } else {
    const gap = g.cellMm - g.bubbleDiameterMm;
    if (Math.abs(gap - g.bubbleGapMm) > 0.15) {
      push("warn", "bubble", `Actual cell gap is ${gap.toFixed(2)} mm (target ${g.bubbleGapMm} mm).`);
    } else {
      push("ok", "bubble", `Bubbles ${g.bubbleDiameterMm} mm with ${gap.toFixed(2)} mm cell gap.`);
    }
  }

  if (g.fiducialMm < 4) {
    push("fail", "fiducial", "Corner markers should be at least 4 mm.");
  } else {
    push("ok", "fiducial", `Four ${g.fiducialMm} mm fiducials with ${g.fiducialKeepoutMm} mm keep-out.`);
  }

  const questions = blocks.filter((b) => b.blockType === "GRID_MCQ");
  if (!questions.length) {
    push("fail", "questions", "Add at least one question block.");
  } else {
    push("ok", "questions", `${questions.length} question column block(s) on the sheet.`);
  }

  const ids = blocks.map((b) => b.blockId.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    push("fail", "ids", "blockId values must be unique.");
  } else {
    push("ok", "ids", "Block IDs are unique.");
  }

  const binds = blocks.map((b) => b.dbColumnBinding.trim()).filter(Boolean);
  if (new Set(binds).size !== binds.length) {
    push("fail", "bind", "Database column bindings must be unique.");
  } else {
    push("ok", "bind", "Database bindings are unique.");
  }

  for (const block of blocks) {
    const overflow =
      block.col0 < 0 ||
      block.row0 < 0 ||
      block.col0 + block.cols > g.gridCols ||
      block.row0 + block.rows > g.gridRows;
    if (overflow) {
      push("fail", "overflow", `${block.label} has bubbles outside the grid.`);
    }
  }

  const rowCount = bubbleRowsForBlocks(blocks).length;
  if (g.syncTimingToBubbleRows) {
    if (rowCount < 1) {
      push("fail", "timing", "No bubble rows to synchronize timing tracks with.");
    } else {
      push("ok", "timing", `Timing tracks synchronized to ${rowCount} bubble row(s).`);
    }
  } else {
    push("warn", "timing", "Timing sync is off; marks follow keep-out rows instead of bubble rows.");
  }

  return items;
}

export function qualitySummary(items: QualityItem[]) {
  const fail = items.filter((i) => i.level === "fail").length;
  const warn = items.filter((i) => i.level === "warn").length;
  const ok = items.filter((i) => i.level === "ok").length;
  return { fail, warn, ok, passed: fail === 0 };
}

export function defaultGeometryForCheck() {
  return DEFAULT_GEOMETRY;
}
