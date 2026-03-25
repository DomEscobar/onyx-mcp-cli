#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOnyxMcpServer } from "./server.js";

async function main(): Promise<void> {
  const mcp = createOnyxMcpServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
