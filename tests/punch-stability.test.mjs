import test from 'node:test';
import assert from 'node:assert/strict';
import {punchStand} from '../research/punch-calibration.mjs';
import {PLANTED_PUNCH_EXECUTION} from '../src/core/skills/combat.ts';
import {plantedSupport} from '../src/core/control/support-readiness.ts';
import {NO_COVER} from '../src/core/mind/intent.ts';
import {saveStand,loadStand} from './harness/core-stand.mjs';
const paths={contactSpeed:5,swingSeconds:.12,elbowExtension:.5,torso:.2};
const settings={execution:PLANTED_PUNCH_EXECUTION,paths,armExtension:.5,matchedFeedback:true,pad:{face:'compliant'}};

test('the planted base replays cancellation of an admitted impact in a fresh world', async()=>{
 const a=await punchStand({...settings,hand:'right'}),b=await punchStand({...settings,hand:'right'});
 const state=s=>({body:s.body.state,skills:s.skills.state,pad:s.sensor.state,calibration:s.state});
 try {
  a.step(240);assert.equal(plantedSupport(a.executorState.foundation),true);
  for(const change of [{otherSupport:true},{flat:{left:false,right:true}},{centred:false},{speed:.36}])
   assert.equal(plantedSupport({...structuredClone(a.executorState.foundation),...change}),false);
  while(!a.executorState.cycles['right'].impact&&a.world.time<4)a.step();assert.ok(a.executorState.cycles['right'].impact,'no impact admitted: the fixture did not reach its case');
  loadStand(b.world,state(b),saveStand(a.world,state(a)));
  for(const s of [a,b])s.body.drive((view,dt)=>s.skills.command(view,{move:null,face:0,
   guard:NO_COVER,actions:[]},dt));
  a.step(240);b.step(240);
  assert.equal(a.executorState.cycles.right.aborted,0);assert.equal(a.skills.report.actions.length,0);
  assert.equal(a.cycles.reading().failed,0);assert.equal(a.body.down,false);
  assert.deepEqual(saveStand(a.world,state(a)).state,saveStand(b.world,state(b)).state);
 }finally{a.dispose();b.dispose();}
});
