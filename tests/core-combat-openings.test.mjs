import test from 'node:test';
import assert from 'node:assert/strict';
import { effectorFeedback, contactResponse } from '../src/core/control/effector-feedback.ts';
import { openingSelector, segmentDistanceSquared } from '../src/core/mind/openings.ts';
import { modelSpec } from '../src/core/models.ts';
import { ARENA_FIGHTER } from '../src/core/mind/config.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';
import { hullEntry } from '../src/core/mind/hull-entry.ts';
import { convexHull } from '../src/core/spec/hull.ts';
import { frameOf } from '../src/core/spec/body.ts';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { combatTrial } from '../research/arena-combat.mjs';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';

test('convex surface rays enter faces, reject misses and never substitute an internal centre',()=>{
 const vertices=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);
 const {planes}=convexHull(vertices);
 assert.deepEqual(hullEntry(planes,[0,.5,3],[0,.5,0]),[0,.5,1]);
 assert.deepEqual(hullEntry(planes,[-3,.2,.4],[0,.2,.4]),[-1,.2,.4]);
 assert.deepEqual(hullEntry(planes,[3,3,3],[0,0,0]),[1,1,1]);
 for(const [a,b]of [[[0,0,0],[0,0,.5]],[[0,0,3],[0,0,2]],[[2,0,3],[2,0,0]],[[0,2,3],[0,2,0]]])assert.equal(hullEntry(planes,a,b),null);
});

test('bounded lane distance covers intersections, endpoints, parallel and point lanes symmetrically',()=>{
 const cases=[[[0,0,0],[2,0,0],[1,-1,0],[1,1,0],0],
  [[0,0,0],[1,0,0],[2,1,0],[2,2,0],2],
  [[0,0,0],[2,0,0],[1,1,0],[3,1,0],1],
  [[0,0,0],[0,0,0],[1,0,0],[2,0,0],1],
  [[0,0,0],[0,0,0],[1,2,2],[1,2,2],9]];
 for(const [a,b,c,d,want]of cases)for(const args of [[a,b,c,d],[b,a,d,c],[c,d,a,b]])assert.equal(segmentDistanceSquared(...args),want);
});

test('contact labels select the strongest permitted contact independently of stronger unknown surfaces',async()=>{
 const s=await buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'}});
 try{
  const built=s.duel.duelists.left.built,other=s.duel.duelists.right.built.segments.get('forearm.right').body;
  const contacts=[{other:built.segments.get('middleTrunk').body,impulse:100,point:[0,0,0],normal:[1,0,0]},
   {other:null,impulse:20,point:[1,2,3],normal:[0,1,0]},
   {other,impulse:3,point:[4,5,6],normal:[0,0,-1]},
   {other,impulse:2,point:[7,8,9],normal:[-1,0,0]}];
  const reading=effectorFeedback({...built,physics:{contactsOf(){return contacts;}}},['hand.left','hand.right'],body=>body===other?{kind:'body',body:'right',segment:'forearm.right'}:null);
  reading.read();
  for(const hand of ['left','right']){
   assert.equal(reading.state[`hand.${hand}`].impulse,25);
   assert.deepEqual(reading.state[`hand.${hand}`].contactPoint,[1,2,3]);
   assert.deepEqual(reading.state[`hand.${hand}`].contact,{target:{kind:'body',body:'right',segment:'forearm.right'},point:[4,5,6],normal:[0,0,-1],impulse:3});
   assert.equal(contactResponse(reading.state[`hand.${hand}`],'right'),'block');
   assert.equal(contactResponse(reading.state[`hand.${hand}`],'third'),'incidental');
  }
  contacts.length=0;reading.read();assert.equal(reading.state['hand.right'].contact,null);
  assert.equal(contactResponse(reading.state.right,'right'),null);
  for(const [target,want]of [[{kind:'world'},'world'],[{kind:'body',body:'right',segment:'head'},'target']])
   assert.equal(contactResponse({contact:{target}},'right'),want);
 }finally{s.dispose();}
});

