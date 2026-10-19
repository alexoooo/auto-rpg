/**
 * **How the path-strike fighters do in Arena bouts** (`research/bout.mjs`, `research/arena-combat.mjs`,
 * `research/combat-locomotion.mjs`; Node, core world, Rapier, 120 Hz, no assist): the range learned
 * from clean misses, driven blows at the trunk, how often guards are met, covers made and walls
 * cleared, a follow-up thrown after a landed lead, and fast turns walked without a fall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {combatTrial} from '../research/arena-combat.mjs';
import {combatTurn} from '../research/combat-locomotion.mjs';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {openingSelector} from '../src/core/mind/openings.ts';
import {modelSpec} from '../src/core/models.ts';
import {COMBAT} from './fixtures/minds.mjs';

const make=async(recipe)=>buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});

test('observed clean misses correct physical self-play spacing without assistance or prolonged pressure', async()=>{
 const candidate={...SCRAPPER,tactics:{...SCRAPPER.tactics,list:SCRAPPER.tactics.list.map(b=>b.kind==='approach'?{...b,spacing:.1,spacingStep:.1}:b)}};
 const index=candidate.tactics.list.findIndex(b=>b.kind==='approach');
 const row=await combatTrial({left:candidate,right:candidate,recipe:{capSeconds:30}});
 for(const side of ['left','right']){
  const s=row.sides[side];assert.equal(s.approachSpacing[index],0);
  assert.ok(s.drivenDamage>.2,JSON.stringify(s));assert.ok((s.drivenTargets.upperTrunk??0)+(s.drivenTargets.middleTrunk??0)>=6);
  assert.equal(s.falls,0);assert.equal(s.pressureOnly.episodes,0);assert.ok(s.pressureOnly.longest<1);
  assert.deepEqual(s.assist,{force:0,moment:0});
 }
});

test('hull-aware body selection lands driven torso blows against an active Combat fighter',async()=>{
 const row=await combatTrial({left:{...COMBAT,actions:COMBAT.actions.map(action=>({...action,regions:[{kind:'mark',mark:'middle'}]}))},right:COMBAT,recipe:{capSeconds:30}});
 const out=row.sides.left;
 assert.ok((out.drivenTargets.middleTrunk??0)+(out.drivenTargets.upperTrunk??0)>=5,JSON.stringify(out));assert.ok(out.drivenDamage>.2,JSON.stringify(out));
 assert.equal(out.falls,0);assert.deepEqual(out.assist,{force:0,moment:0});assert.ok(out.pressureOnly.longest<2);
});

test('a Combat bout labels many guard contacts, meets blocks and has openings its selector passes over',async()=>{
 const a=await make({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},minds:{left:COMBAT,right:COMBAT},recoverySeconds:null,capSeconds:30});
 try{
  const select=openingSelector(modelSpec('workshop-fighter'));
  let labeled=0,penalized=0,escaped=0;
  for(let i=0;i<2400&&!a.duel.done;i++){
   a.world.step();const d=a.duel.duelists.left,view=d.minded.body.view,foe=view.senses.others[0];
   if(!foe)continue;
   const opening=select(view,foe,'right'),alternate=select(view,foe,'right',opening.segment);
   if(alternate.score>opening.score)penalized++;
   if(d.minded.skills.report.ledger.some(record=>record.contacts.counts.commit.block>0))escaped++;
   for(const f of ['hand.left','hand.right'].map(s=>view.effectors[s].feedback))if(f.contact?.target.kind==='body')labeled++;
  }
  assert.ok(labeled>10,`${labeled} labelled`);assert.ok(penalized>100,`${penalized} penalized`);assert.ok(escaped>10,`${escaped} after a block`);
 }finally{a.dispose();}
});

test('predictive defense covers and evades often in a Combat bout',async()=>{
 const a=await make({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:{...COMBAT,tactics:{...COMBAT.tactics,list:[{kind:'follow-orders'},{kind:'evade'},{kind:'attack'},{kind:'approach'},{kind:'cover',guard:'predictive'}]}},right:COMBAT},senseDelay:6,recoverySeconds:null,capSeconds:30});
 try{
  const d=a.duel.duelists.left;let defended=0,evaded=0,covered=0;
  for(let i=0;i<3000&&!a.duel.verdict;i++){
   a.world.step();const st=d.minded.skills.state,held=([effector,goal])=>goal&&d.minded.skills.report.holders['effector:'+effector]==='default';
   defended+=Number(Object.entries(st.command.effectors).some(held));evaded+=Number(st.tactics.phase==='evade');
   covered+=Object.entries(st.command.effectors).filter(held).length;
  }
  assert.ok(defended>10,`${defended} steps defended`);assert.ok(covered>10,`${covered} hands covered`);assert.ok(evaded>0,`${evaded} steps evading`);
 }finally{a.dispose();}
});

test('autonomous combat clears the parapet it was ordered against and commits a blow',async()=>{
 const a=await make({left:'workshop-fighter',right:'workshop-fighter',gap:1.2,held:{left:'empty',right:'empty'},balance:{left:0,right:0},minds:{left:COMBAT,right:COMBAT},recoverySeconds:null,capSeconds:160});
 try{
  const left=a.duel.duelists.left,moving={move:{x:-1,z:0},face:{x:-1,z:0}};
  a.duel.order('left',moving);a.duel.order('right',moving);
  while(left.minded.body.view.stance.centre.x> -12.45&&a.duel.clock<100)a.world.step();
  a.duel.order('left',STAND_ORDERS);a.duel.order('right',STAND_ORDERS);a.world.step(240);
  assert.ok(left.minded.body.view.stance.centre.x< -12.5);assert.equal(left.body.down,false);
  a.duel.order('right',moving);a.world.step(480);a.duel.order('right',STAND_ORDERS);
  a.duel.order('left',null);a.duel.order('right',null);let escaped=0;
  for(let i=0;i<1200;i++){a.world.step();escaped+=Number(left.minded.skills.state.tactics.phase==='clear');}
  assert.ok(escaped>0,'it never clears the wall');
  assert.ok(left.minded.skills.report.ledger.some(record=>record.committed),'it commits no blow');
 }finally{a.dispose();}
});

test('both Arena assignments reach a physical follow-up in a free bout',async()=>{
 const candidate={...COMBAT,actions:[{...COMBAT.actions[0],name:'lead',effectors:['hand.right']},
  {...COMBAT.actions[0],name:'follow',effectors:['hand.left']}],tactics:{...COMBAT.tactics,
  choose:{kind:'rules',rethink:.1,patience:.5,rules:[{when:{kind:'follow-up',seconds:2},actions:['follow']}],otherwise:['lead']}}};
 for(const side of ['left','right']){
  const s=await make({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
   minds:{left:side==='left'?candidate:COMBAT,right:side==='right'?candidate:COMBAT},gap:1.4,recoverySeconds:null,capSeconds:30});
  try{
   const skills=s.duel.duelists[side].minded.skills;let followed=false;
   for(let i=0;i<2400&&!s.duel.verdict&&!followed;i++){s.world.step();followed=skills.report.actions.some(action=>action.action==='follow');}
   assert.ok(followed,`${side} reaches a physical follow-up`);
  }finally{s.dispose();}
 }
});

test('a brief startup ceiling permits fast established turns without the unassisted Warrior falling in either direction', async()=>{
 const startup={seconds:.6,limit:2};
 for(const speed of [.18,.25,.5])for(const sense of [-1,1]){
  const row=await combatTurn({speed,rate:4,turnLimit:4,sense,after:0,turnStartup:startup});
  assert.equal(row.firstDown,null,JSON.stringify(row));assert.equal(row.phase,'stand');assert.ok(row.strides>4);
  assert.ok(row.maximumTurn>3.9&&row.maximumTurn<=4+1e-12,JSON.stringify(row));
  assert.deepEqual(row.assist,{steps:0,force:0,moment:0});
 }
});
