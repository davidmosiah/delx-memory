/**
 * Minimal MCP stdio transport — tools only, no @modelcontextprotocol/sdk load.
 * Framing: newline-delimited JSON-RPC (same as MCP SDK StdioServerTransport).
 *
 * Default for stdio. Full prompts/resources: --sdk / DELX_MEMORY_TRANSPORT=sdk.
 */
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { ensureToolCatalog, listCatalogTools } from "./catalog.js";
import { getCatalogTool, toolInputJsonSchema } from "./tool-registry.js";

type JsonRpcId = string | number | null;
type JsonRpcReq = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

function writeMessage(msg: unknown): void {
  // MCP SDK serializeMessage: JSON.stringify(message) + "\n"
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function ok(id: JsonRpcId, result: unknown): void {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function err(id: JsonRpcId, code: number, message: string): void {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg: JsonRpcReq): Promise<void> {
  const id = (msg.id === undefined ? null : msg.id) as JsonRpcId;
  const method = msg.method ?? "";
  const params = (msg.params ?? {}) as Record<string, unknown>;

  if (process.env.DELX_MEMORY_LITE_DEBUG === "1") {
    console.error("[lite]", method, "id=", msg.id);
  }

  // notifications (no response)
  if (msg.id === undefined) {
    return;
  }

  try {
    if (method === "initialize") {
      const clientProto = String(params.protocolVersion ?? "2024-11-05");
      ok(id, {
        protocolVersion: clientProto,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    }

    if (method === "ping") {
      ok(id, {});
      return;
    }

    if (method === "tools/list") {
      ensureToolCatalog();
      const tools = listCatalogTools().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: toolInputJsonSchema(t),
        annotations: t.annotations,
      }));
      ok(id, { tools });
      return;
    }

    if (method === "tools/call") {
      ensureToolCatalog();
      const name = String(params.name ?? "");
      const args = params.arguments ?? {};
      const tool = getCatalogTool(name);
      if (!tool) {
        err(id, -32601, `Unknown tool: ${name}`);
        return;
      }
      const result = await tool.handler(args);
      ok(id, {
        content: result.content,
        structuredContent: result.structuredContent,
        isError: result.isError === true ? true : undefined,
      });
      return;
    }

    if (method === "prompts/list") {
      ok(id, { prompts: [] });
      return;
    }
    if (method === "resources/list") {
      ok(id, { resources: [] });
      return;
    }
    if (method === "resources/templates/list") {
      ok(id, { resourceTemplates: [] });
      return;
    }

    err(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    err(id, -32603, (e as Error).message || "Internal error");
  }
}

export async function runLiteStdio(): Promise<void> {
  ensureToolCatalog();

  let buffer = "";
  let chain: Promise<void> = Promise.resolve();

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string | Buffer) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    // Process complete lines serially
    chain = chain.then(async () => {
      while (true) {
        const idx = buffer.indexOf("\n");
        if (idx === -1) break;
        const line = buffer.slice(0, idx).replace(/\r$/, "").trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg: JsonRpcReq;
        try {
          msg = JSON.parse(line) as JsonRpcReq;
        } catch {
          continue;
        }
        await handle(msg);
      }
    });
  });
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();

  await new Promise(() => {
    /* stdin handlers own lifetime */
  });
}