test('a physical guard block triggers an angle change and replay preserves contact memory',async()=>{
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},minds:{left:ARENA_FIGHTER,right:ARENA_FIGHTER},recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const select=openingSelector(modelSpec('workshop-fighter'));
  let labeled=0,penalized=0,escaped=0,snapshot=false;
  for(let i=0;i<2400&&!a.duel.done;i++){
   a.world.step();const d=a.duel.duelists.left,view=d.minded.body.view,foe=view.senses.others[0];
   if(!foe)continue;
   const opening=select(view,foe,'right'),alternate=select(view,foe,'right',opening.segment);
   if(alternate.score>opening.score)penalized++;
   if(d.minded.skills.report.engagement.phase==='escape'&&d.minded.skills.state.tactics.blockedSurface)escaped++;
   for(const f of ['hand.left','hand.right'].map(s=>view.effectors[s].feedback))if(f.contact?.target.kind==='body'){
    assert.equal(f.contact.target.body,'right');assert.ok(foe.segments.has(f.contact.target.segment));
    assert.ok(Math.abs(Math.hypot(...f.contact.normal)-1)<1e-5);assert.ok(f.contact.impulse>0);labeled++;
   }
   if(!snapshot&&d.minded.skills.state.tactics.blockedSurface){
    b.duel.load(a.duel.save());const ta=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),tb=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
    for(let k=0;k<120;k++){a.world.step();b.world.step();ta.take();tb.take();}
    assert.deepEqual(b.duel.save().state,a.duel.save().state);assert.equal(tb.digest(),ta.digest());snapshot=true;
   }
  }
  assert.ok(labeled>10);assert.ok(penalized>100);assert.ok(escaped>10);assert.equal(snapshot,true);
 }finally{a.dispose();b.dispose();}
});

test('the real Warrior trunk hull supplies a surface opening and a fresh-world selection fork',async()=>{
 const config={...ARENA_FIGHTER,repertoire:'mixed',openings:{head:1,upperTrunk:.2,middleTrunk:0}};
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:config,right:ARENA_FIGHTER},recoverySeconds:null,capSeconds:30};
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
  while(a.world.time<15&&!(a.duel.duelists.left.minded.skills.report.strike.phase==='swing'&&a.duel.duelists.left.minded.skills.state.tactics.surface==='middleTrunk'))a.world.step();
  assert.equal(a.duel.duelists.left.minded.skills.state.tactics.surface,'middleTrunk');
  assert.equal(a.duel.duelists.left.minded.skills.report.strike.phase,'swing');
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let k=0;k<200;k++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
  assert.ok(a.duel.blows.some(blow=>blow.sides.some(s=>s.fighter==='right'&&s.segment==='middleTrunk')));
 }finally{a.dispose();b.dispose();}
});

test('hull-aware body selection lands driven torso blows against an active Combat fighter',async()=>{
 const row=await combatTrial({left:{...ARENA_FIGHTER,repertoire:'mixed',openings:{head:.3,upperTrunk:0,middleTrunk:0}},right:'combat',recipe:{capSeconds:30}});
 const out=row.sides.left;
 assert.ok((out.drivenTargets.middleTrunk??0)+(out.drivenTargets.upperTrunk??0)>=5,JSON.stringify(out));assert.ok(out.drivenDamage>.2,JSON.stringify(out));
 assert.equal(out.falls,0);assert.deepEqual(out.assist,{force:0,moment:0});assert.ok(out.pressureOnly.longest<2);
});


test('a selected overhand keeps its world contact direction through execution and fresh-world replay',async()=>{
 const candidate={...ARENA_FIGHTER,repertoire:'vertical',openings:{overhand:-.6}};
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:candidate,right:ARENA_FIGHTER},recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try {
  const d=a.duel.duelists.left,skills=d.minded.skills;
  while(a.duel.clock<20&&!(skills.state.action?.family==='overhand'&&skills.report.strike.phase==='swing'))a.world.step();
  assert.equal(skills.state.action?.family,'overhand');assert.equal(skills.report.strike.phase,'swing');
  assert.deepEqual(skills.state.action.direction,[0,-1,0]);
  const hand=skills.report.strike.hand,goal=skills.state.command.effectors[`hand.${hand}`];
  const world=new Vector3(...goal.terminalVelocity).applyRotationQuaternionToRef(d.body.view.root.rotation,new Vector3());
  assert.ok(Math.abs(world.x)<1e-8&&Math.abs(world.y+5)<1e-8&&Math.abs(world.z)<1e-8,JSON.stringify(world.asArray()));
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let i=0;i<240;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
  assert.ok(skills.report.strike.pointCycle.returned[hand]>0);
 }finally{a.dispose();b.dispose();}
});
