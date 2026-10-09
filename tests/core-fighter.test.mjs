// The fighter's tactics and skills as parts, on the Node arena stand, vendored Rapier, 120 Hz.
import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBAT,KICKER,SCRAPPER} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {CONTROLLERS} from '../src/core/mind/controllers.ts';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {buildBout} from '../research/bout.mjs';
import {traceOf} from './harness/trace.mjs';
import {withParts} from './fixtures/minds.mjs';

const bout=async(left,right,recipe={})=>buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
 minds:{left,right},recoverySeconds:null,capSeconds:30,...recipe},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});

test('the opening tactics over the recipe strike play: its blows are thrown, and a recipe strike reads no contact',async()=>{
 const s=await bout(withParts(COMBAT,{blow:{kind:'recipe-strike'}}),COMBAT);
 try{
  const left=s.duel.duelists.left.minded;
  for(let i=0;i<1200&&!s.duel.verdict;i++)s.world.step();
  const thrown=left.skills.report.strike.thrown;
  assert.ok(thrown.left+thrown.right>0,JSON.stringify(thrown));
  assert.equal(left.skills.state.blow.hands,undefined,'the recipe strike, not the path strike, carries the blows');
 }finally{s.dispose();}
});

test('a fighter with no kick skill never asks for a kick; the same tactics with one do',async()=>{
 // Each against a foe that stands, the witness under which the Kicker kicks within 15 s (`arena-kicks`).
 const kicks=async(left)=>{
  const s=await bout(left,SCRAPPER,{gap:1.4,capSeconds:60});
  try{
   s.duel.order('right',STAND_ORDERS);const skills=s.duel.duelists.left.minded.skills;let kicked=0;
   // The skill set refuses a kick it has no skill for, so a step that asked one would throw.
   while(s.duel.clock<15&&!s.duel.verdict){s.world.step();kicked+=Number(skills.state.holders.legs==='kick');}
   return {tactics:skills.state.tactics.kick,report:skills.report.kick,kicked};
  }finally{s.dispose();}
 };
 const without=await kicks(withParts(KICKER,{kick:null})),with_=await kicks(KICKER);
 assert.equal(without.tactics,null);assert.equal(without.report,undefined);assert.equal(without.kicked,0);
 assert.notEqual(with_.tactics,null);assert.ok(with_.report);assert.ok(with_.kicked>0,'the control kicks');
});

test('a bout under each fighter preset forked mid-fight goes on as the one it was forked from',async()=>{
 for(const [id,{config}] of Object.entries(CONTROLLERS.fighter.presets)){
  const a=await bout(config,config),b=await bout(config,config);
  try{
   a.world.step(480);
   b.duel.load(a.duel.save());
   const trace=(s)=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
   for(let i=0;i<240;i++){a.world.step();b.world.step();ta.take();tb.take();}
   assert.deepEqual(b.duel.save().state,a.duel.save().state,id);assert.equal(tb.digest(),ta.digest(),id);
  }finally{a.dispose();b.dispose();}
 }
});
