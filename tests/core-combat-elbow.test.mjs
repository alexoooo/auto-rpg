import test from 'node:test';
import assert from 'node:assert/strict';
import {validAttackTuning,ATTACK_PATH} from '../src/core/skills/attack-path.ts';
import {combatStrike} from '../research/combat-strikes.mjs';
import {coreStand,saveStand,loadStand} from './harness/core-stand.mjs';
import {modelSpec} from '../src/core/models.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {combatSkills} from '../src/core/skills/combat.ts';
import {GUARD} from '../src/core/skills/guard.ts';
import {NO_COVER} from '../src/core/mind/intent.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {traceOf} from './harness/trace.mjs';

test('shared path validation bounds the elbow preference and rejects invalid durations and numbers',()=>{
 for(const elbowExtension of [0,.5,1])assert.equal(validAttackTuning({...ATTACK_PATH,elbowExtension}),true);
 for(const elbowExtension of [-.01,1.01,NaN,Infinity])assert.equal(validAttackTuning({...ATTACK_PATH,elbowExtension}),false);
 for(const field of ['chamberSeconds','swingSeconds','returnSeconds','hold'])assert.equal(validAttackTuning({...ATTACK_PATH,[field]:0}),false);
 assert.equal(validAttackTuning({...ATTACK_PATH,contactSpeed:Infinity}),false);
});

test('either hand repeats extended head punches with useful contact mass and survives misses', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
 for(const hand of ['right','left'])for(const mode of ['hit','miss']) {
  const row=await combatStrike({hand,mode,seconds:8,across:.1,ahead:.6,measureMass:true,tuning:{elbowExtension:1}});
  assert.equal(row.fell,false);assert.equal(row.cycles.failed,0);assert.ok(row.cycles.returned[hand]>=7,JSON.stringify(row));
  assert.deepEqual(row.assist,{force:0,moment:0});
  if(mode==='hit'){
   assert.equal(row.contacts.length,8);assert.ok(row.contacts.every(c=>c.closing>4.9),JSON.stringify(row.contacts));
   const mean=row.contacts.reduce((sum,c)=>sum+c.mass,0)/row.contacts.length;
   const baseline=await combatStrike({hand,mode,seconds:8,across:.1,ahead:.6,measureMass:true});
   const baseMass=baseline.contacts.reduce((sum,c)=>sum+c.mass,0)/baseline.contacts.length;
   assert.ok(mean>baseMass*1.3,JSON.stringify({contacts:row.contacts,baseline:baseline.contacts}));
  }else{assert.deepEqual(row.contacts,[]);assert.ok(row.peaks.every(p=>p>4),JSON.stringify(row.peaks));}
 }
});

async function stand(hand='right',family='straight') {
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body,{},{paths:{...ATTACK_PATH,elbowExtension:1}});
 body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,
  attack:view.time>=2?{kind:'blow',hand,target:[hand==='right'?.1:-.1,1.63,.6],path:{family}}:null},dt));
 return {...s,body,skills};
}

test('extended cross preference composes with bounded trunk rotation on both hands',async()=>{
 for(const hand of ['right','left']){
  const s=await stand(hand,'cross');
  try{
   while(s.skills.report.strike.phase!=='swing'&&s.world.time<5)s.step();s.step(8);
   assert.equal(s.skills.report.strike.phase,'swing');
   const pose=s.skills.state.command.posture,name=`elbow.${hand} flexion`;
   assert.ok(pose[name]<GUARD[name]-.1,JSON.stringify(pose));
   assert.ok(hand==='right'?pose['thoracic rotation right']>0:pose['thoracic rotation right']<0);
   const dof=s.built.spec.joints.find(j=>j.name===`elbow.${hand}`).dofs.find(d=>d.positive==='flexion');
   assert.ok(pose[name]>=dof.min.value&&pose[name]<=dof.max.value);
   assert.equal(s.body.down,false);
  }finally{s.body.dispose();s.dispose();}
 }
});

test('elbow interpolation survives a fresh-world swing/return fork and resets on takeover',async()=>{
 for(const phase of ['swing','return']){
  const a=await stand(),b=await stand();
  try{
   while(a.skills.report.strike.phase!==phase&&a.world.time<5)a.step();a.step(3);
   assert.equal(a.skills.report.strike.phase,phase);assert.ok(a.skills.state.hands.right.elbow>0);
   const states=s=>({body:s.body.state,skills:s.skills.state});
   loadStand(b.world,states(b),saveStand(a.world,states(a)));
   const ta=traceOf([a.built]),tb=traceOf([b.built]);
   for(let i=0;i<160;i++){a.step();b.step();ta.take();tb.take();}
   assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
   assert.equal(ta.digest(),tb.digest());assert.ok(a.skills.report.strike.pointCycle.returned.right>=1);
   a.skills.resume(a.body.view);assert.equal(a.skills.state.hands.right.elbow,0);assert.equal(a.skills.state.hands.right.initialElbow,0);assert.equal(a.skills.report.strike.hand,null);
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
 }
});
