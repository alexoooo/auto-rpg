import test from 'node:test';
import assert from 'node:assert/strict';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {traceOf} from './harness/trace.mjs';
const candidate={...SCRAPPER,tactics:{...SCRAPPER.tactics,list:SCRAPPER.tactics.list.map(b=>b.kind==='approach'?{...b,spacing:.1,spacingStep:.1}:b)}};
const index=candidate.tactics.list.findIndex(b=>b.kind==='approach');
// How far the range is learned is `core-combat-capability`'s: this case forks whatever it has learned by its first commit.
test('a fresh-world fork mid-commit carries the range learned and the pending observation, and ordinary orders cancel it',async()=>{
 const make=async()=>buildBout({left:'workshop-fighter',right:'workshop-fighter',minds:{left:candidate,right:candidate},
  balance:{left:0,right:0},loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },capSeconds:30,recoverySeconds:null},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const a=await make(),b=await make();
 try{
  a.duel.play([]);b.duel.play([]);const skills=a.duel.duelists.left.minded.skills;
  while(a.duel.clock<20&&!skills.report.actions.some(action=>action.phase==='commit'))a.world.step();
  assert.ok(skills.report.actions.some(action=>action.phase==='commit'),'no commit in 20 s: the fixture did not reach its case');
  b.duel.load(a.duel.save());
  const x=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),y=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
  for(let i=0;i<240;i++){a.world.step();b.world.step();x.take();y.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(x.digest(),y.digest());
  a.duel.order('left',STAND_ORDERS);a.world.step(600);assert.deepEqual(skills.report.actions,[]);
 }finally{a.dispose();b.dispose();}
});

test('physical timed-out returns cannot train a shorter Arena working distance',async()=>{
 const timed={...candidate,executors:candidate.executors.map(executor=>({...executor,tuning:{paths:{returnLimit:.05}}}))};
 const s=await buildBout({left:'workshop-fighter',right:'workshop-fighter',minds:{left:timed,right:timed},
  balance:{left:0,right:0},loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },capSeconds:20,recoverySeconds:null},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  s.duel.play([]);let clean=0;
  for(let i=0;i<1800;i++){
   s.world.step();
   for(const d of Object.values(s.duel.duelists)){const r=d.minded.skills.report.actions;if(r.some(action=>action.phase==='commit'&&!action.contacts.loadedInCommit))clean++;}
  }
  assert.ok(clean>0,'real launched swings have a clean miss to observe');
  for(const d of Object.values(s.duel.duelists)){
   const k=d.minded.skills;assert.ok(k.report.ledger.filter(record=>record.ending.kind==='stalled').length>1);assert.equal(k.report.ledger.filter(record=>record.ending.kind==='completed').length,0);
   assert.equal(k.state.tactics.spacing[index],.1);
  }
 }finally{s.dispose();}
});
