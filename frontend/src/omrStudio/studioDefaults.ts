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

export function initialStudioState() {
  const saved = typeof localStorage !== "undefined" ? loadStudioDefault() : null;
  if (saved) return saved;
  const config = defaultConfig();
  const geometry = cloneGeometry();
  return { config, geometry, blocks: [] as StudioBlock[] };
}
