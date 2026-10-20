import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine,DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';
import { COMBAT } from "./fixtures/minds.mjs";

test('physical predictive defense covers only an available hand and preserves its timing through a fresh-world fork',async()=>{
 const recipe={left:'workshop-fighter',right:'workshop-fighter',loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },balance:{left:0,right:0},
  minds:{left:{...COMBAT,tactics:{...COMBAT.tactics,list:[{kind:'follow-orders'},{kind:'evade'},{kind:'attack'},{kind:'approach'},{kind:'cover',guard:'predictive'}]}},right:COMBAT},senseDelay:6,recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const d=a.duel.duelists.left;let covered=0,forked=false;
  for(let i=0;i<3000&&!a.duel.verdict;i++){
   a.world.step();const st=d.minded.skills.state,v=d.minded.body.view;
   if(Object.entries(st.command.effectors).some(([effector,goal])=>goal&&d.minded.skills.report.holders['effector:'+effector]==='default')){
    const hands=Object.entries(st.command.effectors).filter(([h,g])=>d.minded.skills.report.holders['effector:'+h]==='default'&&g);
    assert.ok(hands.length<=2);covered+=hands.length;
    for(const [,goal]of hands)assert.ok(goal.seconds>0&&goal.seconds<=.3);
    const foe=v.senses.others[0];assert.ok(v.time>=foe.time);assert.ok(v.senses.solids.length>20);
    if(!forked){
     b.duel.load(a.duel.save());const ta=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),tb=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
     for(let k=0;k<120;k++){a.world.step();b.world.step();ta.take();tb.take();}
     assert.deepEqual(b.duel.save().state,a.duel.save().state);assert.equal(ta.digest(),tb.digest());forked=true;
    }
   }
  }
  // How often it covers and evades is `core-combat-capability`'s: this case forks at its first cover.
  assert.equal(forked,true,'no cover in 25 s: the fixture did not reach its case');assert.ok(covered>0);
 }finally{a.dispose();b.dispose();}
});

// Whether combat then clears the wall is `core-combat-capability`'s: this case holds the body inside
// the parapet and forks it beside the wall, at its first clearing or a while into the fight.
test('an ordered approach reaches the real parapet, then autonomous combat escapes and forks beside it', async()=>{
 const recipe={left:'workshop-fighter',right:'workshop-fighter',gap:1.2,loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },balance:{left:0,right:0},minds:{left:COMBAT,right:COMBAT},recoverySeconds:null,capSeconds:160};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const left=a.duel.duelists.left;
  const moving={move:{x:-1,z:0},face:{x:-1,z:0}};
  a.duel.order('left',moving);a.duel.order('right',moving);
  while(left.minded.body.view.stance.centre.x> -12.45&&a.duel.clock<100)a.world.step();
  a.duel.order('left',STAND_ORDERS);a.duel.order('right',STAND_ORDERS);a.world.step(240);
  assert.ok(left.minded.body.view.stance.centre.x< -12.5&&!left.body.down,'the ordered walk did not stand at the parapet: the fixture did not reach its case');
  a.duel.order('right',moving);a.world.step(480);a.duel.order('right',STAND_ORDERS);
  a.duel.order('left',null);a.duel.order('right',null);let forked=false;
  for(let i=0;i<1200;i++){
   a.world.step();const st=left.minded.skills.state;
   assert.ok(left.minded.body.view.stance.centre.x> -12.9,'the body stays inside the physical parapet');
   if(!forked&&(st.tactics.phase==='clear'||i===600)){
    b.duel.load(a.duel.save());const ta=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),tb=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
    for(let k=0;k<120;k++){a.world.step();b.world.step();ta.take();tb.take();}
    assert.deepEqual(b.duel.save().state,a.duel.save().state);assert.equal(ta.digest(),tb.digest());forked=true;
   }
  }
  assert.equal(forked,true);
 }finally{a.dispose();b.dispose();}
});
