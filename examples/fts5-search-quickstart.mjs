// FTS5 search quickstart — boots the real delx-memory MCP server over stdio,
// seeds a handful of realistic memory entries, then runs a few `memory_search`
// queries to show off the v0.2 full-text engine: bm25 relevance ranking,
// multi-word queries, prefix matching and diacritic folding.
//
// Run it against an EPHEMERAL DB so it never touches your real store:
//
//   npm run build
//   node examples/fts5-search-quickstart.mjs
//
// The Markdown walkthrough in examples/fts5-search.md is just the captured
// output of this script.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(join(tmpdir(), "delx-memory-fts5-demo-"));
const dbPath = join(workDir, "db.sqlite");

const client = new Client({ name: "delx-memory-fts5-demo", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [join(repoRoot, "dist/index.js")],
  env: { ...process.env, DELX_MEMORY_PATH: dbPath },
});

// A few entries an agent might accumulate across sessions and tools.
const seed = [
  {
    key: "user_preferences",
    value: { language: "pt-BR", verbosity: "concise", tone: "direct" },
    tags: ["profile", "preferences"],
  },
  {
    key: "project_spira",
    value:
      "Regenerative social network. Going open-source under AGPL. Stack is Next.js + Supabase.",
    tags: ["project", "open-source"],
  },
  {
    key: "deploy_runbook",
    value:
      "Production deploys run on Vercel. Push to main, wait for the preview, then promote.",
    tags: ["ops", "deployment"],
  },
  {
    key: "meeting_notes_gabi",
    value:
      "Discussed Spira monetisation: licença AGPL plus a hosted tier. Próxima reunião in two weeks.",
    tags: ["project", "notes"],
  },
  {
    key: "favorite_editor",
    value: "Prefers Cursor for day-to-day editing; falls back to Neovim on the server.",
    tags: ["preferences", "tools"],
  },
];

function show(label, res) {
  const sc = res.structuredContent ?? {};
  console.log(`\n$ memory_search({ query: ${JSON.stringify(sc.query)} })`);
  console.log(`  ${label}`);
  console.log(`  engine=${sc.engine}  count=${sc.count}`);
  for (const hit of sc.results ?? []) {
    console.log(
      `    #${(sc.results.indexOf(hit) + 1).toString().padStart(2)}  score=${String(
        hit.score,
      ).padEnd(7)}  ${hit.key}`,
    );
    console.log(`         ${hit.snippet}`);
  }
}

await client.connect(transport);
try {
  for (const e of seed) {
    await client.callTool({
      name: "memory_set",
      arguments: { ...e, explicit_user_intent: true },
    });
  }

  // 1. Multi-word query — both terms inform the bm25 ranking.
  show(
    "multi-word: ranks the entry mentioning BOTH terms first",
    await client.callTool({
      name: "memory_search",
      arguments: { query: "open source project" },
    }),
  );

  // 2. Prefix matching — a partial word still hits ("deploy" -> "deploys").
  show(
    "prefix: partial word matches stemmed/longer forms",
    await client.callTool({
      name: "memory_search",
      arguments: { query: "deploy" },
    }),
  );

  // 3. Diacritic folding — ascii query finds accented stored text.
  show(
    "diacritic-insensitive: 'licenca' finds 'licença'",
    await client.callTool({
      name: "memory_search",
      arguments: { query: "licenca AGPL" },
    }),
  );

  // 4. Searches tags too — 'preferences' is a tag, not body text.
  show(
    "tags are indexed: matches entries tagged 'preferences'",
    await client.callTool({
      name: "memory_search",
      arguments: { query: "preferences" },
    }),
  );
} finally {
  await client.close();
  rmSync(workDir, { recursive: true, force: true });
}
