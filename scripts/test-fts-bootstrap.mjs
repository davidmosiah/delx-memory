import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {getDb,closeDb,buildFtsMatch,isFtsReady} from '../dist/services/db.js';
const root=mkdtempSync(join(tmpdir(),'memory-bootstrap-test-'));
const oldPath=process.env.DELX_MEMORY_PATH;
function legacy(file,index=false,partial=false){
 const db=new Database(file);
 db.exec('CREATE TABLE memory(key TEXT PRIMARY KEY,value TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,ttl_expires_at INTEGER,tags TEXT,metadata TEXT)');
 const insert=db.prepare('INSERT INTO memory VALUES(?,?,1,1,NULL,?,NULL)');
 insert.run('legacy-a','quasar one',',legacytag,');insert.run('legacy-b','quasar two',null);
 if(index){
  db.exec("CREATE VIRTUAL TABLE memory_fts USING fts5(key,value,tags,content='memory',content_rowid='rowid',tokenize='porter unicode61 remove_diacritics 2')");
  if(partial)db.exec("INSERT INTO memory_fts(rowid,key,value,tags) SELECT rowid,key,value,tags FROM memory WHERE key='legacy-a'");
 }
 const rows=db.prepare('SELECT * FROM memory ORDER BY key').all();db.close();return rows;
}
function hits(db,q){return db.prepare('SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?').all(buildFtsMatch(q)).length;}
try {
 for(const [name,index,partial] of [['new',false,false],['empty-existing',true,false],['partial-existing',true,true]]){
  const file=join(root,`${name}.sqlite`),before=legacy(file,index,partial);process.env.DELX_MEMORY_PATH=file;
  let db=getDb();assert.equal(isFtsReady(),true);assert.equal(hits(db,'quasar'),2);assert.equal(hits(db,'legacytag'),1);
  assert.deepEqual(db.prepare('SELECT * FROM memory ORDER BY key').all(),before,'backfill must preserve all user rows');
  db.exec("UPDATE memory SET value='nebula' WHERE key='legacy-a'");assert.equal(hits(db,'quasar'),1);assert.equal(hits(db,'nebula'),1);
  db.exec("DELETE FROM memory WHERE key='legacy-b'");assert.equal(hits(db,'quasar'),0);
  closeDb();db=getDb();assert.equal(hits(db,'nebula'),1);db.exec("INSERT INTO memory_fts(memory_fts,rank) VALUES('integrity-check',1)");closeDb();
  console.log(`PASS ${name}: backfill, preservation, tag, triggers, reopen, integrity`);
 }
 // Inject process death after the real bootstrap callback, BEFORE SQLite's
 // transaction wrapper commits. Only the child/new fake database is affected.
 const crashFile=join(root,'crash.sqlite'),original=legacy(crashFile);
 const child=spawnSync(process.execPath,['--input-type=module','-e',`
 import Database from 'better-sqlite3';
 const transaction=Database.prototype.transaction;
 Database.prototype.transaction=function(fn){return transaction.call(this,function(...args){const out=fn.apply(this,args);process.kill(process.pid,'SIGKILL');return out;});};
 const {getDb}=await import('./dist/services/db.js');getDb();
 `],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,HOME:root,DELX_MEMORY_PATH:crashFile},encoding:'utf8',timeout:10000});
 assert.equal(child.signal,'SIGKILL',child.stderr);
 const check=new Database(crashFile);assert.deepEqual(check.prepare('SELECT * FROM memory ORDER BY key').all(),original);
 assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='memory_fts'").get().n,0,'uncommitted bootstrap must roll back');check.close();
 process.env.DELX_MEMORY_PATH=crashFile;const recovered=getDb();assert.equal(hits(recovered,'quasar'),2);closeDb();
 console.log('PASS injected pre-commit crash: original rows intact, bootstrap rolled back, reopen recovers');
} finally {closeDb();if(oldPath===undefined)delete process.env.DELX_MEMORY_PATH;else process.env.DELX_MEMORY_PATH=oldPath;rmSync(root,{recursive:true,force:true});}
