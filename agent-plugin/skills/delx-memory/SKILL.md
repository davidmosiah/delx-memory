---
name: delx-memory
description: >-
  Keep durable, searchable memory across sessions and agents with the local delx-memory MCP server (SQLite on this machine). Use when the user says remember this, asks what was decided before, wants context carried to a future session or another agent, or needs a handoff note. Never stores secrets or credentials.
---

# Delx Memory

MCP server `delx-memory` from the `delx-memory@0.4.1` npm package, run locally through `npx`. It reads key/value memories with tags, search, export and session handoff notes shared across agents on this machine. Data source: no network service: a local SQLite database at ~/.delx-memory/db.sqlite (override with DELX_MEMORY_PATH).

## Workflow

1. Start with `memory_connection_status`. Then pick what fits the question: `memory_search`, `memory_get`, `memory_handoff`.
2. Lead with the answer to the user's question and keep supporting detail short.

## Setup (the user runs this in a terminal, not in chat)

```bash
npx -y delx-memory@0.4.1 doctor
```

No setup; the database is created on first write.

## Safety

- Tools that change local state: memory_set / memory_set_batch. Use them only when the user asks.
- Destructive: memory_forget, memory_forget_by_tag (local rows only). Confirm with the user first.
- Never store secrets, credentials or other people's personal data in memory.
- Any agent on this machine that runs delx-memory reads the same database.
