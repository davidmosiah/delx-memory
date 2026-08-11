#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { runCliCommand } from "./cli/commands.js";
import { registerMemoryResources } from "./resources/memory-resources.js";
import { registerMemoryPrompts } from "./prompts/memory-prompts.js";
import { registerMemoryTools } from "./tools/memory-tools.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerMemoryTools(server);
  // Lean profile: tools-only (skip prompts/resources) for smaller surface when requested.
  const lean =
    process.env.DELX_MEMORY_LEAN === "1" ||
    process.env.DELX_MEMORY_LEAN === "true" ||
    process.argv.includes("--lean");
  if (!lean) {
    registerMemoryPrompts(server);
    registerMemoryResources(server);
  }
  return server;
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const args = new Set(process.argv.slice(2));
let cliResult: number | undefined;

try {
  cliResult = await runCliCommand(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${(error as Error).message}`);
  process.exitCode = 1;
}

if (cliResult !== undefined) {
  process.exitCode = cliResult;
} else if (process.exitCode === undefined) {
  const transport = process.env.DELX_MEMORY_TRANSPORT ?? (args.has("--http") ? "http" : "stdio");
  if (transport === "http") {
    // Dynamic import so stdio boot does not load express/cors.
    const { runHttp } = await import("./http-server.js");
    await runHttp(createServer);
  } else {
    await runStdio();
  }
}
