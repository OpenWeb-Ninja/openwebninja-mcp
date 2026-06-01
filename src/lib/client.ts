import { OwnApiError } from "./errors.js";
import type { OperationDef } from "./manifest.js";

const DEFAULT_HOST = "https://api.openwebninja.com";

function apiKey(): string {
  const key = process.env.OPENWEBNINJA_API_KEY;
  if (!key) {
    throw new OwnApiError(
      "OPENWEBNINJA_API_KEY is not set. Get a key at https://www.openwebninja.com and set it in your MCP client config (env)."
    );
  }
  return key;
}

function root(): string {
  return (process.env.OPENWEBNINJA_BASE_URL || DEFAULT_HOST).replace(/\/$/, "");
}

/** Call an OWN API operation. `args` has already been validated/coerced against the op schema. */
export async function callOperation(
  basePath: string,
  op: OperationDef,
  args: Record<string, any>
): Promise<unknown> {
  let p = op.path;
  for (const name of op.pathParams) {
    if (args[name] === undefined) throw new OwnApiError(`Missing required path parameter "${name}".`);
    p = p.replace(`{${name}}`, encodeURIComponent(String(args[name])));
  }

  const url = new URL(root() + basePath + p);
  for (const name of op.queryParams) {
    const v = args[name];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(name, String(item));
    } else if (typeof v === "object") {
      url.searchParams.set(name, JSON.stringify(v));
    } else {
      url.searchParams.set(name, String(v));
    }
  }

  const headers: Record<string, string> = {
    "x-api-key": apiKey(),
    Accept: "application/json",
    "User-Agent": "openwebninja-mcp",
  };

  let body: string | undefined;
  const hasBody = ["POST", "PUT", "PATCH"].includes(op.method);
  if (hasBody) {
    const payload: Record<string, any> = {};
    for (const name of op.bodyParams) {
      if (args[name] !== undefined) payload[name] = args[name];
    }
    body = JSON.stringify(payload);
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url, { method: op.method, headers, body });
  } catch (e: any) {
    throw new OwnApiError(`Network error calling ${url.pathname}: ${e?.message || e}`);
  }

  const raw = await res.text();
  let parsed: any;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = raw;
  }

  if (!res.ok) {
    const detail =
      (parsed && (parsed.error?.message || parsed.error || parsed.message)) ||
      (typeof parsed === "string" ? parsed.slice(0, 300) : "") ||
      res.statusText;
    throw new OwnApiError(`OWN API ${res.status}: ${detail}`, res.status);
  }

  // OWN responses use a { status, request_id, data, cursor } envelope. Surface the
  // useful parts and drop the echoed request parameters to keep the payload lean.
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    const out: Record<string, any> = { data: parsed.data };
    if (parsed.request_id) out.request_id = parsed.request_id;
    if (parsed.cursor) out.cursor = parsed.cursor;
    return out;
  }
  return parsed;
}
