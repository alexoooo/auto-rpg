import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {actionTactics} from '../src/core/mind/action-tactics.ts';
import {behaviourFaults} from '../src/core/mind/behaviours.ts';
import {humanSpec} from '../src/core/human/spec.ts';
import {SCRAPPER,FIGHTING} from '../src/core/mind/config.ts';
import {combatTrial} from '../research/arena-combat.mjs';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {traceOf} from './harness/trace.mjs';
const spec=humanSpec('workshop-fighter');
function reader(){
 const tactics=actionTactics(spec,[],{...FIGHTING,list:[{kind:'approach',spacing:.125,spacingStep:.03125}]});
 const sight={view:{time:0,stance:{centre:new Vector3()},senses:{side:'own',others:[],solids:[]}},report:{heading:0,actions:[],ledger:[]}};
 return {tactics,sight};
}
const record=(sequence,changes={})=>({sequence,action:'strike',committed:true,ending:{kind:'completed'},contacts:{loadedInCommit:false},...changes});
test('range adaptation consumes exact completed clean misses once and saturates without inspecting history',()=>{
 const {tactics,sight}=reader();
 for(let i=1;i<=6;i++){
  sight.report.ledger=[record(i)];tactics.decide(sight,1/120);tactics.decide(sight,1/120);
  assert.deepEqual(tactics.state.spacing,[Math.max(0,.125-i*.03125)]);
  assert.equal(tactics.state.sequence,i);
 }
});
test('refusal, interruption, prepare failure, return timeout and loaded commitment do not train distance',()=>{
 for(const changes of [{committed:false},{ending:{kind:'refused'}},{ending:{kind:'interrupted'}},{ending:{kind:'abandoned'}},{ending:{kind:'stalled'}},{contacts:{loadedInCommit:true}}]){
  const {tactics,sight}=reader();sight.report.ledger=[record(1,changes)];tactics.decide(sight,1/120);
  assert.deepEqual(tactics.state.spacing,[.125]);
 }
});
test('approach learning settings reject nonfinite and negative values',()=>{
 for(const [spacing,spacingStep]of [[NaN,0],[0,NaN],[0,Infinity],[0,-1],[-.1,.1]])
  assert.ok(behaviourFaults({kind:'approach',spacing,spacingStep}).length);
 assert.deepEqual(behaviourFaults({kind:'approach',spacing:0,spacingStep:0}),[]);
});
const candidate={...SCRAPPER,tactics:{...SCRAPPER.tactics,list:SCRAPPER.tactics.list.map(b=>b.kind==='approach'?{...b,spacing:.1,spacingStep:.1}:b)}};
const index=candidate.tactics.list.findIndex(b=>b.kind==='approach');
test('observed clean misses correct physical self-play spacing without assistance or prolonged pressure', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
 const row=await combatTrial({left:candidate,right:candidate,recipe:{capSeconds:30}});
 for(const side of ['left','right']){
  const s=row.sides[side];assert.equal(s.approachSpacing[index],0);
  assert.ok(s.drivenDamage>.2,JSON.stringify(s));assert.ok((s.drivenTargets.upperTrunk??0)+(s.drivenTargets.middleTrunk??0)>=6);
  assert.equal(s.falls,0);assert.equal(s.pressureOnly.episodes,0);assert.ok(s.pressureOnly.longest<1);
  assert.deepEqual(s.assist,{force:0,moment:0});
 }
});

// How far the range is learned is the case above's: this one forks whatever it has learned by its first commit.
test('a fresh-world fork mid-commit carries the range learned and the pending observation, and ordinary orders cancel it',async()=>{
 const make=async()=>buildBout({left:'workshop-fighter',right:'workshop-fighter',minds:{left:candidate,right:candidate},
  balance:{left:0,right:0},held:{left:'empty',right:'empty'},capSeconds:30,recoverySeconds:null},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
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
  balance:{left:0,right:0},held:{left:'empty',right:'empty'},capSeconds:20,recoverySeconds:null},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
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
