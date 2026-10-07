import test from 'node:test';
import assert from 'node:assert/strict';
import {punchCalibration,punchStand} from '../research/punch-calibration.mjs';
import {punchStabilityAdmission} from '../research/punch-stability.mjs';
import {PLANTED_PUNCH_EXECUTION} from '../src/core/skills/combat.ts';
import {plantedSupport} from '../src/core/control/support-readiness.ts';
import {NO_COVER} from '../src/core/mind/intent.ts';
import {saveStand,loadStand} from './harness/core-stand.mjs';
const paths={contactSpeed:5,swingSeconds:.12,elbowExtension:.5,torso:.2};
const settings={execution:PLANTED_PUNCH_EXECUTION,paths,armExtension:.5,matchedFeedback:true,pad:{face:'compliant'}};

test('both hands complete planted straight and cross cycles without falls or assistance',async()=>{
 const rows=[];
 for(const hand of ['left','right'])for(const family of ['straight','cross']) {
  const r=await punchCalibration({...settings,hand,family,seconds:8});rows.push(r);
  assert.deepEqual(r.qualification,{accepted:true,faults:[]});
  assert.equal(r.cycles.failed,0);assert.equal(r.fell,false);assert.equal(r.floorContacts,0);
  assert.ok(r.cycles.returned[hand]>=3);assert.deepEqual(r.assist,{force:0,moment:0});
 }
 // These task summaries exercise admission; physical ground qualification runs separately in research.
 const ground=['left','right'].flatMap(hand=>[false,true].map(recover=>({options:{hand,recover},summary:{begun:10,
  lowReady:200,lowDriven:3,attackerFell:false,trunkFloor:0,returnedStanding:true,
  cycles:{returned:{left:3,right:3},failed:0},assist:{force:0,moment:0}}})));
 assert.equal(punchStabilityAdmission(rows,ground),true);
 for(const mutate of [r=>r.summary.attackerFell=true,r=>r.summary.cycles.failed=1,
  r=>r.summary.lowDriven=0,r=>r.summary.returnedStanding=false,r=>r.summary.assist.force=1]) {
  const bad=structuredClone(ground);mutate(bad[0]);assert.equal(punchStabilityAdmission(rows,bad),false);
 }
 assert.equal(punchStabilityAdmission([rows[0],rows[0],rows[2],rows[3]],ground),false,'duplicate cells cannot replace a required hand/family');
 assert.equal(punchStabilityAdmission(rows.slice(1),ground),false);
 assert.equal(punchStabilityAdmission(rows,ground.slice(1)),false);
 const weak=structuredClone(rows);for(const row of weak)for(const event of row.impacts)event.impulse*=.1;
 assert.equal(punchStabilityAdmission(weak,ground),true,'stability does not claim a force gain');
});

test('the planted base replays cancellation of an admitted impact in a fresh world',async()=>{
 const a=await punchStand({...settings,hand:'right'}),b=await punchStand({...settings,hand:'right'});
 const state=s=>({body:s.body.state,skills:s.skills.state,pad:s.sensor.state,calibration:s.state});
 try {
  a.step(240);assert.equal(plantedSupport(a.skills.state.foundation),true);
  for(const change of [{otherSupport:true},{flat:{left:false,right:true}},{centred:false},{speed:.36}])
   assert.equal(plantedSupport({...structuredClone(a.skills.state.foundation),...change}),false);
  while(!a.skills.report.strike.impact&&a.world.time<4)a.step();assert.ok(a.skills.report.strike.impact);
  loadStand(b.world,state(b),saveStand(a.world,state(a)));
  for(const s of [a,b])s.body.drive((view,dt)=>s.skills.command(view,{move:null,face:0,
   guard:NO_COVER,attack:null},dt));
  a.step(240);b.step(240);
  assert.equal(a.skills.state.hands.right.cycle.aborted,1);assert.equal(a.skills.report.strike.hand,null);
  assert.equal(a.skills.report.strike.pointCycle.failed,0);assert.equal(a.body.down,false);
  assert.deepEqual(saveStand(a.world,state(a)).state,saveStand(b.world,state(b)).state);
 }finally{a.dispose();b.dispose();}
});
