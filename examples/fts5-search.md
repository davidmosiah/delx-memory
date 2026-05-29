# Quickstart: full-text search (FTS5)

`memory_search` is backed by SQLite's [FTS5](https://www.sqlite.org/fts5.html)
engine (added in **v0.2.0**). Queries are ranked by
[bm25](https://www.sqlite.org/fts5.html#the_bm25_function) relevance — with the
`key` column weighted heaviest — and benefit from Porter stemming, diacritic
folding, and per-token prefix matching. The `key`, `value` **and** `tags` of
every entry are indexed. If the local SQLite build lacks the FTS5 module the
tool transparently falls back to a LIKE substring scan and reports
`engine: "like"`.

## Run it yourself

[`fts5-search-quickstart.mjs`](./fts5-search-quickstart.mjs) boots the real MCP
server against a throwaway database, seeds five entries, and runs four searches:

```bash
npm run build
node examples/fts5-search-quickstart.mjs
```

It uses an ephemeral temp DB (via `DELX_MEMORY_PATH`), so your real
`~/.delx-memory/db.sqlite` is never touched.

## What the agent stored

| key | value (abridged) | tags |
|---|---|---|
| `user_preferences` | `{ language: "pt-BR", verbosity: "concise", … }` | `profile`, `preferences` |
| `project_spira` | "Regenerative social network. Going **open-source** under AGPL…" | `project`, `open-source` |
| `deploy_runbook` | "Production **deploys** run on Vercel…" | `ops`, `deployment` |
| `meeting_notes_gabi` | "…**licença** AGPL plus a hosted tier. **Próxima** reunião…" | `project`, `notes` |
| `favorite_editor` | "Prefers Cursor… falls back to Neovim…" | `preferences`, `tools` |

## Captured output

The output below is verbatim from the script — `score` is the negated bm25
rank (higher = more relevant), and `engine` confirms FTS5 served the query.

### 1. Multi-word — ranks the entry matching the most terms first

```
$ memory_search({ query: "open source project" })
  engine=fts5  count=2
    # 1  score=8.055    project_spira
         "Regenerative social network. Going open-source under AGPL. Stack is Next.js + Supabase."
    # 2  score=0.892    meeting_notes_gabi
         "Discussed Spira monetisation: licença AGPL plus a hosted tier. Próxima reunião in two weeks."
```

`project_spira` carries the `open-source` tag *and* the `project` tag, so it
scores ~9× higher than `meeting_notes_gabi`, which only matches `project`. With
the old LIKE scan both would have come back in last-write order, unranked.

### 2. Prefix — a partial word matches longer forms

```
$ memory_search({ query: "deploy" })
  engine=fts5  count=1
    # 1  score=3.993    deploy_runbook
         "Production deploys run on Vercel. Push to main, wait for the preview, then promote."
```

`deploy` matches the stored word `deploys` (prefix + stemming) — no wildcard
needed in the query.

### 3. Diacritic-insensitive — ASCII query finds accented text

```
$ memory_search({ query: "licenca AGPL" })
  engine=fts5  count=2
    # 1  score=2.724    meeting_notes_gabi
         "Discussed Spira monetisation: licença AGPL plus a hosted tier. Próxima reunião in two weeks."
    # 2  score=0.654    project_spira
         "Regenerative social network. Going open-source under AGPL. Stack is Next.js + Supabase."
```

`licenca` (no cedilla) finds `licença`. The note that contains **both**
`licença` and `AGPL` ranks above the one matching only `AGPL`.

### 4. Tags are indexed too

```
$ memory_search({ query: "preferences" })
  engine=fts5  count=2
    # 1  score=1.314    user_preferences
         {"language":"pt-BR","verbosity":"concise","tone":"direct"}
    # 2  score=1.042    favorite_editor
         "Prefers Cursor for day-to-day editing; falls back to Neovim on the server."
```

Neither value body contains the word "preferences" — both match purely on their
`preferences` **tag**, which the FTS index covers alongside key and value.
