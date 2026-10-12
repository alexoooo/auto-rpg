import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deserialize, serialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const frozen = new URL('../.tools/stand-up-frozen/', import.meta.url);
const { acceptanceEnvironment, evaluateAcceptanceCase, frozenRevision } = await import(new URL('research/stand-up-acceptance.mjs', frozen));
const { unassistedAudit, unassistedResult } = await import(new URL('research/stand-up-unassisted.mjs', frozen));
const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozen)));
const source = deserialize(gunzipSync(readFileSync(process.argv[2]))), out = process.argv[3];
const c = manifest.cases[0], revision = frozenRevision();
const digest = data => createHash('sha256').update(data).digest('hex');
const tape = { channels: c.identity.channels, initialObservationSha256: c.observationSha256, actions: source.rows.map(row => row.action) };
writeFileSync(new URL('./stand-up-saved-actions.json.gz', import.meta.url), gzipSync(JSON.stringify(tape)));
const { createPolicy } = await import('./stand-up-saved-candidate.mjs');
const e = await acceptanceEnvironment(c.configuration), rows = [], trace = createHash('sha256');
let audit;
try {
  e.restore(gunzipSync(readFileSync(new URL(`research/stand-up-acceptance/${c.file}`, frozen))));
  audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
  const initial = e.observe(), policy = createPolicy({ channels: e.channels, configuration: c.configuration });
  while (e.result().elapsed < manifest.protocol.episodeSeconds) {
    const row = e.step(policy(e.observe()), { automaticHandover: true }); rows.push(row);
    trace.update(JSON.stringify(row.observation));
    if (row.result.success || row.result.failure) break;
  }
  const result = unassistedResult(e.result(), audit.events), traceSha256 = trace.digest('hex');
  const official = await evaluateAcceptanceCase(c, manifest, createPolicy);
  assert.deepEqual(result, official.result);
  assert.equal(traceSha256, official.traceSha256);
  const from = e.experiment.walkFrom, to = e.observe().centre;
  const record = { initial, rows, result, traceSha256, geometry: source.geometry, identity: e.identity,
    recipe: source.recipe, release: source.release, checkpointSha256: c.sha256, revision, official,
    verification: { walkingDisplacement: from ? Math.hypot(to[0]-from[0],to[2]-from[2]) : null,
      assistance: e.experiment.assistance },
    provenance: { generatingTraceSha256: digest(readFileSync(process.argv[2])),
      candidateModuleSha256: digest(readFileSync(new URL('./stand-up-saved-candidate.mjs',import.meta.url))),
      candidateActionsSha256: digest(readFileSync(new URL('./stand-up-saved-actions.json.gz',import.meta.url))) } };
  writeFileSync(out + '.trace.gz', gzipSync(serialize(record)));
  const { rows: omit, initial: omitInitial, geometry: omitGeometry, ...report } = record;
  writeFileSync(out + '.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result, steps: rows.length, traceSha256, officialMatched: true }));
} finally { audit?.dispose(); e.dispose(); }
