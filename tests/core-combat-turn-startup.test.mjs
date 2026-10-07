import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {locomotion,validTurnStartup} from '../src/core/skills/locomotion.ts';
import {combatTurn} from '../research/combat-locomotion.mjs';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {traceOf} from './harness/trace.mjs';

const dt=1/120,startup={seconds:.6,limit:2};
const view={time:dt,root:{rotation:Quaternion.Identity()},stance:{phase:'stand',centre:new Vector3(0,.9,0),support:new Vector3(),
 soles:{left:new Vector3(-.1,0,0),right:new Vector3(.1,0,0)}}};

test('startup turn scheduling bounds inputs, preserves the whole-walk ceiling and restarts after standing, placement and resume',()=>{
 assert.equal(validTurnStartup(),true);assert.equal(validTurnStartup(startup),true);
 for(const value of [null,{}, {seconds:0,limit:2},{seconds:NaN,limit:2},{seconds:1,limit:0},{seconds:1,limit:Infinity}]){
  assert.equal(validTurnStartup(value),false);assert.throws(()=>locomotion(null,4,value),/startup/);
 }
 const legs=locomotion(null,4,startup);let previous=0;
 for(let i=0;i<100;i++){
  const before=legs.state.walkTime;legs.goal(view,[.25,0],3,dt);
  assert.ok(Math.abs(legs.heading-previous)<= (before<startup.seconds?2:4)*dt+1e-12);previous=legs.heading;
 }
 assert.equal(legs.state.walkTime,startup.seconds);assert.ok(legs.heading>2);
 for(const reset of [()=>legs.goal(view,null,3,dt),()=>legs.goal(view,[0,0],3,dt),()=>legs.place(view,{left:[-.1,0],right:[.1,0]}),()=>legs.resume(view)]){
  reset();assert.equal(legs.state.walkTime,0);const before=legs.heading;
  legs.goal(view,[.25,0],3,dt);assert.ok(Math.abs(legs.heading-before)<=2*dt+1e-12);
  for(let i=0;i<100;i++)legs.goal(view,[.25,0],3,dt);
 }
 const tighter=locomotion(null,1,startup);tighter.goal(view,[.25,0],3,dt);assert.ok(tighter.heading<=dt+1e-12);
});

test('a brief startup ceiling permits fast established turns without the unassisted Warrior falling in either direction',async()=>{
 for(const speed of [.18,.25,.5])for(const sense of [-1,1]){
  const row=await combatTurn({speed,rate:4,turnLimit:4,sense,after:0,turnStartup:startup});
  assert.equal(row.firstDown,null,JSON.stringify(row));assert.equal(row.phase,'stand');assert.ok(row.strides>4);
  assert.ok(row.maximumTurn>3.9&&row.maximumTurn<=4+1e-12,JSON.stringify(row));
  assert.deepEqual(row.assist,{steps:0,force:0,moment:0});
 }
});

test('Arena startup timing forks during setting off and resets under ordinary standing orders',async()=>{
 const candidate={...SCRAPPER,tuning:{turnLimit:4,turnStartup:startup}};
 const make=async()=>buildBout({left:'workshop-fighter',right:'workshop-fighter',gap:3,capSeconds:20,recoverySeconds:null,
  balance:{left:0,right:0},held:{left:'empty',right:'empty'},minds:{left:candidate,right:candidate}}, {physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const a=await make(),b=await make();
 try{
  a.duel.play([]);a.duel.order('left',{move:{x:-1,z:0},face:null,attack:null});a.world.step(13);
  const skills=a.duel.duelists.left.minded.skills;assert.ok(skills.state.legs.walkTime>0&&skills.state.legs.walkTime<startup.seconds);
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),x=trace(a),y=trace(b);
  for(let i=0;i<180;i++){a.world.step();b.world.step();x.take();y.take();}
  assert.equal(x.digest(),y.digest());assert.deepEqual(a.duel.save().state,b.duel.save().state);
  assert.equal(skills.state.legs.walkTime,startup.seconds);
  a.duel.order('left',{move:null,face:null,attack:null});a.world.step();assert.equal(skills.state.legs.walkTime,0);
 }finally{a.dispose();b.dispose();}
});
