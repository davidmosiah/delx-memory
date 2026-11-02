// Copy into an isolated snapshot's scripts/ AFTER applying recall patch/building.
// Run: node --test scripts/test-memory-search-recall-integration.mjs
// Only fake SQLite data under this process's newly-created temp directory.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { capturingServer, getCatalogTool } from '../dist/tool-registry.js';
import { registerMemoryTools } from '../dist/tools/memory-tools.js';
import { getDb, closeDb, isFtsReady, buildFtsMatch } from '../dist/services/db.js';

registerMemoryTools(capturingServer());
const query = 'quasar';
const limit = 2;
async function search() {
  const response = await getCatalogTool('memory_search').handler({query, limit});
  assert.notEqual(response.isError, true, JSON.stringify(response));
  assert.ok(response.structuredContent, 'search returns structuredContent');
  return response.structuredContent;
}
function likeScore(row) {
  return (row.key.toLowerCase().includes(query) ? 5 : 0)
    + (row.value.toLowerCase().split(query).length - 1);
}
function expectedLike(db, namespace) {
  const prefix = namespace === null ? null : `${namespace}::`;
  const rows = db.prepare(`SELECT * FROM memory
    WHERE (key LIKE ? OR value LIKE ?) ${prefix ? 'AND instr(key, ?) = 1' : ''}
    ORDER BY updated_at DESC LIMIT ?`).all(`%${query}%`, `%${query}%`, ...(prefix ? [prefix] : []), limit * 4);
  return rows.map(row => ({key: prefix ? row.key.slice(prefix.length) : row.key, score: likeScore(row)}))
    .filter(row => row.score > 0).sort((a,b) => b.score-a.score).slice(0,limit);
}
function expectedFts(db, namespace) {
  // Independently take the complete global rank order, THEN exact-scope and slice.
  // Preserves corpus-wide bm25 statistics and tests namespace-before-LIMIT.
  const rows = db.prepare(`SELECT m.key, bm25(memory_fts, 5.0, 1.0, 2.0) AS rank
    FROM memory_fts JOIN memory m ON m.rowid = memory_fts.rowid
    WHERE memory_fts MATCH ? ORDER BY rank`).all(buildFtsMatch(query));
  const prefix = namespace === null ? null : `${namespace}::`;
  return rows.filter(row => !prefix || row.key.startsWith(prefix)).slice(0,limit)
    .map(row => ({key: prefix ? row.key.slice(prefix.length) : row.key, score: Math.round(-row.rank*1000)/1000}));
}
function projected(result) {
  return result.results.map(({key,score}) => ({key,score}));
}

for (const [own, other] of [
  ['team','TEAM'], ['team_%\\lab','teamXYlab'], ['team','teamExtra'],
  ['équipe','e\u0301quipe'], ['😀','😃'],
]) {
  await test(`memory_search exact scope + recall: ${JSON.stringify(own)}`, async () => {
    const dir = mkdtempSync(join(tmpdir(),'memory-search-recall-'));
    const oldPath = process.env.DELX_MEMORY_PATH;
    const oldNamespace = process.env.DELX_MEMORY_NAMESPACE;
    process.env.DELX_MEMORY_PATH = join(dir,'fake.sqlite');
    process.env.DELX_MEMORY_NAMESPACE = own;
    try {
      const db = getDb();
      assert.equal(isFtsReady(), true, 'requires actual better-sqlite3 FTS5; do not silently skip');
      const insert = db.prepare(`INSERT INTO memory
        (key,value,created_at,updated_at,ttl_expires_at,tags,metadata)
        VALUES (?,?,?,?,NULL,NULL,NULL)`);
      // Own matches have lower global FTS rank and older timestamps.
      for (let i=0;i<4;i++) {
        insert.run(`${own}::own-${i}`, `${query} ${'filler '.repeat(20+i*15)}`, 100+i, 100+i);
      }
      // Includes key-only hits: catches unparenthesized LIKE OR scope bypass.
      for (let i=0;i<24;i++) {
        insert.run(`${other}::quasar-${i}`, i%2 ? 'other-only' : 'quasar', 1000+i, 1000+i);
      }
      insert.run('quasar-global', 'global-only', 3000, 3000);
      const oldGlobalTop = expectedFts(db,null);
      assert.equal(oldGlobalTop.filter(row => row.key.startsWith(`${own}::`)).length,0,
        'fixture must reproduce original FTS starvation, not only test happy path');
      const fts = await search();
      assert.equal(fts.engine,'fts5');
      assert.equal(fts.namespace,own);
      assert.equal(fts.count,limit);
      assert.deepEqual(projected(fts),expectedFts(db,own));
      assert.ok(fts.results.every(row => row.key.startsWith('own-')));
      delete process.env.DELX_MEMORY_NAMESPACE;
      const globalFts = await search();
      assert.equal(globalFts.namespace,null);
      assert.deepEqual(projected(globalFts),expectedFts(db,null));

      // Force real exception-to-LIKE path. isFtsReady is cached true on this
      // connection, so dropping only the FTS table makes its query fail safely.
      // Triggers are dropped first, solely in our new fake DB. Never reopen it
      // before these assertions (getDb bootstrap would recreate FTS).
      assert.equal(isFtsReady(),true);
      db.exec(`DROP TRIGGER memory_fts_ai; DROP TRIGGER memory_fts_ad;
        DROP TRIGGER memory_fts_au; DROP TABLE memory_fts;`);
      assert.equal(isFtsReady(),true,'exercise FTS exception fallback, not cache flag mutation');
      assert.equal(expectedLike(db,null).filter(row => row.key.startsWith(`${own}::`)).length,0,
        'fixture reproduces original LIKE starvation');
      process.env.DELX_MEMORY_NAMESPACE = own;
      const like = await search();
      assert.equal(like.engine,'like');
      assert.equal(like.namespace,own);
      assert.equal(like.count,limit);
      assert.deepEqual(projected(like),expectedLike(db,own));
      assert.ok(like.results.every(row => row.key.startsWith('own-')));
      delete process.env.DELX_MEMORY_NAMESPACE;
      const globalLike = await search();
      assert.equal(globalLike.engine,'like');
      assert.equal(globalLike.namespace,null);
      assert.deepEqual(projected(globalLike),expectedLike(db,null));
    } finally {
      closeDb();
      if (oldPath === undefined) delete process.env.DELX_MEMORY_PATH;
      else process.env.DELX_MEMORY_PATH = oldPath;
      if (oldNamespace === undefined) delete process.env.DELX_MEMORY_NAMESPACE;
      else process.env.DELX_MEMORY_NAMESPACE = oldNamespace;
      // Only the exact mkdtemp result created above; no caller-supplied path.
      rmSync(dir,{recursive:true,force:true});
    }
  });
}
