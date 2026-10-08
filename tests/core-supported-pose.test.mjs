import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {centreOfToRef} from '../src/core/control/support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatStrike, supportedStrikeCommand } from '../research/combat-strikes.mjs';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/models.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { NO_COVER } from '../src/core/mind/intent.ts';
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

test('a fresh-world fork during the supported fold reproduces low strikes and the standing return', {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async()=>{
 const make=async()=>{
  const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
  const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body);
  body.drive((view,dt)=>supportedStrikeCommand(view,skills.command(view,{move:null,face:0,
   guard:NO_COVER,attack:view.time>=7&&view.time<16?{kind:'blow',hand:'right',target:[.2,.3,.15],path:{family:'downward'}}:null},dt),support));
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
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body);
 body.drive((view,dt)=>supportedStrikeCommand(view,skills.command(view,{move:null,face:0,guard:NO_COVER,attack:null},dt),{...support,lower:.7}));
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


test('neutral low combat waits for physical support, then strikes and restores the ordinary stance',async()=>{
 for(const hand of ['right','left'])for(const hit of [true,false]) {
  const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
  const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,feedback:true});
  const skills=combatSkills(body,{},{ground:true}),target=[hand==='right'?.35:-.35,.3,.1];
  const obstacle=hit?stand.world.physics.addFixedBox([target[0],target[1],target[2]+.04],[.2,.2,.08]):null;
  let contacts=0,first=null,low=false,falls=false,badFloor=false;
  body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,
   lower:view.time>=2&&view.time<14?.5:undefined,attack:view.time>=2&&view.time<14?{kind:'blow',hand,target,path:{family:'downward'}}:null},dt));
  try {
   for(let i=0;i<25*120;i++) {
    stand.step();falls ||= body.down;low ||= skills.report.support.ready;
    if(skills.report.strike.phase&&!first)first=stand.world.time;
    if(obstacle&&stand.world.physics.contactsOf(stand.built.segments.get(`hand.${hand}`).body).some(c=>c.fixed===obstacle.id&&c.impulse>0))contacts++;
    badFloor ||= ['head','upperTrunk','middleTrunk','lowerTrunk'].some(n=>stand.world.physics.contactsOf(stand.built.segments.get(n).body).some(c=>c.fixed===stand.floor.id&&c.impulse>0));
   }
   assert.ok(low);assert.ok(first>4,'preparation follows completed support acquisition');
   assert.equal(falls,false);assert.equal(badFloor,false);assert.equal(skills.report.support.stage,'stand');
   assert.ok(body.view.head.y>1.58);assert.ok(skills.report.strike.pointCycle.returned[hand]>=5);
   assert.equal(hit?contacts>0:contacts===0,true);assert.deepEqual(body.assist.meter,{steps:0,force:0,moment:0});
  }finally{body.dispose();stand.dispose();}
 }
});

test('the supported executor refuses an imagined floor and keeps the strike unlaunched',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,gravity:false,ground:false});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS}),skills=combatSkills(body,{},{ground:true});
 body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,lower:.5,
  attack:{kind:'blow',hand:'right',target:[.35,.3,.1],path:{family:'downward'}}},dt));
 try {
  for(let i=0;i<360;i++){s.step();assert.equal(skills.report.support.stage,'wait');assert.equal(skills.report.support.ready,false);assert.equal(skills.report.strike.phase,null);}
 }finally{body.dispose();s.dispose();}
});


test('a neutral supported-combat fork preserves acquisition, committed strokes and standing handover',async()=>{
 const make=async()=>{
  const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
  const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body,{},{ground:true});
  body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,
   lower:view.time>=2&&view.time<14?.5:undefined,attack:view.time>=2&&view.time<14?{kind:'blow',hand:'left',target:[-.35,.3,.1],path:{family:'downward'}}:null},dt));
  return {...stand,body,skills};
 };
 const a=await make(),b=await make();
 try {
  a.step(360);loadStand(b.world,{body:b.body.state,skills:b.skills.state},saveStand(a.world,{body:a.body.state,skills:a.skills.state}));
  const ta=traceOf([a.built]),tb=traceOf([b.built]);
  for(let i=0;i<2640;i++){a.step();b.step();ta.take();tb.take();}
  assert.deepEqual(saveStand(b.world,{body:b.body.state,skills:b.skills.state}).state,saveStand(a.world,{body:a.body.state,skills:a.skills.state}).state);
  assert.equal(tb.digest(),ta.digest());assert.equal(a.skills.report.support.stage,'stand');assert.ok(a.body.view.head.y>1.58);
 }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
});
