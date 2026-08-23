/**
 * Adapter selection.
 *
 * The live backend is the default; mock mode is opt-in through
 * `VITE_DATA_MODE=mock` and exists for tests and isolated previews. Screens
 * import `repository` from here and never reference an adapter directly.
 */
import { liveRepository } from "./live";
import { mockRepository } from "./mock";
import type { VisionRepository } from "./repository";

export type DataMode = "supabase" | "mock";

export function resolveDataMode(): DataMode {
  const raw = import.meta.env["VITE_DATA_MODE"];
  return raw === "mock" ? "mock" : "supabase";
}

export const dataMode: DataMode = resolveDataMode();

export const repository: VisionRepository =
  dataMode === "mock" ? mockRepository : liveRepository;

export type { VisionRepository } from "./repository";
export * from "./types";
