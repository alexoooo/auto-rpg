import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { buildBout } from '../research/bout.mjs';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { SCRAPPER, RECIPE_FIGHTER } from '../src/core/mind/config.ts';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';
import { centreOfToRef } from '../src/core/control/support.ts';
import { readMinds } from '../src/arena/matchup.ts';
import { traceOf } from './harness/trace.mjs';

test('selectable grounded combat forks its approach and obeys an ordinary stand order', async()=>{
 const preset=readMinds('?control=scrapper').left,candidate={...preset,actions:preset.actions.map(action=>({...action,effectors:['hand.right']}))};
 assert.deepEqual(readMinds('?control=scrapper').left,SCRAPPER);
 const recipe={left:'workshop-fighter',right:'workshop-fighter',loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },balance:{left:0,right:0},
  minds:{left:candidate,right:RECIPE_FIGHTER},gap:.8,capSeconds:60,recoverySeconds:null};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built));
 try{
  a.duel.order('left',STAND_ORDERS);a.duel.order('right',STAND_ORDERS);a.world.step(360);
  const standing=a.duel.duelists.left.body.view.head.y;
  const trunk=a.duel.duelists.right.built.segments.get('upperTrunk');trunk.body.applyImpulse(new Vector3(0,0,90),centreOfToRef(trunk,new Vector3()));
  a.world.step(120);a.duel.order('left',null);
  const skills=a.duel.duelists.left.minded.skills;
  while(a.duel.clock<25&&!skills.state.tactics.ground.wide.route?.length)a.world.step();
  assert.ok(a.duel.clock<25,'no ground approach was routed: the fixture did not reach its case');
  b.duel.load(a.duel.save());const ta=trace(a),tb=trace(b);
  for(let i=0;i<180;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.equal(tb.digest(),ta.digest());assert.deepEqual(b.duel.save().state,a.duel.save().state);
  a.duel.order('left',STAND_ORDERS);a.world.step();
  assert.equal(skills.state.tactics.ground.near.active,false);assert.equal(skills.state.tactics.ground.wide.active,false);
  // Stood again: no action, the low support let go and the head back where it stood.
  const up=()=>!skills.report.actions.length&&!skills.report.support.ready&&a.duel.duelists.left.body.view.head.y>standing-.05;
  while(a.duel.clock<40&&!up())a.world.step();
  assert.ok(up(),JSON.stringify({support:skills.report.support,actions:skills.report.actions.length,head:a.duel.duelists.left.body.view.head.y,standing}));
  assert.equal(a.duel.duelists.left.body.down,false);assert.equal(a.duel.verdict,null);
 }finally{a.dispose();b.dispose();}
});
