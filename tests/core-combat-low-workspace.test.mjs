import test from 'node:test';
import assert from 'node:assert/strict';
import {combatStrike} from '../research/combat-strikes.mjs';

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
