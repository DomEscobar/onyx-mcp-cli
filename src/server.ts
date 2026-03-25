import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Fuse from "fuse.js";
import { z } from "zod";
import { resolveDocPath } from "./docs-path.js";
import { extractDocTitle, formatComponentDetail } from "./format.js";
import { getKnowledgeIndex } from "./knowledge/singleton.js";
import type { ComponentRecord } from "./types.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n… (${s.length - max} more characters)`;
}

type Confidence = "high" | "medium" | "low";

const confidenceSchema = z.enum(["high", "medium", "low"]);
const propSchema = z.object({
  name: z.string(),
  type: z.string(),
  docs: z.string(),
  optional: z.boolean(),
});

function normalizeTerm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

const intentSynonyms: Record<string, string[]> = {
  button: ["OnyxButton", "OnyxIconButton", "OnyxSplitButton", "OnyxSystemButton", "OnyxNavButton"],
  table: ["OnyxDataGrid", "OnyxTable", "OnyxPagination"],
  grid: ["OnyxDataGrid"],
  datagrid: ["OnyxDataGrid"],
  modal: ["OnyxModal", "OnyxDialog", "OnyxAlertModal", "OnyxBasicDialog"],
  dialog: ["OnyxDialog", "OnyxBasicDialog", "OnyxAlertModal", "OnyxSelectDialog"],
  date: ["OnyxDatePicker", "OnyxDatePickerV2", "OnyxCalendar"],
  datepicker: ["OnyxDatePicker", "OnyxDatePickerV2"],
  nav: ["OnyxNavBar", "OnyxNavButton", "OnyxAppLayout"],
  navbar: ["OnyxNavBar"],
  pagination: ["OnyxPagination", "OnyxItemsPerPage"],
  search: ["OnyxSearch", "OnyxMiniSearch", "OnyxGlobalSearch"],
  input: ["OnyxInput", "OnyxSelectInput", "OnyxTextarea"],
};

function componentConfidence(c: ComponentRecord): Confidence {
  if (c.props.length >= 4) return "high";
  if (c.props.length >= 1) return "medium";
  if (c.examplePaths.length > 0 || c.vuePath) return "medium";
  return "low";
}

