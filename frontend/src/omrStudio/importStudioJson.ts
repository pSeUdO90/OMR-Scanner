import { cloneGeometry, mmToCell, type SheetGeometry } from "./geometry";
import { defaultConfig, type StudioBlock, type StudioConfig } from "./layoutEngine";
import { hydrateStudioState, type StudioDefault } from "./studioDefaults";
import type { MappingDocument } from "./exportMapping";

export const STUDIO_JSON_KIND = "gyana-omr-studio";

export type StudioExportDocument = {
  kind: typeof STUDIO_JSON_KIND;
  version: 1;
  config: StudioConfig;
  geometry: SheetGeometry;
  blocks: StudioBlock[];
  mapping: MappingDocument;
};

const VALID_TYPES = new Set(["GRID_MCQ", "GRID_DIGIT", "GRID_DATE", "GRID_NAME"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function geometryFromMapping(mapping: MappingDocument): SheetGeometry {
  const geo = cloneGeometry();
  const page = mapping.documentMetadata?.pageSize;
  const grid = mapping.documentMetadata?.grid;
  if (page?.widthMm) geo.pageWidthMm = Number(page.widthMm);
  if (page?.heightMm) geo.pageHeightMm = Number(page.heightMm);
  if (grid?.cellMm) geo.cellMm = Number(grid.cellMm);
  if (grid?.columns) geo.gridCols = Number(grid.columns);
  if (grid?.rows) geo.gridRows = Number(grid.rows);
  if (grid?.bubbleDiameterMm) geo.bubbleDiameterMm = Number(grid.bubbleDiameterMm);
  return geo;
}

function blocksFromMapping(mapping: MappingDocument, geometry: SheetGeometry): StudioBlock[] {
  const pageW = geometry.pageWidthMm;
  const pageH = geometry.pageHeightMm;
  let nextQ = 1;
  return (mapping.dataBlocks || []).map((item, index) => {
    const bounds = item.boundsRelative || { xPct: 0, yPct: 0, widthPct: 0, heightPct: 0 };
    const origin = mmToCell((bounds.xPct / 100) * pageW, (bounds.yPct / 100) * pageH, geometry);
    const size = mmToCell(
      ((bounds.xPct + bounds.widthPct) / 100) * pageW,
      ((bounds.yPct + bounds.heightPct) / 100) * pageH,
      geometry,
    );
    let col0 = Math.max(0, Math.round(origin.col));
    let row0 = Math.max(0, Math.round(origin.row));
    let cols = Math.max(1, Math.round(size.col - origin.col) || Number(item.dimensions?.cols) || 1);
    let rows = Math.max(1, Math.round(size.row - origin.row) || Number(item.dimensions?.rows) || 1);
    rows = Math.max(1, Number(item.dimensions?.rows) || rows);
    const dimCols = Number(item.dimensions?.cols) || cols;
    let blockType = VALID_TYPES.has(item.blockType) ? item.blockType : "GRID_DIGIT";
    const blockId = item.blockId || `block_${index + 1}`;
    let options: string | undefined;
    let startQ: number | undefined;
    let endQ: number | undefined;
    let dbColumnBinding = item.dbColumnBinding || "";
    if (blockType === "GRID_MCQ") {
      const optionN = Math.max(1, Math.min(6, dimCols || 4));
      options = "ABCDEF".slice(0, optionN);
      cols = 1 + options.length;
      startQ = nextQ;
      endQ = nextQ + rows - 1;
      nextQ = endQ + 1;
      if (!dbColumnBinding) dbColumnBinding = `student_responses.q_${String(startQ).padStart(2, "0")}_to_${String(endQ).padStart(2, "0")}`;
    } else {
      cols = Math.max(1, dimCols);
    }
    return {
      id: blockId,
      blockId,
      dbColumnBinding,
      blockType,
      label: blockId.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      col0,
      row0,
      cols,
      rows,
      options,
      startQ,
      endQ,
    };
  });
}

export function parseStudioImportJson(raw: unknown): StudioDefault {
  const root = asRecord(raw);
  if (!root) throw new Error("OMR JSON must be an object");
  const data = asRecord(root.layout) || root;
  const mapping = (asRecord(data.mapping) ||
    (data.documentMetadata && data.dataBlocks ? data : null)) as MappingDocument | null;

  const configRaw = asRecord(data.config) || asRecord(data.studio_config);
  const geometryRaw = asRecord(data.geometry) || asRecord(data.studio_geometry);
  let blocks = Array.isArray(data.blocks)
    ? (data.blocks as StudioBlock[])
    : Array.isArray(data.studio_blocks)
      ? (data.studio_blocks as StudioBlock[])
      : [];

  if (!blocks.length) {
    if (!mapping?.dataBlocks?.length) {
      throw new Error("Unrecognized OMR JSON. Export from OMR Studio or include config, geometry, and blocks.");
    }
    const geometry = geometryRaw ? ({ ...cloneGeometry(), ...geometryRaw } as SheetGeometry) : geometryFromMapping(mapping);
    blocks = blocksFromMapping(mapping, geometry);
    const mcq = blocks.filter((b) => b.blockType === "GRID_MCQ");
    const title = String(configRaw?.title || "Imported OMR");
    const config = {
      ...defaultConfig(),
      ...(configRaw || {}),
      title,
      questionCount: mcq.length ? Math.max(10, Math.max(...mcq.map((b) => Number(b.endQ) || 0))) : defaultConfig().questionCount,
      questionColumns: mcq.length ? Math.min(6, mcq.length) : defaultConfig().questionColumns,
    } as StudioConfig;
    return hydrateStudioState(config, geometry, blocks);
  }
  return hydrateStudioState(configRaw, geometryRaw, blocks);
}

export function buildStudioExportJson(
  config: StudioConfig,
  geometry: SheetGeometry,
  blocks: StudioBlock[],
  mapping: MappingDocument,
): StudioExportDocument {
  return { kind: STUDIO_JSON_KIND, version: 1, config, geometry, blocks, mapping };
}
