import { z } from "zod";
import {
  MAX_KEY_LENGTH,
  MAX_LIST_LIMIT,
  MAX_SEARCH_LIMIT,
  DEFAULT_LIST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
} from "../constants.js";

/**
 * Mutations require an explicit flag. We expose this as a separate schema
 * so every mutation tool can compose it without copy-paste. An agent that
 * tries to silently mutate state without the user asking will hit a clear
 * validation error.
 */
export const ExplicitUserIntentSchema = z
  .literal(true)
  .describe(
    "Must be true. Set ONLY when the current user message explicitly asks " +
      "the agent to modify memory (set/forget/export). Do not infer intent.",
  );

const KeySchema = z
  .string()
  .min(1, "key must be non-empty")
  .max(MAX_KEY_LENGTH, `key too long (max ${MAX_KEY_LENGTH} chars)`)
  .describe("Stable identifier for the memory entry. Free-form text. Treat as case-sensitive.");

const TagsSchema = z
  .array(z.string().min(1).max(64).regex(/^[^,]+$/, "tag must not contain comma"))
  .max(32, "max 32 tags per entry")
  .optional()
  .describe("Optional list of tags for grouping/filter/bulk-delete.");

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("Optional small JSON object with provenance/notes. Subject to same secret-detection rules.");

// ----- READS -----

export const MemoryGetInputSchema = z.object({
  key: KeySchema,
});

export const MemoryListInputSchema = z.object({
  prefix: z
    .string()
    .max(MAX_KEY_LENGTH)
    .optional()
    .describe("Only return keys starting with this string."),
  tag: z.string().max(64).optional().describe("Only return keys carrying this tag."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIST_LIMIT)
    .default(DEFAULT_LIST_LIMIT)
    .describe("Max keys to return."),
});

export const MemorySearchInputSchema = z.object({
  query: z.string().min(1).max(512).describe("Keyword query. Matched against keys and values."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_LIMIT)
    .default(DEFAULT_SEARCH_LIMIT)
    .describe("Max matches to return."),
});

export const MemoryStatsInputSchema = z.object({}).describe("No arguments.");

// ----- WRITES -----

export const MemorySetInputSchema = z.object({
  key: KeySchema,
  value: z
    .unknown()
    .describe(
      "The value to store. Will be JSON-serialized. Rejected if it looks like a credential.",
    ),
  ttl_seconds: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24 * 365 * 10) // 10 years
    .optional()
    .describe("Optional TTL in seconds. After this, the entry is lazy-deleted on next read."),
  tags: TagsSchema,
  metadata: MetadataSchema,
  explicit_user_intent: ExplicitUserIntentSchema,
});

export const MemoryForgetInputSchema = z.object({
  key: KeySchema,
  explicit_user_intent: ExplicitUserIntentSchema,
});

export const MemoryForgetByTagInputSchema = z.object({
  tag: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[^,]+$/)
    .describe("Tag to bulk-delete."),
  explicit_user_intent: ExplicitUserIntentSchema,
});

export const MemoryExportInputSchema = z.object({
  format: z
    .enum(["json", "jsonl", "markdown"])
    .describe("Output format: json (single object), jsonl (one entry per line), markdown (human-friendly)."),
  since: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Unix ms timestamp — include only entries with updated_at >= since."),
  until: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Unix ms timestamp — include only entries with updated_at <= until."),
  explicit_user_intent: ExplicitUserIntentSchema,
});

export type MemoryGetInput = z.infer<typeof MemoryGetInputSchema>;
export type MemoryListInput = z.infer<typeof MemoryListInputSchema>;
export type MemorySearchInput = z.infer<typeof MemorySearchInputSchema>;
export type MemoryStatsInput = z.infer<typeof MemoryStatsInputSchema>;
export type MemorySetInput = z.infer<typeof MemorySetInputSchema>;
export type MemoryForgetInput = z.infer<typeof MemoryForgetInputSchema>;
export type MemoryForgetByTagInput = z.infer<typeof MemoryForgetByTagInputSchema>;
export type MemoryExportInput = z.infer<typeof MemoryExportInputSchema>;
