# Contributing

Thanks for your interest in `delx-memory`.

## Getting started

```bash
git clone https://github.com/davidmosiah/delx-memory
cd delx-memory
npm install
npm test
```

## Pull requests

- Open an issue first if you're proposing a new tool or a change to the secret-detector patterns. Both are load-bearing for the project's contract with users.
- Keep PRs small. One concern per PR.
- All PRs must pass `npm test` (typecheck + build + smoke + secret-detector + ttl + tag-delete + metadata).
- New tools must register under `src/tools/memory-tools.ts` and be covered in `scripts/smoke-tools.mjs`.
- Mutating tools must require `explicit_user_intent: true` — there is no exception to this.
- Avoid adding dependencies. Current deps: `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, `express`, `cors`. That's the budget.

## Reporting bugs

Open a GitHub issue with:

- `delx-memory version`
- `node --version`
- Steps to reproduce
- Expected vs actual behavior
- Anonymized log if relevant (strip any real keys / values)

## Reporting security issues

See [`SECURITY.md`](./SECURITY.md). Do not file public issues for security reports.

## Code of conduct

Be kind. Disagreements about technical direction are expected; disrespect isn't.
