import test from 'node:test';
import assert from 'node:assert/strict';
import {combatTurn} from '../research/combat-locomotion.mjs';
import {locomotion,validTurnLimit} from '../src/core/skills/locomotion.ts';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {traceOf} from './harness/trace.mjs';

test('heading ceilings reject invalid values and an omitted ceiling retains the envelope',()=>{
 for(const value of [-1,0,Infinity,NaN,null]){assert.equal(validTurnLimit(value),false);assert.throws(()=>locomotion(null,value),/finite and positive/);}
 assert.equal(validTurnLimit(),true);assert.equal(validTurnLimit(2),true);
});

test('an unassisted Warrior starting a fast left turn stands, at the asked rate or under the shared ceiling',async()=>{
 // A step lands no further round than the bearing hip lets the pelvis turn (`landingHeading`); without it these three fell.
 for(const speed of [.18,.35,.5]){
  const config={speed,rate:4,sense:-1,after:0};
  for(const [run,most] of [[await combatTurn(config),4],[await combatTurn({...config,turnLimit:2}),2]]){
   assert.equal(run.firstDown,null,JSON.stringify(run));assert.equal(run.phase,'stand');assert.ok(run.strides>4);
   assert.ok(Math.abs(run.maximumTurn-most)<1e-9,JSON.stringify(run));assert.deepEqual(run.assist,{steps:0,force:0,moment:0});
  }
 }
});

test('a configured Arena turn ceiling forks during an ordinary approach and retains its limit',async()=>{
 const make=async()=>buildBout({left:'workshop-fighter',right:'workshop-fighter',gap:2,capSeconds:20,recoverySeconds:null,
  balance:{left:0,right:0},held:{left:'empty',right:'empty'},minds:{left:{...SCRAPPER,tuning:{turnLimit:1}},right:{...SCRAPPER,tuning:{turnLimit:1}}}},
  {physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const a=await make(),b=await make();
 try{
  a.duel.play([]);b.duel.play([]);
  a.duel.order('left',{move:{x:-1,z:0},face:null,attack:null});
  let previous=a.duel.duelists.left.minded.skills.report.heading;
  for(let i=0;i<73;i++){a.world.step();const h=a.duel.duelists.left.minded.skills.report.heading;assert.ok(Math.abs(h-previous)<=a.world.dt+1e-12);previous=h;}
  assert.ok(Math.abs(previous)>.5);assert.ok(a.duel.duelists.left.minded.skills.report.pace>0);
  const saved=a.duel.save();b.duel.load(saved);
  const x=traceOf([a.duel.duelists.left.built,a.duel.duelists.right.built]),y=traceOf([b.duel.duelists.left.built,b.duel.duelists.right.built]);
  const headings=Object.values(a.duel.duelists).map(d=>d.minded.skills.report.heading);
  for(let i=0;i<600;i++){
   a.world.step();b.world.step();x.take();y.take();
   Object.values(a.duel.duelists).forEach((d,j)=>{const h=d.minded.skills.report.heading;assert.ok(Math.abs(h-headings[j])<=a.world.dt+1e-12);headings[j]=h;});
  }
  assert.equal(x.digest(),y.digest());assert.deepEqual(a.duel.save().state,b.duel.save().state);
 }finally{a.dispose();b.dispose();}
});
