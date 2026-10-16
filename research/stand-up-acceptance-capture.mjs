import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { acceptanceEnvironment, evaluateAcceptanceCase, digest } from './stand-up-acceptance.mjs';
import { unassistedAudit } from './stand-up-unassisted.mjs';

// Capture is a one-time preparation command, not part of evaluating a controller.
const directory = new URL('./stand-up-acceptance/', import.meta.url);
mkdirSync(directory, { recursive: true });
const manifest = { version: 2, node: process.versions.node,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  protocol: { scope: '16 development continuations; no robustness qualification or goal-completion gate',
    harness: 'Node Stance Lab recovery search', engine: 'rapier-coordinate', hz: 120, actuation: 'symmetric',
    balance: 0, host: 'stance', ground: '40 m box, standard gravity and engine contact law',
    baseline: "the game's Stand up (step-up, STEP_UP's settings); standard support recovery as the built-in comparison",
    anatomy: "Warrior/Rogue game bodies on the run's legs (owner-run-body); empty or right-hand club; unchanged muscles",
    prefix: '240 standing steps, two 60 N s shoves 24 steps apart, saved after first recovery takeover; optimized prefix shared by all candidates',
    clock: 'original takeover, including shared prefix; never reset at checkpoint',
    episodeSeconds: 38, handoverDeadline: 35,
    success: 'zero external actuation throughout; existing physical upright/loaded two-foot support and quiet 0.5 s; actual host handover, 2 s standing then 1 s walking at least 0.1 m; bounded efforts',
    reporting: 'all cases retained; show 6/12/35 s counts; failures infinity in medians; no new substantial-improvement threshold',
    changes: 'owner agreement required before changing evaluator, baseline, cases, body configurations or criteria' }, cases: [] };
for (const model of ['workshop-fighter', 'workshop-rogue']) for (const held of ['empty', 'club']) for (const degrees of [0, 90, 180, 270]) {
  const configuration = { model, held };
  const e = await acceptanceEnvironment(configuration);
  const audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
  let c;
  try {
    await e.fall({ degrees });
    assert.equal(e.result().fell, true, 'every frozen case must actually fall');
    assert.deepEqual(audit.events.map(event => [event.step, event.segment, event.method]),
      [[240, 'middleTrunk', 'applyImpulse'], [264, 'middleTrunk', 'applyImpulse']], 'only the two declared shoves act externally during preparation');
    const bytes = gzipSync(e.save());
    const id = `${model}-${held}-${degrees}`;
    c = { id, configuration, fall: { impulse: 60, degrees, separation: .2 },
      file: `${id}.checkpoint.gz`, sha256: digest(bytes), identity: e.identity,
      observationSha256: digest(JSON.stringify(e.observe())), prefixResult: e.result(), preparationActuation: audit.events };
    writeFileSync(new URL(c.file, directory), bytes, { flag: 'wx' });
  } finally { audit.dispose(); e.dispose(); }
  c.reference = await evaluateAcceptanceCase(c, manifest);
  manifest.cases.push(c);
  console.log(JSON.stringify({ case: c.id, result: c.reference.result }));
}
writeFileSync(new URL('cases.json', directory), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
