import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  decodeTags,
  encodeTags,
  getDb,
  getDbSizeBytes,
  resolveDbPath,
  sweepExpired,
  tagLikePattern,
  type MemoryRow,
} from "../services/db.js";
import {
  assertKeyNotSecret,
  assertValueNotSecret,
} from "../services/secret-detector.js";
import { makeError, makeResponse } from "../services/format.js";
import { MAX_VALUE_BYTES } from "../constants.js";
import {
  MemoryExportInputSchema,
  MemoryForgetByTagInputSchema,
  MemoryForgetInputSchema,
  MemoryGetInputSchema,
  MemoryListInputSchema,
  MemorySearchInputSchema,
  MemorySetInputSchema,
  MemoryStatsInputSchema,
} from "../schemas/common.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function rowToPayload(row: MemoryRow) {
  let parsedValue: unknown = row.value;
  try {
    parsedValue = JSON.parse(row.value);
  } catch {
    /* stored as plain string — keep as-is */
  }
  let parsedMetadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      parsedMetadata = JSON.parse(row.metadata);
    } catch {
      parsedMetadata = null;
    }
  }
  return {
    key: row.key,
    value: parsedValue,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ttl_expires_at: row.ttl_expires_at,
    tags: decodeTags(row.tags),
    metadata: parsedMetadata,
  };
}

function snippetFor(value: string, query: string, max: number = 160): string {
  const lower = value.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    return value.slice(0, max) + (value.length > max ? "…" : "");
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(value.length, idx + q.length + 80);
  return (start > 0 ? "…" : "") + value.slice(start, end) + (end < value.length ? "…" : "");
}

// Simple LIKE-based scoring: count occurrences of query in key vs value.
function scoreMatch(row: MemoryRow, q: string): number {
  const ql = q.toLowerCase();
  let s = 0;
  if (row.key.toLowerCase().includes(ql)) s += 5;
  const valLower = row.value.toLowerCase();
  let from = 0;
  while (true) {
    const i = valLower.indexOf(ql, from);
    if (i === -1) break;
    s += 1;
    from = i + ql.length;
  }
  return s;
}

// ---------------------------------------------------------------------------
// tool registrations
// ---------------------------------------------------------------------------

