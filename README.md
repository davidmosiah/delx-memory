# delx-memory

> Local-first persistent memory MCP server. One shared SQLite store any MCP-speaking agent (Claude Desktop, Cursor, Hermes, OpenClaw, Codex) can read and write — so context survives across sessions AND across tools.

[![npm version](https://img.shields.io/npm/v/delx-memory)](https://www.npmjs.com/package/delx-memory)
[![GitHub Release](https://img.shields.io/github/v/release/davidmosiah/delx-memory?label=release)](https://github.com/davidmosiah/delx-memory/releases/latest)
[![npm downloads](https://img.shields.io/npm/dm/delx-memory)](https://www.npmjs.com/package/delx-memory)
[![status: beta](https://img.shields.io/badge/status-beta-0EA5A3)](https://github.com/davidmosiah/delx-memory)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node: >=20](https://img.shields.io/badge/node-%3E%3D20-green)](package.json)
[![Verified Release Index](https://img.shields.io/badge/verified-release_index-0EA5A3)](https://github.com/davidmosiah/delx-wellness/blob/main/docs/release-index.md)

## Why

Every chat client has its own ephemeral context. Quit the tab → preferences gone. Switch from Claude Desktop to Cursor → starting from scratch. Pin a side project in Hermes → invisible to the next agent.

`delx-memory` is a tiny MCP server that exposes a single shared SQLite file as a key/value memory layer. Any client that speaks MCP can read and write the same memory file → real continuity, real cross-tool context.

- **15 tools** — discovery + handoff + batch ops + FTS5 search + mutations gated by intent.
- SQLite at `~/.delx-memory/db.sqlite` (0700 dir, 0600 file).
- **Secret-blocking**: refuses to store credential-shaped keys or values.
- TTL support (lazy expiry on read).
- Tags + prefix filters + FTS5 full-text search (bm25 ranking, stemming, diacritic folding; LIKE fallback if FTS5 is unavailable).
- Mutations require `explicit_user_intent: true` so over-eager agents can't silently rewrite your context.
- Zero telemetry. Zero phone-home. The file is yours.

### Multi-agent namespaces

```bash
# Agent A
DELX_MEMORY_NAMESPACE=claude npx -y delx-memory

# Agent B (same machine, isolated keys)
DELX_MEMORY_NAMESPACE=cursor npx -y delx-memory
```

Keys are stored as `namespace::key`. Omit the env var for a single global store (default).

### Footprint / lightweight mode

- **Default transport is `lite`**: tools-only MCP over stdio **without loading the MCP SDK** (biggest RSS win for always-on agents).
- Full SDK surface (prompts + resources): `delx-memory --sdk` or `DELX_MEMORY_TRANSPORT=sdk`.
- Optional HTTP: `delx-memory --http` (Express + SDK; still loopback by default).
- `DELX_MEMORY_LEAN=1` applies to the **SDK** path only (skip prompts/resources).
- `doctor --json` reports `rss_kb`. Dominant remaining cost is Node + native `better-sqlite3` (no embeddings).

Community measurements (custom transport vs SDK) pointed at the SDK tree as the main overhead — see issue #7.


## Install + run

```bash
# Run once (npx will download + boot)
npx -y delx-memory doctor

# Or install globally
npm install -g delx-memory
delx-memory doctor
```

The `doctor` command checks Node version, DB writability, and file permissions, then prints next steps.

---

## HTTP (v2 stateless)

Default is **stdio**. Optional Streamable HTTP — no session id, JSON responses, loopback only:

```bash
npx -y delx-memory --http
# GET  http://127.0.0.1:3030/health
# POST http://127.0.0.1:3030/mcp   (sessionless)
```

Env: `DELX_MEMORY_HOST`, `DELX_MEMORY_PORT`, `DELX_MEMORY_TRANSPORT=http`.


## Wire it into your MCP client

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "delx-memory": {
      "command": "npx",
      "args": ["-y", "delx-memory"]
    }
  }
}
```

Then restart Claude Desktop. See [`examples/claude-desktop.json`](./examples/claude-desktop.json).

### Cursor

Add to `~/.cursor/mcp.json`. See [`examples/cursor.json`](./examples/cursor.json).

### Hermes

See [`examples/hermes.md`](./examples/hermes.md).

### OpenClaw

See [`examples/openclaw.md`](./examples/openclaw.md).

### Codex CLI

See [`examples/codex.toml`](./examples/codex.toml).

---

## What makes it different (honest)

| | delx-memory | Typical cloud memory | Graph memory MCP |
|---|---|---|---|
| Data leaves your machine | **No** | Yes | Usually no |
| Multi-client same store | **Yes** (one SQLite) | Account-bound | Process-local |
| Agent mutation safety | **`explicit_user_intent`** | Varies | Rare |
| Secret storage | **Hard-refused** | Often allowed | Often allowed |
| Default RSS path | **Lite (no MCP SDK)** | N/A | Full stack |
| Multi-agent isolation | **`DELX_MEMORY_NAMESPACE`** | Tenants | Manual |
| Search | **FTS5 bm25** | Embeddings (cost/leak) | Graph walk |

Not a vector DB. Not a second brain SaaS. Local continuity for agents that already have a model.

## Tools (15)


### Session start

| Tool | Purpose |
|---|---|
| `memory_handoff` | **One-call resume brief**: stats + recent keys (optional values). Prefer this at session start. |
| `memory_agent_manifest` | Machine install/ops contract for agents. |
| `memory_connection_status` / `memory_stats` | Readiness + store size. |
| `memory_capabilities` / `memory_data_inventory` | Self-description for agents. |

### Reads

| Tool | Purpose |
|---|---|
| `memory_list` | Keys only; filters: `prefix`, `tag`, **`since`** (delta sync). |
| `memory_get` / `memory_get_many` | Exact key or batch (max 50). |
| `memory_search` | FTS5 bm25 (+ LIKE fallback). See [search quickstart](./examples/fts5-search.md). |

### Mutations (require `explicit_user_intent: true`)

| Tool | Purpose |
|---|---|
| `memory_set` / `memory_set_batch` | Upsert one key or up to 50 in one transaction. |
| `memory_forget` / `memory_forget_by_tag` | Delete one key or by tag. |
| `memory_export` | Dump JSON / JSONL / Markdown. |

Every mutation refuses to run unless the caller passes `explicit_user_intent: true`. The intent: an agent that decides on its own to update memory must show its work. The user can see the flag in the tool call and reject it if they didn't ask.

---

## Privacy contract (read this)

`delx-memory` is **NOT** a secrets manager. Use macOS Keychain / gnome-keyring / Windows Credential Manager for those.

**What we refuse to store:**

- **Keys** matching: `oauth`, `token`, `secret`, `password`, `cookie`, `refresh`, `api_key`, `api-key`, `apikey`, `bearer`, `credential`, `session_id` (case-insensitive).
- **Values** matching credential shapes:
  - JWT tokens (`eyJ…`)
  - `Bearer <token>` headers
  - Stripe `sk_live_…` / `sk_test_…`
  - Slack `xoxb-…` / `xoxp-…` / etc.
  - GitHub `github_pat_…` / `ghp_…` / `gho_…` / `ghs_…` / `ghr_…`
  - OpenAI / Anthropic `sk-…` (with realistic length)
  - AWS access keys `AKIA…`
  - `Authorization: <scheme> <token>` strings
- Nested objects are walked recursively — a nested field named `refresh_token` (even with an empty value) is rejected.

**What stays local:**

- The DB file lives at `~/.delx-memory/db.sqlite`.
- Directory is created with mode `0700`; file with mode `0600`. (Best effort on Windows / WSL / non-POSIX filesystems.)
- Nothing is uploaded. No telemetry. No phone-home.

**What we do NOT promise:**

- **Other users of the same machine** (root, your `sudo`-using housemate) can read the file. Use full-disk encryption (FileVault, BitLocker, LUKS) if that matters.
- **TTL is best-effort.** Expired rows are deleted lazily on next read; SQLite doesn't `VACUUM` automatically, so freed pages may sit on disk. For sensitive ephemera, treat the DB file like any other unencrypted dotfile.
- **No durability promise.** Back up `~/.delx-memory/db.sqlite` like any other dotfile if you care about losing it.

---

## Example session

```
agent> memory_stats({})
→ { total_keys: 0, db_path: "/Users/me/.delx-memory/db.sqlite", … }

user> Remember that I prefer concise responses in pt-BR.

agent> memory_set({
  key: "user_preferences",
  value: { language: "pt-BR", verbosity: "concise" },
  tags: ["profile", "preferences"],
  explicit_user_intent: true
})
→ { action: "created", key: "user_preferences", … }

# … new chat, possibly different tool …

agent> memory_list({ tag: "preferences" })
→ [{ key: "user_preferences", updated_at: … }]

agent> memory_get({ key: "user_preferences" })
→ { found: true, value: { language: "pt-BR", verbosity: "concise" } }
```

---

## Storage layout

| | |
|---|---|
| Default path | `~/.delx-memory/db.sqlite` |
| Override | `DELX_MEMORY_PATH` env var |
| Directory mode | `0700` |
| File mode | `0600` |
| Schema | `memory(key PRIMARY KEY, value, created_at, updated_at, ttl_expires_at, tags, metadata)` |
| Indexes | partial index on `ttl_expires_at`, plus `tags`, `updated_at` |
| Per-value cap | 64 KB (JSON-serialized) |
| Per-key cap | 512 chars |

---

## CLI

```
delx-memory                Start MCP stdio server
delx-memory --http         Start local HTTP MCP server (127.0.0.1:3030)
delx-memory setup          Print MCP client config snippets
delx-memory setup --json   Print as JSON
delx-memory doctor         Health check + next steps
delx-memory doctor --json  Health check as JSON
delx-memory version        Print version
```

### Environment

| Var | Default | Purpose |
|---|---|---|
| `DELX_MEMORY_PATH` | `~/.delx-memory/db.sqlite` | DB file location |
| `DELX_MEMORY_TRANSPORT` | `stdio` | `stdio` or `http` |
| `DELX_MEMORY_HOST` | `127.0.0.1` | HTTP host |
| `DELX_MEMORY_PORT` | `3030` | HTTP port |
| `DELX_MEMORY_ALLOWED_ORIGIN` | `http://HOST:PORT` | CORS origin |

---

## Development

```bash
git clone https://github.com/davidmosiah/delx-memory
cd delx-memory
npm install
npm test         # typecheck + build + smoke + secret-detector + ttl + tag-delete + metadata
```

See [`AGENTS.md`](./AGENTS.md) for repo conventions, [`SECURITY.md`](./SECURITY.md) for the security model and reporting policy, and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for PR rules.

---

## License

MIT © 2026 David Batista. [Code of Conduct](CODE_OF_CONDUCT.md).
