---
name: delx-memory
description: >
  Local-first agent memory MCP. No API keys. Prefer MCP tools if connected; otherwise the package CLI.
  Use when the user wants Delx Memory data or actions through an agent.
---

# Delx Memory — skill or MCP

Same binary either way. Do not duplicate the API client.

## Choose a surface

**MCP** — tools appear natively after stdio/HTTP config:

```json
{ "mcpServers": { "delx-memory": { "command": "npx", "args": ["-y", "delx-memory"] } } }
```

Do not put mutation flags in that snippet.

**Skill / CLI** — no MCP client required. Same tools:

```bash
npx -y delx-memory call memory_connection_status --json '{}'
```

If MCP tools named `memory_*` are already available, use them. Do not also shell out.

## Loop

1. Call `memory_connection_status` (or `doctor --json` when that exists).
2. Use read tools as asked.
3. Stop on `USER_ACTION_REQUIRED`. Do not invent env flags. Do not enable mutations from this skill.

## Never

- Paste tokens into git, chat logs, or the prompt
- Copy a mutations-enabled assignment into config
