import test from 'node:test';
import assert from 'node:assert/strict';
import {punchStand,punchCalibration} from '../research/punch-calibration.mjs';
import {PUNCH_EXECUTION} from '../src/core/skills/combat.ts';
import {NO_COVER} from '../src/core/mind/intent.ts';
import {saveStand,loadStand} from './harness/core-stand.mjs';
const settings={execution:PUNCH_EXECUTION,matchedFeedback:true,pad:{face:'compliant'}};
const states=s=>({body:s.body.state,skills:s.skills.state,pad:s.sensor.state,calibration:s.state});

test('misses and an actual fixed obstruction withdraw, without target follow-through or sensor credit',async()=>{
 for(const hand of ['left','right'])for(const block of [false,true]){
  const s=await punchStand({...settings,hand,mode:'miss'});
  if(block)s.world.physics.addFixedBox([s.target[0],s.target[1],s.target[2]-.1],[.2,.4,.11]);
  let touched=false;
  try{s.world.afterStep(()=>{touched||=s.body.view.effectors[`hand.${hand}`].feedback.impulse>0;});s.step(720);const r=s.reading();
   assert.equal(r.impacts.length,0);assert.equal(r.impactResponse.admitted,0);assert.ok(r.cycles.returned[hand]>=2);
   assert.equal(r.cycles.failed,0);assert.equal(r.fell,false);assert.equal(touched,block);
  }finally{s.dispose();}
 }
});

test('cancellation interrupts an admitted impact and a fresh-world fork replays it exactly',async()=>{
 for(const hand of ['left','right']){
  const a=await punchStand({...settings,hand}),b=await punchStand({...settings,hand});
  try{while(!a.executorState.cycles[hand].impact&&a.world.time<4)a.step();assert.ok(a.executorState.cycles[hand].impact,`${hand}: no impact admitted: the fixture did not reach its case`);
   loadStand(b.world,states(b),saveStand(a.world,states(a)));
   const cancel=s=>s.body.drive((view,dt)=>s.skills.command(view,{move:null,face:0,guard:NO_COVER,actions:[]},dt));
   cancel(a);cancel(b);a.step(240);b.step(240);
   assert.deepEqual(a.reading(),b.reading());assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
   assert.equal(a.skills.report.actions.length,0);assert.equal(a.executorState.cycles[hand].aborted,0);
   assert.equal(a.reading().cycles.failed,0);assert.equal(a.reading().cycles.returned[hand],1);
  }finally{a.dispose();b.dispose();}
 }
});

test('native pad contacts carry the same intended-object identity as the compliant material',async()=>{
 const r=await punchCalibration({execution:PUNCH_EXECUTION,matchedFeedback:true,seconds:4});
 assert.ok(r.impactResponse.admitted>=1,'no impact admitted: the fixture did not reach its case');assert.ok(r.samples.some(s=>s.narrowImpulse>0));
 assert.equal(r.fell,false);assert.equal(r.cycles.failed,0);
});
