import test from 'node:test';
import assert from 'node:assert/strict';
import {punchStand,punchCalibration} from '../research/punch-calibration.mjs';
import {PUNCH_EXECUTION,PLANTED_PUNCH_EXECUTION,validCombatExecution} from '../src/core/skills/combat.ts';
import {contactResponse} from '../src/core/control/effector-feedback.ts';
import {NO_COVER} from '../src/core/mind/intent.ts';
import {saveStand,loadStand} from './harness/core-stand.mjs';
import {punchAdmission,punchScore,median} from '../research/punch-foundation.mjs';
const settings={execution:PUNCH_EXECUTION,matchedFeedback:true,pad:{face:'compliant'}};
const states=s=>({body:s.body.state,skills:s.skills.state,pad:s.sensor.state,calibration:s.state});

test('both planted physical fists use matched tactile contact, bounded impact paths and measured returns',async()=>{
 for(const hand of ['left','right']){
  const s=await punchStand({...settings,execution:PLANTED_PUNCH_EXECUTION,armExtension:.5,hand});let impacts=0;
  try{while(s.world.time<6){s.step();if(s.skills.report.strike.impact){impacts++;
    assert.equal(s.built.handPoses.state[hand].applied,'fist');
    assert.equal(s.skills.state.command.effectors[`hand.${hand}`].places[0].point,'strike');
    const {origin,finish,elapsed}=s.skills.state.hands[hand].cycle.impact;
    assert.ok(Math.hypot(...finish.map((v,k)=>v-origin[k]))<=PUNCH_EXECUTION.impactTravel+1e-10);
    assert.ok(elapsed<PUNCH_EXECUTION.impactSeconds);assert.equal(contactResponse(s.body.view.effectors[`hand.${hand}`].feedback,'punch-pad'),'target');
   }}
   const r=s.reading();assert.ok(impacts>=3);assert.ok(r.impactResponse.admitted>=3);
   assert.equal(r.cycles.failed,0);assert.ok(r.cycles.returned[hand]>=3);assert.equal(r.fell,false);
   assert.ok(r.impacts.every(e=>e.preImpact.pose==='fist'&&e.preImpact.anchorErrors.every(j=>j.error<.02)));
   assert.deepEqual(r.assist,{force:0,moment:0});
  }finally{s.dispose();}
 }
});

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
  try{while(!a.skills.report.strike.impact&&a.world.time<4)a.step();assert.ok(a.skills.report.strike.impact);
   loadStand(b.world,states(b),saveStand(a.world,states(a)));
   const cancel=s=>s.body.drive((view,dt)=>s.skills.command(view,{move:null,face:0,guard:NO_COVER,attack:null},dt));
   cancel(a);cancel(b);a.step(240);b.step(240);
   assert.deepEqual(a.reading(),b.reading());assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
   assert.equal(a.skills.report.strike.hand,null);assert.equal(a.skills.state.hands[hand].cycle.aborted,1);
   assert.equal(a.reading().cycles.failed,0);assert.equal(a.reading().cycles.returned[hand],1);
  }finally{a.dispose();b.dispose();}
 }
});

test('native pad contacts carry the same intended-object identity as the compliant material',async()=>{
 const r=await punchCalibration({execution:PUNCH_EXECUTION,matchedFeedback:true,seconds:4});
 assert.ok(r.impactResponse.admitted>=1);assert.ok(r.samples.some(s=>s.narrowImpulse>0));
 assert.equal(r.fell,false);assert.equal(r.cycles.failed,0);
});

test('contact admission distinguishes blocks, incidental objects and world, and rejects invalid settings',()=>{
 const touch=target=>({contact:{target}});
 assert.equal(contactResponse(touch({kind:'body',body:'foe',segment:'forearm.left',guard:true}),'foe'),'block');
 assert.equal(contactResponse(touch({kind:'body',body:'foe',segment:'upperTrunk',guard:false}),'foe'),'target');
 assert.equal(contactResponse(touch({kind:'object',id:'other'}),'foe'),'incidental');
 assert.equal(contactResponse(touch({kind:'world'}),'foe'),'world');
 assert.equal(contactResponse({impulse:1},'foe'),null);
 for(const change of [{impactSeconds:NaN},{impactTravel:-1},{normalAlignment:2},{physicalFists:1}])assert.equal(validCombatExecution({...PUNCH_EXECUTION,...change}),false);
});

test('promotion cannot hide a failed cell or an unimproved hand behind an average',()=>{
 assert.equal(median([4,1,3,2]),2.5);assert.equal(median([]),null);
 const score=impulse=>({accepted:true,hands:{left:{impulse,failures:0,falls:0},right:{impulse,failures:0,falls:0}}});
 const baseline=score(5),candidate=score(6);assert.equal(punchAdmission(baseline,candidate),true);
 for(const mutate of [c=>c.accepted=false,c=>c.hands.left.impulse=5.9,c=>c.hands.right.failures=1,c=>c.hands.left.falls=1]){
  const c=structuredClone(candidate);mutate(c);assert.equal(punchAdmission(baseline,c),false);
 }
 assert.equal(punchScore([]).accepted,false);
});
