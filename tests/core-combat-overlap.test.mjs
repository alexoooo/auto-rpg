import test from 'node:test';
import assert from 'node:assert/strict';
import {combinationStand} from './harness/combat-combination.mjs';
import {saveStand,loadStand} from './harness/core-stand.mjs';
import {traceOf} from './harness/trace.mjs';
import {SCRAPPER,BRAWLER} from '../src/core/mind/config.ts';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';

const states=s=>({body:s.body.state,skills:s.skills.state,policy:s.policy});

test('both leading hands overlap real strikes and returns through one unpinned body on hits and misses', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
 for(const lead of ['left','right'])for(const mode of ['hit','miss']){
  const s=await combinationStand({lead,mode});
  try{
   const contacts={left:0,right:0};let overlapSteps=0,starts=0;
   for(let i=0;i<1200;i++){
    const before=structuredClone(s.skills.state),wasBack=s.skills.report.strike.returning;s.step();
    const state=s.skills.state,r=s.skills.report.strike.returning;
    assert.equal(s.body.down,false);
    if(r){
     const back=state.blow.hands[r];
     overlapSteps++;assert.notEqual(state.blow.hand,r);assert.equal(back.cycle.phase,'return');
     assert.ok(state.command.effectors["hand.left"]);assert.ok(state.command.effectors["hand.right"]);
     assert.equal(state.command.effectors[`hand.${r}`].sequence,back.cycle.sequence);
     assert.equal(s.body.state.mind.host.motor.effectors[`hand.${r}`].goal.sequence,back.cycle.sequence,'return motion keeps its identity');
     if(!wasBack){
      starts++;assert.equal(before.blow.hands[r].cycle.phase,'return');assert.equal(before.blow.hand,r);
      assert.equal(back.cycle.returned,before.blow.hands[r].cycle.returned,'overlap is not a verified return');
      assert.equal(s.body.view.effectors[`hand.${r}`].feedback.impulse,0,'old contact has cleared');
      const was=before.blow.hands[r].cycle.previous,at=back.cycle.previous;
      assert.ok(at.reduce((sum,v,k)=>sum+(v-was[k])*(back.home[k]-v),0)>0,'physical hand motion is homeward');
     }
    }
    const w=s.policy.witness;
    if(w.phase==='swing'&&s.obstacle){
     const hit=s.world.physics.contactsOf(s.built.segments.get(`hand.${w.hand}`).body).find(c=>c.fixed===s.obstacle.id&&c.impulse>0);
     if(hit){assert.ok(w.closing>4,JSON.stringify(w));contacts[w.hand]++;}
    }
   }
   assert.ok(starts>=5);assert.ok(overlapSteps>100);assert.ok(s.policy.pairs>=5);
   assert.ok(s.skills.report.strike.pointCycle.returned.left>=5);assert.ok(s.skills.report.strike.pointCycle.returned.right>=5);
   assert.equal(s.skills.report.strike.pointCycle.failed,0);assert.equal(s.skills.report.strike.pointCycle.interrupted,0);
   if(mode==='hit'){assert.ok(contacts[lead]>=6);assert.ok(contacts[lead==='left'?'right':'left']>=3);}else assert.deepEqual(contacts,{left:0,right:0});
   assert.deepEqual({force:s.body.assist.meter.force,moment:s.body.assist.meter.moment},{force:0,moment:0});
  }finally{s.dispose();}
 }
});

