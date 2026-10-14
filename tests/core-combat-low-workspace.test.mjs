import test from 'node:test';
import assert from 'node:assert/strict';
import {combatStrike} from '../research/combat-strikes.mjs';
import {saveStand,loadStand} from './harness/core-stand.mjs';
import {pathStand} from './harness/path-stand.mjs';
import {traceOf} from './harness/trace.mjs';

for(const hand of ['left','right'])test(`the shared fold gates ${hand} low strokes, verifies hits and misses, and restores standing`, { todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to" }, async()=>{
 for(const mode of ['hit','miss']){
  const row=await combatStrike({hand,mode,family:'downward',surface:'top',ahead:.35,across:.1,up:-1.3,armExtension:1,
   support:{shared:true,lower:.5,attackAt:2,riseAt:12},seconds:16});
  const ready=row.supportPhases.find(r=>r.ready),first=row.phases.find(r=>r.phase==='chamber');
  assert.ok(ready&&first&&first.time>=ready.time,JSON.stringify({ready,first}));
  assert.ok(row.supportPhases.some(r=>r.stage==='lower'));assert.ok(row.supportPhases.some(r=>r.stage==='rise'));
  assert.equal(row.supportState.stage,'stand');assert.equal(row.supportState.active,false);
  assert.equal(row.fell,false);assert.equal(row.floorContacts,0);assert.equal(row.cycles.failed,0);
  assert.ok(row.cycles.returned[hand]>=6);assert.ok(row.head[1]>1.5);
  assert.deepEqual(row.assist,{force:0,moment:0});
  if(mode==='hit'){
   assert.ok(row.contacts.length>=6);assert.ok(row.contacts[0].closing>4);
   assert.ok(row.contacts.every(c=>c.closing>0));
   for(const c of row.contacts)assert.equal(c.closing,-c.velocity[1]);
  }else assert.deepEqual(row.contacts,[]);
 }
});

/** An extended downward stroke at a point 0.33 m up, folding the stance half a metre for it, asked from 2 s to 8 s. */
const foldedStand=hand=>pathStand({hand,action:{family:'downward',armExtension:1,lower:.5},target:{at:[hand==='right'?.1:-.1,.33,.35]},until:8,ground:true});

test('low preparation and an extended folded swing fork through the actual return into standing',async()=>{
 for(const hand of ['left','right']){
  const a=await foldedStand(hand),b=await foldedStand(hand),stages=s=>s.skills.report.actions.map(action=>[action.phase,action.stage]);
  try{
   for(const phase of ['lower','swing']){
    while(a.world.time<7&&a.stage()!==phase)a.step();
    assert.ok(a.world.time<7,phase);
    if(phase==='lower'){assert.deepEqual(stages(a),[['prepare','lower']]);assert.equal(a.skills.report.support.stage,'lower');}
    a.step(6);loadStand(b.world,b.states(),saveStand(a.world,a.states()));
    const ta=traceOf([a.built]),tb=traceOf([b.built]);
    for(let i=0;i<90;i++){a.step();b.step();ta.take();tb.take();}
    assert.equal(ta.digest(),tb.digest());assert.deepEqual(saveStand(a.world,a.states()).state,saveStand(b.world,b.states()).state);
   }
   // Once nothing more is asked, the stroke's own fold rises back into the ordinary stance.
   while(a.world.time<13&&!(a.world.time>=8&&a.skills.report.support.stage==='stand'&&!a.skills.report.actions.length)){a.step();b.step();}
   assert.equal(a.skills.report.support.stage,'stand');assert.deepEqual(stages(a),[]);
   assert.equal(a.body.down,false);
   assert.deepEqual(a.skills.report.ledger.map(record=>({...record.ending,committed:record.committed})).slice(0,1),[{kind:'completed',committed:true}]);
   assert.ok([a,b].every(s=>s.cycles.reading().returned[hand]>=1));
   assert.deepEqual(saveStand(a.world,a.states()).state,saveStand(b.world,b.states()).state);
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
 }
});
