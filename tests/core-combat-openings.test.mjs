import test from 'node:test';
import assert from 'node:assert/strict';
import { openingSelector } from '../src/core/mind/openings.ts';
import { modelSpec } from '../src/core/models.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';
import { convexHull } from '../src/core/spec/hull.ts';
import { frameOf } from '../src/core/spec/body.ts';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';
import {COMBAT} from './fixtures/minds.mjs';

test('physical guard contacts retain anatomical labels and replay preserves the action ledger',async()=>{
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},minds:{left:COMBAT,right:COMBAT},recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  let labeled=0,snapshot=false;
  for(let i=0;i<2400&&!a.duel.done;i++){
   a.world.step();const d=a.duel.duelists.left,view=d.minded.body.view,foe=view.senses.others[0];
   if(!foe)continue;
   for(const f of ['hand.left','hand.right'].map(s=>view.effectors[s].feedback))if(f.contact?.target.kind==='body'){
    assert.equal(f.contact.target.body,'right');assert.ok(foe.segments.has(f.contact.target.segment));
    assert.ok(Math.abs(Math.hypot(...f.contact.normal)-1)<1e-5);assert.ok(f.contact.impulse>0);labeled++;
   }
   if(!snapshot&&d.minded.skills.report.ledger.some(record=>record.contacts.counts.commit.block>0)){
    b.duel.load(a.duel.save());const ta=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),tb=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
    for(let k=0;k<120;k++){a.world.step();b.world.step();ta.take();tb.take();}
    assert.deepEqual(b.duel.save().state,a.duel.save().state);assert.equal(tb.digest(),ta.digest());snapshot=true;
   }
  }
  // How often a guard is met is `core-combat-capability`'s: this case reads every label it sees and forks at the first block.
  assert.equal(snapshot,true,'no commit met a guard in 20 s: the fixture did not reach its case');assert.ok(labeled>0);
 }finally{a.dispose();b.dispose();}
});

test('the real Warrior trunk hull supplies a surface opening and a fresh-world selection fork',async()=>{
 const config={...COMBAT,actions:COMBAT.actions.map(action=>({...action,regions:[{kind:'segment',segment:'middleTrunk'}],aim:{kind:'surface',tuning:{head:1,upperTrunk:.2,middleTrunk:0}}}))};
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:config,right:COMBAT},recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try {
  const select=openingSelector(modelSpec('workshop-fighter'),{head:100,upperTrunk:100,middleTrunk:0});
  a.duel.order('left',STAND_ORDERS);a.duel.order('right',STAND_ORDERS);
  a.world.step(240);const view=a.duel.duelists.left.minded.body.view,foe=view.senses.others[0];
  const opening=select(view,foe,'right');assert.equal(opening.segment,'middleTrunk');
  const segment=foe.spec.segments.find(s=>s.name===opening.segment),sensed=foe.segments.get(opening.segment),frame=frameOf(segment);
  assert.equal(segment.shape.kind,'hull');
  const local=p=>{const d=p.map((v,k)=>v-frame.origin[k]);return [frame.x,frame.y,frame.z].map(axis=>axis.reduce((sum,v,k)=>sum+v*d[k],0));};
  const poly=convexHull(segment.shape.points.map(p=>local(p.value)));
  const position=new Vector3(...opening.target).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.Inverse(sensed.rotation),new Vector3());
  const distances=poly.planes.map(p=>Vector3.Dot(new Vector3(...p.normal),position)-p.offset);
  assert.ok(Math.max(...distances)<.005&&Math.abs(Math.max(...distances))<.005,'target lies on the physical hull within its short prediction');
  a.duel.order('left',null);a.duel.order('right',null);
  while(a.world.time<15&&!(a.duel.duelists.left.minded.skills.report.actions.some(action=>action.phase==='commit'&&action.target.region.segment==='middleTrunk')))a.world.step();
  assert.equal(a.duel.duelists.left.minded.skills.report.actions.find(action=>action.phase==='commit')?.target.region.segment,'middleTrunk','no commit on the trunk in 15 s: the fixture did not reach its case');
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let k=0;k<200;k++){a.world.step();b.world.step();ta.take();tb.take();}
  // Whether the blow lands on the trunk is the next case's: this one forks the selection.
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
 }finally{a.dispose();b.dispose();}
});


// Whether the overhand lands is `combat-strike-capability`'s: this case forks the one thrown, whatever it meets.
test('a selected overhand keeps its world contact direction through execution and fresh-world replay', async()=>{
 const candidate={...COMBAT,actions:[{...COMBAT.actions[0],name:'overhand',family:'overhand',regions:[{kind:'segment',segment:'head'}],aim:{kind:'surface',tuning:{overhand:-.6}}}]};
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:candidate,right:COMBAT},recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try {
  const d=a.duel.duelists.left,skills=d.minded.skills;
  while(a.duel.clock<20&&!(skills.report.actions.some(action=>action.action==='overhand'&&action.phase==='commit')))a.world.step();
  const committed=skills.report.actions.find(action=>action.action==='overhand'&&action.phase==='commit');assert.ok(committed,'no overhand committed in 20 s: the fixture did not reach its case');
  const hand=committed.effector.split('.')[1],goal=skills.state.command.effectors[`hand.${hand}`];
  const world=new Vector3(...goal.terminalVelocity).applyRotationQuaternionToRef(d.body.view.root.rotation,new Vector3());
  // The goal is in the root's frame as the command was made, a step before the root read here.
  assert.ok(Math.abs(world.x)<1e-6&&Math.abs(world.y+5)<1e-6&&Math.abs(world.z)<1e-6,JSON.stringify(world.asArray()));
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let i=0;i<240;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
  assert.ok(skills.report.ledger.some(record=>record.id===committed.id),'the overhand ends within the forked steps');
 }finally{a.dispose();b.dispose();}
});
