# Security Policy

## Threat model

`delx-memory` is a single-user, local-first key/value store exposed over MCP. It is intended to be opened by AI agents running on the same machine as the user. The threat model is:

- **In scope:** an over-eager agent silently writing the user's OAuth tokens, API keys, refresh tokens, or session cookies into shared local memory where another agent could read them.
- **In scope:** an agent on the same machine quietly mutating memory the user did not ask to change.
- **Out of scope:** physical access to the host. Other root-level users on the same machine. Backups copied off-host. Network-level attackers (no network exposure by default — stdio only).

## What we do

1. **Credential-shape refusal.** Keys matching `oauth|token|secret|password|cookie|refresh|api[_-]?key|bearer|credential|session[_-]?id` are refused. String values matching JWT / `Bearer …` / `sk_live_…` / `xoxb-…` / `github_pat_…` / `ghp_…` / OpenAI `sk-…` / AWS `AKIA…` / `Authorization:` header shapes are refused. Nested objects are walked recursively.
2. **Mutation gating.** Every mutating tool (`memory_set`, `memory_forget`, `memory_forget_by_tag`, `memory_export`) requires `explicit_user_intent: true`. An agent that decides on its own to mutate must show its work — the user can see the flag in the tool call.
3. **File permissions.** Directory created at `0700`, file at `0600` (best effort on non-POSIX filesystems).
4. **No network by default.** stdio transport only unless the user opts in with `--http` or `DELX_MEMORY_TRANSPORT=http`. HTTP mode binds to `127.0.0.1` and uses a strict CORS origin.
5. **No telemetry, no phone-home.** The package never makes a network request other than what the user explicitly does over the HTTP transport.

## What we do NOT promise

- **Other users on the same machine can read the file.** Standard Unix permissions block group/world reads, but root and `sudo`-capable users can still read it. Use full-disk encryption if you need protection at that level.
- **TTL is best-effort.** Expired rows are deleted lazily on next read. `VACUUM` is not automatic, so freed pages may persist on disk.
- **Per-value cap is 64 KB.** This is a tripwire to discourage misuse as a blob store, not a security boundary.

## Reporting a vulnerability

Email `support@delx.ai` with subject `delx-memory security:`. Please do not open a public GitHub issue for security reports. Coordinated disclosure preferred — we will respond within 7 days.

## Versioning

This project uses semver. Security fixes will be released as patch versions and noted in `CHANGELOG.md`.
