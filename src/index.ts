#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP protocol channel; all logging must go to stderr.
  console.error("openwebninja-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting openwebninja-mcp:", err);
  process.exit(1);
});
