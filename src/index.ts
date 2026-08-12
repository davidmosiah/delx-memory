#!/usr/bin/env node
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { runCliCommand } from "./cli/commands.js";

const args = new Set(process.argv.slice(2));
let cliResult: number | undefined;

try {
  cliResult = await runCliCommand(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${(error as Error).message}`);
  process.exitCode = 1;
}

function resolveTransport(): "lite" | "sdk" | "http" {
  if (args.has("--http") || process.env.DELX_MEMORY_TRANSPORT === "http") return "http";
  if (args.has("--sdk") || process.env.DELX_MEMORY_TRANSPORT === "sdk") return "sdk";
  if (args.has("--lite") || process.env.DELX_MEMORY_TRANSPORT === "lite") return "lite";
  // Default: lite stdio (tools-only, no MCP SDK load) — lowest RSS for always-on agents.
  // Full prompts/resources: DELX_MEMORY_TRANSPORT=sdk or --sdk.
  const env = process.env.DELX_MEMORY_TRANSPORT;
  if (env === "stdio") return "lite"; // stdio alias → lite
  return "lite";
}

if (cliResult !== undefined) {
  process.exitCode = cliResult;
} else if (process.exitCode === undefined) {
  const mode = resolveTransport();
  if (mode === "http") {
    const { createSdkServer } = await import("./sdk-stdio.js");
    const { runHttp } = await import("./http-server.js");
    await runHttp(() => createSdkServer());
  } else if (mode === "sdk") {
    const { runSdkStdio } = await import("./sdk-stdio.js");
    await runSdkStdio();
  } else {
    const { runLiteStdio } = await import("./lite-stdio.js");
    await runLiteStdio();
  }
}

void SERVER_NAME;
void SERVER_VERSION;
