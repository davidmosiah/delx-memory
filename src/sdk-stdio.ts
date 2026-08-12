import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerMemoryTools } from "./tools/memory-tools.js";
import { registerMemoryPrompts } from "./prompts/memory-prompts.js";
import { registerMemoryResources } from "./resources/memory-resources.js";

export function createSdkServer(options?: { lean?: boolean }): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerMemoryTools(server as unknown as import("./tool-registry.js").ToolServerFacade);
  const lean =
    options?.lean === true ||
    process.env.DELX_MEMORY_LEAN === "1" ||
    process.env.DELX_MEMORY_LEAN === "true" ||
    process.argv.includes("--lean");
  if (!lean) {
    registerMemoryPrompts(server);
    registerMemoryResources(server);
  }
  return server;
}

export async function runSdkStdio(): Promise<void> {
  const server = createSdkServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
