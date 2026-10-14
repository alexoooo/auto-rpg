import test from 'node:test';
import assert from 'node:assert/strict';
import {combinationStand} from './harness/combat-combination.mjs';
import {saveStand,loadStand} from './harness/core-stand.mjs';
import {traceOf} from './harness/trace.mjs';

const states=s=>({body:s.body.state,skills:s.skills.state,policy:s.policy});
const overlap=s=>s.skills.report.actions.length===2&&s.skills.report.actions.some(action=>action.phase==='release');

test('both leading hands overlap a physical returning hand with the other action and preserve ownership',async()=>{
 for(const lead of ['left','right']){
  const s=await combinationStand({lead,mode:'miss'});
  try{
   let steps=0;
   for(let i=0;i<720;i++){
    s.step();
    if(overlap(s)){
     steps++;
     for(const action of s.skills.report.actions){
      assert.equal(s.skills.report.holders[`effector:${action.effector}`],action.id);
      assert.ok(s.skills.state.command.effectors[action.effector]);
      assert.equal(s.body.state.mind.host.motor.effectors[action.effector].goal.sequence,s.skills.state.command.effectors[action.effector].sequence);
     }
    }
    assert.equal(s.body.down,false);
   }
   assert.ok(steps>0);
   const completed=s.skills.report.ledger.filter(record=>record.ending.kind==='completed');
   assert.ok(completed.some(record=>record.effector==='hand.left'));
   assert.ok(completed.some(record=>record.effector==='hand.right'));
  }finally{s.dispose();}
 }
});

test('an overlapping fork preserves motion; withdrawal returns both hands and takeover ends both identities',async()=>{
 const a=await combinationStand({mode:'miss'}),b=await combinationStand({mode:'miss'});
 try{
  while(!overlap(a)&&a.world.time<5)a.step();assert.ok(overlap(a));
  loadStand(b.world,states(b),saveStand(a.world,states(a)));
  const ta=traceOf([a.built]),tb=traceOf([b.built]);
  for(let i=0;i<180;i++){a.step();b.step();ta.take();tb.take();}
  assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);assert.equal(ta.digest(),tb.digest());
  a.policy.cancelled=true;a.step(180);
  assert.deepEqual(a.skills.report.actions,[]);
  const thrown=a.cycles.reading().thrown;a.step(120);assert.deepEqual(a.cycles.reading().thrown,thrown);
  a.policy.cancelled=false;a.policy.stage='lead';a.policy.hand='right';
  while(!overlap(a)&&a.world.time<12)a.step();assert.ok(overlap(a));
  const ids=a.skills.report.actions.map(action=>action.id);
  a.skills.release(a.body.view,'takeover');
  assert.deepEqual(a.skills.report.ledger.filter(record=>ids.includes(record.id)).map(record=>record.ending),ids.map(()=>({kind:'interrupted',reason:'takeover'})));
  assert.deepEqual(a.skills.report.actions,[]);assert.deepEqual(a.skills.report.reservations,{});
 }finally{a.dispose();b.dispose();}
});

test('a physical return deadline records stalled and never counts a verified return',async()=>{
 const s=await combinationStand({mode:'miss',tuning:{returnLimit:.15}});
 try{
  for(let i=0;i<600&&!s.skills.report.ledger.some(record=>record.ending.kind==='stalled');i++)s.step();
  const failed=s.skills.report.ledger.find(record=>record.ending.kind==='stalled');
  assert.ok(failed);assert.match(failed.ending.reason,/return deadline/);
  assert.equal(s.cycles.reading().returned[failed.effector.split('.')[1]],0);
 }finally{s.dispose();}
});
