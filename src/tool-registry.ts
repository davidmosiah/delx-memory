import { z } from "zod";
import type { ToolResult } from "./format.js";

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type CatalogTool = {
  name: string;
  title: string;
  description: string;
  /** Zod raw shape (what MCP SDK registerTool expects as inputSchema). */
  inputShape: z.ZodRawShape | z.ZodTypeAny;
  annotations?: ToolAnnotations;
  handler: (rawInput: unknown) => Promise<ToolResult | Record<string, unknown>>;
};

const tools: CatalogTool[] = [];
let loaded = false;

export function resetToolCatalog(): void {
  tools.length = 0;
  loaded = false;
}

export function isCatalogLoaded(): boolean {
  return loaded;
}

export function markCatalogLoaded(): void {
  loaded = true;
}

export function addTool(tool: CatalogTool): void {
  if (tools.some((t) => t.name === tool.name)) {
    throw new Error(`duplicate tool: ${tool.name}`);
  }
  tools.push(tool);
}

export function getCatalogTools(): readonly CatalogTool[] {
  return tools;
}

export function getCatalogTool(name: string): CatalogTool | undefined {
  return tools.find((t) => t.name === name);
}

/** Build JSON Schema for tools/list from a catalog entry. */
export function toolInputJsonSchema(tool: CatalogTool): Record<string, unknown> {
  const shapeOrType = tool.inputShape as z.ZodTypeAny & { shape?: z.ZodRawShape };
  const schema =
    shapeOrType && typeof shapeOrType === "object" && "shape" in shapeOrType && shapeOrType.shape
      ? shapeOrType
      : z.object(tool.inputShape as z.ZodRawShape);
  try {
    const json = z.toJSONSchema(schema) as Record<string, unknown>;
    // MCP tools use draft-07-ish without $schema noise
    delete json.$schema;
    return json;
  } catch {
    return { type: "object", additionalProperties: true };
  }
}

/** Minimal server facade used to capture tools without the MCP SDK. */
export type ToolServerFacade = {
  registerTool: (
    name: string,
    config: {
      title?: string;
      description: string;
      inputSchema: z.ZodRawShape | z.ZodTypeAny;
      annotations?: ToolAnnotations;
    },
    handler: (rawInput: unknown) => Promise<ToolResult | Record<string, unknown>>,
  ) => void;
};


export function capturingServer(): ToolServerFacade {
  return {
    registerTool(name, config, handler) {
      addTool({
        name,
        title: config.title ?? name,
        description: config.description,
        inputShape: config.inputSchema,
        annotations: config.annotations,
        handler,
      });
    },
  };
}
