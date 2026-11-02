import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
// Caller provides the locally built, SHA-pinned scorecard checkout, not a URL.
const scorecard=process.argv[2];
if(!scorecard)throw new Error('Provide reviewed local scorecard checkout');
const {runAudit}=await import(pathToFileURL(resolve(scorecard,'dist/audit/runner.js')).href);
const {resolveLocal}=await import(pathToFileURL(resolve(scorecard,'dist/resolvers/local-resolver.js')).href);
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'scorecard-results');mkdirSync(output,{recursive:true});
for(const mode of ['lite','sdk']) {
  const target=resolveLocal(root);
  target.command=process.execPath;
  target.args=[fileURLToPath(new URL('./scorecard-target.mjs',import.meta.url)),mode];
  const report=await runAudit(target);
  writeFileSync(resolve(output,`${mode}.json`),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({mode,report}));
  // Retain raw metrics, including lite's intentional resources FAIL. Do not
  // modify report/check weights or pretend default lite has the SDK surface.
  const resources=report.checks.find(c=>c.id==='resources');assert.ok(resources);
  assert.equal(resources.status,mode==='sdk'?'pass':'fail');
  assert.equal(resources.score,mode==='sdk'?10:0);
  const expectedIds=['schema_validity','tool_naming','dense_series_caps','privacy_modes',
    'mutation_gating','agent_manifest','smoke_test','resources','tool_descriptions',
    'annotations','manifest_discoverability'].sort();
  assert.deepEqual(report.checks.map(c=>c.id).sort(),expectedIds,
    'all eleven distinct existing checks must remain present');
  const schema=report.checks.find(c=>c.id==='schema_validity');
  assert.equal(schema.score,10);assert.deepEqual(schema.details,[]);
  for(const check of report.checks) {
    if(mode==='lite' && check.id==='resources')continue;
    assert.equal(check.status,'pass',`${mode}: ${check.id} ${check.summary}`);
  }
}
