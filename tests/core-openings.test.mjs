/**
 * **Openings and their contacts** (`src/core/mind/openings.ts`, `hull-entry.ts`,
 * `src/core/control/effector-feedback.ts`): a ray's entry into a convex hull, the distance between
 * two lanes, the surface settings' bounds, and which of a hand's contacts its feedback reports.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectorFeedback, contactResponse } from '../src/core/control/effector-feedback.ts';
import { openingSelector, segmentDistanceSquared, validOpeningTuning } from '../src/core/mind/openings.ts';
import { buildBout } from '../research/bout.mjs';
import { hullEntry } from '../src/core/mind/hull-entry.ts';
import { convexHull } from '../src/core/spec/hull.ts';

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

test('lateral surface settings reject fractions outside the physical circle',()=>{
 for(const headLateral of [0,.5,1])assert.equal(validOpeningTuning({headLateral}),true);
 for(const headLateral of [-.01,1.01,NaN,Infinity])assert.equal(validOpeningTuning({headLateral}),false);
 assert.equal(validOpeningTuning({head:-.6}),true);assert.equal(validOpeningTuning({head:Infinity}),false);
 assert.throws(()=>openingSelector({}, {headLateral:1.01}),/headLateral/);
});

test('contact labels select the strongest permitted contact independently of stronger unknown surfaces',async()=>{
 const s=await buildBout({left:'workshop-fighter',right:'workshop-fighter',loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } }});
 try{
  const built=s.duel.duelists.left.built,other=s.duel.duelists.right.built.segments.get('forearm.right').body;
  const contacts=[{other:built.segments.get('middleTrunk').body,impulse:100,point:[0,0,0],normal:[1,0,0]},
   {other:null,impulse:20,point:[1,2,3],normal:[0,1,0]},
   {other,impulse:3,point:[4,5,6],normal:[0,0,-1]},
   {other,impulse:2,point:[7,8,9],normal:[-1,0,0]}];
  const reading=effectorFeedback({...built,physics:{contactsOf(){return contacts;}}},['hand.left','hand.right'],body=>body===other?{kind:'body',body:'right',segment:'forearm.right',guard:true}:null);
  reading.read();
  for(const hand of ['left','right']){
   assert.equal(reading.state[`hand.${hand}`].impulse,25);
   assert.deepEqual(reading.state[`hand.${hand}`].contactPoint,[1,2,3]);
   assert.deepEqual(reading.state[`hand.${hand}`].contact,{target:{kind:'body',body:'right',segment:'forearm.right',guard:true},point:[4,5,6],normal:[0,0,-1],impulse:3});
   assert.equal(contactResponse(reading.state[`hand.${hand}`],'right'),'block');
   assert.equal(contactResponse(reading.state[`hand.${hand}`],'third'),'incidental');
  }
  contacts.length=0;reading.read();assert.equal(reading.state['hand.right'].contact,null);
  assert.equal(contactResponse(reading.state.right,'right'),null);
  for(const [target,want]of [[{kind:'world'},'world'],[{kind:'body',body:'right',segment:'head',guard:false},'target']])
   assert.equal(contactResponse({contact:{target}},'right'),want);
 }finally{s.dispose();}
});
