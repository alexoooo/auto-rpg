// The fighter's tactics and skills as parts, on the Node arena stand, vendored Rapier, 120 Hz.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RECIPE_FIGHTER,SCRAPPER} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {CONTROLLERS} from '../src/core/mind/controllers.ts';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {buildBout} from '../research/bout.mjs';
import {traceOf} from './harness/trace.mjs';
import {COMBAT,KICKER,withParts} from './fixtures/minds.mjs';

const bout=async(left,right,recipe={})=>buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
 minds:{left,right},recoverySeconds:null,capSeconds:30,...recipe},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});

test('a named recipe executor runs under the shared behaviour fighter with physical contact feedback',async()=>{
 const s=await bout(RECIPE_FIGHTER,COMBAT,{gap:1.4});
 try{
  const left=s.duel.duelists.left.minded;
  for(let i=0;i<1200&&!s.duel.verdict;i++)s.world.step();
  assert.ok(left.skills.report.ledger.some(record=>record.committed),JSON.stringify(left.skills.report.ledger));
  assert.equal(left.skills.state.actions.executors.length,1);
  assert.ok(left.body.view.effectors['hand.right'].feedback);
 }finally{s.dispose();}
});

test('a fighter can request only the configured kick action and records its committed interval',async()=>{
 const onlyKick={...KICKER,actions:KICKER.actions.filter(action=>action.name==='kick'),tactics:{...KICKER.tactics,
  choose:{kind:'first-ready',rethink:.2,patience:2},list:[{kind:'attack'},{kind:'approach'},{kind:'cover',guard:'pose'}]}};
 const s=await bout(onlyKick,SCRAPPER,{gap:1.4,capSeconds:60});
 try{
  s.duel.order('right',STAND_ORDERS);const skills=s.duel.duelists.left.minded.skills;
  while(s.duel.clock<15&&!s.duel.verdict&&!skills.report.ledger.some(record=>record.committed))s.world.step();
  assert.ok(skills.report.ledger.some(record=>record.action==='kick'&&record.committed),JSON.stringify(skills.report.ledger));
  assert.ok(skills.report.ledger.every(record=>record.action==='kick'));
 }finally{s.dispose();}
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
