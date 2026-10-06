import test from 'node:test';
import assert from 'node:assert/strict';
import { handFeedback, contactResponse } from '../src/core/control/hand-feedback.ts';
import { openingSelector, segmentDistanceSquared } from '../src/core/mind/openings.ts';
import { modelSpec } from '../src/core/human/spec.ts';
import { ARENA_FIGHTER } from '../src/core/mind/config.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';

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
  const reading=handFeedback({...built,physics:{contactsOf(){return contacts;}}},body=>body===other?{kind:'body',body:'right',segment:'forearm.right'}:null);
  reading.read();
  for(const hand of ['left','right']){
   assert.equal(reading.state[hand].impulse,25);
   assert.deepEqual(reading.state[hand].contactPoint,[1,2,3]);
   assert.deepEqual(reading.state[hand].contact,{target:{kind:'body',body:'right',segment:'forearm.right'},point:[4,5,6],normal:[0,0,-1],impulse:3});
   assert.equal(contactResponse(reading.state[hand],'right'),'block');
   assert.equal(contactResponse(reading.state[hand],'third'),'incidental');
  }
  contacts.length=0;reading.read();assert.equal(reading.state.right.contact,null);
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
   for(const f of Object.values(view.handFeedback))if(f.contact?.target.kind==='body'){
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
