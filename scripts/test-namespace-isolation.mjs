import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { capturingServer, getCatalogTool } from "../dist/tool-registry.js";
import { registerMemoryTools } from "../dist/tools/memory-tools.js";
import { closeDb } from "../dist/services/db.js";
registerMemoryTools(capturingServer());
async function call(name, input) {
  const result = await getCatalogTool(name).handler(input);
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return result.structuredContent;
}
for (const [own, other] of [["team", "TEAM"], ["team_%\\lab", "teamXYlab"], ["team", "teamExtra"], ["équipe", "équipe"], ["😀", "😃"]]) {
  await test(`namespace list and handoff: ${own} versus ${other}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-ns-"));
    const oldPath = process.env.DELX_MEMORY_PATH;
    const oldNs = process.env.DELX_MEMORY_NAMESPACE;
    process.env.DELX_MEMORY_PATH = join(dir, "test.sqlite");
    try {
      for (const [ns, key, value] of [[undefined,"global","global-only"],[other,"shared","other-only"],[own,"shared","own-only"],[own,"kept","own-kept"],[own,"%literal","percent"],[own,"_literal","underscore"],[own,"\\\\literal","backslash"]]) {
        if (ns === undefined) delete process.env.DELX_MEMORY_NAMESPACE;
        else process.env.DELX_MEMORY_NAMESPACE = ns;
        await call("memory_set", {key,value,tags:["scratch"],explicit_user_intent:true});
      }
      const list = await call("memory_list", {});
      assert.equal(list.count, 5);
      assert.deepEqual(list.keys.map(x => x.key).sort(), ["%literal", "\\\\literal", "_literal", "kept", "shared"]);
      const prefix = await call("memory_list", {prefix:"sha",tag:"scratch"});
      assert.equal(prefix.count, 1);
      assert.equal(prefix.keys[0].key, "shared");
      for (const [query, expected] of [["SHA","shared"],["%","%literal"],["_","_literal"],["\\\\","\\\\literal"]]) {
        const exact = await call("memory_list", {prefix:query});
        assert.equal(exact.count,1, `literal prefix ${query}`);
        assert.equal(exact.keys[0].key,expected);
      }
      for (const include_values of [false,true]) {
        const handoff = await call("memory_handoff", {include_values});
        assert.equal(handoff.total_keys,5);
        assert.equal(handoff.recent.length,5);
        assert.doesNotMatch(JSON.stringify(handoff), /other-only|global-only/);
        if (include_values) assert.match(JSON.stringify(handoff), /own-only/);
      }
      delete process.env.DELX_MEMORY_NAMESPACE;
      assert.equal((await call("memory_list", {} )).count,7);
      assert.equal((await call("memory_handoff", {include_values:true} )).total_keys,7);
    } finally {
      closeDb();
      if (oldPath === undefined) delete process.env.DELX_MEMORY_PATH; else process.env.DELX_MEMORY_PATH = oldPath;
      if (oldNs === undefined) delete process.env.DELX_MEMORY_NAMESPACE; else process.env.DELX_MEMORY_NAMESPACE = oldNs;
      rmSync(dir,{recursive:true,force:true});
    }
  });
}
