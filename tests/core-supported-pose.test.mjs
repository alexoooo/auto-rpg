import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {centreOfToRef} from '../src/core/control/support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatStrike, supportedStrikeCommand } from '../research/combat-strikes.mjs';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/models.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { combatSkills, pathExecutor } from '../src/core/skills/combat.ts';
import { skillSet } from '../src/core/skills/arbiter.ts';
import { locomotion } from '../src/core/skills/locomotion.ts';
import { guardSkill } from '../src/core/skills/guard.ts';
import { supportFold } from '../src/core/skills/support-fold.ts';
import { actionCycles } from '../research/action-cycles.mjs';
import { NO_COVER } from '../src/core/mind/intent.ts';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { traceOf } from './harness/trace.mjs';

const support=Object.freeze({lower:.5,pitch:.9,seconds:.5,transition:4,lumbar:.89,thoracic:.368,attackAt:7,riseAt:16});

/** A low downward action that owns its support fold (`lower`): it lowers, strikes and rises again for every stroke. */
const LOW=Object.freeze({name:'low',family:'downward',lower:.5});

/** A Warrior whose one hand asks the low action at `target` from 2 to 14 s, through the action protocol. */
async function lowStand(hand,target,options={}) {
 const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,...options});
 const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,feedback:true}),effector=`hand.${hand}`;
 const skills=skillSet(body,{},{legs:locomotion(body.envelope),guard:guardSkill(body.built.spec),support:supportFold(body),
  executors:[{name:'paths',executor:pathExecutor(body,[LOW])}],actions:[{name:'low',executor:'paths',effectors:[effector]}]});
 const cycles=actionCycles(skills);
 body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,
  actions:cycles.requests(view,'low',effector,{kind:'point',at:target},view.time>=2&&view.time<14)},dt));
 const states=()=>({body:body.state,skills:skills.state,cycles:cycles.state});
 return {...stand,body,skills,cycles,states};
}

test('shared supported low strokes lower, strike and rise again with both hands through contact and misses',async()=>{
 for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
  const r=await combatStrike({hand,mode,family:'downward',seconds:25,ahead:.15,across:.2,up:-1.33,support:{shared:true,lower:LOW.lower,attackAt:2,riseAt:20}});
  assert.equal(r.fell,false,JSON.stringify(r)); assert.equal(r.floorContacts,0);
  assert.deepEqual(r.assist,{force:0,moment:0});
  assert.equal(r.cycles.failed,0); assert.ok(r.cycles.thrown[hand]>=3,JSON.stringify(r.cycles));
  assert.ok(r.cycles.returned[hand]>=r.cycles.thrown[hand],JSON.stringify(r.cycles));
  assert.equal(r.supportState.stage,'stand'); assert.ok(r.head[1]>1.58,'physical standing height is restored');
  for(const foot of r.feet)for(const corner of foot.corners)assert.ok(Math.abs(corner[1])<.015,JSON.stringify(foot));
  if(mode==='miss')assert.deepEqual(r.contacts,[]);
  else {
   // Every stroke thrown meets the box's top, coming down at 2 m/s or more.
   assert.equal(r.contacts.length,r.cycles.thrown[hand],JSON.stringify(r.contacts));
   assert.ok(r.contacts.every(c=>-c.velocity[1]>=2),JSON.stringify(r.contacts));
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


test('a low action waits for physical support, then strikes and restores the ordinary stance',async()=>{
 for(const hand of ['right','left'])for(const hit of [true,false]) {
  const target=[hand==='right'?.35:-.35,.3,.1],stand=await lowStand(hand,target),{body,skills,cycles}=stand;
  const obstacle=hit?stand.world.physics.addFixedBox([target[0],target[1],target[2]+.04],[.2,.2,.08]):null;
  let contacts=0,ready=null,chamber=null,falls=false,badFloor=false;
  try {
   for(let i=0;i<25*120;i++) {
    stand.step();falls ||= body.down;
    if(skills.report.support.ready&&ready===null)ready=stand.world.time;
    if(skills.report.actions.some(action=>action.stage==='chamber')&&chamber===null)chamber=stand.world.time;
    if(obstacle&&stand.world.physics.contactsOf(stand.built.segments.get(`hand.${hand}`).body).some(c=>c.fixed===obstacle.id&&c.impulse>0))contacts++;
    badFloor ||= ['head','upperTrunk','middleTrunk','lowerTrunk'].some(n=>stand.world.physics.contactsOf(stand.built.segments.get(n).body).some(c=>c.fixed===stand.floor.id&&c.impulse>0));
   }
   const reading=cycles.reading();
   assert.ok(ready!==null&&chamber!==null&&chamber>=ready,`support ready at ${ready} s, first chamber at ${chamber} s`);
   assert.equal(falls,false);assert.equal(badFloor,false);assert.equal(skills.report.support.stage,'stand');assert.deepEqual(skills.report.actions,[]);
   assert.ok(body.view.head.y>1.58);assert.equal(reading.failed,0);assert.ok(reading.returned[hand]>=2,JSON.stringify(reading));
   assert.equal(hit?contacts>0:contacts===0,true);assert.deepEqual(body.assist.meter,{steps:0,force:0,moment:0});
  }finally{body.dispose();stand.dispose();}
 }
});

test('the supported executor refuses an imagined floor and keeps the strike unlaunched',async()=>{
 const s=await lowStand('right',[.35,.3,.1],{gravity:false,ground:false});
 try {
  // Requests are admitted and stay in preparation: weightless and with no floor, the fold never reads support, and a
  // request that is still lowering when the drifting body reads down ends there, never committed.
  const seen=new Set();
  for(let i=0;i<14*120;i++){
   s.step();assert.equal(s.skills.report.support.ready,false);
   for(const action of s.skills.report.actions)seen.add(`${action.phase}/${action.stage}`);
  }
  assert.deepEqual([...seen].sort(),['prepare/admitting','prepare/lower']);
  assert.ok(s.skills.report.ledger.length>0&&s.skills.report.ledger.every(record=>!record.committed&&record.ending.kind==='interrupted'),JSON.stringify(s.skills.report.ledger));
 }finally{s.body.dispose();s.dispose();}
});


test('a low-action fork preserves acquisition, committed strokes and standing handover',async()=>{
 const a=await lowStand('left',[-.35,.3,.1]),b=await lowStand('left',[-.35,.3,.1]);
 try {
  a.step(360);loadStand(b.world,b.states(),saveStand(a.world,a.states()));
  const ta=traceOf([a.built]),tb=traceOf([b.built]);
  for(let i=0;i<2640;i++){a.step();b.step();ta.take();tb.take();}
  assert.deepEqual(saveStand(b.world,b.states()).state,saveStand(a.world,a.states()).state);
  assert.equal(tb.digest(),ta.digest());assert.equal(a.skills.report.support.stage,'stand');assert.ok(a.body.view.head.y>1.58);
  assert.ok(a.cycles.reading().returned.left>=2,JSON.stringify(a.cycles.reading()));
 }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
});
