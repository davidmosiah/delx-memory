import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "delx-memory-tag-"));
process.env.DELX_MEMORY_PATH = join(workDir, "tag.sqlite");

const { getDb, encodeTags, tagLikePattern, closeDb } = await import("../dist/services/db.js");

try {
  const db = getDb();
  const now = Date.now();

  // Seed: 3 rows with tag "scratch", 2 with tag "permanent", 1 untagged.
  function insert(key, tags) {
    db.prepare(
      `INSERT INTO memory (key, value, created_at, updated_at, ttl_expires_at, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(key, '"v"', now, now, null, encodeTags(tags), null);
  }

  insert("s1", ["scratch"]);
  insert("s2", ["scratch", "another"]);
  insert("s3", ["scratch"]);
  insert("p1", ["permanent"]);
  insert("p2", ["permanent", "important"]);
  insert("u1", null);

  // Before
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM memory").get().c, 6);

  // Bulk delete by tag "scratch"
  const info = db.prepare("DELETE FROM memory WHERE tags LIKE ?").run(tagLikePattern("scratch"));
  assert.equal(info.changes, 3, "should delete exactly 3 scratch rows");

  // After
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM memory").get().c, 3);

  // Make sure no permanent-tagged row was hit
  const remaining = db
    .prepare("SELECT key FROM memory ORDER BY key")
    .all()
    .map((r) => r.key);
  assert.deepEqual(remaining, ["p1", "p2", "u1"]);

  // Bulk delete by tag "important" — should hit exactly 1
  const info2 = db
    .prepare("DELETE FROM memory WHERE tags LIKE ?")
    .run(tagLikePattern("important"));
  assert.equal(info2.changes, 1);

  // Verify tag substring poisoning is impossible:
  // a tag like "perm" should NOT match a row tagged "permanent".
  insert("trap", ["permanent"]);
  const info3 = db.prepare("DELETE FROM memory WHERE tags LIKE ?").run(tagLikePattern("perm"));
  assert.equal(info3.changes, 0, "partial tag match must NOT delete 'permanent' rows");

  console.log(
    JSON.stringify(
      {
        ok: true,
        first_delete: info.changes,
        second_delete: info2.changes,
        partial_match_safe: info3.changes === 0,
      },
      null,
      2,
    ),
  );
} finally {
  closeDb();
  rmSync(workDir, { recursive: true, force: true });
}
