import { readFile } from "node:fs/promises";
import { parsePropsFromTypesFile } from "../parser/props.js";
import { splitExportFile } from "../parser/split-files.js";
import type { ComponentRecord, KnowledgeIndex } from "../types.js";

const TYPES_RE = /^packages\/sit-onyx\/src\/components\/(Onyx[A-Za-z0-9]+)\/types\.ts$/;

function findMainVue(files: Map<string, string>, folder: string): string | undefined {
  const base = `packages/sit-onyx/src/components/${folder}/`;
  const exact = `${base}${folder}.vue`;
  if (files.has(exact)) return exact;

  const candidates = [...files.keys()].filter(
    (k) =>
      k.startsWith(base) &&
      k.endsWith(".vue") &&
      !k.includes("/examples/") &&
      !k.includes(".ct.") &&
      !k.includes(".stories.") &&
      !k.endsWith("TestCase.vue") &&
      !k.endsWith("TestWrapper.vue"),
  );
  if (candidates.length === 0) return undefined;
  candidates.sort();
  return candidates[0];
}

function listExamples(files: Map<string, string>, folder: string): string[] {
  const prefix = `packages/sit-onyx/src/components/${folder}/examples/`;
  return [...files.keys()].filter((k) => k.startsWith(prefix) && k.endsWith(".vue")).sort();
}

function buildSearchText(folder: string, props: { name: string; type: string; docs: string }[]): string {
  const propBits = props.map((p) => `${p.name} ${p.type} ${p.docs}`).join(" ");
  return `${folder} ${propBits}`;
}

export async function buildKnowledgeIndex(exportPath: string): Promise<KnowledgeIndex> {
  const raw = await readFile(exportPath, "utf-8");
  const files = splitExportFile(raw);

  const components = new Map<string, ComponentRecord>();

  for (const path of files.keys()) {
    const m = path.match(TYPES_RE);
    if (!m) continue;
    const folder = m[1];
    const content = files.get(path);
    if (!content) continue;

    const props = parsePropsFromTypesFile(content);
    const vuePath = findMainVue(files, folder);
    const examplePaths = listExamples(files, folder);

    const record: ComponentRecord = {
      name: folder,
      folder,
      props,
      typesPath: path,
      vuePath,
      examplePaths,
      searchText: buildSearchText(folder, props),
    };
    components.set(folder, record);
  }

  const docs = new Map<string, string>();
  for (const [path, content] of files) {
    if (path.startsWith("apps/docs/src/") && path.endsWith(".md") && !path.includes("/node_modules/")) {
      docs.set(path, content);
    }
  }

  let sitOnyxVersion: string | undefined;
  const pkg = files.get("packages/sit-onyx/package.json");
  if (pkg) {
    try {
      const j = JSON.parse(pkg) as { version?: string };
      sitOnyxVersion = j.version;
    } catch {
      /* ignore */
    }
  }

  return { components, docs, files, sitOnyxVersion, sourcePath: exportPath };
}