export function createOnyxMcpServer(): McpServer {
  const server = new McpServer({
    name: "onyx",
    version: "1.0.0",
  });

  server.registerTool(
    "onyx_list_components",
    {
      title: "List onyx components",
      description:
        "List all sit-onyx Vue components discovered from the export (from packages/sit-onyx types.ts). Supports pagination.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe("Max items (default 80)"),
        offset: z.number().int().min(0).optional().describe("Offset (default 0)"),
      },
      outputSchema: {
        total: z.number().int(),
        offset: z.number().int(),
        limit: z.number().int(),
        names: z.array(z.string()),
        sources: z.array(z.string()),
        confidence: confidenceSchema,
      },
      annotations: readOnly,
    },
    async (args) => {
      const idx = await getKnowledgeIndex();
      const limit = args.limit ?? 80;
      const offset = args.offset ?? 0;
      const sorted = [...idx.components.keys()].sort();
      const slice = sorted.slice(offset, offset + limit);
      const lines = slice.map((name) => {
        const c = idx.components.get(name)!;
        return `- **${name}** — ${c.props.length} props${c.vuePath ? ` — \`${c.vuePath}\`` : ""}`;
      });
      const text = [
        `# onyx components (${sorted.length} total)`,
        "",
        `Showing ${slice.length} (offset ${offset}, limit ${limit}).`,
        "",
        ...lines,
      ].join("\n");
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          total: sorted.length,
          offset,
          limit,
          names: slice,
          sources: ["packages/sit-onyx/src/components/*/types.ts"],
          confidence: "high" as Confidence,
        },
      };
    },
  );

  server.registerTool(
    "onyx_get_component",
    {
      title: "Get onyx component details",
      description:
        "Get props (from types.ts), example file paths, and an excerpt of the main .vue file when present. Use exact component folder name (e.g. OnyxButton, OnyxDataGrid).",
      inputSchema: {
        name: z.string().describe("Component name, e.g. OnyxButton"),
        vueMaxLines: z.number().int().min(20).max(400).optional().describe("Max lines of .vue source (default 120)"),
      },
      outputSchema: {
        name: z.string(),
        props: z.array(propSchema),
        typesPath: z.string(),
        vuePath: z.string().nullable(),
        examplePaths: z.array(z.string()),
        sources: z.array(z.string()),
        confidence: confidenceSchema,
      },
      annotations: readOnly,
    },
    async (args) => {
      const idx = await getKnowledgeIndex();
      const raw = args.name.trim();
      const key = raw.startsWith("Onyx") ? raw : `Onyx${raw}`;
      let c: ComponentRecord | undefined = idx.components.get(key);
      if (!c) {
        const fuse = new Fuse([...idx.components.keys()], { threshold: 0.35 });
        const hit = fuse.search(raw)[0];
        const hint = hit ? ` Did you mean **${hit.item}**?` : "";
        return {
          content: [
            {
              type: "text",
              text: `Unknown component **${raw}**.${hint} Use onyx_list_components or onyx_search_components.`,
            },
          ],
          isError: true,
        };
      }

      let vueExcerpt: string | undefined;
      if (c.vuePath) {
        const vue = idx.files.get(c.vuePath);
        if (vue) {
          const maxL = args.vueMaxLines ?? 120;
          const lines = vue.split("\n");
          vueExcerpt = lines.slice(0, maxL).join("\n");
          if (lines.length > maxL) vueExcerpt += `\n\n… (${lines.length - maxL} more lines)`;
        }
      }

      const text = formatComponentDetail(c, vueExcerpt);
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          name: c.name,
          props: c.props,
          typesPath: c.typesPath,
          vuePath: c.vuePath ?? null,
          examplePaths: c.examplePaths,
          sources: [c.typesPath, ...(c.vuePath ? [c.vuePath] : []), ...c.examplePaths],
          confidence: componentConfidence(c),
        },
      };
    },
  );

  server.registerTool(
    "onyx_search_components",
    {
      title: "Search onyx components",
      description: "Fuzzy search components by name or prop-related text (from parsed types).",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 15)"),
      },
      outputSchema: {
        query: z.string(),
        results: z.array(
          z.object({
            name: z.string(),
            score: z.number().nullable(),
            propCount: z.number().int(),
            matchReason: z.string(),
            sources: z.array(z.string()),
          }),
        ),
        sources: z.array(z.string()),
        confidence: confidenceSchema,
      },
      annotations: readOnly,
    },
    async (args) => {
      const idx = await getKnowledgeIndex();
      const limit = args.limit ?? 15;
      const query = args.query.trim();
      const normalizedQuery = normalizeTerm(query);
      const tokens = queryTokens(query);

      const list = [...idx.components.values()].map((c) => ({ name: c.name, searchText: c.searchText }));
      const fuse = new Fuse(list, {
        keys: ["name", "searchText"],
        threshold: 0.42,
        ignoreLocation: true,
      });

      const fuzzyScoreByName = new Map<string, number>();
      for (const h of fuse.search(query)) {
        if (typeof h.score === "number") fuzzyScoreByName.set(h.item.name, h.score);
      }

      const ranked = [...idx.components.values()]
        .map((c) => {
          const normalizedName = normalizeTerm(c.name.replace(/^Onyx/i, ""));
          const fuzzyRaw = fuzzyScoreByName.get(c.name);
          const fuzzyBoost = typeof fuzzyRaw === "number" ? 2 * (1 - Math.min(1, fuzzyRaw)) : 0;

          let score = fuzzyBoost;
          const reasons: string[] = [];

          if (normalizedName === normalizedQuery) {
            score += 4;
            reasons.push("exact component-name match");
          }

          if (tokens.length > 0) {
            const tokenHits = tokens.filter((t) => normalizedName.includes(t) || c.searchText.toLowerCase().includes(t));
            if (tokenHits.length > 0) {
              score += tokenHits.length * 0.7;
              reasons.push(`token match (${tokenHits.join(", ")})`);
            }
          }

          for (const t of tokens) {
            const boosts = intentSynonyms[t];
            if (boosts?.includes(c.name)) {
              score += c.name === boosts[0] ? 1.6 : 0.9;
              reasons.push(`intent boost (${t})`);
            }
          }

          if (c.props.length >= 4) score += 0.25;

          return {
            name: c.name,
            finalScore: score,
            fuzzyRaw: typeof fuzzyRaw === "number" ? fuzzyRaw : null,
            matchReason: reasons.length > 0 ? reasons.join("; ") : "weak fuzzy match",
          };
        })
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, limit);

      const lines = ranked.map((r) => {
        const c = idx.components.get(r.name)!;
        return `- **${c.name}** (rank ${r.finalScore.toFixed(2)}) — ${c.props.length} props`;
      });
      const text =
        ranked.length === 0 ? `No components matched **${args.query}**. Try a shorter or different term.` : [`# Search results for "${args.query}"`, "", ...lines].join("\n");

      const topScore = ranked[0]?.finalScore ?? 0;
      const confidence: Confidence = ranked.length === 0 ? "low" : topScore >= 4 ? "high" : "medium";
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          query: args.query,
          results: ranked.map((r) => {
            const c = idx.components.get(r.name)!;
            return {
              name: r.name,
              score: Number(r.finalScore.toFixed(4)),
              propCount: c.props.length,
              matchReason: r.matchReason,
              sources: [c.typesPath],
            };
          }),
          sources: ["packages/sit-onyx/src/components/*/types.ts"],
          confidence,
        },
      };
    },
  );

  server.registerTool(
    "onyx_get_docs_page",
    {
      title: "Get onyx documentation page",
      description:
        "Get a documentation page from the export (Markdown). Path can be short, e.g. development/index, basics/colors, or full apps/docs/src/... path.",
      inputSchema: {
        path: z.string().min(1).describe("Doc path or topic"),
        maxChars: z.number().int().min(500).max(120_000).optional().describe("Truncate long pages (default 24000)"),
      },
      outputSchema: {
        path: z.string(),
        title: z.string(),
        truncated: z.boolean(),
        sources: z.array(z.string()),
        confidence: confidenceSchema,
      },
      annotations: readOnly,
    },
    async (args) => {
      const idx = await getKnowledgeIndex();
      const resolved = resolveDocPath(idx, args.path);
      if (!resolved) {
        const fuse = new Fuse([...idx.docs.keys()], { threshold: 0.45 });
        const alt = fuse.search(args.path)[0]?.item;
        return {
          content: [
            {
              type: "text",
              text: `No doc matched **${args.path}**.${alt ? ` Closest path: \`${alt}\`` : " Use onyx_search_docs."}`,
            },
          ],
          isError: true,
        };
      }
      const body = idx.docs.get(resolved)!;
      const title = extractDocTitle(body);
      const maxC = args.maxChars ?? 24_000;
      const text = [
        `# ${title || resolved}`,
        "",
        `**Path:** \`${resolved}\``,
        "",
        clip(body, maxC),
      ].join("\n");
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          path: resolved,
          title,
          truncated: body.length > maxC,
          sources: [resolved],
          confidence: "high" as Confidence,
        },
      };
    },
  );

  server.registerTool(
    "onyx_search_docs",
    {
      title: "Search onyx documentation",
      description: "Full-text search across exported docs (titles + content preview).",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        limit: z.number().int().min(1).max(30).optional().describe("Max hits (default 12)"),
      },
      outputSchema: {
        query: z.string(),
        results: z.array(
          z.object({
            path: z.string(),
            title: z.string(),
            score: z.number().nullable(),
            sources: z.array(z.string()),
          }),
        ),
        sources: z.array(z.string()),
        confidence: confidenceSchema,
      },
      annotations: readOnly,
    },
    async (args) => {
      const idx = await getKnowledgeIndex();
      const limit = args.limit ?? 12;
      const list = [...idx.docs.entries()].map(([path, body]) => ({
        path,
        title: extractDocTitle(body),
        preview: body.slice(0, 1200),
      }));
      const fuse = new Fuse(list, {
        keys: ["path", "title", "preview"],
        threshold: 0.38,
        ignoreLocation: true,
      });
      const hits = fuse.search(args.query.trim()).slice(0, limit);
      const lines = hits.map((h) => {
        const { path, title } = h.item;
        return `- **${title || path}** — \`${path}\` (score ${h.score?.toFixed(3) ?? "?"})`;
      });
      const text =
        hits.length === 0
          ? `No documentation matched **${args.query}**.`
          : [`# Doc search: "${args.query}"`, "", ...lines].join("\n");
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          query: args.query,
          results: hits.map((h) => ({
            path: h.item.path,
            title: h.item.title,
            score: typeof h.score === "number" ? h.score : null,
            sources: [h.item.path],
          })),
          sources: ["apps/docs/src/**/*.md"],
          confidence: "medium" as Confidence,
        },
      };
    },
  );

  server.registerTool(
    "onyx_get_setup_guide",
    {
      title: "Get onyx setup guide",
      description:
        "Returns the Getting Started / development index content from the export (install sit-onyx, createOnyx, imports).",
      inputSchema: {
        maxChars: z.number().int().min(1000).max(80_000).optional().describe("Max characters (default 32000)"),
      },
      outputSchema: {
        path: z.string(),
        truncated: z.boolean(),
        sources: z.array(z.string()),
        confidence: confidenceSchema,
      },
      annotations: readOnly,
    },
    async (args) => {
      const idx = await getKnowledgeIndex();
      const path = resolveDocPath(idx, "development/index") ?? resolveDocPath(idx, "apps/docs/src/development/index.md");
      if (!path) {
        return {
          content: [{ type: "text", text: "Setup guide not found in export." }],
          isError: true,
        };
      }
      const body = idx.docs.get(path)!;
      const maxC = args.maxChars ?? 32_000;
      const text = [`# Getting started (from export)`, "", `**Path:** \`${path}\``, "", clip(body, maxC)].join("\n");
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          path,
          truncated: body.length > maxC,
          sources: [path],
          confidence: "high" as Confidence,
        },
      };
    },
  );

  server.registerTool(
    "onyx_meta",
    {
      title: "Onyx MCP metadata",
      description: "Report sit-onyx version from export, export file path, and component/doc counts.",
      inputSchema: z.object({}),
      outputSchema: {
        sitOnyxVersion: z.string().nullable(),
        sourcePath: z.string(),
        componentCount: z.number().int(),
        docCount: z.number().int(),
        sources: z.array(z.string()),
        confidence: confidenceSchema,
      },
      annotations: readOnly,
    },
    async () => {
      const idx = await getKnowledgeIndex();
      const text = [
        "# onyx MCP index",
        "",
        `- **sit-onyx version (from export):** ${idx.sitOnyxVersion ?? "unknown"}`,
        `- **Export file:** \`${idx.sourcePath}\``,
        `- **Components indexed:** ${idx.components.size}`,
        `- **Documentation pages:** ${idx.docs.size}`,
      ].join("\n");
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          sitOnyxVersion: idx.sitOnyxVersion ?? null,
          sourcePath: idx.sourcePath,
          componentCount: idx.components.size,
          docCount: idx.docs.size,
          sources: [idx.sourcePath, "packages/sit-onyx/package.json", "apps/docs/src/**/*.md"],
          confidence: "high" as Confidence,
        },
      };
    },
  );

  return server;
}