export function registerMemoryTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // memory_get
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_get",
    {
      title: "Get one memory entry by key",
      description:
        "Exact key lookup. Returns the stored value plus timestamps, ttl, tags, metadata. Returns null if missing or expired.",
      inputSchema: MemoryGetInputSchema.shape,
    },
    async (rawInput) => {
      try {
        const input = MemoryGetInputSchema.parse(rawInput);
        sweepExpired();
        const db = getDb();
        const row = db
          .prepare<unknown[], MemoryRow>("SELECT * FROM memory WHERE key = ?")
          .get(input.key);
        if (!row) {
          return makeResponse({ key: input.key, found: false, value: null });
        }
        return makeResponse({ found: true, ...rowToPayload(row) });
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // memory_list — keys only
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_list",
    {
      title: "List memory keys (not values)",
      description:
        "List keys with optional prefix or tag filter. Returns keys + timestamps + tags only — call memory_get for values. Use this first on a new session to discover what is stored.",
      inputSchema: MemoryListInputSchema.shape,
    },
    async (rawInput) => {
      try {
        const input = MemoryListInputSchema.parse(rawInput);
        sweepExpired();
        const db = getDb();
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (input.prefix) {
          clauses.push("key LIKE ?");
          params.push(input.prefix.replace(/[%_]/g, "\\$&") + "%");
        }
        if (input.tag) {
          clauses.push("tags LIKE ?");
          params.push(tagLikePattern(input.tag));
        }
        const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
        const sql = `SELECT key, created_at, updated_at, ttl_expires_at, tags FROM memory ${where} ORDER BY updated_at DESC LIMIT ?`;
        params.push(input.limit);
        const rows = db.prepare<unknown[], Pick<MemoryRow, "key" | "created_at" | "updated_at" | "ttl_expires_at" | "tags">>(sql).all(...params);
        return makeResponse({
          count: rows.length,
          filters: {
            prefix: input.prefix ?? null,
            tag: input.tag ?? null,
            limit: input.limit,
          },
          keys: rows.map((r) => ({
            key: r.key,
            created_at: r.created_at,
            updated_at: r.updated_at,
            ttl_expires_at: r.ttl_expires_at,
            tags: decodeTags(r.tags),
          })),
        });
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // memory_search — keyword across key + value
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_search",
    {
      title: "Keyword search across keys and values",
      description:
        "Substring search across keys AND values. Returns top N by simple occurrence-count score, with a snippet. Case-insensitive. For v0.1 this is plain LIKE — FTS will come later.",
      inputSchema: MemorySearchInputSchema.shape,
    },
    async (rawInput) => {
      try {
        const input = MemorySearchInputSchema.parse(rawInput);
        sweepExpired();
        const db = getDb();
        const escaped = input.query.replace(/[%_]/g, "\\$&");
        const pattern = `%${escaped}%`;
        const rows = db
          .prepare<unknown[], MemoryRow>(
            `SELECT * FROM memory
             WHERE key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\'
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(pattern, pattern, Math.min(input.limit * 4, 400));
        const scored = rows
          .map((r) => ({ row: r, score: scoreMatch(r, input.query) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, input.limit);
        return makeResponse({
          query: input.query,
          count: scored.length,
          results: scored.map(({ row, score }) => ({
            key: row.key,
            score,
            snippet: snippetFor(row.value, input.query),
            updated_at: row.updated_at,
            tags: decodeTags(row.tags),
          })),
        });
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // memory_stats
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_stats",
    {
      title: "Memory store stats",
      description:
        "High-level stats about the local memory store. Safe to call first on every session to gauge whether the store is empty, small, or large.",
      inputSchema: MemoryStatsInputSchema.shape,
    },
    async () => {
      try {
        sweepExpired();
        const db = getDb();
        const countRow = db
          .prepare<unknown[], { total: number; oldest: number | null; newest: number | null }>(
            "SELECT COUNT(*) AS total, MIN(created_at) AS oldest, MAX(updated_at) AS newest FROM memory",
          )
          .get();
        const tagsRow = db
          .prepare<unknown[], { with_tags: number }>(
            "SELECT COUNT(*) AS with_tags FROM memory WHERE tags IS NOT NULL",
          )
          .get();
        const ttlRow = db
          .prepare<unknown[], { with_ttl: number }>(
            "SELECT COUNT(*) AS with_ttl FROM memory WHERE ttl_expires_at IS NOT NULL",
          )
          .get();
        return makeResponse({
          total_keys: countRow?.total ?? 0,
          keys_with_tags: tagsRow?.with_tags ?? 0,
          keys_with_ttl: ttlRow?.with_ttl ?? 0,
          total_size_bytes: getDbSizeBytes(),
          oldest_created_at: countRow?.oldest ?? null,
          newest_updated_at: countRow?.newest ?? null,
          db_path: resolveDbPath(),
        });
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // memory_set
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_set",
    {
      title: "Upsert a memory entry (requires explicit_user_intent)",
      description:
        "Create or update a key in memory. Rejects credential-shaped keys or values. Requires explicit_user_intent: true. Returns whether the row was created or updated.",
      inputSchema: MemorySetInputSchema.shape,
    },
    async (rawInput) => {
      try {
        const input = MemorySetInputSchema.parse(rawInput);

        // Key check — credential-shaped names are refused.
        assertKeyNotSecret(input.key);

        // Value check — recursive walk for credential shapes.
        assertValueNotSecret(input.value);

        // Tag check — tags are usually descriptive but easy to abuse.
        if (input.tags) input.tags.forEach((t) => assertKeyNotSecret(t));

        // Metadata check — small JSON, but apply same rules.
        if (input.metadata) assertValueNotSecret(input.metadata);

        // Serialize and enforce size cap.
        const serialized = JSON.stringify(input.value ?? null);
        const byteLen = Buffer.byteLength(serialized, "utf8");
        if (byteLen > MAX_VALUE_BYTES) {
          throw new Error(
            `Value too large: ${byteLen} bytes > ${MAX_VALUE_BYTES} byte cap. delx-memory is for small context, not blobs.`,
          );
        }

        const metadataBlob = input.metadata ? JSON.stringify(input.metadata) : null;
        const tagsBlob = encodeTags(input.tags ?? null);
        const now = Date.now();
        const ttlAt = input.ttl_seconds ? now + input.ttl_seconds * 1000 : null;

        const db = getDb();
        const existing = db
          .prepare<unknown[], { created_at: number }>(
            "SELECT created_at FROM memory WHERE key = ?",
          )
          .get(input.key);

        if (existing) {
          db.prepare(
            `UPDATE memory SET value = ?, updated_at = ?, ttl_expires_at = ?, tags = ?, metadata = ? WHERE key = ?`,
          ).run(serialized, now, ttlAt, tagsBlob, metadataBlob, input.key);
          return makeResponse({
            key: input.key,
            action: "updated",
            created_at: existing.created_at,
            updated_at: now,
            ttl_expires_at: ttlAt,
            bytes: byteLen,
          });
        }
        db.prepare(
          `INSERT INTO memory (key, value, created_at, updated_at, ttl_expires_at, tags, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(input.key, serialized, now, now, ttlAt, tagsBlob, metadataBlob);
        return makeResponse({
          key: input.key,
          action: "created",
          created_at: now,
          updated_at: now,
          ttl_expires_at: ttlAt,
          bytes: byteLen,
        });
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // memory_forget
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_forget",
    {
      title: "Delete one memory entry (requires explicit_user_intent)",
      description:
        "Delete a single key from memory. Idempotent: returns existed=false if the key was not present. Requires explicit_user_intent: true.",
      inputSchema: MemoryForgetInputSchema.shape,
    },
    async (rawInput) => {
      try {
        const input = MemoryForgetInputSchema.parse(rawInput);
        const db = getDb();
        const info = db.prepare("DELETE FROM memory WHERE key = ?").run(input.key);
        return makeResponse({
          key: input.key,
          existed: info.changes > 0,
          deleted: info.changes,
        });
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // memory_forget_by_tag
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_forget_by_tag",
    {
      title: "Bulk-delete entries by tag (requires explicit_user_intent)",
      description:
        "Delete every entry carrying the given tag. Returns deleted_count. Requires explicit_user_intent: true.",
      inputSchema: MemoryForgetByTagInputSchema.shape,
    },
    async (rawInput) => {
      try {
        const input = MemoryForgetByTagInputSchema.parse(rawInput);
        const db = getDb();
        const info = db
          .prepare("DELETE FROM memory WHERE tags LIKE ?")
          .run(tagLikePattern(input.tag));
        return makeResponse({
          tag: input.tag,
          deleted_count: info.changes,
        });
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );

  // -------------------------------------------------------------------------
  // memory_export
  // -------------------------------------------------------------------------
  server.registerTool(
    "memory_export",
    {
      title: "Export memory contents (requires explicit_user_intent)",
      description:
        "Dump the memory store as JSON, JSONL, or Markdown. Optional since/until window on updated_at. Use for backup/inspection. Requires explicit_user_intent: true.",
      inputSchema: MemoryExportInputSchema.shape,
    },
    async (rawInput) => {
      try {
        const input = MemoryExportInputSchema.parse(rawInput);
        sweepExpired();
        const db = getDb();
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (typeof input.since === "number") {
          clauses.push("updated_at >= ?");
          params.push(input.since);
        }
        if (typeof input.until === "number") {
          clauses.push("updated_at <= ?");
          params.push(input.until);
        }
        const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
        const rows = db
          .prepare<unknown[], MemoryRow>(
            `SELECT * FROM memory ${where} ORDER BY updated_at DESC`,
          )
          .all(...params);

        const entries = rows.map(rowToPayload);
        let body: string;
        let contentType: string;
        if (input.format === "json") {
          body = JSON.stringify(
            { version: 1, generated_at: Date.now(), count: entries.length, entries },
            null,
            2,
          );
          contentType = "application/json";
        } else if (input.format === "jsonl") {
          body = entries.map((e) => JSON.stringify(e)).join("\n");
          contentType = "application/x-ndjson";
        } else {
          const parts = [
            `# delx-memory export`,
            `Generated: ${new Date().toISOString()}`,
            `Entries: ${entries.length}`,
            "",
          ];
          for (const e of entries) {
            parts.push(`## ${e.key}`);
            parts.push(`- Created: ${new Date(e.created_at).toISOString()}`);
            parts.push(`- Updated: ${new Date(e.updated_at).toISOString()}`);
            if (e.ttl_expires_at) {
              parts.push(`- TTL expires: ${new Date(e.ttl_expires_at).toISOString()}`);
            }
            if (e.tags?.length) parts.push(`- Tags: ${e.tags.join(", ")}`);
            parts.push("", "```json", JSON.stringify(e.value, null, 2), "```", "");
          }
          body = parts.join("\n");
          contentType = "text/markdown";
        }

        return {
          structuredContent: {
            format: input.format,
            count: entries.length,
            content_type: contentType,
            bytes: Buffer.byteLength(body, "utf8"),
          },
          content: [{ type: "text", text: body }],
        };
      } catch (err) {
        return makeError((err as Error).message);
      }
    },
  );
}

// Re-exported for tests / introspection.
export const REGISTERED_TOOL_NAMES = [
  "memory_get",
  "memory_list",
  "memory_search",
  "memory_stats",
  "memory_set",
  "memory_forget",
  "memory_forget_by_tag",
  "memory_export",
];

// Suppress unused-import warning if it ever appears.
void z;
