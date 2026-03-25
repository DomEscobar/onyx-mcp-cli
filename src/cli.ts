#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOnyxMcpServer } from "./server.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`onyx-mcp — MCP server for Schwarz IT onyx (offline export)

Usage:
  onyx-mcp              Start MCP server (stdio)
  onyx-mcp --help       Show this help

Environment:
  ONYX_EXPORT_PATH      Path to schwarzit-onyx-*.txt export file (optional if file is in cwd or package dir)
`);
    return;
  }

  const mcp = createOnyxMcpServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
