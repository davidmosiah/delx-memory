/**
 * Dual-format MCP tool response (no SDK type import — keeps lite path thin).
 */
export type ToolResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  // Allow MCP content union without pulling SDK types.
  content: Array<Record<string, unknown> & { type: string }>;
};

export function makeResponse<T>(payload: T): ToolResult {
  return {
    structuredContent: payload as Record<string, unknown>,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function makeError(message: string, extra?: Record<string, unknown>): ToolResult {
  const payload = { ok: false, error: message, ...(extra ?? {}) };
  return {
    isError: true,
    structuredContent: payload,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
