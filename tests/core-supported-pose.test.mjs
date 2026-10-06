import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {centreOfToRef} from '../src/core/control/support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatStrike, supportedStrikeCommand } from '../research/combat-strikes.mjs';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/human/spec.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { GUARD_ACTION } from '../src/core/mind/intent.ts';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { traceOf } from './harness/trace.mjs';

const support=Object.freeze({lower:.5,pitch:.9,seconds:.5,transition:4,lumbar:.89,thoracic:.368,attackAt:7,riseAt:16});

test('supported low strokes survive contact and misses with both hands and return to standing',async()=>{
 for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
  const r=await combatStrike({hand,mode,family:'downward',seconds:25,ahead:.15,across:.2,up:-1.33,support});
  assert.equal(r.fell,false,JSON.stringify(r)); assert.equal(r.floorContacts,0);
  assert.deepEqual(r.assist,{force:0,moment:0});
  assert.ok(r.cycles.returned[hand]>=8,JSON.stringify(r.cycles));
  assert.ok(r.head[1]>1.6,'physical standing height is restored');
  for(const foot of r.feet)for(const corner of foot.corners)assert.ok(Math.abs(corner[1])<.015,JSON.stringify(foot));
  if(mode==='miss')assert.deepEqual(r.contacts,[]);
  else {
   assert.ok(r.contacts.length>=8,JSON.stringify(r.contacts));
   assert.ok(r.contacts.filter(c=>c.closing>=2).length>=6,JSON.stringify(r.contacts));
  }
 }
});

test('a fresh-world fork during the supported fold reproduces low strikes and the standing return',async()=>{
 const make=async()=>{
  const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
  const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,handFeedback:true}),skills=combatSkills(body);
  body.drive((view,dt)=>supportedStrikeCommand(view,skills.command(view,{move:null,face:0,
   hands:{left:GUARD_ACTION,right:GUARD_ACTION},combat:view.time>=7&&view.time<16?{hand:'right',target:[.2,.3,.15],family:'downward'}:null},dt),support));
  return {...stand,body,skills};
 };
 const a=await make(),b=await make();
 try {
  a.step(480);loadStand(b.world,{body:b.body.state,skills:b.skills.state},saveStand(a.world,{body:a.body.state,skills:a.skills.state}));
  const ta=traceOf([a.built]),tb=traceOf([b.built]);
  for(let i=0;i<2400;i++){a.step();b.step();ta.take();tb.take();}
  assert.deepEqual(saveStand(b.world,{body:b.body.state,skills:b.skills.state}).state,saveStand(a.world,{body:a.body.state,skills:a.skills.state}).state);
  assert.equal(tb.digest(),ta.digest());assert.ok(a.body.view.head.y>1.6);
 }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
});

test('a supported fold does not hide an actual fall from the host recovery reading',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,handFeedback:true}),skills=combatSkills(body);
 body.drive((view,dt)=>supportedStrikeCommand(view,skills.command(view,{move:null,face:0,hands:{left:GUARD_ACTION,right:GUARD_ACTION}},dt),{...support,lower:.7}));
 try {
  s.step(840);
  assert.equal(body.down,false);
  const trunk=s.built.segments.get('upperTrunk');
  trunk.body.applyImpulse(new Vector3(0,0,80),centreOfToRef(trunk,new Vector3()));
  let detected=false;
  for(let i=0;i<360;i++){s.step();detected ||= body.down;}
  assert.ok(detected,'low requested height still reports the shoved body down');
  assert.ok(body.view.head.y<.6,'the shove leaves a physically fallen body');
  assert.equal(body.down,true,'the host continues to see the fallen body');
 }finally{body.dispose();s.dispose();}
});
