# Delx Memory — Agent Plugins package

Portable [Agent Plugins](https://agent-plugins.org/) v1 package for
[Hermes Agent](https://github.com/NousResearch/hermes-agent) and other Agent Plugins clients:
the `delx-memory` MCP server (`delx-memory@0.4.2` over stdio) plus the `delx-memory` workflow skill.

## Install (Hermes Agent)

```bash
hermes plugins install davidmosiah/delx-memory/agent-plugin --no-enable
hermes plugins enable delx-memory
```

Requires Node.js 20+ (`npx` on PATH). The skill loads as `delx-memory:delx-memory`.

## Connector setup

```bash
npx -y delx-memory@0.4.2 doctor
```

No setup; the database is created on first write.

## Disclosure

Runs the `delx-memory@0.4.2` npm package locally over stdio through `npx` (Node.js 20+ required); the package is downloaded from npm on first start. Data source: no network service: a local SQLite database at ~/.delx-memory/db.sqlite (override with DELX_MEMORY_PATH). Tools that change state: memory_set / memory_set_batch; memory_forget, memory_forget_by_tag (local rows only). Never store secrets, credentials or other people's personal data in memory. Any agent on this machine that runs delx-memory reads the same database. The tool set comes from the pinned npm version, not from this repository's source tree.
