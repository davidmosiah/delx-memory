import { NPM_PACKAGE_NAME, PINNED_NPM_PACKAGE, SERVER_VERSION } from "../constants.js";

export const AGENT_CLIENTS = ["generic", "claude", "cursor", "windsurf", "hermes", "openclaw", "codex"] as const;
export type AgentClientName = (typeof AGENT_CLIENTS)[number];

export function parseAgentClientName(value: string): AgentClientName {
  return AGENT_CLIENTS.includes(value as AgentClientName) ? (value as AgentClientName) : "generic";
}

export function buildAgentManifest(client: AgentClientName = "generic") {
  return {
    project: NPM_PACKAGE_NAME,
    mcp_name: "io.github.davidmosiah/delx-memory",
    client,
    unofficial: true,
    recommended_first_calls: [
      "memory_handoff",
      "memory_agent_manifest",
      "memory_connection_status",
      "memory_stats",
      "memory_list",
    ],
    standard_tools: [
      "memory_agent_manifest",
      "memory_connection_status",
      "memory_data_inventory",
      "memory_capabilities",
      "memory_handoff",
      "memory_get",
      "memory_get_many",
      "memory_list",
      "memory_search",
      "memory_stats",
      "memory_set",
      "memory_set_batch",
      "memory_forget",
      "memory_forget_by_tag",
      "memory_export",
    ],
    package: {
      name: NPM_PACKAGE_NAME,
      version: SERVER_VERSION,
      install_command: `npx -y ${NPM_PACKAGE_NAME}`,
      pinned_install_command: `npx -y ${PINNED_NPM_PACKAGE}`,
      binary: "delx-memory",
    },
    tools: [
      "memory_agent_manifest",
      "memory_connection_status",
      "memory_data_inventory",
      "memory_capabilities",
      "memory_handoff",
      "memory_get",
      "memory_get_many",
      "memory_list",
      "memory_search",
      "memory_stats",
      "memory_set",
      "memory_set_batch",
      "memory_forget",
      "memory_forget_by_tag",
      "memory_export",
    ],
    agent_rules: [
      "Call memory_agent_manifest or memory_connection_status on first contact.",
      "Use memory_list / memory_stats before memory_get when exploring an unknown store.",
      "Mutations (set/forget/export) require explicit_user_intent: true — never invent it.",
      "privacy_mode=summary on read tools returns keys/meta without full values; structured (default) returns full entries.",
      "Never store secrets, tokens, passwords, private keys or raw health measurements.",
      "This is local SQLite under ~/.delx-memory/ — not a multi-user cloud store.",
      "Optional DELX_MEMORY_NAMESPACE isolates keys as namespace::key for multi-agent setups.",
      "Prefer memory_handoff at session start for a compact resume brief.",
      "Default transport is lite (no MCP SDK); use --sdk for prompts/resources.",
    ],
    privacy_modes: [
      { mode: "summary", use_when: "List/search without loading full values into context." },
      { mode: "structured", use_when: "Default full entries (values included)." },
      { mode: "raw", use_when: "Same as structured for local SQLite; kept for agent-surface parity." },
    ],
    links: {
      github: "https://github.com/davidmosiah/delx-memory",
      npm: "https://www.npmjs.com/package/delx-memory",
    },
  };
}
