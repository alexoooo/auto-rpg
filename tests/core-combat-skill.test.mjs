import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/models.ts';
import { GUARD } from '../src/core/skills/guard.ts';
import { attackPath, ATTACK_PATH } from '../src/core/skills/attack-path.ts';
import { RECIPE_FIGHTER } from '../src/core/mind/config.ts';
import { COMBAT } from './fixtures/minds.mjs';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { combatStrike } from '../research/combat-strikes.mjs';
import { combatTrial } from '../research/arena-combat.mjs';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { pointPath } from '../src/core/control/point-path.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { poseBlocked } from '../src/core/build/hand-poses.ts';
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
  body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,
   attack:view.time>=2?{kind:'blow',hand:'right',target:[.1,1.63,.5],path:{family:'hook'}}:null},dt));
  return {...stand,body,skills};
 };
 const a=await make(),b=await make();
 try {
  while(a.skills.report.strike.phase!=='swing'&&a.world.time<5)a.step();
  a.step(8);assert.equal(a.skills.report.strike.phase,'swing');
  const states=s=>({body:s.body.state,skills:s.skills.state});
  loadStand(b.world,states(b),saveStand(a.world,states(a)));
  const ta=traceOf([a.built]),tb=traceOf([b.built]);
  for(let i=0;i<160;i++){a.step();b.step();ta.take();tb.take();}
  assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
  assert.equal(ta.digest(),tb.digest());assert.ok(a.skills.report.strike.pointCycle.returned.right>=1);
 } finally {a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
});

test('both hands repeat fast contacts and verified returns on the unpinned gameplay body', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async () => {
 for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
  const row=await combatStrike({hand,mode,seconds:8});
  assert.equal(row.fell,false,JSON.stringify(row)); assert.equal(row.cycles.failed,0);
  assert.ok(row.cycles.returned[hand]>=6); assert.deepEqual(row.assist,{force:0,moment:0});
  assert.ok(row.peaks.every(p=>p>4&&p<7),JSON.stringify(row.peaks));
  if(mode==='hit') {assert.ok(row.contacts.length>=6);assert.ok(row.contacts.every(c=>c.closing>4),JSON.stringify(row.contacts));}
  else assert.deepEqual(row.contacts,[]);
 }
});

test('either hand repeats a close curved strike and survives misses without assistance', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async () => {
 for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
  const row=await combatStrike({hand,family:'hook',mode,ahead:.5,across:.1,seconds:8});
  assert.equal(row.fell,false,JSON.stringify(row));assert.equal(row.cycles.failed,0);
  assert.ok(row.cycles.returned[hand]>=6);assert.deepEqual(row.assist,{force:0,moment:0});
  if(mode==='hit') {
   assert.equal(row.contacts.length,8);
   assert.ok(row.contacts.every(c=>c.closing>2.6&&c.speed>3),JSON.stringify(row.contacts));
   assert.ok(row.contacts.every(c=>hand==='right'?c.velocity[0]<-1:c.velocity[0]>1));
   assert.ok(row.pathError.mean<.012&&row.pathError.maximum<.07,JSON.stringify(row.pathError));
  } else assert.deepEqual(row.contacts,[]);
 }
});

test('combat self-play takes initiative and breaks prolonged hand pressure without self-falls', async () => {
 const row=await combatTrial({left:COMBAT,right:COMBAT,recipe:{capSeconds:20}});
 for(const out of Object.values(row.sides)) {
  assert.ok(out.driven>=10,JSON.stringify(out)); assert.equal(out.falls,0);
  assert.ok(out.pressureOnly.longest<2,JSON.stringify(out)); assert.ok(out.drivenDamage>.02,JSON.stringify(out));
  assert.deepEqual(out.assist,{force:0,moment:0});
 }
});

test('explicit orders suppress pursuit and a fresh-world combat fork preserves the whole strike and return', async () => {
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:COMBAT,right:COMBAT},recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try {
  a.duel.order('left',STAND_ORDERS);a.world.step(360);
  assert.equal(a.duel.duelists.left.minded.skills.report.strike.hand,null);
  assert.equal(a.duel.duelists.left.minded.skills.report.engagement.phase,'guard');
  a.duel.order('left',null);
  while(a.duel.duelists.left.minded.skills.report.strike.phase!=='swing'&&a.duel.clock<20)a.world.step();
  assert.equal(a.duel.duelists.left.minded.skills.report.strike.phase,'swing');
  b.duel.load(a.duel.save());
  const traced=stand=>traceOf(Object.values(stand.duel.duelists).map(d=>d.built));
  const ta=traced(a),tb=traced(b);
  for(let i=0;i<180;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(b.duel.save().state,a.duel.save().state);
  assert.equal(tb.digest(),ta.digest());
  a.duel.order('left',STAND_ORDERS);a.world.step(180);
  assert.equal(a.duel.duelists.left.minded.skills.report.strike.hand,null);
  assert.equal(a.duel.duelists.left.minded.skills.report.engagement.phase,'guard');
 } finally {a.dispose();b.dispose();}
});


