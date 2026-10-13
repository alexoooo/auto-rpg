import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { frozenEvaluator, verifyFrozenEvaluator } from '../../scripts/frozen-evaluator.mjs';
import { contactModel } from '../../research/stand-up-contact-model.mjs';
import { trackingPolicy } from '../../research/stand-up-tracking-policy.mjs';

verifyFrozenEvaluator();
const { acceptanceEnvironment, evaluateAcceptanceCase, rejectFloatingController, digest } =
  await import(new URL('research/stand-up-acceptance.mjs', frozenEvaluator));
const { unassistedAudit } = await import(new URL('research/stand-up-unassisted.mjs', frozenEvaluator));

test('a saved fall preserves physical state and elapsed time across controller choices and rejects requested assistance', async () => {
  const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozenEvaluator)));
  const c = manifest.cases[0];
  assert.equal(manifest.cases.length, 16);
  const e = await acceptanceEnvironment(c.configuration);
  try {
    const saved = gunzipSync(readFileSync(new URL(`research/stand-up-acceptance/${c.file}`, frozenEvaluator)));
    assert.equal(digest(readFileSync(new URL(`research/stand-up-acceptance/${c.file}`, frozenEvaluator))), c.sha256);
    e.restore(saved);
    assert.equal(digest(JSON.stringify(e.observe())), c.observationSha256);
    const initial = e.observe(), clock = e.result();
    const traces = [];
    for (const controller of ['standard', 'optimized', 'standard']) {
      e.restore(saved);
      e.selectComparison(controller);
      assert.deepEqual(e.observe(), initial);
      assert.deepEqual(e.result(), clock, 'a new policy cannot restart the recovery clock');
      const trace = [];
      let driven = 0;
      for (let step = 0; step < 10 * e.stand.world.hz && driven < 24; step++) {
        const row = e.step(); trace.push(row);
        if (row.action.kind === 'muscles' && row.action.activation.some(value => value > 0)) driven++;
      }
      assert.equal(driven, 24, 'the continuation must reach muscle-driven recovery after settling');
      traces.push(trace);
    }
    assert.deepEqual(traces[0], traces[2], 'controller ordering cannot change a continuation');
    assert.notDeepEqual(traces[0], traces[1], 'different real controllers exercise different actions');
  } finally { e.dispose(); }
  const rejected = await evaluateAcceptanceCase(c, manifest, ({ channels }) => () => ({
    kind: 'muscles', activation: channels.map(() => 0), velocity: channels.map(() => 0),
    assist: { force: [0, 1, 0], moment: [0, 0, 0] },
  }));
  assert.equal(rejected.result.success, false);
  assert.equal(rejected.result.failure, 'external actuation');
  assert.equal(rejected.steps, 0);
  const floating = await rejectFloatingController(c, manifest);
  assert.equal(floating.checkpointSha256, rejected.checkpointSha256);
  assert.equal(floating.initialObservationSha256, rejected.initialObservationSha256);
});

test('a physically landed recovery foot becomes predicted support before the rise attempt',async()=>{
  const cases=JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json',frozenEvaluator)));
  const c=cases.cases[0],e=await acceptanceEnvironment(c.configuration),model=contactModel(e);
  const actions=JSON.parse(gunzipSync(readFileSync(new URL('../../research/stand-up-saved-actions.json.gz',import.meta.url)))).actions;
  const audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps);
  try {
    e.restore(gunzipSync(readFileSync(new URL('research/stand-up-acceptance/'+c.file,frozenEvaluator))));
    for(let i=0;i<840;i++)e.step(actions[i]);
    const control=trackingPolicy({model,parameters:{jointWeight:.1,liftAfter:.05,centreWeight:3,holdAngles:true,
      stepSeconds:.5,stepFoot:'foot.left',transition:.3,transferTolerance:10,rootWeight:1,wait:0,
      liftResponse:.15,response:.3,extend:true,stepForward:.15,footWeight:15,stepArc:.2}});
    let acquired=false;
    for(let i=0;i<240;i++) {
      const before=e.measure(),action=control(before.observation);
      if(control.state.phase==='extend') {
        assert.ok(before.soleUp[0]>.9);
        assert.ok(before.observation.contacts.some(c=>c.segment==='foot.left'&&c.fixed!==null&&c.impulse>0));
        assert.ok(control.state.tracking.contact.forces.some(f=>f.frame==='segment:foot.left'));
        assert.ok(action.activation.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
        acquired=true;e.step(action);break;
      }
      e.step(action);
    }
    assert.equal(acquired,true,'the physical continuation reaches the support-acquisition branch');
    assert.deepEqual(audit.events,[]);assert.equal(e.result().assisted,false);
    assert.equal(e.result().success,false,'support acquisition alone is not recovery');
  }finally{audit.dispose();e.dispose();}
});
