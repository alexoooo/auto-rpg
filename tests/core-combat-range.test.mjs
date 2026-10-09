import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeLearning,validRangeLearning} from '../src/core/mind/range-learning.ts';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {combatTrial} from '../research/arena-combat.mjs';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {traceOf} from './harness/trace.mjs';
import {withParts} from './fixtures/minds.mjs';

test('range adaptation consumes only a clean launched swing with a verified return and saturates at the reference spacing',()=>{
 const learner=rangeLearning(.125,.03125),report={hand:'left',phase:'chamber',pointCycle:{returned:{left:0,right:0}}};
 const effectors={'hand.left':{feedback:{impulse:0}},'hand.right':{feedback:{impulse:0}}};
 for(let i=0;i<6;i++){
  report.hand='left';report.phase='chamber';learner.observe(report,effectors);
  report.phase='swing';learner.observe(report,effectors);report.phase='return';learner.observe(report,effectors);
  report.hand=null;report.phase=null;report.pointCycle.returned.left++;learner.observe(report,effectors);
  assert.deepEqual(learner.state,{offset:Math.max(0,.125-(i+1)*.03125),hand:null,launched:false,touched:false,returned:0,misses:i+1,adjustments:Math.min(i+1,4)});
 }
 learner.restart();assert.deepEqual(learner.state,{offset:.125,hand:null,launched:false,touched:false,returned:0,misses:0,adjustments:0});
});

test('preparation failure, a return timeout and contact during any strike phase never justify moving closer',()=>{
 for(const scenario of ['prepare','timeout','chamber','swing','return']){
  const learner=rangeLearning(.125,.03125),report={hand:'left',phase:'chamber',pointCycle:{returned:{left:0,right:0},failed:0}};
  const effectors={'hand.left':{feedback:{impulse:0}},'hand.right':{feedback:{impulse:0}}};
  for(const phase of ['chamber',...(scenario==='prepare'?[]:['swing']),'return']){
   report.phase=phase;effectors['hand.left'].feedback.impulse=phase===scenario?1:0;learner.observe(report,effectors);
  }
  report.hand=null;report.phase=null;
  if(scenario==='timeout')report.pointCycle.failed++;else report.pointCycle.returned.left++;
  learner.observe(report,effectors);
  assert.deepEqual(learner.state,{offset:.125,hand:null,launched:false,touched:false,returned:0,misses:0,adjustments:0},scenario);
 }
 const learner=rangeLearning(.125,.03125),report={hand:'right',phase:'chamber',pointCycle:{returned:{left:0,right:0}}};
 learner.observe(report,{});report.phase='swing';learner.observe(report,{});learner.cancel();
 report.hand=null;report.phase=null;report.pointCycle.returned.right++;learner.observe(report,{});
 assert.equal(learner.state.misses,0);assert.equal(learner.state.offset,.125);
});

test('range-learning settings reject nonfinite and negative active inputs',()=>{
 for(const [spacing,step] of [[NaN,0],[0,NaN],[0,Infinity],[0,-1],[-.1,.1]]){
  assert.equal(validRangeLearning(spacing,step),false);assert.throws(()=>rangeLearning(spacing,step),/range learning/);
 }
 assert.equal(validRangeLearning(-.1,0),true);assert.equal(validRangeLearning(),true);
});

const candidate=withParts(SCRAPPER,{tactics:{spacing:.1,spacingStep:.1}});
test('observed clean misses correct physical self-play spacing without assistance or prolonged pressure', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
 const row=await combatTrial({left:candidate,right:candidate,recipe:{capSeconds:30}});
 for(const side of ['left','right']){
  const s=row.sides[side];assert.ok(s.rangeLearning.adjustments>=1);assert.equal(s.rangeLearning.offset,0);
  assert.ok(s.drivenDamage>.2,JSON.stringify(s));assert.ok((s.drivenTargets.upperTrunk??0)+(s.drivenTargets.middleTrunk??0)>=6);
  assert.equal(s.falls,0);assert.equal(s.pressureOnly.episodes,0);assert.ok(s.pressureOnly.longest<1);
  assert.deepEqual(s.assist,{force:0,moment:0});
 }
});

test('fresh-world replay retains learned range and ordinary orders cancel the pending observation',async()=>{
 const make=async()=>buildBout({left:'workshop-fighter',right:'workshop-fighter',minds:{left:candidate,right:candidate},
  balance:{left:0,right:0},held:{left:'empty',right:'empty'},capSeconds:30,recoverySeconds:null},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const a=await make(),b=await make();
 try{
  a.duel.play([]);b.duel.play([]);const skills=a.duel.duelists.left.minded.skills;
  while(a.duel.clock<20&&skills.state.tactics.range.adjustments===0)a.world.step();
  assert.ok(skills.state.tactics.range.adjustments>0);
  while(a.duel.clock<20&&!skills.state.tactics.range.launched)a.world.step();
  assert.equal(skills.state.tactics.range.launched,true);assert.ok(skills.state.tactics.range.hand);
  b.duel.load(a.duel.save());
  const x=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),y=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
  for(let i=0;i<240;i++){a.world.step();b.world.step();x.take();y.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(x.digest(),y.digest());
  a.duel.order('left',STAND_ORDERS);a.world.step();assert.equal(skills.state.tactics.range.hand,null);
 }finally{a.dispose();b.dispose();}
});

test('physical timed-out returns cannot train a shorter Arena working distance',async()=>{
 const timed=withParts(candidate,{blow:{tuning:{paths:{returnLimit:.05}}}});
 const s=await buildBout({left:'workshop-fighter',right:'workshop-fighter',minds:{left:timed,right:timed},
  balance:{left:0,right:0},held:{left:'empty',right:'empty'},capSeconds:20,recoverySeconds:null},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  s.duel.play([]);let clean=0;
  for(let i=0;i<1800;i++){
   s.world.step();
   for(const d of Object.values(s.duel.duelists)){const r=d.minded.skills.state.tactics.range;if(r.launched&&!r.touched)clean++;}
  }
  assert.ok(clean>0,'real launched swings have a clean miss to observe');
  for(const d of Object.values(s.duel.duelists)){
   const k=d.minded.skills;assert.ok(k.report.strike.pointCycle.failed>1);assert.equal(k.report.strike.pointCycle.returned.left+k.report.strike.pointCycle.returned.right,0);
   assert.equal(k.state.tactics.range.misses,0);assert.equal(k.state.tactics.range.offset,.1);
  }
 }finally{s.dispose();}
});
