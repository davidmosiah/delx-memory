import { NPM_PACKAGE_NAME, SERVER_VERSION } from "../constants.js";

export function buildCapabilities() {
  return {
    project: NPM_PACKAGE_NAME,
    version: SERVER_VERSION,
    unofficial: true,
    privacy_modes: [
      { mode: "summary", use_when: "Keys/meta only — shrink agent context." },
      { mode: "structured", use_when: "Default — full values." },
      { mode: "raw", use_when: "Parity mode; identical to structured for this local store." },
    ],
    tools: [
      { name: "memory_agent_manifest", summary: "Install and operating rules for agents." },
      { name: "memory_connection_status", summary: "DB path ready + size/stats without reading values." },
      { name: "memory_data_inventory", summary: "Static domains and recommended first calls." },
      { name: "memory_capabilities", summary: "Self-description of this MCP." },
      { name: "memory_get", summary: "Exact key lookup." },
      { name: "memory_list", summary: "List keys with optional prefix/tag." },
      { name: "memory_search", summary: "Keyword / FTS search." },
      { name: "memory_stats", summary: "Store size and timestamps." },
      { name: "memory_set", summary: "Upsert (explicit_user_intent required)." },
      { name: "memory_forget", summary: "Delete one key (explicit_user_intent required)." },
      { name: "memory_forget_by_tag", summary: "Bulk delete by tag (explicit_user_intent required)." },
      { name: "memory_export", summary: "Export dump (explicit_user_intent required)." },
      { name: "memory_get_many", summary: "Batch get by keys." },
      { name: "memory_set_batch", summary: "Atomic multi-upsert (explicit_user_intent required)." },
      { name: "memory_handoff", summary: "Session resume brief (stats + recent keys)." },
    ],
    recommended_agent_flow: [
      "Call memory_agent_manifest once.",
      "Call memory_connection_status or memory_stats to see if the store is empty.",
      "memory_list / memory_search to discover keys; memory_get for values.",
      "Only set/forget/export with explicit_user_intent: true from the user.",
    ],
    namespace: "Optional DELX_MEMORY_NAMESPACE env prefixes all keys (multi-agent isolation).",
    transports: {
      lite: "default tools-only stdio without MCP SDK",
      sdk: "full MCP SDK with prompts/resources",
      http: "loopback Streamable HTTP",
    },
    mutation_gating: "All writes require explicit_user_intent: true; secret-shaped keys/values are refused.",
    links: {
      github: "https://github.com/davidmosiah/delx-memory",
      npm: "https://www.npmjs.com/package/delx-memory",
    },
  };
}
