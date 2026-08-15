/** Physical A4 OMR geometry. 1 SVG unit = 1 millimetre. */

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

export type PointMm = { xMm: number; yMm: number };

export function cellOrigin(col: number, row: number): PointMm {
  return {
    xMm: GRID_ORIGIN_X_MM + col * CELL_MM,
    yMm: GRID_ORIGIN_Y_MM + row * CELL_MM,
  };
}

export function cellCenter(col: number, row: number): PointMm {
  const origin = cellOrigin(col, row);
  return { xMm: origin.xMm + CELL_MM / 2, yMm: origin.yMm + CELL_MM / 2 };
}

export function mmToPct(xMm: number, yMm: number) {
  return {
    xPct: (xMm / PAGE_WIDTH_MM) * 100,
    yPct: (yMm / PAGE_HEIGHT_MM) * 100,
  };
}

export function sizeToPct(widthMm: number, heightMm: number) {
  return {
    widthPct: (widthMm / PAGE_WIDTH_MM) * 100,
    heightPct: (heightMm / PAGE_HEIGHT_MM) * 100,
  };
}

export type FiducialId = "TL" | "TR" | "BL" | "BR";

export function fiducialRect(id: FiducialId) {
  const x = id === "TL" || id === "BL" ? FIDUCIAL_INSET_MM : PAGE_WIDTH_MM - FIDUCIAL_INSET_MM - FIDUCIAL_MM;
  const y = id === "TL" || id === "TR" ? FIDUCIAL_INSET_MM : PAGE_HEIGHT_MM - FIDUCIAL_INSET_MM - FIDUCIAL_MM;
  return { xMm: x, yMm: y, widthMm: FIDUCIAL_MM, heightMm: FIDUCIAL_MM };
}

export function fiducialKeepout(id: FiducialId) {
  const box = fiducialRect(id);
  return {
    x0: box.xMm - FIDUCIAL_KEEPOUT_MM,
    y0: box.yMm - FIDUCIAL_KEEPOUT_MM,
    x1: box.xMm + box.widthMm + FIDUCIAL_KEEPOUT_MM,
    y1: box.yMm + box.heightMm + FIDUCIAL_KEEPOUT_MM,
  };
}

export function timingMark(side: "left" | "right", row: number) {
  const center = cellCenter(side === "left" ? 0 : GRID_COLS - 1, row);
  const xMm = side === "left" ? FIDUCIAL_INSET_MM : PAGE_WIDTH_MM - FIDUCIAL_INSET_MM - TIMING_WIDTH_MM;
  return {
    xMm,
    yMm: center.yMm - TIMING_HEIGHT_MM / 2,
    widthMm: TIMING_WIDTH_MM,
    heightMm: TIMING_HEIGHT_MM,
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

export function timingRows(): number[] {
  const keepouts = (["TL", "TR", "BL", "BR"] as FiducialId[]).map(fiducialKeepout);
  const rows: number[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const left = timingMark("left", row);
    const blocked = keepouts.some((zone) => rectsOverlap(zone, left));
    if (!blocked) rows.push(row);
  }
  return rows;
}

export const CONTENT_COL0 = 3;
export const CONTENT_COL1 = 28;
export const CONTENT_ROW0 = 3;
export const CONTENT_ROW1 = 41;
