/**
 * **Attack paths** (`src/core/skills/attack-path.ts`, `src/core/control/point-path.ts`): curved
 * point paths and their derivatives, each family's mirrored chamber and contact velocity, the
 * tuning's bounds, and a strike's path followed on the core stand (Node, Rapier, 120 Hz).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/models.ts';
import { GUARD } from '../src/core/skills/guard.ts';
import { attackPath, ATTACK_PATH, validAttackTuning } from '../src/core/skills/attack-path.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { traceOf } from './harness/trace.mjs';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { pointPath } from '../src/core/control/point-path.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { NO_COVER } from '../src/core/mind/intent.ts';

test('curved point paths preserve endpoint motion and analytic derivatives', () => {
 const start={position:[.2,.7,-.1],velocity:[.3,-.2,.1]},finish=[-.1,.8,.5],terminal=[-1,0,3],curve=[.06,-.02,.01],seconds=.3;
 for(const time of [0,seconds]) {
  const path=pointPath(start,finish,time,seconds,terminal,curve);
  assert.deepEqual(path.target,time===0?start.position:finish);
  assert.deepEqual(path.velocity,time===0?start.velocity:terminal);
  assert.deepEqual(path.acceleration,[0,0,0]);
 }
 const mid=pointPath(start,finish,seconds/2,seconds,terminal,curve),line=pointPath(start,finish,seconds/2,seconds,terminal);
 for(let k=0;k<3;k++)assert.ok(Math.abs(mid.target[k]-line.target[k]-curve[k])<1e-12);
 for(const time of [.04,.12,.23]) {
  const h=1e-6,p=pointPath(start,finish,time,seconds,terminal,curve),a=pointPath(start,finish,time-h,seconds,terminal,curve),b=pointPath(start,finish,time+h,seconds,terminal,curve);
  for(let k=0;k<3;k++) {
   assert.ok(Math.abs((b.target[k]-a.target[k])/(2*h)-p.velocity[k])<1e-7);
   assert.ok(Math.abs((b.velocity[k]-a.velocity[k])/(2*h)-p.acceleration[k])<1e-5);
  }
 }
 const right=attackPath([.15,1.49,.3],[.1,1.63,.5],'right','hook'),left=attackPath([-.15,1.49,.3],[-.1,1.63,.5],'left','hook');
 assert.deepEqual(left.curve,[-right.curve[0],right.curve[1],right.curve[2]]);
 assert.deepEqual(left.contactVelocity,[-right.contactVelocity[0],right.contactVelocity[1],right.contactVelocity[2]]);
});

test('the attack contract produces mirrored chambers and an explicit contact rate', () => {
 const right=attackPath([.15,1.49,.3],[0,1.63,.65],'right','cross');
 const left=attackPath([-.15,1.49,.3],[0,1.63,.65],'left','cross');
 assert.deepEqual(left.chamber,[-right.chamber[0],right.chamber[1],right.chamber[2]]);
 assert.deepEqual(left.contactVelocity,[-right.contactVelocity[0],right.contactVelocity[1],right.contactVelocity[2]]);
 assert.equal(left.torso,-right.torso);
 assert.ok(Math.abs(Math.hypot(...right.contactVelocity)-ATTACK_PATH.contactSpeed)<1e-12);
 assert.throws(()=>attackPath([0,0,0],[0,0,1],'right','invented'),/unknown attack/);
});

test('an overhand chambers over the guard, mirrored, and strikes downward', () => {
 const right=attackPath([.15,1.49,.3],[.1,1.73,.5],'right','overhand');
 assert.deepEqual(right.chamber,[.15,1.49+ATTACK_PATH.overhandWindup,.3-ATTACK_PATH.windup]);assert.ok(right.contactVelocity[1]<0);
 const left=attackPath([-.15,1.49,.3],[-.1,1.73,.5],'left','overhand');
 assert.deepEqual(left.chamber,[-right.chamber[0],right.chamber[1],right.chamber[2]]);
 assert.deepEqual(left.contactVelocity,[-right.contactVelocity[0],right.contactVelocity[1],right.contactVelocity[2]]);
});

test('uppercut chambers mirror below guard, carry upward contact velocity and own their measured duration',()=>{
 const a=attackPath([.15,1.49,.3],[.1,1.63,.35],'right','uppercut',ATTACK_PATH,[0,1,0]);
 const b=attackPath([-.15,1.49,.3],[-.1,1.63,.35],'left','uppercut',ATTACK_PATH,[0,1,0]);
 assert.deepEqual(b.chamber,[-a.chamber[0],a.chamber[1],a.chamber[2]]);
 assert.equal(a.chamber[1],1.49-ATTACK_PATH.uppercutWindup);assert.deepEqual(a.contactVelocity,[0,ATTACK_PATH.contactSpeed,0]);
 assert.equal(a.seconds,ATTACK_PATH.uppercutSeconds);assert.equal(a.torso,0);
 assert.equal(validAttackTuning({...ATTACK_PATH,uppercutSeconds:0}),false);
 assert.equal(validAttackTuning({...ATTACK_PATH,uppercutWindup:-1}),false);
});

test('shared path validation bounds the elbow preference and rejects invalid durations and numbers',()=>{
 for(const elbowExtension of [0,.5,1])assert.equal(validAttackTuning({...ATTACK_PATH,elbowExtension}),true);
 for(const elbowExtension of [-.01,1.01,NaN,Infinity])assert.equal(validAttackTuning({...ATTACK_PATH,elbowExtension}),false);
 for(const field of ['chamberSeconds','swingSeconds','returnSeconds','hold'])assert.equal(validAttackTuning({...ATTACK_PATH,[field]:0}),false);
 assert.equal(validAttackTuning({...ATTACK_PATH,contactSpeed:Infinity}),false);
});

test('terminal motion crosses the motor endpoint continuously and segment identity restarts a following path', async () => {
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,pinned:'lowerTrunk',gravity:false,ground:false});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS});
 let sequence=1, z=.45, curve=[.03,0,0];
 body.drive(()=>({posture:GUARD,pushes:[],stance:null,effectors:{'hand.right':{places:[{point:'knuckles',position:[.15,1.49,z]}],
  seconds:.2,initialVelocity:[0,0,0],terminalVelocity:[0,0,1],curve,sequence,follows:true}}}));
 try {
  s.step(25); const memory=body.state.mind.host.motor.effectors["hand.right"];
  const endpoint=memory.point.z; assert.ok(Math.abs(memory.time-.2)<1e-12);
  s.step(); assert.ok(Math.abs((memory.point.z-endpoint)*120-1)<1e-12);
  sequence=2; s.step(); assert.equal(memory.time,0);
  const before=memory.from.map(p=>[...p]);
  for(let i=0;i<12;i++){z+=.0001;s.step();}
  assert.ok(Math.abs(memory.time-.1)<1e-12); assert.deepEqual(memory.from,before,'moving targets retain the same start');
  curve=[.04,0,0];s.step();assert.deepEqual(memory.goal.curve,curve);
  assert.ok(Math.abs(memory.time-(.1+1/120))<1e-12);
 } finally {body.dispose();s.dispose();}
});

test('a fresh-world fork inside a curved strike preserves the whole motion and return', async () => {
 const make=async()=>{
  const stand=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
  const body=createBody(stand.built,stand.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body);
  const request={id:skills.instance(),action:'hook',effector:'hand.right',target:{kind:'point',at:[.1,1.63,.5]}};
  body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,actions:view.time>=2?[request]:[]},dt),skills.release);
  return {...stand,body,skills,request};
 };
 const a=await make(),b=await make();
 try {
  while(a.skills.report.actions[0]?.phase!=='commit'&&a.world.time<5)a.step();
  a.step(8);assert.equal(a.skills.report.actions[0]?.phase,'commit','no hook in commit by 5 s: the fixture did not reach its case');
  const states=s=>({body:s.body.state,skills:s.skills.state});
  loadStand(b.world,states(b),saveStand(a.world,states(a)));
  const ta=traceOf([a.built]),tb=traceOf([b.built]);
  for(let i=0;i<160;i++){a.step();b.step();ta.take();tb.take();}
  assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
  // Whatever its ending, the hook has one within the forked steps.
  assert.equal(ta.digest(),tb.digest());assert.ok(a.skills.report.ledger.some(record=>record.id===a.request.id),JSON.stringify(a.skills.report.ledger));
 } finally {a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
});
