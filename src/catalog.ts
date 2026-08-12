import {
  capturingServer,
  getCatalogTools,
  isCatalogLoaded,
  markCatalogLoaded,
  resetToolCatalog,
} from "./tool-registry.js";
import { registerMemoryTools } from "./tools/memory-tools.js";

/** Ensure the in-process tool catalog is populated (no MCP SDK required). */
export function ensureToolCatalog(): void {
  if (isCatalogLoaded()) return;
  resetToolCatalog();
  registerMemoryTools(capturingServer());
  markCatalogLoaded();
}

export function listCatalogTools() {
  ensureToolCatalog();
  return getCatalogTools();
}
