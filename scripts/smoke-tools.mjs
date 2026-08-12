import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expectedTools = [
  "memory_agent_manifest",
  "memory_connection_status",
  "memory_data_inventory",
  "memory_capabilities",
  "memory_get",
  "memory_list",
  "memory_search",
  "memory_stats",
  "memory_set",
  "memory_forget",
  "memory_forget_by_tag",
  "memory_export",
].sort();

const workDir = mkdtempSync(join(tmpdir(), "delx-memory-smoke-"));
const dbPath = join(workDir, "db.sqlite");

const client = new Client({ name: "delx-memory-smoke", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js", "--sdk"],
  env: {
    ...process.env,
    DELX_MEMORY_PATH: dbPath,
  },
});

await client.connect(transport);
try {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  assert.deepEqual(names, expectedTools, `tools mismatch: ${names.join(",")}`);

  // discovery surface
  let r = await client.callTool({ name: "memory_agent_manifest", arguments: {} });
  assert.ok(Array.isArray(r.structuredContent?.recommended_first_calls));
  r = await client.callTool({ name: "memory_connection_status", arguments: {} });
  assert.equal(r.structuredContent?.ok, true);
  assert.equal(r.structuredContent?.db_path, dbPath);
  r = await client.callTool({ name: "memory_data_inventory", arguments: {} });
  assert.equal(r.structuredContent?.kind, "data_inventory");
  r = await client.callTool({ name: "memory_capabilities", arguments: {} });
  assert.equal(r.structuredContent?.unofficial, true);
  const resources = await client.listResources();
  assert.ok(resources.resources?.length >= 3, "expected agent-facing resources");

  // stats on empty
  r = await client.callTool({ name: "memory_stats", arguments: {} });
  assert.equal(r.structuredContent?.total_keys, 0, "expected empty store");
  assert.equal(r.structuredContent?.db_path, dbPath);

  // set
  r = await client.callTool({
    name: "memory_set",
    arguments: {
      key: "user_preferences",
      value: { language: "pt-BR", verbosity: "concise" },
      tags: ["profile", "preferences"],
      explicit_user_intent: true,
    },
  });
  assert.equal(r.structuredContent?.action, "created");
  assert.equal(r.structuredContent?.key, "user_preferences");

  // missing explicit_user_intent must error
  r = await client.callTool({
    name: "memory_set",
    arguments: { key: "no_intent", value: "x" },
  });
  assert.ok(r.isError, "must reject set without explicit_user_intent");

  // secret-key rejection
  r = await client.callTool({
    name: "memory_set",
    arguments: { key: "github_token", value: "doesnt matter", explicit_user_intent: true },
  });
  assert.ok(r.isError, "must reject credential-shaped key");
  assert.match(
    String(r.structuredContent?.error ?? ""),
    /credential/i,
    "error should mention credential",
  );

  // secret-value rejection (JWT shape)
  r = await client.callTool({
    name: "memory_set",
    arguments: {
      key: "innocent_name",
      value: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      explicit_user_intent: true,
    },
  });
  assert.ok(r.isError, "must reject JWT value");

  // get
  r = await client.callTool({ name: "memory_get", arguments: { key: "user_preferences" } });
  assert.equal(r.structuredContent?.found, true);
  assert.deepEqual(r.structuredContent?.value, { language: "pt-BR", verbosity: "concise" });
  assert.deepEqual(r.structuredContent?.tags, ["profile", "preferences"]);

  // privacy_mode=summary omits full value
  r = await client.callTool({
    name: "memory_get",
    arguments: { key: "user_preferences", privacy_mode: "summary" },
  });
  assert.equal(r.structuredContent?.found, true);
  assert.equal(r.structuredContent?.value, undefined);
  assert.ok(r.structuredContent?.value_summary?.bytes > 0);

  // get missing
  r = await client.callTool({ name: "memory_get", arguments: { key: "missing_xyz" } });
  assert.equal(r.structuredContent?.found, false);

  // list
  r = await client.callTool({ name: "memory_list", arguments: {} });
  assert.equal(r.structuredContent?.count, 1);
  assert.equal(r.structuredContent?.keys?.[0]?.key, "user_preferences");

  // search
  r = await client.callTool({ name: "memory_search", arguments: { query: "pt-BR" } });
  assert.ok(r.structuredContent?.count >= 1, "search should find pt-BR");
  assert.equal(r.structuredContent?.results?.[0]?.key, "user_preferences");

  // update via set
  r = await client.callTool({
    name: "memory_set",
    arguments: {
      key: "user_preferences",
      value: { language: "pt-BR", verbosity: "detailed" },
      tags: ["profile"],
      explicit_user_intent: true,
    },
  });
  assert.equal(r.structuredContent?.action, "updated");

  // add another with different tag for bulk-delete test
  await client.callTool({
    name: "memory_set",
    arguments: { key: "scratch_note_1", value: "ephemeral", tags: ["scratch"], explicit_user_intent: true },
  });
  await client.callTool({
    name: "memory_set",
    arguments: { key: "scratch_note_2", value: "ephemeral 2", tags: ["scratch"], explicit_user_intent: true },
  });

  // forget single
  r = await client.callTool({
    name: "memory_forget",
    arguments: { key: "scratch_note_1", explicit_user_intent: true },
  });
  assert.equal(r.structuredContent?.existed, true);
  r = await client.callTool({
    name: "memory_forget",
    arguments: { key: "scratch_note_1", explicit_user_intent: true },
  });
  assert.equal(r.structuredContent?.existed, false, "second forget must be idempotent");

  // bulk delete by tag
  r = await client.callTool({
    name: "memory_forget_by_tag",
    arguments: { tag: "scratch", explicit_user_intent: true },
  });
  assert.equal(r.structuredContent?.deleted_count, 1, "should delete 1 remaining scratch entry");

  // export json
  r = await client.callTool({
    name: "memory_export",
    arguments: { format: "json", explicit_user_intent: true },
  });
  assert.equal(r.structuredContent?.format, "json");
  assert.ok(r.content?.[0]?.text?.includes("user_preferences"));

  // export markdown
  r = await client.callTool({
    name: "memory_export",
    arguments: { format: "markdown", explicit_user_intent: true },
  });
  assert.equal(r.structuredContent?.format, "markdown");
  assert.ok(r.content?.[0]?.text?.startsWith("# delx-memory export"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        tools: names.length,
        db_path: dbPath,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
  rmSync(workDir, { recursive: true, force: true });
}
