import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { modelSpec } from '../src/core/human/spec.ts';
import { GUARD } from '../src/core/skills/guard.ts';
import { attackPath, ATTACK_PATH } from '../src/core/skills/attack-path.ts';
import { ARENA_FIGHTER } from '../src/core/mind/config.ts';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { combatStrike } from '../research/combat-strikes.mjs';
import { combatTrial } from '../research/arena-combat.mjs';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';
import { coreStand } from './harness/core-stand.mjs';

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
 let sequence=1, z=.45;
 body.drive(()=>({posture:GUARD,pushes:[],stance:null,hands:{left:null,right:{places:[{point:'knuckles',position:[.15,1.49,z]}],
  seconds:.2,initialVelocity:[0,0,0],terminalVelocity:[0,0,1],sequence,follows:true}}}));
 try {
  s.step(25); const memory=body.state.mind.host.motor.hands.right;
  const endpoint=memory.point.z; assert.ok(Math.abs(memory.time-.2)<1e-12);
  s.step(); assert.ok(Math.abs((memory.point.z-endpoint)*120-1)<1e-12);
  sequence=2; s.step(); assert.equal(memory.time,0);
  const before=memory.from.map(p=>[...p]);
  for(let i=0;i<12;i++){z+=.0001;s.step();}
  assert.ok(Math.abs(memory.time-.1)<1e-12); assert.deepEqual(memory.from,before,'moving targets retain the same start');
 } finally {body.dispose();s.dispose();}
});

test('both hands repeat fast contacts and verified returns on the unpinned gameplay body', async () => {
 for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
  const row=await combatStrike({hand,mode,seconds:8});
  assert.equal(row.fell,false,JSON.stringify(row)); assert.equal(row.cycles.failed,0);
  assert.ok(row.cycles.returned[hand]>=6); assert.deepEqual(row.assist,{force:0,moment:0});
  assert.ok(row.peaks.every(p=>p>4&&p<7),JSON.stringify(row.peaks));
  if(mode==='hit') {assert.ok(row.contacts.length>=6);assert.ok(row.contacts.every(c=>c.closing>4),JSON.stringify(row.contacts));}
  else assert.deepEqual(row.contacts,[]);
 }
});

test('combat self-play takes initiative and breaks prolonged hand pressure without self-falls', async () => {
 const row=await combatTrial({left:'combat',right:'combat',recipe:{capSeconds:20}});
 for(const out of Object.values(row.sides)) {
  assert.ok(out.driven>=10,JSON.stringify(out)); assert.equal(out.falls,0);
  assert.ok(out.pressureOnly.longest<2,JSON.stringify(out)); assert.ok(out.drivenDamage>.02,JSON.stringify(out));
  assert.deepEqual(out.assist,{force:0,moment:0});
 }
});

test('explicit orders suppress pursuit and a fresh-world combat fork preserves the whole strike and return', async () => {
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:ARENA_FIGHTER,right:ARENA_FIGHTER},recoverySeconds:null,capSeconds:30};
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
