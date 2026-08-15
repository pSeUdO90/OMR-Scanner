/** Physical A4 OMR geometry. 1 SVG unit = 1 millimetre. */

export type SheetGeometry = {
  pageWidthMm: number;
  pageHeightMm: number;
  cellMm: number;
  gridCols: number;
  gridRows: number;
  bubbleDiameterMm: number;
  bubbleGapMm: number;
  fiducialMm: number;
  fiducialInsetMm: number;
  fiducialKeepoutMm: number;
  timingWidthMm: number;
  timingHeightMm: number;
  syncTimingToBubbleRows: boolean;
  extraTimingRows: number;
  contentCol0: number;
  contentCol1: number;
  contentRow0: number;
  contentRow1: number;
};

export const DEFAULT_GEOMETRY: SheetGeometry = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  cellMm: 6.5,
  gridCols: 32,
  gridRows: 45,
  bubbleDiameterMm: 4.5,
  bubbleGapMm: 1,
  fiducialMm: 8,
  fiducialInsetMm: 5,
  fiducialKeepoutMm: 5,
  timingWidthMm: 5,
  timingHeightMm: 2.5,
  syncTimingToBubbleRows: true,
  extraTimingRows: 0,
  contentCol0: 3,
  contentCol1: 28,
  contentRow0: 3,
  contentRow1: 41,
};

export function cloneGeometry(g: SheetGeometry = DEFAULT_GEOMETRY): SheetGeometry {
  return { ...g };
}

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const CELL_MM = 6.5;
export const GRID_COLS = 32;
export const GRID_ROWS = 45;
export const BUBBLE_DIAMETER_MM = 4.5;
export const BUBBLE_RADIUS_MM = BUBBLE_DIAMETER_MM / 2;
export const BUBBLE_CELL_MARGIN_MM = (CELL_MM - BUBBLE_DIAMETER_MM) / 2;
export const FIDUCIAL_MM = 8;
export const FIDUCIAL_INSET_MM = 5;
export const FIDUCIAL_KEEPOUT_MM = 5;
export const TIMING_WIDTH_MM = 5;
export const TIMING_HEIGHT_MM = 2.5;
export const SAFETY_BUFFER_MM = 12;
export const BUBBLE_STROKE_PT = 0.75;

export const GRID_WIDTH_MM = GRID_COLS * CELL_MM;
export const GRID_HEIGHT_MM = GRID_ROWS * CELL_MM;
export const GRID_ORIGIN_X_MM = (PAGE_WIDTH_MM - GRID_WIDTH_MM) / 2;
export const GRID_ORIGIN_Y_MM = (PAGE_HEIGHT_MM - GRID_HEIGHT_MM) / 2;

export const CONTENT_COL0 = DEFAULT_GEOMETRY.contentCol0;
export const CONTENT_COL1 = DEFAULT_GEOMETRY.contentCol1;
export const CONTENT_ROW0 = DEFAULT_GEOMETRY.contentRow0;
export const CONTENT_ROW1 = DEFAULT_GEOMETRY.contentRow1;

export type PointMm = { xMm: number; yMm: number };

export function gridOrigin(g: SheetGeometry) {
  return {
    xMm: (g.pageWidthMm - g.gridCols * g.cellMm) / 2,
    yMm: (g.pageHeightMm - g.gridRows * g.cellMm) / 2,
  };
}

export function cellOrigin(col: number, row: number, g: SheetGeometry = DEFAULT_GEOMETRY): PointMm {
  const origin = gridOrigin(g);
  return {
    xMm: origin.xMm + col * g.cellMm,
    yMm: origin.yMm + row * g.cellMm,
  };
}

export function cellCenter(col: number, row: number, g: SheetGeometry = DEFAULT_GEOMETRY): PointMm {
  const origin = cellOrigin(col, row, g);
  return { xMm: origin.xMm + g.cellMm / 2, yMm: origin.yMm + g.cellMm / 2 };
}

export function mmToPct(xMm: number, yMm: number, g: SheetGeometry = DEFAULT_GEOMETRY) {
  return {
    xPct: (xMm / g.pageWidthMm) * 100,
    yPct: (yMm / g.pageHeightMm) * 100,
  };
}

export function sizeToPct(widthMm: number, heightMm: number, g: SheetGeometry = DEFAULT_GEOMETRY) {
  return {
    widthPct: (widthMm / g.pageWidthMm) * 100,
    heightPct: (heightMm / g.pageHeightMm) * 100,
  };
}

export type FiducialId = "TL" | "TR" | "BL" | "BR";

export function fiducialRect(id: FiducialId, g: SheetGeometry = DEFAULT_GEOMETRY) {
  const x = id === "TL" || id === "BL" ? g.fiducialInsetMm : g.pageWidthMm - g.fiducialInsetMm - g.fiducialMm;
  const y = id === "TL" || id === "TR" ? g.fiducialInsetMm : g.pageHeightMm - g.fiducialInsetMm - g.fiducialMm;
  return { xMm: x, yMm: y, widthMm: g.fiducialMm, heightMm: g.fiducialMm };
}

export function fiducialKeepout(id: FiducialId, g: SheetGeometry = DEFAULT_GEOMETRY) {
  const box = fiducialRect(id, g);
  return {
    x0: box.xMm - g.fiducialKeepoutMm,
    y0: box.yMm - g.fiducialKeepoutMm,
    x1: box.xMm + box.widthMm + g.fiducialKeepoutMm,
    y1: box.yMm + box.heightMm + g.fiducialKeepoutMm,
  };
}

export function timingMark(side: "left" | "right", row: number, g: SheetGeometry = DEFAULT_GEOMETRY) {
  const center = cellCenter(side === "left" ? 0 : g.gridCols - 1, row, g);
  const xMm = side === "left" ? g.fiducialInsetMm : g.pageWidthMm - g.fiducialInsetMm - g.timingWidthMm;
  return {
    xMm,
    yMm: center.yMm - g.timingHeightMm / 2,
    widthMm: g.timingWidthMm,
    heightMm: g.timingHeightMm,
  };
}

function rectsOverlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { xMm: number; yMm: number; widthMm: number; heightMm: number },
) {
  return !(
    b.xMm + b.widthMm < a.x0 ||
    b.xMm > a.x1 ||
    b.yMm + b.heightMm < a.y0 ||
    b.yMm > a.y1
  );
}

export function timingRowsFromKeepout(g: SheetGeometry = DEFAULT_GEOMETRY): number[] {
  const keepouts = (["TL", "TR", "BL", "BR"] as FiducialId[]).map((id) => fiducialKeepout(id, g));
  const rows: number[] = [];
  for (let row = 0; row < g.gridRows; row++) {
    const left = timingMark("left", row, g);
    const blocked = keepouts.some((zone) => rectsOverlap(zone, left));
    if (!blocked) rows.push(row);
  }
  return rows;
}

export function timingRows(
  g: SheetGeometry = DEFAULT_GEOMETRY,
  bubbleRows?: number[],
): number[] {
  if (g.syncTimingToBubbleRows && bubbleRows && bubbleRows.length) {
    const unique = [...new Set(bubbleRows)].filter((r) => r >= 0 && r < g.gridRows).sort((a, b) => a - b);
    const extra = Math.max(0, Math.round(g.extraTimingRows));
    const last = unique[unique.length - 1] ?? 0;
    const extras = Array.from({ length: extra }, (_, i) => last + i + 1).filter((r) => r < g.gridRows);
    return [...unique, ...extras];
  }
  return timingRowsFromKeepout(g);
}
