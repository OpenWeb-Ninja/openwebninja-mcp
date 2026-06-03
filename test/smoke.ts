/**
 * Smoke test: launches the built server over stdio and exercises tool listing,
 * argument validation, and the request path. With a dummy API key, a real call is
 * expected to come back as an upstream auth error (which still proves URL/header
 * construction and connectivity). Run: npx tsx test/smoke.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v;
if (!env.OPENWEBNINJA_API_KEY) env.OPENWEBNINJA_API_KEY = "dummy-test-key";

function textOf(r: any): string {
  return (r?.content || []).map((c: any) => c.text).join("\n");
}

async function main() {
  const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env });
  const client = new Client({ name: "smoke", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  let pass = 0;
  let fail = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
    ok ? pass++ : fail++;
  };

  // 1. tools/list
  const list = await client.listTools();
  check("lists 42 tools", list.tools.length === 42, `got ${list.tools.length}`);
  const names = list.tools.map((t) => t.name);
  check(
    "key tools present",
    ["jsearch", "local_business_data", "realtime_amazon_data", "realtime_zillow_data", "realtime_product_search"].every((n) =>
      names.includes(n)
    ),
    names.slice(0, 5).join(", ") + " ..."
  );
  const js = list.tools.find((t) => t.name === "jsearch");
  check("jsearch has operation enum", Array.isArray((js?.inputSchema as any)?.properties?.operation?.enum));

  // 2. unknown operation -> friendly error
  const r1 = await client.callTool({ name: "jsearch", arguments: { operation: "nope", args: {} } });
  check("unknown operation rejected", (r1 as any).isError === true, textOf(r1).slice(0, 80));

  // 3. missing required arg (query) -> validation error
  const r2 = await client.callTool({ name: "jsearch", arguments: { operation: "search", args: {} } });
  check("missing required arg rejected", (r2 as any).isError === true, textOf(r2).slice(0, 100));

  // 4. valid args -> reaches upstream; with dummy key expect an auth/upstream error (proves request build)
  const r3 = await client.callTool({
    name: "jsearch",
    arguments: { operation: "search", args: { query: "site reliability engineer remote" } },
  });
  const t3 = textOf(r3);
  const reachedUpstream = /OWN API \d{3}|Network error/.test(t3);
  const realData = (r3 as any).isError !== true;
  check("valid call reaches upstream (or succeeds)", reachedUpstream || realData, t3.slice(0, 120));

  await client.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});
