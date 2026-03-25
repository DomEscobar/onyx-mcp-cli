import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    ONYX_EXPORT_PATH:
      process.env.ONYX_EXPORT_PATH ??
      "schwarzit-onyx-8a5edab282632443.txt",
  },
});

const client = new Client({
  name: "onyx-smoke-client",
  version: "1.0.0",
});

async function main() {
  await client.connect(transport);

  const tools = await client.request(
    { method: "tools/list", params: {} },
    ListToolsResultSchema,
  );
  console.log("tools.count", tools.tools.length);
  console.log(
    "tools.names",
    tools.tools.map((t) => t.name).join(", "),
  );

  const meta = await client.request(
    {
      method: "tools/call",
      params: { name: "onyx_meta", arguments: {} },
    },
    CallToolResultSchema,
  );
  const firstText = meta.content.find((c) => c.type === "text");
  console.log("onyx_meta.ok", Boolean(firstText));
  if (firstText) {
    console.log(firstText.text);
  }

  await transport.close();
}

main().catch(async (error) => {
  console.error("smoke failed:", error);
  try {
    await transport.close();
  } catch {}
  process.exit(1);
});
