import { cloneGeometry, type SheetGeometry } from "./geometry";
import { defaultConfig, type StudioBlock, type StudioConfig } from "./layoutEngine";

const STORAGE_KEY = "gyana.omrStudio.default";

export type StudioDefault = {
  config: StudioConfig;
  geometry: SheetGeometry;
  blocks: StudioBlock[];
};

export function loadStudioDefault(): StudioDefault | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StudioDefault;
    if (!data?.config || !data?.geometry || !Array.isArray(data.blocks)) return null;
    return {
      config: { ...defaultConfig(), ...data.config },
      geometry: { ...cloneGeometry(), ...data.geometry },
      blocks: data.blocks,
    };
  } catch {
    return null;
  }
}

export function saveStudioDefault(value: StudioDefault) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function hydrateStudioState(
  configRaw?: Record<string, unknown> | StudioConfig | null,
  geometryRaw?: Record<string, unknown> | SheetGeometry | null,
  blocksRaw?: StudioBlock[] | null,
): StudioDefault {
  const config = { ...defaultConfig(), ...(configRaw || {}) } as StudioConfig;
  config.questionCount = Number(config.questionCount);
  config.questionColumns = Number(config.questionColumns);
  config.rollCols = Number(config.rollCols);
  config.subjectCols = Number(config.subjectCols);
  config.seriesCols = Number(config.seriesCols);
  const geometry = { ...cloneGeometry(), ...(geometryRaw || {}) } as SheetGeometry;
  for (const key of Object.keys(geometry) as (keyof SheetGeometry)[]) {
    if (typeof geometry[key] === "number" || typeof (geometryRaw as Record<string, unknown> | null)?.[key] === "number") {
      (geometry as unknown as Record<string, unknown>)[key as string] = Number(geometry[key]);
    }
  }
  const blocks = Array.isArray(blocksRaw) ? blocksRaw.map((block) => ({ ...block })) : [];
  return { config, geometry, blocks };
}

export function initialStudioState() {
  const saved = typeof localStorage !== "undefined" ? loadStudioDefault() : null;
  if (saved) return hydrateStudioState(saved.config, saved.geometry, saved.blocks);
  return hydrateStudioState();
}
