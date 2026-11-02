import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = mkdtempSync(join(tmpdir(), 'memory-contracts-'));
const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const expectedResources = ['memory://inventory','memory://agent-manifest','memory://capabilities','memory://connection-status'].sort();
const peers = [];
async function connect(mode, namespace = '', path = join(root, `${mode}.sqlite`)) {
  const client = new Client({ name: 'memory-contract-test', version: '0.0.0' });
  const transport = new StdioClientTransport({command: process.execPath,
    args: [entry, ...(mode === 'lite' ? [] : mode === 'lean' ? ['--sdk','--lean'] : ['--sdk'])],
    env: {HOME:root, DELX_MEMORY_PATH:path, DELX_MEMORY_NAMESPACE:namespace}, stderr:'pipe'});
  peers.push({client,transport});
  await client.connect(transport);
  return client;
}
async function call(client,name,args) {
  const out = await client.callTool({name, arguments:args});
  assert.notEqual(out.isError,true, `${name} unexpectedly failed`);
  return out.structuredContent;
}
try {
  for (const mode of ['lite','sdk','lean']) {
    const client=await connect(mode);
    const tools=await client.listTools();
    assert.equal(new Set(tools.tools.map(t=>t.name)).size,15);
    let resources;
    try { resources=await client.listResources(); }
    catch(error) { assert.equal(mode,'lean'); assert.equal(error.code,-32601); resources={resources:[]}; }
    assert.deepEqual(resources.resources.map(r=>r.uri).sort(),mode==='sdk'?expectedResources:[]);
    const caps=client.getServerCapabilities();
    assert.equal(Boolean(caps.resources),mode==='sdk');
    const denied=await client.callTool({name:'memory_set',arguments:{key:'contract-fixture',value:'fake-value'}});
    assert.equal(denied.isError,true,'missing explicit intent must remain rejected');
    await call(client,'memory_set',{key:'contract-fixture',value:'fake-value',explicit_user_intent:true});
    assert.equal((await call(client,'memory_get',{key:'contract-fixture'})).value,'fake-value');
    if(mode==='sdk') for(const uri of expectedResources) {
      const read=await client.readResource({uri});assert.equal(read.contents.length,1);
      const data=JSON.parse(read.contents[0].text);assert.ok(data&&typeof data==='object');
      assert.ok(!read.contents[0].text.includes('fake-value'),'metadata resources must not expose stored values');
      assert.ok(!read.contents[0].text.includes('contract-fixture'),'metadata resources must not enumerate keys');
      if(uri==='memory://connection-status')assert.equal(data.total_keys,1);
    }
    console.log(`PASS ${mode}:15 tools,${resources.resources.length} resources, intent + actual read/write`);
    await client.close();
  }
  // Two independent server processes, same fake WAL DB, exact case-distinct scopes.
  const db=join(root,'concurrent.sqlite');
  const a=await connect('sdk','team',db),b=await connect('sdk','TEAM',db);
  await Promise.all(Array.from({length:12},(_,i)=>Promise.all([
    call(a,'memory_set',{key:`a-${i}`,value:`fixture-a-${i}`,explicit_user_intent:true}),
    call(b,'memory_set',{key:`b-${i}`,value:`fixture-b-${i}`,explicit_user_intent:true}),
  ])));
  for(let i=0;i<12;i++) {
    assert.equal((await call(a,'memory_get',{key:`a-${i}`})).value,`fixture-a-${i}`);
    assert.equal((await call(b,'memory_get',{key:`b-${i}`})).value,`fixture-b-${i}`);
    assert.equal((await call(a,'memory_get',{key:`b-${i}`})).found,false);
    assert.equal((await call(b,'memory_get',{key:`a-${i}`})).found,false);
  }
  console.log('PASS concurrent SDK processes:24 writes retained; case-distinct namespace exact reads');
} finally {
  for(const {client} of peers)await client.close().catch(()=>{});
  rmSync(root,{recursive:true,force:true});
}
