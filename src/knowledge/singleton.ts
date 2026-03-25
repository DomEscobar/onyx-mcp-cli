import { buildKnowledgeIndex } from "./build-index.js";
import { resolveExportPath } from "../paths.js";
import type { KnowledgeIndex } from "../types.js";

let cached: KnowledgeIndex | null = null;
let loadPromise: Promise<KnowledgeIndex> | null = null;

export function getKnowledgeIndex(): Promise<KnowledgeIndex> {
  if (cached) return Promise.resolve(cached);
  if (!loadPromise) {
    loadPromise = (async () => {
      const path = resolveExportPath();
      cached = await buildKnowledgeIndex(path);
      return cached;
    })();
  }
  return loadPromise;
}

export function resetKnowledgeIndexForTests(): void {
  cached = null;
  loadPromise = null;
}
