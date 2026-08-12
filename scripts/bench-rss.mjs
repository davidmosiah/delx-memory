#!/usr/bin/env node
/**
 * Rough RSS probe for lite vs sdk after initialize + tools/list.
 * Not a scientific benchmark — directional proof for docs.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function probe(label, args) {
  const dir = mkdtempSync(join(tmpdir(), `delx-mem-bench-${label}-`));
  const db = join(dir, "db.sqlite");
  const p = spawn("node", ["dist/index.js", ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DELX_MEMORY_PATH: db },
  });
  const send = (obj) => p.stdin.write(JSON.stringify(obj) + "\n");
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "bench", version: "0" },
    },
  });
  await sleep(200);
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  await sleep(600);
  let rss = null;
  try {
    rss = Number(execSync(`ps -o rss= -p ${p.pid}`).toString().trim());
  } catch {
    rss = null;
  }
  p.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
  return { label, rss_kb: rss };
}

const lite = await probe("lite", ["--lite"]);
const sdk = await probe("sdk", ["--sdk"]);
console.log(
  JSON.stringify(
    {
      ok: true,
      suite: "bench-rss",
      results: [lite, sdk],
      delta_kb: lite.rss_kb != null && sdk.rss_kb != null ? sdk.rss_kb - lite.rss_kb : null,
      note: "macOS RSS KB after initialize+tools/list; directional only",
    },
    null,
    2,
  ),
);
