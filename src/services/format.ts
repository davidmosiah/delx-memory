import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Build the dual-format MCP response: structuredContent for machine readers
 * + a content[] text block for human-facing clients that ignore structured.
 */
export function makeResponse<T>(payload: T): CallToolResult {
  return {
    structuredContent: payload as Record<string, unknown>,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function makeError(message: string, extra?: Record<string, unknown>): CallToolResult {
  const payload = { ok: false, error: message, ...(extra ?? {}) };
  return {
    isError: true,
    structuredContent: payload,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
