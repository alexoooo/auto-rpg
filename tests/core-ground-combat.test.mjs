import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { groundFight } from '../research/ground-combat.mjs';
import { buildBout } from '../research/bout.mjs';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { ARENA_SCRAPPER, FIGHTER } from '../src/core/mind/config.ts';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';
import { centreOfToRef } from '../src/core/control/support.ts';
import { readMinds } from '../src/arena/matchup.ts';
import { traceOf } from './harness/trace.mjs';

for(const hand of ['right','left'])for(const recover of [false,true])test(`the real Arena ${hand} hand attacks a ${recover?'recovering':'stationary fallen'} Warrior and returns standing`,async()=>{
 const row=await groundFight({hand,recover,seconds:45}),out=row.summary;
 assert.ok(out.begun!==null&&out.begun<15,JSON.stringify(out));
 assert.ok(out.lowReady>100&&out.lowDriven>=2&&out.damage>.015,JSON.stringify(out));
 assert.equal(out.opponentFell,true);assert.equal(out.attackerFell,false);assert.equal(out.trunkFloor,0);
 assert.equal(out.returnedStanding,true);assert.ok(out.cycles.returned[hand]>=2);
 assert.deepEqual(out.assist,{force:0,moment:0});
 assert.ok(row.rows.some(r=>r.phase==='low-approach'));
 if(recover)assert.ok(row.rows.some(r=>r.foeOwner==='recovery: rise'));
 else assert.ok(row.rows.some(r=>r.foeOwner==='lie'));
});

test('selectable grounded combat forks its approach and low swing and obeys an ordinary stand order',async()=>{
 const candidate={...readMinds('?control=scrapper').left,hand:'right'};
 assert.deepEqual(readMinds('?control=scrapper').left,ARENA_SCRAPPER);
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:candidate,right:FIGHTER},gap:.8,capSeconds:60,recoverySeconds:null};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built));
 try{
  a.duel.order('left',STAND_ORDERS);a.duel.order('right',STAND_ORDERS);a.world.step(360);
  const trunk=a.duel.duelists.right.built.segments.get('upperTrunk');trunk.body.applyImpulse(new Vector3(0,0,90),centreOfToRef(trunk,new Vector3()));
  a.world.step(120);a.duel.order('left',null);
  const skills=a.duel.duelists.left.minded.skills;
  for(const phase of ['approach','swing']){
   while(a.duel.clock<25&&!(phase==='approach'?skills.state.tactics.ground.wide.route?.length:skills.state.action?.family==='downward'&&skills.report.strike.phase==='swing'))a.world.step();
   assert.ok(a.duel.clock<25,phase);
   b.duel.load(a.duel.save());const ta=trace(a),tb=trace(b);
   for(let i=0;i<180;i++){a.world.step();b.world.step();ta.take();tb.take();}
   assert.equal(tb.digest(),ta.digest());assert.deepEqual(b.duel.save().state,a.duel.save().state);
  }
  a.duel.order('left',STAND_ORDERS);a.world.step();
  assert.equal(skills.state.tactics.ground.near.active,false);assert.equal(skills.state.tactics.ground.wide.active,false);
  while(a.duel.clock<40&&(skills.report.support.stage!=='stand'||skills.report.strike.hand))a.world.step();
  assert.ok(a.duel.clock<40);assert.equal(skills.report.support.stage,'stand');assert.equal(skills.report.strike.hand,null);
  assert.equal(a.duel.duelists.left.body.down,false);assert.equal(a.duel.verdict,null);
 }finally{a.dispose();b.dispose();}
});
