import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {openingSelector,validOpeningTuning} from '../src/core/mind/openings.ts';
import {SCRAPPER,COMBAT} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {frameOf} from '../src/core/spec/body.ts';
import {traceOf} from './harness/trace.mjs';

const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
 minds:{left:SCRAPPER,right:SCRAPPER},recoverySeconds:null,capSeconds:30};

test('lateral surface settings reject fractions outside the physical circle',()=>{
 for(const headLateral of [0,.5,1])assert.equal(validOpeningTuning({headLateral}),true);
 for(const headLateral of [-.01,1.01,NaN,Infinity])assert.equal(validOpeningTuning({headLateral}),false);
 assert.equal(validOpeningTuning({head:-.6}),true);assert.equal(validOpeningTuning({head:Infinity}),false);
 assert.throws(()=>openingSelector({}, {headLateral:1.01}),/headLateral/);
});

test('both real guard hands can select a lateral collider surface while zero preserves the whole reference choice',async()=>{
 const s=await buildBout({...recipe,gap:.65},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  s.duel.order('left',STAND_ORDERS);s.duel.order('right',STAND_ORDERS);s.world.step(360);
  const d=s.duel.duelists.left,view=d.body.view,foe=view.senses.others[0],tuning={head:0,upperTrunk:100,middleTrunk:100};
  const plain=openingSelector(d.built.spec,tuning),zero=openingSelector(d.built.spec,{...tuning,headLateral:0}),side=openingSelector(d.built.spec,{...tuning,headLateral:.5});
  for(const hand of ['right','left']){
   const a=plain(view,foe,hand,null,'mixed'),b=side(view,foe,hand,null,'mixed');
   assert.deepEqual(zero(view,foe,hand,null,'mixed'),a);assert.equal(b.segment,'head');assert.equal(b.blocked,false);
   assert.ok(Vector3.Distance(new Vector3(...a.target),new Vector3(...b.target))>.02,JSON.stringify({a,b}));
   const spec=foe.spec.segments.find(s=>s.name==='head'),sensed=foe.segments.get('head'),frame=frameOf(spec);assert.equal(spec.shape.kind,'capsule');
   const world=new Vector3(...b.target).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.Inverse(sensed.rotation),new Vector3());
   const local=p=>{const delta=p.map((v,k)=>v-frame.origin[k]);return new Vector3(...[frame.x,frame.y,frame.z].map(axis=>axis.reduce((sum,v,k)=>sum+v*delta[k],0)));};
   const from=local(spec.shape.from.value),axis=local(spec.shape.to.value).subtract(from),squared=axis.lengthSquared();
   const nearest=from.add(axis.scale(squared?Math.max(0,Math.min(1,Vector3.Dot(world.subtract(from),axis)/squared)):0));
   assert.ok(Math.abs(Vector3.Distance(world,nearest)-spec.shape.radius.value)<.005,JSON.stringify(b));
  }
  assert.equal(d.body.down,false);
 }finally{s.dispose();}
});

test('lateral Arena selection carries through the shared physical strike and fresh-world replay',async()=>{
 const candidate={...SCRAPPER,spacing:.1,tuning:{paths:{elbowExtension:1},openings:{head:-.6,upperTrunk:0,middleTrunk:0,headLateral:.5}}};
 const r={...recipe,minds:{left:candidate,right:COMBAT},gap:2};
 const a=await buildBout(r,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(r,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const d=a.duel.duelists.left,skills=d.minded.skills;
  while(a.duel.clock<20&&!(skills.report.strike.phase==='swing'&&skills.state.tactics.surface==='head'))a.world.step();
  assert.equal(skills.report.strike.phase,'swing');assert.equal(skills.state.tactics.surface,'head');assert.ok(skills.state.blow.hands[skills.state.blow.hand]?.action);
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let i=0;i<240;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
  assert.ok(skills.report.strike.thrown.left+skills.report.strike.thrown.right>=1);
  assert.equal(d.body.down,false);
 }finally{a.dispose();b.dispose();}
});
