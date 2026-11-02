import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dir = mkdtempSync(join(tmpdir(), 'memory-limits-'));
const env = { ...process.env, DELX_MEMORY_PATH: join(dir, 'test.sqlite') };
const client = new Client({ name: 'local-limits-test', version: '1' });
let child;
let checks = 0;
async function denied(args) {
  let response, error;
  try { response = await client.callTool({ name: 'memory_stats', arguments: args }); }
  catch (caught) { error = caught; }
  const text = error ? String(error.message) : JSON.stringify(response);
  assert.match(text, /more than the maximum of 10000 elements/);
  checks++;
}
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/index.js', '--sdk'], env }));
  for (const args of [{}, { extra: Array(9999).fill(0) }]) {
    const result = await client.callTool({ name: 'memory_stats', arguments: args });
    assert.notEqual(result.isError, true); checks++;
  }
  await denied({ extra: Array(10000).fill(0) });
  await denied(Object.fromEntries(Array.from({ length: 10001 }, (_, i) => ['x' + i, 0])));
  await denied({ nested: { extra: Array(9999).fill(0) } });
  assert.notEqual((await client.callTool({ name: 'memory_stats', arguments: {} })).isError, true); checks++;
  await client.close();

  // Test server is loopback-only with an ephemeral fake database, no providers.
  const port = 23000 + (process.pid % 10000);
  child = spawn(process.execPath, ['dist/index.js', '--http'], { env: { ...env, DELX_MEMORY_HOST: '127.0.0.1', DELX_MEMORY_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('HTTP child exited: ' + stderr);
    try { ready = (await fetch(url + '/health')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, stderr);
  for (const [length, rejected] of [[9999, false], [10000, true]]) {
    const response = await fetch(url + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'memory_stats', arguments: { extra: Array(length).fill(0) } } }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    if (rejected) assert.match(JSON.stringify(body), /more than the maximum of 10000 elements/);
    else { assert.equal(body.error, undefined); assert.notEqual(body.result?.isError, true); assert.equal(body.result?.structuredContent?.total_keys, 0); }
    checks++;
  }
  for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]]) {
    const result = await fetch(url + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding }, body: compress(Buffer.from('{}')) });
    assert.equal(result.status, 415); checks++;
  }
  const malformed = await fetch(url + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400); checks++;
  const large = await fetch(url + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(1024 * 1024) }) });
  assert.equal(large.status, 413); checks++;
  const healthy = await fetch(url + '/health'); assert.equal(healthy.status, 200); checks++;
  console.log(JSON.stringify({ ok: true, suite: 'input-limits', checks }));
} finally {
  await client.close().catch(() => undefined);
  if (child && child.exitCode === null) {
    child.kill(); await new Promise(resolve => child.once('close', resolve));
  }
  rmSync(dir, { recursive: true, force: true });
}
