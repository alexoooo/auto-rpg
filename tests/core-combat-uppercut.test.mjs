import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {ATTACK_PATH} from '../src/core/skills/attack-path.ts';
import {lowerSurface,upperSurface,openingSelector} from '../src/core/mind/openings.ts';
import {modelSpec} from '../src/core/models.ts';
import {frameOf} from '../src/core/spec/body.ts';
import {convexHull} from '../src/core/spec/hull.ts';
import {buildBout} from '../research/bout.mjs';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {DEFAULT_ENGINE,loadEngine} from '../src/core/engine/engines.ts';
import {traceOf} from './harness/trace.mjs';
import {COMBAT} from './fixtures/minds.mjs';

test('lower-surface selection reaches actual Warrior capsule and hull faces and supplies the upward neutral action',async()=>{
 const s=await buildBout({left:'workshop-fighter',right:'workshop-fighter',gap:.8,loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },balance:{left:0,right:0},
  minds:{left:SCRAPPER,right:SCRAPPER}},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  s.duel.order('left',STAND_ORDERS);s.duel.order('right',STAND_ORDERS);s.world.step(240);
  const view=s.duel.duelists.left.body.view,foe=view.senses.others[0],from=view.fists.right.position.asArray();
  for(const name of ['head','upperTrunk']){
   const low=lowerSurface(foe,name),high=upperSurface(foe,name);assert.ok(low&&high&&low[1]<high[1]);
   const segment=foe.spec.segments.find(s=>s.name===name),sensed=foe.segments.get(name);
   const point=new Vector3(...low).subtractInPlace(sensed.position).applyRotationQuaternionToRef(Quaternion.Inverse(sensed.rotation),new Vector3());
   const frame=frameOf(segment),local=p=>{const d=p.map((v,k)=>v-frame.origin[k]);return [frame.x,frame.y,frame.z].map(axis=>axis.reduce((sum,v,k)=>sum+v*d[k],0));};
   if(segment.shape.kind==='sphere'||segment.shape.kind==='capsule'){
    const a=new Vector3(...local(segment.shape.kind==='sphere'?segment.shape.centre.value:segment.shape.from.value));
    const z=new Vector3(...local(segment.shape.kind==='sphere'?segment.shape.centre.value:segment.shape.to.value)),axis=z.subtract(a);
    const u=axis.lengthSquared()?Math.max(0,Math.min(1,Vector3.Dot(point.subtract(a),axis)/axis.lengthSquared())):0;
    const error=Math.abs(Vector3.Distance(point,a.add(axis.scale(u)))-segment.shape.radius.value);assert.ok(error<1e-8,JSON.stringify({name,error,rotation:sensed.rotation}));
   }
   else{
    const poly=convexHull(segment.shape.points.map(p=>local(p.value)));
    const distances=poly.planes.map(p=>Vector3.Dot(point,new Vector3(...p.normal))-p.offset);
    // Native quaternion round trips leave sub-micrometre hull error: `docs/reference/combat-uppercut.md`.
    assert.ok(Math.abs(Math.max(...distances))<1e-6,JSON.stringify({name,maximum:Math.max(...distances)}));
   }
  }
  const selected=openingSelector(modelSpec('workshop-fighter'),{head:-100,upperTrunk:100,middleTrunk:100,uppercut:-100})(view,foe,'right',null,'boxing');
  assert.equal(selected.family,'uppercut');assert.equal(selected.segment,'head');assert.deepEqual(selected.direction,[0,1,0]);
  assert.equal(lowerSurface(foe,'absent'),null);
 }finally{s.dispose();}
});

// Whether the uppercut lands is `combat-strike-capability`'s: this case forks the one thrown, whatever it meets.
test('an actual Arena uppercut keeps its world direction and full state through a fresh-world fork', async()=>{
 const candidate={...COMBAT,actions:[{...COMBAT.actions[0],name:'uppercut',family:'uppercut',regions:[{kind:'segment',segment:'head'}],
  aim:{kind:'surface',tuning:{head:0,upperTrunk:.2,middleTrunk:.4,uppercut:-.6}}}]};
 const recipe={left:'workshop-fighter',right:'workshop-fighter',gap:2,capSeconds:30,recoverySeconds:null,loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },balance:{left:0,right:0},
  minds:{left:candidate,right:COMBAT}};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const d=a.duel.duelists.left,skills=d.minded.skills,thrown=()=>skills.report.actions.find(action=>action.action==='uppercut'&&action.phase==='commit');
  while(a.duel.clock<20&&!thrown())a.world.step();
  const committed=thrown();assert.ok(committed,'no uppercut committed in 20 s: the fixture did not reach its case');
  const hand=committed.effector.split('.')[1],goal=skills.state.command.effectors[`hand.${hand}`];
  const world=new Vector3(...goal.terminalVelocity).applyRotationQuaternionToRef(d.body.view.root.rotation,new Vector3());
  assert.ok(Math.abs(world.x)<1e-6&&Math.abs(world.y-ATTACK_PATH.contactSpeed)<1e-6&&Math.abs(world.z)<1e-6,JSON.stringify(world.asArray()));
  b.duel.load(a.duel.save());
  const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let i=0;i<200;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.equal(ta.digest(),tb.digest());assert.deepEqual(a.duel.save().state,b.duel.save().state);
  assert.ok(skills.report.ledger.some(record=>record.id===committed.id),'the uppercut ends within the forked steps');
  assert.deepEqual(d.body.assist.meter.force,0);
 }finally{a.dispose();b.dispose();}
});
