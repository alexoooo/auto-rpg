import test from 'node:test';
import assert from 'node:assert/strict';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {traceOf} from './harness/trace.mjs';

const startup={seconds:.6,limit:2};
test('Arena startup timing forks during setting off and resets under ordinary standing orders',async()=>{
 const candidate={...SCRAPPER,locomotion:{kind:'stance-walk',tuning:{turnLimit:4,turnStartup:startup}}};
 const make=async()=>buildBout({left:'workshop-fighter',right:'workshop-fighter',gap:3,capSeconds:20,recoverySeconds:null,
  balance:{left:0,right:0},loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } },minds:{left:candidate,right:candidate}}, {physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const a=await make(),b=await make();
 try{
  a.duel.play([]);a.duel.order('left',{move:{ kind: "direct", direction: {x:-1,z:0} },face:null,attack:null});a.world.step(13);
  const skills=a.duel.duelists.left.minded.skills;assert.ok(skills.state.legs.walkTime>0&&skills.state.legs.walkTime<startup.seconds);
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),x=trace(a),y=trace(b);
  for(let i=0;i<180;i++){a.world.step();b.world.step();x.take();y.take();}
  assert.equal(x.digest(),y.digest());assert.deepEqual(a.duel.save().state,b.duel.save().state);
  assert.equal(skills.state.legs.walkTime,startup.seconds);
  a.duel.order('left',{move:null,face:null,attack:null});a.world.step();assert.equal(skills.state.legs.walkTime,0);
 }finally{a.dispose();b.dispose();}
});