test('overlapping chamber and swing forks preserve complete motion; cancellation and takeover account for both hands',async()=>{
 for(const lead of ['left','right'])for(const phase of ['chamber','swing']){
  const a=await combinationStand({lead}),b=await combinationStand({lead});
  try{
   const ready=()=>a.skills.report.strike.returning&&a.skills.report.strike.phase===phase;
   while(!ready()&&a.world.time<5)a.step();assert.ok(ready());
   loadStand(b.world,states(b),saveStand(a.world,states(a)));
   const ta=traceOf([a.built]),tb=traceOf([b.built]);
   for(let i=0;i<240;i++){a.step();b.step();ta.take();tb.take();}
   assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);assert.equal(ta.digest(),tb.digest());
   while(!a.skills.report.strike.returning&&a.world.time<8)a.step();assert.ok(a.skills.report.strike.returning);
   a.policy.cancelled=true;const thrown=structuredClone(a.skills.report.strike.thrown);a.step(180);
   assert.equal(a.skills.report.strike.hand,null);assert.equal(a.skills.report.strike.returning,null);
   a.step(120);assert.deepEqual(a.skills.report.strike.thrown,thrown);
   a.policy.cancelled=false;a.policy.stage='lead';a.policy.hand=lead;
   while(!a.skills.report.strike.returning&&a.world.time<12)a.step();assert.ok(a.skills.report.strike.returning);assert.ok(a.skills.state.blow.hand);
   const interrupted=a.skills.report.strike.pointCycle.interrupted;
   a.skills.resume(a.body.view);
   assert.equal(a.skills.report.strike.pointCycle.interrupted,interrupted+2);
   assert.equal(a.skills.state.blow.hand,null);assert.equal(a.skills.report.strike.returning,null);assert.equal(a.skills.report.strike.overlapHand,null);
  }finally{a.dispose();b.dispose();}
 }
});

test('an auxiliary return deadline records failure and never manufactures guard readiness',async()=>{
 const s=await combinationStand({tuning:{returnLimit:.15}});
 try{
  let captured=false,failed=false;
  for(let i=0;i<600;i++){
   const r=s.skills.report.strike.returning,returned=structuredClone(s.skills.report.strike.pointCycle.returned),failures=s.skills.report.strike.pointCycle.failed;
   s.step();captured ||= !!s.skills.report.strike.returning;
   if(r&&!s.skills.report.strike.returning){
    assert.equal(s.skills.report.strike.pointCycle.returned[r],returned[r]);
    assert.ok(s.skills.report.strike.pointCycle.failed>failures);failed=true;
   }
  }
  assert.ok(captured);assert.ok(failed);assert.deepEqual(s.skills.report.strike.pointCycle.returned,{left:0,right:0});
 }finally{s.dispose();}
});

async function arena(side='left'){
 const other=side==='left'?'right':'left';
 return buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},gap:1.9,
  recoverySeconds:null,capSeconds:30,minds:{[side]:{...SCRAPPER,spacing:.1,combinations:'overlap'},[other]:BRAWLER}},
  {physicsEngine:await loadEngine(DEFAULT_ENGINE)});
}

test('both Arena assignments overlap only a promised opposite-hand follow-up, never a third strike', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
 for(const side of ['left','right']){
  const s=await arena(side);
  try{
   const d=s.duel.duelists[side],skills=d.minded.skills;let starts=0,promise=null;
   for(let i=0;i<2400;i++){
    const before=structuredClone(skills.state),wasBack=skills.report.strike.returning;s.world.step();
    const state=skills.state,combo=state.tactics.combo,back=skills.report.strike.returning;
    if(before.tactics.combo.hand)promise=before.tactics.combo;
    if(back&&!wasBack){
     starts++;assert.ok(promise);assert.equal(state.blow.hand,promise.hand);assert.notEqual(state.blow.hand,back);
     assert.equal(skills.report.strike.pointCycle.returned[back],before.blow.hands[back].cycle.returned);
    }
    if(combo.depth===1)assert.equal(combo.hand,null);
    assert.equal(d.body.down,false);
   }
   assert.ok(starts>=2,JSON.stringify({side,starts}));assert.equal(skills.report.strike.pointCycle.failed,0);
   assert.deepEqual({force:d.body.assist.meter.force,moment:d.body.assist.meter.moment},{force:0,moment:0});
  }finally{s.dispose();}
 }
});

test('a fresh Arena fork retains both active hands and ordinary stand orders cancel further combinations',async()=>{
 const a=await arena(),b=await arena();
 try{
  const skills=a.duel.duelists.left.minded.skills;
  while(!skills.report.strike.returning&&a.duel.clock<20)a.world.step();assert.ok(skills.report.strike.returning);
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let i=0;i<240;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
  a.duel.order('left',STAND_ORDERS);a.world.step(240);
  assert.deepEqual(skills.state.tactics.combo,{hand:null,until:0,returned:0,depth:0,following:false});
  assert.equal(skills.report.strike.hand,null);assert.equal(skills.report.strike.returning,null);
  const thrown=structuredClone(skills.report.strike.thrown);a.world.step(120);assert.deepEqual(skills.report.strike.thrown,thrown);
 }finally{a.dispose();b.dispose();}
});
