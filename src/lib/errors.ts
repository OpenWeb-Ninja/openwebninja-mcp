/** Error raised when an OWN API call fails (network, auth, or upstream non-2xx). */
export class OwnApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "OwnApiError";
  }
}

/** Wrap a message as an MCP tool error result an LLM can read and recover from. */
export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

/** Wrap a successful payload as an MCP tool result. */
export function toolResult(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
  };
}
