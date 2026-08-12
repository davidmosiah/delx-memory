import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const workDir = mkdtempSync(join(tmpdir(), "delx-memory-lite-"));
const dbPath = join(workDir, "db.sqlite");

const client = new Client({ name: "delx-memory-lite-smoke", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js", "--lite"],
  env: { ...process.env, DELX_MEMORY_PATH: dbPath },
});

await client.connect(transport);
try {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  assert.ok(names.includes("memory_set"));
  assert.ok(names.includes("memory_get"));
  assert.equal(names.length, 15, `expected 12 tools, got ${names.length}: ${names.join(",")}`);

  let r = await client.callTool({
    name: "memory_set",
    arguments: {
      key: "lite_pref",
      value: { ok: true },
      explicit_user_intent: true,
    },
  });
  assert.equal(r.structuredContent?.action, "created");

  r = await client.callTool({ name: "memory_get", arguments: { key: "lite_pref" } });
  assert.deepEqual(r.structuredContent?.value, { ok: true });

  r = await client.callTool({ name: "memory_stats", arguments: {} });
  assert.equal(r.structuredContent?.total_keys, 1);

  // Lite path has no resources
  const resources = await client.listResources();
  assert.equal(resources.resources?.length ?? 0, 0);

  console.log(JSON.stringify({ ok: true, suite: "smoke-lite", tools: names.length }));
} finally {
  await client.close().catch(() => undefined);
  rmSync(workDir, { recursive: true, force: true });
}
