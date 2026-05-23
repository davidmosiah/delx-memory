import { SERVER_NAME, SERVER_VERSION, PINNED_NPM_PACKAGE } from "../constants.js";

/**
 * Tools agents can call freely on a fresh session — they only read.
 */
export const STANDARD_TOOLS = [
  "memory_stats",
  "memory_list",
  "memory_get",
  "memory_search",
];

/**
 * Tools that mutate state. They require explicit_user_intent: true and
 * should NEVER be called without a fresh user request asking for the change.
 */
export const MUTATION_TOOLS = [
  "memory_set",
  "memory_forget",
  "memory_forget_by_tag",
  "memory_export",
];

/**
 * Suggested first calls a fresh agent should make to orient itself.
 * memory_stats is intentionally first — gives the agent total size and
 * oldest entry so it can decide whether the store is "warm" or empty
 * without asking the user.
 */
export const RECOMMENDED_FIRST_CALLS = [
  "memory_stats",
  "memory_list",
];

export interface AgentManifest {
  server: string;
  version: string;
  npm_package: string;
  tools: {
    standard: string[];
    mutation: string[];
  };
  recommended_first_calls: string[];
  privacy: {
    storage: string;
    rejects_credential_shapes: boolean;
    telemetry: boolean;
    file_permissions: string;
  };
  notes: string[];
}

export function buildAgentManifest(): AgentManifest {
  return {
    server: SERVER_NAME,
    version: SERVER_VERSION,
    npm_package: PINNED_NPM_PACKAGE,
    tools: {
      standard: STANDARD_TOOLS,
      mutation: MUTATION_TOOLS,
    },
    recommended_first_calls: RECOMMENDED_FIRST_CALLS,
    privacy: {
      storage: "Local SQLite at ~/.delx-memory/db.sqlite (override with DELX_MEMORY_PATH).",
      rejects_credential_shapes: true,
      telemetry: false,
      file_permissions: "0700 directory, 0600 file (best effort on non-POSIX).",
    },
    notes: [
      "delx-memory is NOT a secrets manager. Credential-shaped keys and values are rejected.",
      "Mutations require explicit_user_intent: true.",
      "TTL is lazy: expired rows are pruned on each read.",
      "Same DB file can be opened by Claude Desktop, Cursor, Hermes, OpenClaw, Codex — that is the point.",
    ],
  };
}
