// Audits only this reviewed package against a fresh throwaway database.
// Mode selection happens here because scorecard intentionally does not forward
// arbitrary DELX_* environment variables into its subprocess.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mode=process.argv[2];
if(!['lite','sdk'].includes(mode))throw new Error('Expected lite or sdk audit mode');
const root=mkdtempSync(join(tmpdir(),'memory-scorecard-'));
process.env.DELX_MEMORY_PATH=join(root,'fake.sqlite');
delete process.env.DELX_MEMORY_NAMESPACE;
delete process.env.DELX_MEMORY_LEAN;
process.env.DELX_MEMORY_TRANSPORT=mode;
process.argv=[process.execPath,'delx-memory',mode==='sdk'?'--sdk':'--lite'];
process.on('exit',()=>rmSync(root,{recursive:true,force:true}));
process.on('SIGTERM',()=>process.exit(0));
await import('../dist/index.js');
