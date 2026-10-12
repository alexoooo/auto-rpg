import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {deserialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {bodyEnvironment} from './stand-up-foot-design.mjs';

const frozen=new URL('../.tools/stand-up-frozen/',import.meta.url);
const {acceptanceEnvironment,frozenRevision}=await import(new URL('research/stand-up-acceptance.mjs',frozen));
const {unassistedAudit,unassistedResult}=await import(new URL('research/stand-up-unassisted.mjs',frozen));
const manifest=JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json',frozen)));
const source=deserialize(gunzipSync(readFileSync(process.argv[2]))),c=manifest.cases.find(c=>c.id===source.case);
assert.ok(source.configuration.fall&&source.result.success,'replay a complete fresh-fall recovery');
const revision=frozenRevision(),changed=source.configuration.body||source.configuration.feet;
const e=changed?(await bodyEnvironment(c.configuration,source.configuration.body??{feet:source.configuration.feet})).environment:await acceptanceEnvironment(c.configuration);
let audit;
try {
  assert.deepEqual(e.identity,source.identity);
  await e.fall({...c.fall,...source.configuration.fall});
  assert.deepEqual(e.observe(),source.initial,'fresh physical preparation reproduces the entire initial observation');
  audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps);
  const hash=createHash('sha256');
  for(const expected of source.rows) {
    const actual=e.step(expected.action,{automaticHandover:true});
    assert.deepEqual(actual.observation,expected.observation);
    assert.deepEqual(actual.result,expected.result);
    hash.update(JSON.stringify(actual.observation));
  }
  const result=unassistedResult(e.result(),audit.events),traceSha256=hash.digest('hex');
  assert.deepEqual(result,source.result);assert.equal(traceSha256,source.traceSha256);
  const record={revision,configuration:source.configuration,result,steps:source.rows.length,traceSha256,exact:true,
    scope:'Fresh development fall; any body change is declared in configuration. The frozen saved cases are neither replaced nor modified.'};
  writeFileSync(process.argv[3],JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
}finally{audit?.dispose();e.dispose();}
