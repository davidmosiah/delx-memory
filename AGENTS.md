# Agent Development Notes

## Scope

This repo is a local-first persistent memory MCP server. It stores small key/value entries in SQLite for AI agents to share across sessions and across tools.

## Commands

- Install: `npm ci`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Fast smoke: `npm run smoke`
- Full gate: `npm test`

## Rules

- **Never** commit a `.sqlite` file, a `.env`, or any real user memory contents.
- Keep the secret-detector patterns conservative on the KEY side (false positives are fine — users can pick a different key name) and high-specificity on the VALUE side (false positives there would block legitimate notes containing words like "token", "refresh", "secret").
- Every mutating tool **must** require `explicit_user_intent: true`. Do not add a tool that mutates without it.
- Tools that mutate **must** preserve idempotence where reasonable (e.g. `memory_forget` returns `existed: false` rather than throwing on missing key).
- Keep the per-value cap at 64 KB. This is a tripwire against blob-storage misuse.
- Tests must use ephemeral tmpdirs (`mkdtempSync`) and clean up. Never let a test write to `~/.delx-memory/`.
- No telemetry. No outbound network calls anywhere in the package except over the HTTP transport when the user opts in.

## Agent-readiness checklist

Before publishing a new version:

1. `npm test` clean
2. `npm pack --dry-run` — confirm only `dist/`, docs, `examples/`, `server.json`, `llms.txt` are packaged
3. `git log -p | grep -iE 'token|secret|api_key'` — confirm no real credentials slipped in
4. Bump `version` in `package.json`, `server.json`, and `src/constants.ts` together
5. Update `CHANGELOG.md`
