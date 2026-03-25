import type { KnowledgeIndex } from "./types.js";

/**
 * Resolve user input to a key in `index.docs`.
 * Accepts: full path, `development/index.md`, `development/index`, `basics/colors`.
 */
export function resolveDocPath(index: KnowledgeIndex, key: string): string | undefined {
  const k = key.trim().replace(/^\/+/, "");
  if (index.docs.has(k)) return k;

  const candidates = [
    k.endsWith(".md") ? k : `${k}.md`,
    `apps/docs/src/${k}`,
    k.endsWith(".md") ? `apps/docs/src/${k}` : `apps/docs/src/${k}.md`,
  ];

  for (const c of candidates) {
    if (index.docs.has(c)) return c;
  }

  const lower = k.toLowerCase();
  for (const path of index.docs.keys()) {
    if (path.toLowerCase().endsWith(lower) || path.toLowerCase().endsWith(`${lower}.md`)) {
      return path;
    }
  }

  return undefined;
}
