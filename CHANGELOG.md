# Changelog

All notable changes to `delx-memory` follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adhere to [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-29

### Added
- FTS5 full-text search backing `memory_search`: an external-content virtual
  table mirrors `key`/`value`/`tags`, kept in sync via insert/update/delete
  triggers. Queries use bm25 relevance ranking (key-weighted), Porter stemming,
  diacritic folding, and per-token prefix matching, so multi-word, partial and
  accent-insensitive queries now rank by relevance instead of last-write order.
- `memory_search` responses now include an `engine` field (`"fts5"` or
  `"like"`) so callers can see which path served the query.

### Changed
- `memory_search` automatically falls back to the previous LIKE substring scan
  when the SQLite build lacks the FTS5 module, preserving behavior everywhere.
- Existing 0.1.x databases are backfilled into the FTS index on first open
  after upgrade — no manual migration needed.

## [0.1.0] — 2026-05-23

Initial release.

### Added
- 8 MCP tools: `memory_get`, `memory_list`, `memory_search`, `memory_stats`, `memory_set`, `memory_forget`, `memory_forget_by_tag`, `memory_export`.
- SQLite store at `~/.delx-memory/db.sqlite` (override via `DELX_MEMORY_PATH`).
- Directory `0700` + file `0600` permissions (POSIX best-effort).
- Credential-shape refusal — keys + nested values walked for OAuth/Bearer/Stripe/Slack/GitHub/OpenAI/AWS/Authorization patterns.
- `explicit_user_intent: true` gate on every mutating tool.
- TTL with lazy expiry sweep on every read.
- Tags + prefix filters on `memory_list`.
- LIKE-based keyword search across keys and values (FTS planned for a later release).
- Export to JSON / JSONL / Markdown with optional `since` / `until` window on `updated_at`.
- CLI: `setup`, `doctor`, `version`, `help` plus `--http` / `--json` flags.
- HTTP transport binding `127.0.0.1:3030` by default with strict CORS.

### Security
- No telemetry, no phone-home.
- All test scripts use ephemeral tmpdirs — no test ever touches the user's real DB.

[0.2.0]: https://github.com/davidmosiah/delx-memory/releases/tag/v0.2.0
[0.1.0]: https://github.com/davidmosiah/delx-memory/releases/tag/v0.1.0
