/**
 * **How the shared strike runner lands** (`combatStrike`, `research/combat-strikes.mjs`: the
 * unpinned Warrior on the core stand, Node, Rapier, 120 Hz, no assist), striking a fixed box or the
 * same point in empty space with each hand and family: how many blows land, how fast they close,
 * the contact mass behind them, and that every stroke returns with the body standing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatStrike } from '../research/combat-strikes.mjs';

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

test('either hand repeats a close curved strike and survives misses without assistance', async () => {
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
});

test('either hand repeats extended head punches with useful contact mass and survives misses', async()=>{
 for(const hand of ['right','left'])for(const mode of ['hit','miss']) {
  const row=await combatStrike({hand,mode,seconds:8,across:.1,ahead:.6,measureMass:true,tuning:{elbowExtension:1}});
  assert.equal(row.fell,false);assert.equal(row.cycles.failed,0);assert.ok(row.cycles.returned[hand]>=7,JSON.stringify(row));
  assert.deepEqual(row.assist,{force:0,moment:0});
  if(mode==='hit'){
   assert.equal(row.contacts.length,8);assert.ok(row.contacts.every(c=>c.closing>4.9),JSON.stringify(row.contacts));
   const mean=row.contacts.reduce((sum,c)=>sum+c.mass,0)/row.contacts.length;
   const baseline=await combatStrike({hand,mode,seconds:8,across:.1,ahead:.6,measureMass:true});
   const baseMass=baseline.contacts.reduce((sum,c)=>sum+c.mass,0)/baseline.contacts.length;
   assert.ok(mean>baseMass*1.3,JSON.stringify({contacts:row.contacts,baseline:baseline.contacts}));
  }else{assert.deepEqual(row.contacts,[]);assert.ok(row.peaks.every(p=>p>4),JSON.stringify(row.peaks));}
 }
});

test('an action arm style strikes and returns standing on either hand', async()=>{
 // 58 cm ahead, where every blow of a hit cell lands on the box.
 for(const hand of ['right','left'])for(const mode of ['hit','miss'])for(const armExtension of [0,1]){
  const row=await combatStrike({hand,mode,seconds:8,ahead:.58,across:.1,tuning:{elbowExtension:1-armExtension},armExtension});
  assert.equal(row.fell,false);assert.equal(row.cycles.failed,0);assert.ok(row.cycles.returned[hand]>=6,JSON.stringify(row.cycles));
 }
});

test('both hands repeat actual upward contacts and survive clean misses with verified returns and no assistance', async()=>{
 for(const hand of ['right','left'])for(const mode of ['hit','miss']){
  const row=await combatStrike({hand,mode,seconds:8,family:'uppercut',surface:'bottom',direction:[0,1,0],ahead:.35,across:.1,measureMass:true});
  assert.equal(row.fell,false);assert.equal(row.cycles.failed,0);assert.deepEqual(row.assist,{force:0,moment:0});
  assert.ok(row.cycles.returned[hand]>=(mode==='hit'?6:4),JSON.stringify(row.cycles));
  if(mode==='hit'){
   assert.equal(row.contacts.length,6);assert.ok(row.contacts.every(c=>c.closing>2.9&&c.mass>.2),JSON.stringify(row.contacts));
  }else{assert.deepEqual(row.contacts,[]);assert.ok(row.peaks.every(p=>p>2.9),JSON.stringify(row.peaks));}
 }
});

for(const hand of ['left','right'])test(`the shared fold gates ${hand} low strokes, verifies hits and misses, and restores standing`, async()=>{
 for(const mode of ['hit','miss']){
  const row=await combatStrike({hand,mode,family:'downward',surface:'top',ahead:.35,across:.1,up:-1.3,armExtension:1,
   support:{shared:true,lower:.5,attackAt:2,riseAt:12},seconds:16});
  const ready=row.supportPhases.find(r=>r.ready),first=row.phases.find(r=>r.phase==='swing');
  assert.ok(ready&&first&&first.time>=ready.time,JSON.stringify({ready,first}));
  // The support lowers to ready, leaves it to rise, and is let go.
  assert.ok(row.supportPhases.some(r=>r.time>ready.time&&!r.ready),JSON.stringify(row.supportPhases));
  assert.equal(row.supportState.active,false);
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
