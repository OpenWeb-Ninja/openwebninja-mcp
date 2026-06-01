import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Ajv, type ValidateFunction } from "ajv";
import { manifest, type ApiDef, type OperationDef } from "./lib/manifest.js";
import { descriptions } from "./lib/descriptions.js";
import { callOperation } from "./lib/client.js";
import { OwnApiError, toolError, toolResult } from "./lib/errors.js";

const ajv = new Ajv({ coerceTypes: true, useDefaults: true, allErrors: true, strict: false });

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

export function createServer(): Server {
  const server = new Server(
    { name: "openwebninja", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: manifest.apis.map((api) => ({
      name: api.id,
      description: buildToolDescription(api),
      inputSchema: buildInputSchema(api),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const raw = (req.params.arguments || {}) as Record<string, any>;

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
      if (e instanceof OwnApiError) return toolError(e.message);
      return toolError(`Unexpected error calling ${name}.${operation}: ${(e as Error).message}`);
    }
  });

  return server;
}
