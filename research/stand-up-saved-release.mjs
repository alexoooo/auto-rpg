import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deserialize, serialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const frozen = new URL('../.tools/stand-up-frozen/', import.meta.url);
const { acceptanceEnvironment, frozenRevision } = await import(new URL('research/stand-up-acceptance.mjs', frozen));
const { unassistedAudit, unassistedResult } = await import(new URL('research/stand-up-unassisted.mjs', frozen));
const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozen)));
const source = deserialize(gunzipSync(readFileSync(process.argv[2]))), out = process.argv[3], c = manifest.cases[0];
const revision = frozenRevision(), e = await acceptanceEnvironment(c.configuration), saved = gunzipSync(readFileSync(new URL(`research/stand-up-acceptance/${c.file}`, frozen)));
const results = [], started = performance.now();
const releaseStep = process.argv[4] === '--step' ? Number(process.argv[5]) : null;
if (releaseStep !== null) assert.ok(Number.isSafeInteger(releaseStep) && releaseStep >= 0);
const releases = [];
if (releaseStep !== null) releases.push(null);
else for (let t = Number(process.argv[4] ?? 8); t <= Number(process.argv[5] ?? 16); t += Number(process.argv[6] ?? .125)) releases.push(t);
let best;
try {
  for (const release of releases) {
    e.restore(saved);
    const initial = e.observe(), rows = [], hash = createHash('sha256');
    const audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
    try {
      while (e.result().elapsed < 22) {
        const index = rows.length;
        const retain = releaseStep === null ? e.result().elapsed < release : index < releaseStep;
        const action = retain ? source.rows[index]?.action ?? {kind:'host'} : {kind:'host'};
        const row = e.step(action, { automaticHandover: true }); rows.push(row); hash.update(JSON.stringify(row.observation));
        if (row.result.success || row.result.failure) break;
      }
      const result=unassistedResult(e.result(),audit.events), entry={release,releaseStep,result,steps:rows.length,traceSha256:hash.digest('hex')};
      results.push(entry);
      if(result.success&&(!best||result.seconds<best.result.seconds)) {
        best=entry;
        writeFileSync(out+'.trace.gz',gzipSync(serialize({...source,initial,rows,result,release,releaseStep,traceSha256:entry.traceSha256})));
        console.log(JSON.stringify(entry));
      }
      writeFileSync(out+'.json',JSON.stringify({revision,best,results,steps:results.reduce((s,r)=>s+r.steps,0),wallSeconds:(performance.now()-started)/1000},null,2)+'\n');
    } finally { audit.dispose(); }
  }
} finally { e.dispose(); }
assert.ok(best,'no tested release completes');
