import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceEnvironment } from '../research/stand-up-acceptance.mjs';
import { contactModel } from '../research/stand-up-contact-model.mjs';
import { detachedDynamics } from '../research/stand-up-detached-dynamics.mjs';
import { coupledDynamics } from '../src/core/build/coupled-dynamics.ts';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { trackingPolicy } from '../research/stand-up-tracking-policy.mjs';
import { unassistedAudit } from '../research/stand-up-unassisted.mjs';

test('detached recovery dynamics reproduces the physical body at standing and moving fallen observations',async()=>{
  const e=await acceptanceEnvironment({model:'workshop-fighter',held:'empty',contact:'shoe',strength:1,speed:1,weight:1});
  try {
    const detached=detachedDynamics(structuredClone(contactModel(e)));
    const physical=coupledDynamics(e.stand.built,e.stand.world.physics.gravity);
    const predicted=coupledDynamics(detached.built,detached.physics.gravity);
    const compare=()=>{
      const o=e.observe();detached.read(structuredClone(o));physical.update();predicted.update();
      const torque=o.joints.map((_,i)=>i%2===0?2:-3);
      assert.deepEqual(predicted.solve(torque),physical.solve(torque));
      for(const s of o.segments)assert.deepEqual(
        predicted.pointAcceleration(detached.built.segments.get(s.name).body,s.centre,predicted.solve(torque)),
        physical.pointAcceleration(e.stand.built.segments.get(s.name).body,s.centre,physical.solve(torque)));
      assert.deepEqual(e.observe(),o,'prediction leaves the complete physical observation unchanged');
      return o;
    };
    for(let i=0;i<5;i++)e.step({kind:'host'});
    assert.equal(compare().down,false);
    await e.fall({degrees:0,impulse:60,separation:.2});
    const fallen=compare();assert.equal(fallen.down,true);
    assert.ok(fallen.segments.some(s=>s.spin.some(v=>Math.abs(v)>.1)));
  }finally{e.dispose();}
});

test('rise-only tracking keeps its supporting foot out of the stepping arc',async()=>{
  const e=await acceptanceEnvironment({model:'workshop-fighter',held:'empty',contact:'shoe',strength:1,speed:1,weight:1});
  const model=contactModel(e),audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps);
  try {
    for(let i=0;i<12;i++)e.step({kind:'host'});
    const parameters={stepFoot:'foot.left',riseOnly:true,extend:true,holdAngles:true,
      retainRiseSupports:true,stepSeconds:.2,riseSeconds:1,response:.5,footWeight:3};
    const plain=trackingPolicy({model,parameters});
    const grounded=trackingPolicy({model,parameters:{...parameters,stepArc:0}});
    const exaggerated=trackingPolicy({model,parameters:{...parameters,stepArc:.4}});
    for(let i=0;i<16;i++) {
      const observation=e.observe(),expected=grounded(observation);
      assert.deepEqual(plain(observation),expected,'rise-only commands cannot inherit the default lifting arc');
      assert.deepEqual(exaggerated(observation),expected,'a step-only setting cannot move a rise-only support');
      assert.equal(plain.state.phase,'extend');
      e.step(expected);
    }
    assert.deepEqual(audit.events,[]);
    assert.equal(e.result().assisted,false);
  }finally{audit.dispose();e.dispose();}
});

test('a physically landed recovery foot becomes predicted support before the rise attempt',async()=>{
  const cases=JSON.parse(readFileSync(new URL('../research/stand-up-acceptance/cases.json',import.meta.url)));
  const c=cases.cases[0],e=await acceptanceEnvironment(c.configuration),model=contactModel(e);
  const actions=JSON.parse(gunzipSync(readFileSync(new URL('../research/stand-up-saved-actions.json.gz',import.meta.url)))).actions;
  const audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps);
  try {
    e.restore(gunzipSync(readFileSync(new URL('../research/stand-up-acceptance/'+c.file,import.meta.url))));
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
