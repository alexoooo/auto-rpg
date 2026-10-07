import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {attackPath,ATTACK_PATH,validAttackTuning} from '../src/core/skills/attack-path.ts';
import {lowerSurface,upperSurface,openingSelector} from '../src/core/mind/openings.ts';
import {modelSpec} from '../src/core/models.ts';
import {frameOf} from '../src/core/spec/body.ts';
import {convexHull} from '../src/core/spec/hull.ts';
import {combatStrike} from '../research/combat-strikes.mjs';
import {buildBout} from '../research/bout.mjs';
import {COMBAT,SCRAPPER} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {DEFAULT_ENGINE,loadEngine} from '../src/core/engine/engines.ts';
import {coreStand,saveStand,loadStand} from './harness/core-stand.mjs';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {combatSkills} from '../src/core/skills/combat.ts';
import {GUARD_ACTION} from '../src/core/mind/intent.ts';
import {traceOf} from './harness/trace.mjs';

test('uppercut chambers mirror below guard, carry upward contact velocity and own their measured duration',()=>{
 const a=attackPath([.15,1.49,.3],[.1,1.63,.35],'right','uppercut',ATTACK_PATH,[0,1,0]);
 const b=attackPath([-.15,1.49,.3],[-.1,1.63,.35],'left','uppercut',ATTACK_PATH,[0,1,0]);
 assert.deepEqual(b.chamber,[-a.chamber[0],a.chamber[1],a.chamber[2]]);
 assert.equal(a.chamber[1],1.49-ATTACK_PATH.uppercutWindup);assert.deepEqual(a.contactVelocity,[0,ATTACK_PATH.contactSpeed,0]);
 assert.equal(a.seconds,ATTACK_PATH.uppercutSeconds);assert.equal(a.torso,0);
 assert.equal(validAttackTuning({...ATTACK_PATH,uppercutSeconds:0}),false);
 assert.equal(validAttackTuning({...ATTACK_PATH,uppercutWindup:-1}),false);
});

test('lower-surface selection reaches actual Warrior capsule and hull faces and supplies the upward neutral action',async()=>{
 const s=await buildBout({left:'workshop-fighter',right:'workshop-fighter',gap:.8,held:{left:'empty',right:'empty'},balance:{left:0,right:0},
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

test('both hands repeat actual upward contacts and survive clean misses with verified returns and no assistance',async()=>{
 for(const hand of ['right','left'])for(const mode of ['hit','miss']){
  const row=await combatStrike({hand,mode,seconds:8,family:'uppercut',surface:'bottom',direction:[0,1,0],ahead:.35,across:.1,measureMass:true});
  assert.equal(row.fell,false);assert.equal(row.cycles.failed,0);assert.deepEqual(row.assist,{force:0,moment:0});
  assert.ok(row.cycles.returned[hand]>=(mode==='hit'?6:4),JSON.stringify(row.cycles));
  if(mode==='hit'){
   assert.equal(row.contacts.length,6);assert.ok(row.contacts.every(c=>c.closing>2.9&&c.mass>.2),JSON.stringify(row.contacts));
  }else{assert.deepEqual(row.contacts,[]);assert.ok(row.peaks.every(p=>p>2.9),JSON.stringify(row.peaks));}
 }
});

test('a fresh-world fork preserves the full upward swing and return with either hand',async()=>{
 const make=async hand=>{
  const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
  const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body);
  body.drive((view,dt)=>skills.command(view,{move:null,face:0,hands:{left:GUARD_ACTION,right:GUARD_ACTION},
   combat:view.time>=2?{hand,target:[hand==='right'?.1:-.1,1.63,.35],family:'uppercut',direction:[0,1,0]}:null},dt));
  return {...s,body,skills};
 };
 for(const hand of ['right','left'])for(const phase of ['swing','return']){
  const a=await make(hand),b=await make(hand);
  try{
   while(a.skills.report.strike.phase!==phase&&a.world.time<5)a.step();a.step(3);assert.equal(a.skills.report.strike.phase,phase);
   assert.equal(a.skills.state.action.family,'uppercut');assert.deepEqual(a.skills.state.action.direction,[0,1,0]);
   const states=s=>({body:s.body.state,skills:s.skills.state});loadStand(b.world,states(b),saveStand(a.world,states(a)));
   const ta=traceOf([a.built]),tb=traceOf([b.built]);
   for(let i=0;i<200;i++){a.step();b.step();ta.take();tb.take();}
   assert.equal(ta.digest(),tb.digest());assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
   assert.ok(a.skills.report.strike.pointCycle.returned[hand]>=1);assert.equal(a.body.down,false);
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
 }
});


test('an actual Arena uppercut keeps its world direction and full state through a fresh-world fork',async()=>{
 const candidate={...SCRAPPER,strikes:'boxing',tuning:{openings:{head:0,upperTrunk:.2,middleTrunk:.4,uppercut:-.6}}};
 const recipe={left:'workshop-fighter',right:'workshop-fighter',gap:2,capSeconds:30,recoverySeconds:null,held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:candidate,right:COMBAT}};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const skills=a.duel.duelists.left.minded.skills;
  while(a.duel.clock<20&&!(skills.state.action?.family==='uppercut'&&skills.report.strike.phase==='swing'))a.world.step();
  assert.ok(a.duel.clock<20);assert.equal(skills.state.action.family,'uppercut');assert.deepEqual(skills.state.action.direction,[0,1,0]);
  const hand=skills.report.strike.hand,thrown=skills.report.strike.thrown[hand];b.duel.load(a.duel.save());
  const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let i=0;i<200;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.equal(ta.digest(),tb.digest());assert.deepEqual(a.duel.save().state,b.duel.save().state);
  assert.ok(skills.report.strike.thrown[hand]>thrown);assert.deepEqual(a.duel.duelists.left.body.assist.meter.force,0);
 }finally{a.dispose();b.dispose();}
});
