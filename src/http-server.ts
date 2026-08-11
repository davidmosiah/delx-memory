import cors from "cors";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";

export type CreateServerFn = () => McpServer;

/**
 * HTTP transport is optional and only loaded when --http / DELX_MEMORY_TRANSPORT=http.
 * Keeping this module separate lets the default stdio path avoid paying for Express/CORS
 * at process start (see issue #7 lightweight discussion).
 */
export async function runHttp(createServer: CreateServerFn): Promise<void> {
  const app = express();
  const host = process.env.DELX_MEMORY_HOST ?? "127.0.0.1";
  const port = Number(process.env.DELX_MEMORY_PORT ?? 3030);
  const allowedOrigin = process.env.DELX_MEMORY_ALLOWED_ORIGIN ?? `http://${host}:${port}`;

  app.use(express.json({ limit: "1mb" }));
  app.use(cors({ origin: allowedOrigin }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION });
  });

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP HTTP request failed:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  app.listen(port, host, () => {
    console.error(`${SERVER_NAME} HTTP transport listening on http://${host}:${port}/mcp`);
  });
}
