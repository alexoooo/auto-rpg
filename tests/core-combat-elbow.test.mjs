import test from 'node:test';
import assert from 'node:assert/strict';
import {validAttackTuning,ATTACK_PATH} from '../src/core/skills/attack-path.ts';
import {combatStrike} from '../research/combat-strikes.mjs';

test('shared path validation bounds the elbow preference and rejects invalid durations and numbers',()=>{
 for(const elbowExtension of [0,.5,1])assert.equal(validAttackTuning({...ATTACK_PATH,elbowExtension}),true);
 for(const elbowExtension of [-.01,1.01,NaN,Infinity])assert.equal(validAttackTuning({...ATTACK_PATH,elbowExtension}),false);
 for(const field of ['chamberSeconds','swingSeconds','returnSeconds','hold'])assert.equal(validAttackTuning({...ATTACK_PATH,[field]:0}),false);
 assert.equal(validAttackTuning({...ATTACK_PATH,contactSpeed:Infinity}),false);
});

test('either hand repeats extended head punches with useful contact mass and survives misses', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
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
