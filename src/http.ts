import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

/**
 * Streamable HTTP transport (MCP spec 2025-03-26+), for running the server as a network
 * service (e.g. in a Docker container). Stateless: every POST gets its own Server +
 * transport, so no session state is kept and any replica can serve any request. That fits
 * this server, which is a pure request/response proxy with no server-initiated messages.
 *
 * Env:
 *   PORT            listen port (default 3000)
 *   HOST            listen address (default 0.0.0.0)
 *   MCP_AUTH_TOKEN  if set, every /mcp request must send "Authorization: Bearer <token>".
 *                   Strongly recommended: the server spends the OPENWEBNINJA_API_KEY it holds.
 */

const MCP_PATH = "/mcp";

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function isAuthorized(req: IncomingMessage, tokenHash: Buffer | null): boolean {
  if (!tokenHash) return true;
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  // Compare fixed-length digests so the comparison is constant-time regardless of input length.
  return timingSafeEqual(sha256(match[1].trim()), tokenHash);
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

async function handleMcp(req: IncomingMessage, res: ServerResponse) {
  // Stateless mode: no standalone SSE stream (GET) and no sessions to terminate (DELETE).
  if (req.method !== "POST") {
    sendJsonRpcError(res, 405, "Method not allowed.", { Allow: "POST" });
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) sendJsonRpcError(res, 500, "Internal server error.");
  }
}

export async function startHttpServer(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  const tokenHash = token ? sha256(token) : null;

  if (!tokenHash) {
    console.error(
      "WARNING: MCP_AUTH_TOKEN is not set; the /mcp endpoint is open to anyone who can reach it " +
        "and will spend this server's OPENWEBNINJA_API_KEY."
    );
  }
  if (!process.env.OPENWEBNINJA_API_KEY) {
    console.error("WARNING: OPENWEBNINJA_API_KEY is not set; tool calls will fail until it is.");
  }

  const httpServer = createHttpServer((req, res) => {
    const path = (req.url || "/").split("?")[0];

    if (path === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (path !== MCP_PATH) {
      sendJsonRpcError(res, 404, "Not found. The MCP endpoint is " + MCP_PATH + ".");
      return;
    }

    if (!isAuthorized(req, tokenHash)) {
      sendJsonRpcError(res, 401, "Unauthorized.", { "WWW-Authenticate": "Bearer" });
      return;
    }

    void handleMcp(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });
  console.error(`openwebninja-mcp listening on http://${host}:${port}${MCP_PATH}`);

  const shutdown = (signal: string) => {
    console.error(`Received ${signal}, shutting down.`);
    httpServer.close(() => process.exit(0));
    // Don't hang on keep-alive connections.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
