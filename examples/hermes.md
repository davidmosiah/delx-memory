# Hermes integration

Add `delx-memory` to your Hermes MCP server config (`~/.hermes/config.json`):

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

Then reload Hermes (`/reload-mcp` or restart). Tools will appear as `mcp_delx_memory_memory_get`, `mcp_delx_memory_memory_set`, etc., per Hermes's prefix convention.

## Recommended first calls on a fresh session

```
mcp_delx_memory_memory_stats({})
mcp_delx_memory_memory_list({})
```

These two reads tell the agent what is already remembered without touching state.

## Mutation reminder

Every write requires `explicit_user_intent: true`. Pass it ONLY when the current user message asks to update memory:

```
mcp_delx_memory_memory_set({
  key: "user_preferences",
  value: {...},
  explicit_user_intent: true
})
```

## Shared store across MCP clients

The DB at `~/.delx-memory/db.sqlite` is the SAME file Claude Desktop, Cursor, OpenClaw, and Codex see. Writing from Hermes is immediately visible to the others — that is the whole point.
