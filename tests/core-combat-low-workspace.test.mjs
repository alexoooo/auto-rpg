import test from 'node:test';
import assert from 'node:assert/strict';
import {combatStrike} from '../research/combat-strikes.mjs';
import {combatSkills} from '../src/core/skills/combat.ts';
import {ATTACK_PATH} from '../src/core/skills/attack-path.ts';
import {STANCE_LOWER} from '../src/core/skills/locomotion.ts';
import {NO_COVER} from '../src/core/mind/intent.ts';
import {modelSpec} from '../src/core/models.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {coreStand,saveStand,loadStand} from './harness/core-stand.mjs';
import {traceOf} from './harness/trace.mjs';

for(const hand of ['left','right'])test(`the shared fold gates ${hand} low strokes, verifies hits and misses, and restores standing`,async()=>{
 for(const mode of ['hit','miss']){
  const row=await combatStrike({hand,mode,family:'downward',surface:'top',ahead:.35,across:.1,up:-1.3,armExtension:1,
   support:{shared:true,lower:.5,attackAt:2,riseAt:12},seconds:16});
  const ready=row.supportPhases.find(r=>r.ready),first=row.phases.find(r=>r.phase==='chamber');
  assert.ok(ready&&first&&first.time>=ready.time,JSON.stringify({ready,first}));
  assert.ok(row.supportPhases.some(r=>r.stage==='lower'));assert.ok(row.supportPhases.some(r=>r.stage==='rise'));
  assert.equal(row.supportState.stage,'stand');assert.equal(row.supportState.active,false);
  assert.equal(row.fell,false);assert.equal(row.floorContacts,0);assert.equal(row.cycles.failed,0);
  assert.ok(row.cycles.returned[hand]>=6);assert.ok(row.head[1]>1.5);
  assert.deepEqual(row.assist,{force:0,moment:0});
  if(mode==='hit'){
   assert.ok(row.contacts.length>=6);assert.ok(row.contacts[0].closing>4);
   assert.ok(row.contacts.every(c=>c.closing>0));
   for(const c of row.contacts)assert.equal(c.closing,-c.velocity[1]);
  }else assert.deepEqual(row.contacts,[]);
 }
});

async function foldedStand(hand){
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body,{},{ground:true});
 body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,
  lower:view.time>=2&&view.time<8?.5:STANCE_LOWER,
  attack:view.time>=2&&view.time<8?{kind:'blow',hand,target:[hand==='right'?.1:-.1,.33,.35],path:{family:'downward',armExtension:1}}:null},dt));
 return {...s,body,skills};
}

test('low preparation and an extended folded swing fork through the actual return into standing',async()=>{
 for(const hand of ['left','right']){
  const a=await foldedStand(hand),b=await foldedStand(hand),state=s=>({body:s.body.state,skills:s.skills.state});
  try{
   for(const phase of ['lower','swing']){
    while(a.world.time<7&&!(phase==='lower'?a.skills.report.support.stage==='lower':a.skills.report.strike.phase==='swing'))a.step();
    assert.ok(a.world.time<7,phase);if(phase==='lower')assert.equal(a.skills.report.strike.hand,null);
    a.step(6);loadStand(b.world,state(b),saveStand(a.world,state(a)));
    const ta=traceOf([a.built]),tb=traceOf([b.built]);
    for(let i=0;i<90;i++){a.step();b.step();ta.take();tb.take();}
    assert.equal(ta.digest(),tb.digest());assert.deepEqual(saveStand(a.world,state(a)).state,saveStand(b.world,state(b)).state);
   }
   while(a.world.time<13&&a.skills.report.support.stage!=='stand'){a.step();b.step();}
   assert.equal(a.skills.report.support.stage,'stand');assert.equal(a.skills.report.strike.hand,null);
   assert.equal(a.body.down,false);assert.ok(a.skills.report.strike.pointCycle.returned[hand]>=2);
   assert.deepEqual(saveStand(a.world,state(a)).state,saveStand(b.world,state(b)).state);
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
 }
});
