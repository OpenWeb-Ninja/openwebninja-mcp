/**
 * Reads every OpenAPI spec in openapi-cache/ and emits src/generated/manifest.json:
 * one entry per API product, each with its operations, JSON Schemas, and the
 * query/path/body routing the runtime client needs. Specs are the source of truth
 * (synced from s3://openwebninja/portal/openapi/). js-yaml parses both YAML and JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

type AnyObj = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "openapi-cache");
const OUT_DIR = path.join(ROOT, "src", "generated");
const OUT = path.join(OUT_DIR, "manifest.ts");

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"];
const DEFAULT_HOST = "https://api.openwebninja.com";

// realtime_product_search.yaml is the legacy v1 (paths suffixed `-v2`); the clean
// v2 surface lives in realtime_product_search-v2.yaml. Both declare the same server
// slug, so exposing both would collide on tool id. We ship v2 only.
//
// Bundle products (e-commerce / real-estate / jobs) are intentionally excluded: they
// only re-expose endpoints already covered by the individual API tools, so shipping
// them would be redundant and would muddy tool selection (decision: 2026-06-22 sync).
const SKIP_FILES = new Set([
  "realtime_product_search.yaml",
  "realtime_ecommerce_data.yaml",
  "realtime_real_estate_data.yaml",
  "realtime_jobs_data.yaml",
]);

const warnings: string[] = [];

function deref(node: any, root: AnyObj, seen: Set<string> = new Set()): any {
  if (Array.isArray(node)) return node.map((n) => deref(n, root, seen));
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
      if (seen.has(node.$ref)) return {};
      const target = node.$ref
        .slice(2)
        .split("/")
        .reduce(
          (o: any, k: string) =>
            o ? o[decodeURIComponent(k.replace(/~1/g, "/").replace(/~0/g, "~"))] : undefined,
          root
        );
      const next = new Set(seen);
      next.add(node.$ref);
      return deref(target ?? {}, root, next);
    }
    const out: AnyObj = {};
    for (const [k, v] of Object.entries(node)) out[k] = deref(v, root, seen);
    return out;
  }
  return node;
}

function opNameFromPath(p: string): string {
  return p
    .replace(/^\//, "")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/[\/-]/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function cleanTitle(t: string | undefined): string {
  return (t || "").replace(/\s+Documentation\s*$/i, "").trim();
}

function buildOperation(method: string, p: string, op: AnyObj, pathLevelParams: any[]) {
  const properties: AnyObj = {};
  const required: string[] = [];
  const queryParams: string[] = [];
  const pathParams: string[] = [];
  const bodyParams: string[] = [];

  const allParams = [...(pathLevelParams || []), ...((op.parameters as any[]) || [])];
  for (const param of allParams) {
    if (!param || !param.name) continue;
    const schema: AnyObj = { ...(param.schema || { type: "string" }) };
    if (param.description && !schema.description) schema.description = param.description;
    properties[param.name] = schema;
    if (param.required) required.push(param.name);
    if (param.in === "path") pathParams.push(param.name);
    else if (param.in === "query") queryParams.push(param.name);
  }

  const hasBody = ["post", "put", "patch"].includes(method);
  if (hasBody && op.requestBody) {
    const json = op.requestBody.content && op.requestBody.content["application/json"];
    const bodySchema = json && json.schema;
    if (bodySchema && bodySchema.type === "object" && bodySchema.properties) {
      for (const [k, v] of Object.entries(bodySchema.properties)) {
        properties[k] = v as AnyObj;
        bodyParams.push(k);
      }
      for (const r of (bodySchema.required as string[]) || []) {
        if (!required.includes(r)) required.push(r);
      }
    } else if (bodySchema) {
      warnings.push(`${p} [${method}]: non-object request body — not mapped`);
    }
  }

  const inputSchema: AnyObj = { type: "object", properties };
  if (required.length) inputSchema.required = required;

  return {
    method: method.toUpperCase(),
    path: p,
    summary: op.summary || op.operationId || "",
    description: typeof op.description === "string" ? op.description.slice(0, 600) : "",
    pathParams,
    queryParams,
    bodyParams,
    inputSchema,
  };
}

function main() {
  const files = fs
    .readdirSync(CACHE)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".json"))
    .sort();

  const apis: AnyObj[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    if (SKIP_FILES.has(file)) continue;
    let doc: AnyObj;
    try {
      doc = yaml.load(fs.readFileSync(path.join(CACHE, file), "utf8")) as AnyObj;
    } catch (e: any) {
      warnings.push(`${file}: parse failed — ${e.message.split("\n")[0]}`);
      continue;
    }
    if (!doc || typeof doc !== "object" || !doc.paths) {
      warnings.push(`${file}: no paths`);
      continue;
    }
    doc = deref(doc, doc);

    const serverUrl: string = (doc.servers && doc.servers[0] && doc.servers[0].url) || "";
    if (!serverUrl) {
      warnings.push(`${file}: missing servers[0].url — skipped`);
      continue;
    }
    if (!serverUrl.includes("api.openwebninja.com")) {
      warnings.push(`${file}: non-OWN server url "${serverUrl}"`);
    }
    let basePath = "";
    try {
      basePath = new URL(serverUrl).pathname.replace(/\/$/, "");
    } catch {
      basePath = serverUrl.replace(DEFAULT_HOST, "");
    }
    const slug = basePath.replace(/^\//, "");
    const id = slug.replace(/-/g, "_");

    const operations: AnyObj = {};
    for (const [p, methodsRaw] of Object.entries(doc.paths)) {
      const methods = methodsRaw as AnyObj;
      const pathLevelParams = (methods.parameters as any[]) || [];
      for (const method of Object.keys(methods)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        const op = methods[method] as AnyObj;
        let name = opNameFromPath(p);
        if (operations[name]) name = `${name}_${method.toLowerCase()}`;
        operations[name] = buildOperation(method.toLowerCase(), p, op, pathLevelParams);
      }
    }

    if (Object.keys(operations).length === 0) {
      warnings.push(`${file}: zero operations — skipped`);
      continue;
    }

    if (seenIds.has(id)) {
      warnings.push(`${file}: duplicate tool id "${id}" — skipped (add to SKIP_FILES to silence)`);
      continue;
    }
    seenIds.add(id);

    apis.push({
      id,
      slug,
      basePath,
      title: cleanTitle(doc.info && doc.info.title) || id,
      version: (doc.info && doc.info.version) || "",
      description:
        typeof (doc.info && doc.info.description) === "string"
          ? doc.info.description.split("\n")[0].slice(0, 300)
          : "",
      operations,
    });
  }

  apis.sort((a, b) => a.id.localeCompare(b.id));

  const manifest = {
    generatedAt: new Date().toISOString(),
    defaultHost: DEFAULT_HOST,
    apiCount: apis.length,
    operationCount: apis.reduce((n, a) => n + Object.keys(a.operations).length, 0),
    apis,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const banner = "// AUTO-GENERATED by scripts/generate.ts — do not edit by hand. Run `npm run generate`.\n";
  fs.writeFileSync(OUT, `${banner}const manifest: any = ${JSON.stringify(manifest, null, 2)};\nexport default manifest;\n`);

  console.log(`Wrote ${OUT}`);
  console.log(`  APIs: ${manifest.apiCount}   operations: ${manifest.operationCount}`);
  if (warnings.length) {
    console.log(`\nLint (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main();
