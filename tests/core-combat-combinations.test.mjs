import test from 'node:test';
import assert from 'node:assert/strict';
import {SCRAPPER,BRAWLER} from '../src/core/mind/config.ts';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {traceOf} from './harness/trace.mjs';

async function make(side='left',paths={}) {
 const other=side==='left'?'right':'left',candidate={...SCRAPPER,spacing:.1,combinations:'follow-up',tuning:{paths}};
 return buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{[side]:candidate,[other]:BRAWLER},gap:1.9,recoverySeconds:null,capSeconds:30},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
}

test('both Arena assignments follow confirmed target contact and verified return with one opposite-hand punch',async()=>{
 for(const side of ['left','right']){
  const s=await make(side);
  try{
   const d=s.duel.duelists[side],skills=d.minded.skills;let phase=null,promise=null,following=0,leading=null;
   for(let i=0;i<2400;i++){
    s.world.step();const combo=skills.state.tactics.combo;
    if(combo.hand)promise=structuredClone(combo);
    if(combo.depth===1)assert.equal(combo.hand,null,'a follow-up never schedules a third punch');
    if(skills.report.strike.phase==='swing'&&phase!=='swing'){
     const hand=skills.report.strike.hand;
     if(combo.depth===1){
      assert.ok(promise);assert.equal(hand,promise.hand);assert.notEqual(hand,leading);
      assert.ok(skills.report.strike.pointCycle.returned[leading]>promise.returned);following++;
     }else leading=hand;
    }
    phase=skills.report.strike.phase;assert.equal(d.body.down,false);
   }
   assert.ok(following>=2,JSON.stringify({side,following}));assert.deepEqual({force:d.body.assist.meter.force,moment:d.body.assist.meter.moment},{force:0,moment:0});
  }finally{s.dispose();}
 }
});

test('fresh-world forks retain a pending combination and physical follow-up; ordinary orders cancel it',async()=>{
 for(const stage of ['pending','swing']){
  const a=await make(),b=await make();
  try{
   const d=a.duel.duelists.left,skills=d.minded.skills,combo=()=>skills.state.tactics.combo;
   const ready=()=>stage==='pending'?combo().hand!==null:combo().depth===1&&skills.report.strike.phase==='swing';
   while(!ready()&&a.duel.clock<20)a.world.step();assert.equal(ready(),true);
   b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
   for(let i=0;i<240;i++){a.world.step();b.world.step();ta.take();tb.take();}
   assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
   a.duel.order('left',STAND_ORDERS);a.world.step(180);
   assert.deepEqual(combo(),{hand:null,until:0,returned:0,depth:0,following:false});assert.equal(skills.report.strike.hand,null);
   const thrown=structuredClone(skills.report.strike.thrown);a.world.step(120);assert.deepEqual(skills.report.strike.thrown,thrown);
  }finally{a.dispose();b.dispose();}
 }
});

test('a physical return timeout after a real target contact cannot release a combination',async()=>{
 const s=await make('left',{returnLimit:.2});
 try{
  const skills=s.duel.duelists.left.minded.skills;let promises=0,previous=null,followups=0;
  for(let i=0;i<1800&&!s.duel.done;i++){
   s.world.step();const c=skills.state.tactics.combo;
   if(c.hand&&c.hand!==previous)promises++;previous=c.hand;
   if(c.following||c.depth===1)followups++;
  }
  assert.ok(promises>0,'the fixture reaches the contact that offers a follow-up');assert.ok(skills.report.strike.pointCycle.failed>0);
  assert.equal(followups,0,'timed-out returns never prove guard readiness');
 }finally{s.dispose();}
});
