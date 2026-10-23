import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { capturingServer, getCatalogTool } from "../dist/tool-registry.js";
import { registerMemoryTools } from "../dist/tools/memory-tools.js";
import { getDb, closeDb } from "../dist/services/db.js";

registerMemoryTools(capturingServer());

async function call(name, input) {
  const result = await getCatalogTool(name).handler(input);
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return result;
}

async function fixture(run) {
  const workDir = mkdtempSync(join(tmpdir(), "delx-memory-tag-"));
  const previousPath = process.env.DELX_MEMORY_PATH;
  const previousNamespace = process.env.DELX_MEMORY_NAMESPACE;
  process.env.DELX_MEMORY_PATH = join(workDir, "tag.sqlite");
  delete process.env.DELX_MEMORY_NAMESPACE;
  try {
    await run();
  } finally {
    closeDb();
    if (previousPath === undefined) delete process.env.DELX_MEMORY_PATH;
    else process.env.DELX_MEMORY_PATH = previousPath;
    if (previousNamespace === undefined) delete process.env.DELX_MEMORY_NAMESPACE;
    else process.env.DELX_MEMORY_NAMESPACE = previousNamespace;
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function put(key, value, tags = ["scratch"]) {
  await call("memory_set", { key, value, tags, explicit_user_intent: true });
}

await test("global bulk deletion retains exact tags and explicit intent", async () => fixture(async () => {
  await put("s1", "first");
  await put("s2", "second", ["scratch", "another"]);
  await put("s3", "third");
  await put("p1", "permanent", ["permanent"]);
  await put("p2", "important", ["permanent", "important"]);
  await put("u1", "untagged", []);

  const denied = await getCatalogTool("memory_forget_by_tag").handler({ tag: "scratch" });
  assert.equal(denied.isError, true);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS c FROM memory").get().c, 6);

  const first = await call("memory_forget_by_tag", { tag: "scratch", explicit_user_intent: true });
  assert.equal(first.structuredContent.deleted_count, 3);
  assert.deepEqual(getDb().prepare("SELECT key FROM memory ORDER BY key").all().map(r => r.key), ["p1", "p2", "u1"]);
  const second = await call("memory_forget_by_tag", { tag: "important", explicit_user_intent: true });
  assert.equal(second.structuredContent.deleted_count, 1);
  const partial = await call("memory_forget_by_tag", { tag: "perm", explicit_user_intent: true });
  assert.equal(partial.structuredContent.deleted_count, 0);
}));

// The namespaces deliberately differ at LIKE wildcard/backslash positions.
for (const [ownNamespace, otherNamespace] of [
  ["team_%\\lab", "teamXYlab"],
  ["team", "TEAM"],
]) {

async function seedNamespaces() {
  await put("global", "global-only");
  process.env.DELX_MEMORY_NAMESPACE = otherNamespace;
  await put("shared", "other-only");
  process.env.DELX_MEMORY_NAMESPACE = ownNamespace;
  await put("shared", "own-only");
  await put("kept", "own-kept", ["permanent"]);
}

await test(`exports isolate namespace ${ownNamespace} from ${otherNamespace} in every format`, async () => fixture(async () => {
  await seedNamespaces();
  for (const format of ["json", "jsonl", "markdown"]) {
    const result = await call("memory_export", { format, explicit_user_intent: true });
    assert.equal(result.structuredContent.count, 2, `${format} must exclude other namespaces and global rows`);
    const body = result.content[0].text;
    assert.match(body, /own-only/);
    assert.match(body, /own-kept/);
    assert.doesNotMatch(body, /other-only|global-only/);
  }

  // Existing date filters must compose with the namespace predicate.
  getDb().prepare("UPDATE memory SET updated_at = ? WHERE key = ?").run(100, `${ownNamespace}::shared`);
  getDb().prepare("UPDATE memory SET updated_at = ? WHERE key = ?").run(200, `${ownNamespace}::kept`);
  const window = await call("memory_export", { format: "json", since: 150, until: 250, explicit_user_intent: true });
  assert.equal(window.structuredContent.count, 1);
  assert.equal(JSON.parse(window.content[0].text).entries[0].value, "own-kept");

  delete process.env.DELX_MEMORY_NAMESPACE;
  const global = await call("memory_export", { format: "json", explicit_user_intent: true });
  assert.equal(global.structuredContent.count, 4, "unset namespace retains global export behavior");
}));

await test(`bulk deletion isolates namespace ${ownNamespace} from ${otherNamespace}`, async () => fixture(async () => {
  await seedNamespaces();
  const deleted = await call("memory_forget_by_tag", { tag: "scratch", explicit_user_intent: true });
  assert.equal(deleted.structuredContent.deleted_count, 1, "only the active namespace may be deleted");
  const again = await call("memory_forget_by_tag", { tag: "scratch", explicit_user_intent: true });
  assert.equal(again.structuredContent.deleted_count, 0, "repeated deletion is idempotent");

  process.env.DELX_MEMORY_NAMESPACE = otherNamespace;
  const other = await call("memory_get", { key: "shared" });
  assert.equal(other.structuredContent.value, "other-only");
  delete process.env.DELX_MEMORY_NAMESPACE;
  const global = await call("memory_get", { key: "global" });
  assert.equal(global.structuredContent.value, "global-only");
  const remaining = await call("memory_export", { format: "json", explicit_user_intent: true });
  assert.equal(remaining.structuredContent.count, 3);

  const globalDelete = await call("memory_forget_by_tag", { tag: "scratch", explicit_user_intent: true });
  assert.equal(globalDelete.structuredContent.deleted_count, 2, "unset namespace retains global deletion behavior");
}));

}
