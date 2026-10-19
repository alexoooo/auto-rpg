import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {centreOfToRef} from '../src/core/control/support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedStrikeCommand } from '../research/combat-strikes.mjs';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/models.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { NO_COVER } from '../src/core/mind/intent.ts';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { traceOf } from './harness/trace.mjs';

const support=Object.freeze({lower:.5,pitch:.9,seconds:.5,transition:4,lumbar:.89,thoracic:.368,attackAt:7,riseAt:16});

test('a fresh-world fork during the supported fold reproduces low strikes and the standing return',async()=>{
 const make=async()=>{
  const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
  const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body);
  // One strike, asked from the fold's seventh second to its sixteenth, at a point low in front.
  const id=skills.instance(),strike={id,action:'strike',effector:'hand.right',target:{kind:'point',at:[.2,.3,.15]}};
  body.drive((view,dt)=>supportedStrikeCommand(view,skills.command(view,{move:null,face:0,
   guard:NO_COVER,actions:view.time>=support.attackAt&&view.time<support.riseAt?[strike]:[]},dt),support));
  return {...stand,body,skills,id};
 };
 const a=await make(),b=await make();
 try {
  a.step(480);loadStand(b.world,{body:b.body.state,skills:b.skills.state},saveStand(a.world,{body:a.body.state,skills:a.skills.state}));
  const ta=traceOf([a.built]),tb=traceOf([b.built]);
  let struck=false,low=Infinity;
  for(let i=0;i<2400;i++){
   a.step();b.step();ta.take();tb.take();
   struck||=[...a.skills.report.actions,...a.skills.report.ledger].some(action=>action.id===a.id);low=Math.min(low,a.body.view.head.y);
  }
  assert.ok(struck&&low<1.4,`the fixture did not reach its case: ${struck?'':'no strike was taken up, '}its head came down to ${low.toFixed(3)} m`);
  assert.deepEqual(saveStand(b.world,{body:b.body.state,skills:b.skills.state}).state,saveStand(a.world,{body:a.body.state,skills:a.skills.state}).state);
  assert.equal(tb.digest(),ta.digest());
 }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
});

test('a supported fold does not hide an actual fall from the host recovery reading',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body);
 body.drive((view,dt)=>supportedStrikeCommand(view,skills.command(view,{move:null,face:0,guard:NO_COVER,actions:[]},dt),{...support,lower:.7}));
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
