import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Ajv, type ValidateFunction } from "ajv";
import { manifest, type ApiDef, type OperationDef } from "./lib/manifest.js";
import { descriptions } from "./lib/descriptions.js";
import { callOperation, subscribeFree } from "./lib/client.js";
import { OwnApiError, toolError, toolResult } from "./lib/errors.js";

// useDefaults is OFF: these tools are passthrough proxies and several OpenAPI specs carry
// empty-string defaults on optional params. Injecting them would send invalid values
// (e.g. arrival_time="", max_hoa_fee="") that the upstream APIs reject. Omitted params are
// left out so each API applies its own server-side default.
const ajv = new Ajv({ coerceTypes: true, useDefaults: false, allErrors: true, strict: false });

const apiById = new Map<string, ApiDef>(manifest.apis.map((a) => [a.id, a]));
const validators = new Map<string, ValidateFunction>();
const PASS: ValidateFunction = Object.assign(() => true, { errors: null }) as any;

function getValidator(apiId: string, opName: string, op: OperationDef): ValidateFunction {
  const key = `${apiId}.${opName}`;
  const cached = validators.get(key);
  if (cached) return cached;
  let v: ValidateFunction;
  try {
    v = ajv.compile(op.inputSchema);
  } catch {
    v = PASS; // schema Ajv can't compile: skip local validation, let upstream validate
  }
  validators.set(key, v);
  return v;
}

function buildToolDescription(api: ApiDef): string {
  const hint = descriptions[api.id];
  const summary = hint?.summary || api.description || api.title;
  const lines: string[] = [
    summary,
    "",
    'Operations (set "operation" to one of these; put its parameters in "args"):',
  ];
  for (const [opName, op] of Object.entries(api.operations)) {
    const req = (op.inputSchema.required || []) as string[];
    const reqStr = req.length ? `required: ${req.join(", ")}` : "no required params";
    lines.push(`- ${opName} (${reqStr})${op.summary ? ": " + op.summary : ""}`);
  }
  if (hint?.whenToUse) {
    lines.push("", `When to use: ${hint.whenToUse}`);
  }
  return lines.join("\n");
}

function buildInputSchema(api: ApiDef) {
  return {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: Object.keys(api.operations),
        description: "Which endpoint to call. See the tool description for each operation and its parameters.",
      },
      args: {
        type: "object",
        description: "Parameters for the chosen operation as key/value pairs (see the tool description for required params).",
        additionalProperties: true,
      },
    },
    required: ["operation"],
  };
}

const SUBSCRIBE_TOOL = {
  name: "subscribe",
  description:
    "Subscribe the current OpenWeb Ninja API key to an API's free (BASIC) tier so that API's tool can be used. " +
    'Call this when another tool returns a subscription/entitlement error: HTTP 401/403, or a 429 "Too Many Requests" when you have not subscribed to that API yet. ' +
    'Pass api_id = the name of the tool you want to use (e.g. "realtime_image_search"). ' +
    "Free tier only: it never incurs charges and will not alter an existing paid subscription. After it succeeds, wait a few seconds for it to take effect, then retry the original tool.",
  inputSchema: {
    type: "object",
    properties: {
      api_id: {
        type: "string",
        description: 'The id of the API/tool to subscribe to (same as the tool name, e.g. "jsearch").',
      },
    },
    required: ["api_id"],
  },
};

export function createServer(): Server {
  const server = new Server(
    { name: "openwebninja", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...manifest.apis.map((api) => ({
        name: api.id,
        description: buildToolDescription(api),
        inputSchema: buildInputSchema(api),
      })),
      SUBSCRIBE_TOOL,
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const raw = (req.params.arguments || {}) as Record<string, any>;

    if (name === "subscribe") {
      const apiId = raw.api_id as string | undefined;
      if (!apiId) {
        return toolError('Missing "api_id" for subscribe. Pass the id of the API/tool to subscribe to.');
      }
      try {
        const result = await subscribeFree(apiId);
        return toolResult({ subscribed: apiId, result });
      } catch (e) {
        return toolError(
          e instanceof OwnApiError
            ? `Subscribe to "${apiId}" failed: ${e.message}`
            : `Subscribe to "${apiId}" failed: ${(e as Error).message}`
        );
      }
    }

    const api = apiById.get(name);
    if (!api) return toolError(`Unknown tool "${name}".`);

    const operation = raw.operation as string | undefined;
    const opArgs = (raw.args || {}) as Record<string, any>;
    const opList = Object.keys(api.operations).join(", ");

    if (!operation) {
      return toolError(`Missing "operation" for ${name}. Valid operations: ${opList}.`);
    }
    const op = api.operations[operation];
    if (!op) {
      return toolError(`Unknown operation "${operation}" for ${name}. Valid operations: ${opList}.`);
    }

    const validate = getValidator(name, operation, op);
    if (!validate(opArgs)) {
      const errs = (validate.errors || [])
        .map((e) => `${e.instancePath || "(root)"} ${e.message}`)
        .join("; ");
      return toolError(`Invalid args for ${name}.${operation}: ${errs}`);
    }

    try {
      const result = await callOperation(api.basePath, op, opArgs);
      return toolResult(result);
    } catch (e) {
      if (e instanceof OwnApiError) {
        if (e.status && [401, 402, 403, 429].includes(e.status)) {
          return toolError(
            `${e.message}\n\nThis looks like a subscription/entitlement issue for "${name}". ` +
              `If you have not subscribed to this API yet, call the "subscribe" tool with api_id="${name}", wait a few seconds for it to take effect, then retry this call. ` +
              `(If you are already subscribed, a 429 means you are being rate-limited; wait briefly and retry.)`
          );
        }
        return toolError(e.message);
      }
      return toolError(`Unexpected error calling ${name}.${operation}: ${(e as Error).message}`);
    }
  });

  return server;
}
