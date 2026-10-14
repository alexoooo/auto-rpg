import test from 'node:test';
import assert from 'node:assert/strict';
import {validAttackTuning,ATTACK_PATH} from '../src/core/skills/attack-path.ts';
import {combatStrike} from '../research/combat-strikes.mjs';
import {saveStand,loadStand} from './harness/core-stand.mjs';
import {pathStand} from './harness/path-stand.mjs';
import {GUARD} from '../src/core/skills/guard.ts';
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

const stand=(hand='right',family='straight')=>pathStand({hand,action:{family},tuning:{elbowExtension:1}});

test('extended cross preference composes with bounded trunk rotation on both hands',async()=>{
 for(const hand of ['right','left']){
  const s=await stand(hand,'cross');
  try{
   while(s.stage()!=='swing'&&s.world.time<5)s.step();s.step(8);
   assert.equal(s.stage(),'swing');
   const pose=s.skills.state.command.posture,name=`elbow.${hand} flexion`;
   assert.ok(pose[name]<GUARD[name]-.1,JSON.stringify(pose));
   assert.ok(hand==='right'?pose['thoracic rotation right']>0:pose['thoracic rotation right']<0);
   const dof=s.built.spec.joints.find(j=>j.name===`elbow.${hand}`).dofs.find(d=>d.positive==='flexion');
   assert.ok(pose[name]>=dof.min.value&&pose[name]<=dof.max.value);
   assert.equal(s.body.down,false);
  }finally{s.body.dispose();s.dispose();}
 }
});

test('elbow interpolation survives a fresh-world swing/return fork and ends on takeover',async()=>{
 for(const phase of ['swing','return']){
  const a=await stand(),b=await stand();
  try{
   while(a.stage()!==phase&&a.world.time<5)a.step();a.step(3);
   assert.equal(a.stage(),phase);assert.ok(a.paths.lives.right.elbow>0);
   loadStand(b.world,b.states(),saveStand(a.world,a.states()));
   const ta=traceOf([a.built]),tb=traceOf([b.built]);
   for(let i=0;i<160;i++){a.step();b.step();ta.take();tb.take();}
   assert.ok([a,b].every(s=>s.cycles.reading().returned.right>=1));
   assert.deepEqual(saveStand(a.world,a.states()).state,saveStand(b.world,b.states()).state);
   assert.equal(ta.digest(),tb.digest());
   // The stroke under way when the host takes the body ends there, and the executor holds no elbow.
   while(!(a.paths.lives.right?.elbow>0)&&a.world.time<10)a.step();
   assert.ok(a.paths.lives.right?.elbow>0);
   a.skills.release(a.body.view,'takeover');
   assert.deepEqual(a.paths.lives,{left:null,right:null});assert.deepEqual(a.skills.report.actions,[]);
   assert.deepEqual(a.skills.report.ledger.at(-1).ending,{kind:'interrupted',reason:'takeover'});
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
 }
});
