import { StudioBlock } from "./layoutEngine";
import {
  DEFAULT_GEOMETRY,
  cellCenter,
  cellOrigin,
  fiducialRect,
  mmToPct,
  sizeToPct,
  type SheetGeometry,
} from "./geometry";

export type MappingTarget = {
  targetId: number;
  gridPosition: { row: number; col: number };
  value: string;
  centerRelative: { xPct: number; yPct: number };
};

export type MappingBlock = {
  blockId: string;
  dbColumnBinding: string;
  blockType: "GRID_MCQ" | "GRID_DIGIT" | "GRID_DATE" | "GRID_NAME";
  dimensions: { rows: number; cols: number; isColumnMajor: boolean };
  boundsRelative: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  targets: MappingTarget[];
};

export type MappingDocument = {
  documentMetadata: {
    pageSize: { widthMm: number; heightMm: number };
    referenceAnchorTopLeft: { xPct: number; yPct: number };
    grid?: { cellMm: number; columns: number; rows: number; bubbleDiameterMm: number };
  };
  dataBlocks: MappingBlock[];
};

export function blockBoundsMm(block: StudioBlock, g: SheetGeometry = DEFAULT_GEOMETRY) {
  const origin = cellOrigin(block.col0, block.row0, g);
  return {
    xMm: origin.xMm,
    yMm: origin.yMm,
    widthMm: block.cols * g.cellMm,
    heightMm: block.rows * g.cellMm,
  };
}

export function nameTargets(block: StudioBlock, g: SheetGeometry = DEFAULT_GEOMETRY): MappingTarget[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const targets: MappingTarget[] = [];
  let targetId = 1;
  for (let col = 0; col < block.cols; col++) {
    for (let row = 0; row < block.rows; row++) {
      const center = cellCenter(block.col0 + col, block.row0 + row, g);
      targets.push({
        targetId: targetId++,
        gridPosition: { row: row + 1, col: col + 1 },
        value: letters[row % 26],
        centerRelative: mmToPct(center.xMm, center.yMm, g),
      });
    }
  }
  return targets;
}

export function digitTargets(block: StudioBlock, g: SheetGeometry = DEFAULT_GEOMETRY): MappingTarget[] {
  const targets: MappingTarget[] = [];
  let targetId = 1;
  for (let col = 0; col < block.cols; col++) {
    for (let row = 0; row < block.rows; row++) {
      const center = cellCenter(block.col0 + col, block.row0 + row, g);
      targets.push({
        targetId: targetId++,
        gridPosition: { row: row + 1, col: col + 1 },
        value: String(row % 10),
        centerRelative: mmToPct(center.xMm, center.yMm, g),
      });
    }
  }
  return targets;
}

export function mcqTargets(block: StudioBlock, g: SheetGeometry = DEFAULT_GEOMETRY): MappingTarget[] {
  const options = block.options || "ABCD";
  const startQ = block.startQ || 1;
  const endQ = block.endQ || startQ + block.rows - 1;
  const rowCount = Math.min(block.rows, Math.max(1, endQ - startQ + 1));
  const targets: MappingTarget[] = [];
  let targetId = 1;
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < options.length; c++) {
      const center = cellCenter(block.col0 + 1 + c, block.row0 + r, g);
      targets.push({
        targetId: targetId++,
        gridPosition: { row: r + 1, col: c + 1 },
        value: options[c],
        centerRelative: mmToPct(center.xMm, center.yMm, g),
      });
    }
  }
  return targets;
}

export function mappingFromGeometry(blocks: StudioBlock[], g: SheetGeometry = DEFAULT_GEOMETRY): MappingDocument {
  const tl = fiducialRect("TL", g);
  const dataBlocks: MappingBlock[] = blocks.map((block) => {
    const bounds = blockBoundsMm(block, g);
    const size = sizeToPct(bounds.widthMm, bounds.heightMm, g);
    const origin = mmToPct(bounds.xMm, bounds.yMm, g);
    const isMcq = block.blockType === "GRID_MCQ";
    return {
      blockId: block.blockId,
      dbColumnBinding: block.dbColumnBinding,
      blockType: block.blockType,
      dimensions: {
        rows: block.rows,
        cols: isMcq ? (block.options || "ABCD").length : block.cols,
        isColumnMajor: !isMcq,
      },
      boundsRelative: {
        xPct: origin.xPct,
        yPct: origin.yPct,
        widthPct: size.widthPct,
        heightPct: size.heightPct,
      },
      targets:
        block.blockType === "GRID_MCQ"
          ? mcqTargets(block, g)
          : block.blockType === "GRID_NAME"
            ? nameTargets(block, g)
            : digitTargets(block, g),
    };
  });
  return {
    documentMetadata: {
      pageSize: { widthMm: g.pageWidthMm, heightMm: g.pageHeightMm },
      referenceAnchorTopLeft: mmToPct(tl.xMm, tl.yMm, g),
      grid: {
        cellMm: g.cellMm,
        columns: g.gridCols,
        rows: g.gridRows,
        bubbleDiameterMm: g.bubbleDiameterMm,
      },
    },
    dataBlocks,
  };
}

export function mappingFromDom(
  pageEl: Element,
  blocks: StudioBlock[],
  g: SheetGeometry = DEFAULT_GEOMETRY,
): MappingDocument {
  const page = pageEl.getBoundingClientRect();
  const width = Math.max(page.width, 1);
  const height = Math.max(page.height, 1);
  const toPct = (rect: DOMRect) => ({
    xPct: ((rect.left + rect.width / 2 - page.left) / width) * 100,
    yPct: ((rect.top + rect.height / 2 - page.top) / height) * 100,
  });
  const base = mappingFromGeometry(blocks, g);
  const tl = pageEl.querySelector("[data-fiducial='TL']")?.getBoundingClientRect();
  if (tl) {
    base.documentMetadata.referenceAnchorTopLeft = {
      xPct: ((tl.left - page.left) / width) * 100,
      yPct: ((tl.top - page.top) / height) * 100,
    };
  }
  base.dataBlocks = base.dataBlocks.map((block) => {
    const group = pageEl.querySelector(`[data-block-id="${CSS.escape(block.blockId)}"]`);
    const box = group?.getBoundingClientRect();
    if (box) {
      block.boundsRelative = {
        xPct: ((box.left - page.left) / width) * 100,
        yPct: ((box.top - page.top) / height) * 100,
        widthPct: (box.width / width) * 100,
        heightPct: (box.height / height) * 100,
      };
    }
    block.targets = block.targets.map((target) => {
      const el = pageEl.querySelector(
        `[data-block-id="${CSS.escape(block.blockId)}"] [data-target-id="${target.targetId}"]`,
      );
      const rect = el?.getBoundingClientRect();
      if (rect) target.centerRelative = toPct(rect);
      return target;
    });
    return block;
  });
  return base;
}
