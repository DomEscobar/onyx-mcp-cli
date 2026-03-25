# onyx-mcp

MCP server for the [SchwarzIT/onyx](https://github.com/SchwarzIT/onyx) design system, backed by an exported monolithic markdown/text dump (`schwarzit-onyx-*.txt`).

This server focuses on:

- fast offline access to component/docs knowledge
- grounded responses with `sources`
- explicit confidence levels (`high` / `medium` / `low`)
- measurable response quality via automated checks

## What this project does

It parses the exported onyx dataset and exposes curated MCP tools for:

- component discovery
- component detail lookup (props + source references)
- docs page lookup
- docs search
- setup guidance
- repository metadata

## Data source

Primary source file:

- `schwarzit-onyx-8a5edab282632443.txt`

The server parses this file into:

- component index (`packages/sit-onyx/src/components/Onyx*/types.ts`)
- docs index (`apps/docs/src/**/*.md`)
- metadata (`packages/sit-onyx/package.json`)

You can override the file via environment variable:

- `ONYX_EXPORT_PATH=/absolute/path/to/schwarzit-onyx-<id>.txt`

### Refresh the export file (Gitingest)

To update the onyx knowledge snapshot, regenerate the export with Gitingest:

1. Open the onyx repo ingest URL in browser:
   - `https://gitingest.com/SchwarzIT/onyx`
2. Copy/download the generated text digest.
3. Save it in this project root as:
   - `schwarzit-onyx-8a5edab282632443.txt`
   - or any filename you prefer, then set `ONYX_EXPORT_PATH` to that file.
4. Re-run checks:
   - `npm run build`
   - `npm run smoke`
   - `npm run eval:quality`

## Requirements

- Node.js >= 20
- npm

## Installation

```bash
npm install
npm run build
```

## Run the MCP server

```bash
node dist/index.js
```

or:

```bash
npm start
```

## MCP Inspector

```bash
npm run inspect
```

Direct spawn example (matching current setup):

```js
const child = spawn("npx", ["@modelcontextprotocol/inspector", "node", "dist/index.js"], {
  cwd: projectRoot,
  shell: true,
  env: { ...process.env, DANGEROUSLY_OMIT_AUTH: "true" },
});
```

## OpenCode integration (copy/paste)

Use one of the following setups in OpenCode (depending on whether your OpenCode version is CLI-driven or config-file-driven).

### Option A: OpenCode MCP config file

Add this server block to your OpenCode MCP config:

```json
{
  "mcpServers": {
    "onyx": {
      "command": "node",
      "args": ["<PROJECT_ROOT>/dist/index.js"],
      "env": {
        "ONYX_EXPORT_PATH": "<PROJECT_ROOT>/schwarzit-onyx-8a5edab282632443.txt"
      }
    }
  }
}
```

If your OpenCode config uses a different root key than `mcpServers`, keep the same inner server object and adapt only the outer key.

### Option B: OpenCode command registration

If your OpenCode supports command-based MCP registration:

```bash
opencode mcp add onyx -- node "<PROJECT_ROOT>/dist/index.js"
```

Then set/export this env var in the OpenCode runtime:

```bash
ONYX_EXPORT_PATH=<PROJECT_ROOT>/schwarzit-onyx-8a5edab282632443.txt
```

Use absolute paths and replace `<PROJECT_ROOT>` with your local checkout path.

### Quick verify in OpenCode

After integration, run:

- `onyx_meta` (must return version/counts)
- `onyx_list_components` (must return component names)

If either fails, check:

- Node path is available in OpenCode environment
- absolute paths are correct
- `npm run build` was executed and `dist/index.js` exists

## Copyable skill setup (agent behavior)

If your OpenCode agent supports reusable skills/prompts, use this as a project skill:

```md
Use the `onyx` MCP server as source-of-truth for SchwarzIT onyx questions.

Rules:
1. Always call `onyx_search_components` or `onyx_search_docs` before answering ambiguous queries.
2. For component-specific answers, call `onyx_get_component` and include key props.
3. For setup questions, call `onyx_get_setup_guide`.
4. Include the returned `sources` in the final answer.
5. Reflect uncertainty using `confidence`:
   - high: direct match from component/docs source
   - medium: fuzzy search or partial match
   - low: no direct source match
6. Never invent props, defaults, or APIs not present in MCP responses.
```

## Available tools

- `onyx_list_components`
- `onyx_get_component`
- `onyx_search_components`
- `onyx_get_docs_page`
- `onyx_search_docs`
- `onyx_get_setup_guide`
- `onyx_meta`

All tools are read-only and return structured content with:

- `sources: string[]`
- `confidence: "high" | "medium" | "low"`

## Quality workflow

### 1) Smoke test (server health)

```bash
npm run smoke
```

Checks:

- server starts over stdio
- `tools/list` works
- `onyx_meta` call succeeds

### 2) Quality evaluation (response quality)

```bash
npm run eval:quality
```

Checks include:

- all expected tools are present
- schema-critical fields exist (`sources`, `confidence`)
- key domain expectations hold (component/docs/setup retrieval)

Current baseline:

- `28/28` checks passing

## Scripts

- `npm run build` – compile TypeScript to `dist/`
- `npm run dev` – run TypeScript directly
- `npm start` – start built server (`dist/cli.js`)
- `npm run inspect` – launch MCP Inspector
- `npm run smoke` – run smoke test
- `npm run eval:quality` – run quality checks

## Project structure

- `src/server.ts` – MCP tool registration + response shaping
- `src/index.ts` – stdio server entrypoint (for inspector/client)
- `src/cli.ts` – CLI-friendly entrypoint with `--help`
- `src/knowledge/*` – index building + singleton loading
- `src/parser/*` – export splitting + props parsing
- `scripts/smoke-client.mjs` – health check client
- `scripts/eval-quality.mjs` – quality test suite

## Critical notes / limitations

- Parsing is optimized for the exported file format; major export format changes may require parser updates.
- Prop extraction is robust for typical `types.ts` patterns, but very complex TS type constructs can still be edge cases.
- Confidence is currently heuristic per tool path, not model-calibrated scoring.

## Recommended next steps

- Add dynamic confidence scoring based on retrieval quality
- Expand eval set to 30+ golden questions
- Add CI quality gates (fail build below target threshold)

