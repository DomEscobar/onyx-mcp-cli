import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

const projectRoot = process.cwd();
const exportPath =
  process.env.ONYX_EXPORT_PATH ??
  "schwarzit-onyx-8a5edab282632443.txt";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: projectRoot,
  env: { ...process.env, ONYX_EXPORT_PATH: exportPath },
});

const client = new Client({
  name: "onyx-quality-eval",
  version: "1.0.0",
});

const checks = [];

function assertCheck(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
}

async function callTool(name, args) {
  return client.request(
    { method: "tools/call", params: { name, arguments: args } },
    CallToolResultSchema,
  );
}

function textOf(result) {
  return result.content.find((c) => c.type === "text")?.text ?? "";
}

function hasSourcesAndConfidence(sc) {
  return (
    sc &&
    Array.isArray(sc.sources) &&
    sc.sources.length > 0 &&
    ["high", "medium", "low"].includes(sc.confidence)
  );
}

async function run() {
  await client.connect(transport);

  const tools = await client.request(
    { method: "tools/list", params: {} },
    ListToolsResultSchema,
  );
  const toolNames = tools.tools.map((t) => t.name);
  const expected = [
    "onyx_list_components",
    "onyx_get_component",
    "onyx_search_components",
    "onyx_get_docs_page",
    "onyx_search_docs",
    "onyx_get_setup_guide",
    "onyx_meta",
  ];
  for (const name of expected) {
    assertCheck(`tools/list contains ${name}`, toolNames.includes(name), toolNames.join(", "));
  }

  const meta = await callTool("onyx_meta", {});
  const metaSc = meta.structuredContent ?? {};
  assertCheck("onyx_meta has sources+confidence", hasSourcesAndConfidence(metaSc), JSON.stringify(metaSc));
  assertCheck("onyx_meta componentCount > 50", Number(metaSc.componentCount) > 50, String(metaSc.componentCount));
  assertCheck("onyx_meta docCount > 30", Number(metaSc.docCount) > 30, String(metaSc.docCount));
  assertCheck("onyx_meta sourcePath points to export", String(metaSc.sourcePath).endsWith(".txt"), String(metaSc.sourcePath));

  const list = await callTool("onyx_list_components", { limit: 10, offset: 0 });
  const listSc = list.structuredContent ?? {};
  assertCheck("onyx_list_components has sources+confidence", hasSourcesAndConfidence(listSc), JSON.stringify(listSc));
  assertCheck("onyx_list_components names length > 0", Array.isArray(listSc.names) && listSc.names.length > 0, JSON.stringify(listSc.names));

  const button = await callTool("onyx_get_component", { name: "OnyxButton", vueMaxLines: 40 });
  const buttonSc = button.structuredContent ?? {};
  assertCheck("onyx_get_component has sources+confidence", hasSourcesAndConfidence(buttonSc), JSON.stringify(buttonSc));
  assertCheck(
    "OnyxButton contains label prop",
    Array.isArray(buttonSc.props) && buttonSc.props.some((p) => p.name === "label" && p.type === "string"),
    JSON.stringify(buttonSc.props?.slice(0, 5)),
  );
  assertCheck(
    "OnyxButton has examples or vuePath",
    (Array.isArray(buttonSc.examplePaths) && buttonSc.examplePaths.length > 0) || Boolean(buttonSc.vuePath),
    JSON.stringify({ vuePath: buttonSc.vuePath, examples: buttonSc.examplePaths?.length ?? 0 }),
  );

  const dataGrid = await callTool("onyx_get_component", { name: "OnyxDataGrid", vueMaxLines: 40 });
  const dataGridSc = dataGrid.structuredContent ?? {};
  assertCheck("OnyxDataGrid has parsed props", Array.isArray(dataGridSc.props) && dataGridSc.props.length > 0, JSON.stringify(dataGridSc.props?.slice(0, 5)));

  const modal = await callTool("onyx_get_component", { name: "OnyxModal", vueMaxLines: 40 });
  const modalSc = modal.structuredContent ?? {};
  assertCheck(
    "OnyxModal confidence not falsely high when props are sparse",
    !(
      Array.isArray(modalSc.props) &&
      modalSc.props.length === 0 &&
      String(modalSc.confidence) === "high"
    ),
    JSON.stringify({ props: modalSc.props?.length, confidence: modalSc.confidence }),
  );

  const componentSearch = await callTool("onyx_search_components", { query: "date picker", limit: 10 });
  const componentSearchSc = componentSearch.structuredContent ?? {};
  assertCheck("onyx_search_components has sources+confidence", hasSourcesAndConfidence(componentSearchSc), JSON.stringify(componentSearchSc));
  assertCheck(
    "component search returns date-related component",
    Array.isArray(componentSearchSc.results) &&
      componentSearchSc.results.some((r) => String(r.name).includes("DatePicker") || String(r.name).includes("Calendar")),
    JSON.stringify(componentSearchSc.results?.slice(0, 5)),
  );

  const buttonSearch = await callTool("onyx_search_components", { query: "button", limit: 3 });
  const buttonSearchSc = buttonSearch.structuredContent ?? {};
  assertCheck(
    "component search top-1 for 'button' is OnyxButton",
    Array.isArray(buttonSearchSc.results) && buttonSearchSc.results[0]?.name === "OnyxButton",
    JSON.stringify(buttonSearchSc.results?.slice(0, 3)),
  );

  const paginationSearch = await callTool("onyx_search_components", { query: "pagination", limit: 3 });
  const paginationSearchSc = paginationSearch.structuredContent ?? {};
  assertCheck(
    "component search top-1 for 'pagination' is OnyxPagination",
    Array.isArray(paginationSearchSc.results) && paginationSearchSc.results[0]?.name === "OnyxPagination",
    JSON.stringify(paginationSearchSc.results?.slice(0, 3)),
  );

  const docsPage = await callTool("onyx_get_docs_page", { path: "development/index", maxChars: 5000 });
  const docsPageSc = docsPage.structuredContent ?? {};
  const docsPageText = textOf(docsPage);
  assertCheck("onyx_get_docs_page has sources+confidence", hasSourcesAndConfidence(docsPageSc), JSON.stringify(docsPageSc));
  assertCheck("docs page includes installation section", /Installation/i.test(docsPageText), docsPageText.slice(0, 280));

  const docsSearch = await callTool("onyx_search_docs", { query: "theming", limit: 10 });
  const docsSearchSc = docsSearch.structuredContent ?? {};
  assertCheck("onyx_search_docs has sources+confidence", hasSourcesAndConfidence(docsSearchSc), JSON.stringify(docsSearchSc));
  assertCheck(
    "docs search finds theming topic",
    Array.isArray(docsSearchSc.results) &&
      docsSearchSc.results.some((r) => String(r.path).toLowerCase().includes("theming") || String(r.title).toLowerCase().includes("theming")),
    JSON.stringify(docsSearchSc.results?.slice(0, 5)),
  );

  const setup = await callTool("onyx_get_setup_guide", { maxChars: 6000 });
  const setupSc = setup.structuredContent ?? {};
  const setupText = textOf(setup);
  assertCheck("onyx_get_setup_guide has sources+confidence", hasSourcesAndConfidence(setupSc), JSON.stringify(setupSc));
  assertCheck("setup guide contains createOnyx", /createOnyx/.test(setupText), setupText.slice(0, 280));

  await transport.close();

  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  const accuracy = ((passed / total) * 100).toFixed(1);
  console.log(`Quality checks passed: ${passed}/${total} (${accuracy}%)`);
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"} - ${c.name}`);
    if (!c.pass) {
      console.log(`  detail: ${c.detail}`);
    }
  }

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch(async (error) => {
  console.error("evaluation failed:", error);
  try {
    await transport.close();
  } catch {}
  process.exit(1);
});
