# X post drafts — delx-memory 0.4.0

Não postado. Escolhe um. Claims batem com código + npm + benches locais (sem inventar stars/usuários).

---

## A — principal (recomendado, thread 1/3)

**1/3**

Your agents forget everything the moment you close the tab.

Claude Desktop ≠ Cursor ≠ Hermes ≠ Codex.

I built **delx-memory** — local SQLite memory any MCP client shares.

No cloud. No embeddings tax. No telemetry.

`npx -y delx-memory`

https://github.com/davidmosiah/delx-memory

**2/3**

What “SOTA for agents” actually means here (not a vector demo):

• **lite transport by default** — tools MCP without loading the full MCP SDK (~18MB less RSS than sdk path on my Mac)
• **explicit_user_intent** on every write — agents can’t silently rewrite your life
• **secret-blocking** — refuses tokens/passwords by shape
• **FTS5 bm25** search (local)
• **namespaces** for multi-agent isolation (`DELX_MEMORY_NAMESPACE`)
• **memory_handoff** — one call to resume a session
• **batch set/get** — atomic multi-key writes

0.4.0 on npm.

**3/3**

If you run more than one agent on the same machine and you’re tired of re-explaining yourself:

```
npx -y delx-memory doctor
```

Wire it once. Every client hits the same file under `~/.delx-memory/`.

MIT. Local-first. Your DB.

Stars help other builders find it → https://github.com/davidmosiah/delx-memory

---

## B — single banger (≤280-ish with link)

Your AI forgets you every session.

delx-memory = shared local SQLite for Claude/Cursor/Hermes/Codex via MCP.

Lite by default (no SDK bloat). Secret-blocking. Intent-gated writes. FTS5. Multi-agent namespaces. One-call handoff.

`npx -y delx-memory`

https://github.com/davidmosiah/delx-memory

---

## C — builder/technical

Most “agent memory” is either:
1) cloud RAG with your life as training fuel, or
2) a toy JSON file that dies with the process.

delx-memory is the boring third option: **SQLite + MCP**, hardened for agents.

• default transport does not load @modelcontextprotocol/sdk
• mutations require explicit_user_intent: true
• refuses credential-shaped keys/values
• FTS5 bm25, namespaces, handoff + batch tools in 0.4.0

https://www.npmjs.com/package/delx-memory

---

## D — PT (se quiser audiência BR)

Seu agente esquece tudo quando fecha a aba.

delx-memory: memória local em SQLite que Claude, Cursor, Hermes e Codex compartilham via MCP.

Sem cloud. Sem telemetria. Writes só com intent explícito. Bloqueia segredo. Busca FTS5. Namespace multi-agente. Handoff em 1 call.

`npx -y delx-memory`

https://github.com/davidmosiah/delx-memory

---

## Não usar

- “10k engineers use this” / “#1 memory” / números de user inventados
- prometer embeddings, multi-user cloud, ou Bun first-class (ainda não)
- before/after de stars inventado

Números honestos se precisar de social proof:
- npm ~90–100 downloads/semana (ainda cedo; fleet wellness é maior)
- RSS lite ~52MB vs sdk ~70MB no meu Mac (bench no repo)
