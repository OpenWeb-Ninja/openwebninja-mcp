#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { startHttpServer } from "./http.js";

// MCP_TRANSPORT=http (or --http) serves Streamable HTTP on PORT; the default stays stdio so
// existing `npx @openwebninja/mcp-server` client configs keep working unchanged.
function wantsHttp(): boolean {
  return process.argv.includes("--http") || (process.env.MCP_TRANSPORT || "").toLowerCase() === "http";
}

async function main() {
  if (wantsHttp()) {
    await startHttpServer();
    return;
  }
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
