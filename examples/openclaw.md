# OpenClaw integration

Add `delx-memory` to OpenClaw's MCP gateway config:

```json
{
  "mcp_servers": {
    "delx-memory": {
      "command": "npx",
      "args": ["-y", "delx-memory"],
      "transport": "stdio"
    }
  }
}
```

OpenClaw will expose the 8 tools through its gateway. The first time any lane calls `memory_set`, the SQLite file is created at `~/.delx-memory/db.sqlite` with `0700`/`0600` permissions.

## Cross-lane continuity

The whole point: every lane (and any other MCP client on the host) sees the same memory. Write a planning note from one lane, read it from another — or from Claude Desktop, Cursor, or Codex. The shared SQLite file is the synchronization point.

## Token economy note

Reads are cheap (no model round-trip needed to inspect `memory_list`). Mutations cost only the agent's reasoning to assemble the right `key`/`value` payload — there is no per-call fee. Suitable for heartbeat-style routines.