test('either hand repeats an overhand to a high surface and survives the miss',async()=>{
 for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
  const row=await combatStrike({hand,mode,family:'overhand',ahead:.5,across:.1,up:.1,seconds:8});
  assert.equal(row.fell,false,JSON.stringify(row));assert.equal(row.cycles.failed,0);
  assert.ok(row.cycles.returned[hand]>=(mode==='hit'?7:5),JSON.stringify(row));assert.deepEqual(row.assist,{force:0,moment:0});
  if(mode==='hit') {
   assert.equal(row.contacts.length,8);assert.ok(row.contacts.every(c=>c.closing>3.4&&c.speed>3.4),JSON.stringify(row.contacts));
   assert.ok(row.contacts.every(c=>c.velocity[1]<0),JSON.stringify(row.contacts));
  } else assert.deepEqual(row.contacts,[]);
 }
 const right=attackPath([.15,1.49,.3],[.1,1.73,.5],'right','overhand');
 assert.deepEqual(right.chamber,[.15,1.49+ATTACK_PATH.overhandWindup,.3-ATTACK_PATH.windup]);assert.ok(right.contactVelocity[1]<0);
 const left=attackPath([-.15,1.49,.3],[-.1,1.73,.5],'left','overhand');
 assert.deepEqual(left.chamber,[-right.chamber[0],right.chamber[1],right.chamber[2]]);
 assert.deepEqual(left.contactVelocity,[-right.contactVelocity[0],right.contactVelocity[1],right.contactVelocity[2]]);
});

test('every skill set closes a bare hand for its blow and opens it in the guard', async () => {
 for(const mind of [COMBAT,RECIPE_FIGHTER]) {
  const bout=await buildBout({left:'workshop-fighter',right:'workshop-fighter',gap:2,capSeconds:15,recoverySeconds:null,
   balance:{left:0,right:0},held:{left:'empty',right:'empty'},minds:{left:mind,right:mind}},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
  const tally={},free={left:0,right:0},blocked={};
  // Blocked as `createHandPoses` blocks a change, read where it reads it: before the step, after it has had its say.
  const hook=bout.world.beforeStep(()=>{for(const side of ['left','right'])for(const hand of ['left','right']){
   const part=bout.duel.duelists[side].built.segments.get(`hand.${hand}`);blocked[`${side}.${hand}`]=poseBlocked(bout.world,part,part.poses.open.collider);}});
  try {
   bout.duel.play([]);
   while(bout.duel.verdict===null&&bout.duel.clock<15) {
    bout.world.step();
    for(const side of ['left','right']) {
     const d=bout.duel.duelists[side],strike=d.minded.skills.report.strike,poses=d.built.handPoses.state;
     // A step after its last blow has ended, a hand is asked open; one held shut is only an opening blocked until it is clear.
     free[side]=strike.hand===null&&!strike.returning&&!d.body.view.down?free[side]+1:0;
     for(const hand of ['left','right']) {
      const t=tally[`${mind.kind} ${side}.${hand}`]??={swing:0,swingOpen:0,guard:0,guardAsked:0,guardOpen:0,guardBlocked:0};
      if(strike.hand===hand&&strike.phase==='swing'){t.swing++;if(poses[hand].applied!=='fist')t.swingOpen++;}
      if(free[side]>=2){t.guard++;if(poses[hand].requested==='open')t.guardAsked++;if(poses[hand].applied==='open')t.guardOpen++;else if(blocked[`${side}.${hand}`])t.guardBlocked++;}
     }
    }
   }
  } finally {hook.dispose();bout.dispose();}
  for(const [key,t] of Object.entries(tally)) {
   // The seeking tactics throw with the right hand alone; the left is never closed.
   if(mind===RECIPE_FIGHTER&&key.endsWith('.left'))assert.equal(t.swing,0,key);
   else assert.ok(t.swing>0,`${key}: ${JSON.stringify(t)}`);
   assert.equal(t.swingOpen,0,`${key} swings with its fist: ${JSON.stringify(t)}`);
   // Every step a hand asked open in the guard is not open, its opening is blocked; and it is open on more than a hundred.
   assert.ok(t.guard>100&&t.guardAsked===t.guard&&t.guardOpen+t.guardBlocked===t.guard&&t.guardOpen>100,`${key} opens in the guard: ${JSON.stringify(t)}`);
  }
 }
});
