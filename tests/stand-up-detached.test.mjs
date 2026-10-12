import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceEnvironment } from '../research/stand-up-acceptance.mjs';
import { contactModel } from '../research/stand-up-contact-model.mjs';
import { detachedDynamics } from '../research/stand-up-detached-dynamics.mjs';
import { coupledDynamics } from '../src/core/build/coupled-dynamics.ts';

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
