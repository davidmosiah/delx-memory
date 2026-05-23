import { existsSync, statSync } from "node:fs";
import { SERVER_NAME, SERVER_VERSION, PINNED_NPM_PACKAGE } from "../constants.js";
import { resolveDbPath, getDbSizeBytes, getDb, sweepExpired } from "../services/db.js";

export async function runCliCommand(args: string[]): Promise<number | undefined> {
  const [command, ...rest] = args;
  if (!command || command === "--http") return undefined;
  if (command === "setup") return runSetup(rest);
  if (command === "doctor" || command === "status") return runDoctor(rest);
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(SERVER_VERSION);
    return 0;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (!command.startsWith("--")) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }
  return undefined;
}

function runSetup(args: string[]): number {
  const json = args.includes("--json");
  const path = resolveDbPath();
  const env = process.env.DELX_MEMORY_PATH ? "DELX_MEMORY_PATH env override" : "default";
  // Force creation by opening + sweep + close.
  const db = getDb();
  sweepExpired();
  const exists = existsSync(path);
  const result = {
    ok: true,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    db_path: path,
    db_path_source: env,
    db_exists: exists,
    db_size_bytes: getDbSizeBytes(),
    mcp_clients: {
      claude_desktop: `Add to ~/Library/Application Support/Claude/claude_desktop_config.json:\n${exampleClaudeDesktop()}`,
      cursor: `Add to ~/.cursor/mcp.json:\n${exampleCursor()}`,
      hermes: `Add to ~/.hermes/config.json mcp_servers section:\n${exampleHermes()}`,
    },
    note: "delx-memory rejects credential-shaped keys and values. Use a system keychain for secrets.",
  };
  void db;
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${SERVER_NAME} ${SERVER_VERSION}`);
    console.log(`DB path: ${path}`);
    console.log(`DB exists: ${exists}`);
    console.log(`DB size: ${result.db_size_bytes} bytes`);
    console.log("");
    console.log("MCP client snippets:");
    console.log("  Claude Desktop: see examples/claude-desktop.json");
    console.log("  Cursor:         see examples/cursor.json");
    console.log("  Hermes:         see examples/hermes.md");
    console.log("  OpenClaw:       see examples/openclaw.md");
    console.log("  Codex:          see examples/codex.toml");
  }
  return 0;
}

async function runDoctor(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const path = resolveDbPath();
  const checks = {
    node_version: process.version,
    node_supported: Number(process.version.replace("v", "").split(".")[0]) >= 20,
    db_path: path,
    db_exists: existsSync(path),
    db_writable: false as boolean,
    permissions_ok: true as boolean,
  };
  try {
    const db = getDb();
    sweepExpired();
    db.prepare("SELECT 1").get();
    checks.db_writable = true;
  } catch {
    checks.db_writable = false;
  }
  // Permissions
  if (checks.db_exists) {
    try {
      const mode = statSync(path).mode & 0o777;
      checks.permissions_ok = (mode & 0o077) === 0; // no group/world bits
    } catch {
      checks.permissions_ok = false;
    }
  }
  const ok = checks.node_supported && checks.db_writable && checks.permissions_ok;
  const result = {
    ok,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    npm_package: PINNED_NPM_PACKAGE,
    checks,
    next_steps: ok
      ? ["Memory store is ready. Restart your MCP client if you just installed.", "Try memory_stats to verify the connection."]
      : [
          !checks.node_supported && "Upgrade to Node 20+",
          !checks.db_writable && `Cannot write to ${path}. Check disk permissions or DELX_MEMORY_PATH.`,
          !checks.permissions_ok && `${path} has group/world-readable bits. chmod 600 it.`,
        ].filter(Boolean) as string[],
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const mark = (b: boolean) => (b ? "ok" : "FAIL");
    console.log(`${SERVER_NAME} ${SERVER_VERSION} · doctor`);
    console.log(`Status: ${ok ? "READY" : "NEEDS ATTENTION"}`);
    console.log("");
    console.log(`  ${mark(checks.node_supported)}  Node.js >=20 (${checks.node_version})`);
    console.log(`  ${mark(checks.db_writable)}    DB writable (${path})`);
    console.log(`  ${mark(checks.permissions_ok)} DB permissions (0600)`);
    console.log("");
    result.next_steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }
  return strict && !ok ? 1 : 0;
}

function exampleClaudeDesktop(): string {
  return JSON.stringify(
    {
      mcpServers: {
        "delx-memory": {
          command: "npx",
          args: ["-y", "delx-memory"],
        },
      },
    },
    null,
    2,
  );
}

function exampleCursor(): string {
  return JSON.stringify(
    {
      mcpServers: {
        "delx-memory": {
          command: "npx",
          args: ["-y", "delx-memory"],
        },
      },
    },
    null,
    2,
  );
}

function exampleHermes(): string {
  return JSON.stringify(
    {
      "delx-memory": {
        command: "npx",
        args: ["-y", "delx-memory"],
        transport: "stdio",
      },
    },
    null,
    2,
  );
}

function printHelp(): void {
  console.log(`delx-memory — local-first persistent memory MCP server

Usage:
  delx-memory                Start MCP stdio server
  delx-memory --http         Start local HTTP MCP server (127.0.0.1:3030 by default)
  delx-memory setup          Print MCP client config snippets
  delx-memory setup --json   Print as JSON
  delx-memory doctor         Check setup
  delx-memory doctor --json  Check setup as JSON
  delx-memory version        Print version

Environment:
  DELX_MEMORY_PATH           Override default ~/.delx-memory/db.sqlite
  DELX_MEMORY_HOST           HTTP host (default 127.0.0.1)
  DELX_MEMORY_PORT           HTTP port (default 3030)
  DELX_MEMORY_ALLOWED_ORIGIN CORS origin (default http://HOST:PORT)
  DELX_MEMORY_TRANSPORT      stdio | http (default stdio)
`);
}
