import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "delx-memory-ttl-"));
process.env.DELX_MEMORY_PATH = join(workDir, "ttl.sqlite");

const { getDb, sweepExpired, closeDb } = await import("../dist/services/db.js");

try {
  const db = getDb();
  const now = Date.now();

  // Insert one row with a TTL already expired and one fresh.
  db.prepare(
    `INSERT INTO memory (key, value, created_at, updated_at, ttl_expires_at, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("expired_key", '"v1"', now - 10_000, now - 10_000, now - 5_000, null, null);
  db.prepare(
    `INSERT INTO memory (key, value, created_at, updated_at, ttl_expires_at, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("fresh_key", '"v2"', now, now, now + 60_000, null, null);
  db.prepare(
    `INSERT INTO memory (key, value, created_at, updated_at, ttl_expires_at, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("forever_key", '"v3"', now, now, null, null, null);

  // Before sweep we expect 3.
  let total = db.prepare("SELECT COUNT(*) AS c FROM memory").get();
  assert.equal(total.c, 3, "should have 3 rows before sweep");

  const deleted = sweepExpired(now);
  assert.equal(deleted, 1, "sweep should delete the 1 expired row");

  total = db.prepare("SELECT COUNT(*) AS c FROM memory").get();
  assert.equal(total.c, 2, "should have 2 rows after sweep");

  // Inject a row that will expire 50ms from now.
  db.prepare(
    `INSERT INTO memory (key, value, created_at, updated_at, ttl_expires_at, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("about_to_expire", '"v4"', now, now, now + 50, null, null);

  // Wait briefly then sweep with a slightly-later timestamp.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const deleted2 = sweepExpired(Date.now());
  assert.equal(deleted2, 1, "second sweep should delete the now-expired row");

  console.log(
    JSON.stringify(
      {
        ok: true,
        first_sweep_deleted: deleted,
        second_sweep_deleted: deleted2,
        remaining: db.prepare("SELECT COUNT(*) AS c FROM memory").get().c,
      },
      null,
      2,
    ),
  );
} finally {
  closeDb();
  rmSync(workDir, { recursive: true, force: true });
}
