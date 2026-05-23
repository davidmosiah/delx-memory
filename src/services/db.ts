import Database from "better-sqlite3";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_DB_PATH } from "../constants.js";

export interface MemoryRow {
  key: string;
  value: string;
  created_at: number;
  updated_at: number;
  ttl_expires_at: number | null;
  tags: string | null;
  metadata: string | null;
}

let cachedDb: Database.Database | null = null;
let cachedPath: string | null = null;

export function resolveDbPath(): string {
  return process.env.DELX_MEMORY_PATH ?? DEFAULT_DB_PATH;
}

function ensureParentDirSecure(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    // Try to tighten existing dir perms (best effort — may fail on Windows).
    try {
      chmodSync(dir, 0o700);
    } catch {
      /* ignore */
    }
  }
}

function ensureFileSecure(path: string): void {
  if (existsSync(path)) {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* ignore — non-POSIX filesystems */
    }
  }
}

/**
 * Open (or reuse) the SQLite connection. Bootstraps schema + indexes on
 * first open. Idempotent. Returns the SAME connection on repeated calls
 * unless the path changed (only happens in tests that flip env vars).
 */
export function getDb(): Database.Database {
  const path = resolveDbPath();
  if (cachedDb && cachedPath === path) return cachedDb;
  if (cachedDb && cachedPath !== path) {
    cachedDb.close();
    cachedDb = null;
    cachedPath = null;
  }

  ensureParentDirSecure(path);
  const db = new Database(path);
  ensureFileSecure(path);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ttl_expires_at INTEGER,
      tags TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memory_ttl ON memory(ttl_expires_at) WHERE ttl_expires_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_memory_tags ON memory(tags);
    CREATE INDEX IF NOT EXISTS idx_memory_updated_at ON memory(updated_at);
  `);

  cachedDb = db;
  cachedPath = path;
  return db;
}

/**
 * Close cached connection. Mostly for tests / clean shutdown.
 */
export function closeDb(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
    cachedPath = null;
  }
}

/**
 * Lazy-delete expired rows. Called on every read path. Cheap because of the
 * partial index on ttl_expires_at. Returns number of rows deleted.
 */
export function sweepExpired(now: number = Date.now()): number {
  const db = getDb();
  const stmt = db.prepare(
    "DELETE FROM memory WHERE ttl_expires_at IS NOT NULL AND ttl_expires_at <= ?",
  );
  const info = stmt.run(now);
  return info.changes;
}

/**
 * Returns DB file size in bytes, or 0 if file does not exist.
 */
export function getDbSizeBytes(): number {
  const path = resolveDbPath();
  if (!existsSync(path)) return 0;
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Serialize a tag array into the format we LIKE-search against:
 * leading and trailing comma so `tags LIKE '%,foo,%'` is unambiguous.
 */
export function encodeTags(tags: string[] | null | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  const clean = tags
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !t.includes(","));
  if (clean.length === 0) return null;
  return "," + clean.join(",") + ",";
}

export function decodeTags(tagBlob: string | null): string[] | null {
  if (!tagBlob) return null;
  const parts = tagBlob.split(",").filter((p) => p.length > 0);
  return parts.length > 0 ? parts : null;
}

export function tagLikePattern(tag: string): string {
  return `%,${tag},%`;
}
