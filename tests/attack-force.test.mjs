import test from 'node:test';
import assert from 'node:assert/strict';
import {slidingPeak,forceSummary,forceAdmission,FORCE_PROTOCOL,TRAINED_ATTACKS} from '../research/attack-force.mjs';
import {strikeEffort} from '../research/strike-effort.mjs';
import {punchCalibration} from '../research/punch-calibration.mjs';
import {PLANTED_PUNCH_EXECUTION} from '../src/core/skills/combat.ts';

test('the two millisecond peak integrates fractional steps and cannot be inferred at game rate',()=>{
 assert.equal(slidingPeak([{time:1/120,impulse:2}],120),null);
 const hz=2000,samples=Array.from({length:12},(_,i)=>({time:(i+1)/hz,impulse:i>=3&&i<7?.5:0}));
 assert.ok(Math.abs(slidingPeak(samples,hz)-1000)<1e-9);
 assert.ok(Math.abs(slidingPeak(samples,hz,.00175)-1000)<1e-9);
 assert.ok(Math.abs(slidingPeak([{time:4/1920,impulse:2}],1920)-1000)<1e-9);
 assert.ok(Math.abs(slidingPeak([{time:4/960,impulse:1}],960)-500)<1e-9);
 assert.equal(slidingPeak([],1920),null);assert.throws(()=>slidingPeak([],0),/window/);
});

test('force admission rejects missing limbs, duplicate rates, anatomical violations and unconverged force',()=>{
 const rows=['left','right'].flatMap(limb=>FORCE_PROTOCOL.rates.map(hz=>({kind:'punch',summary:{kind:'punch',limb,hz,
  family:'straight',actuation:'directional',accepted:true,impulse:{mean:20},force120:{mean:1000},peak2ms:{mean:3000},protocolMatch:true}})));
 const accepted=forceAdmission(rows,'punch','directional');assert.equal(accepted.qualified,true);assert.equal(accepted.parity,true);
 for(const mutate of [r=>r.pop(),r=>r.push(structuredClone(r[0])),r=>r[2].summary.accepted=false,
  r=>r[2].summary.impulse.mean=50,r=>r[3].summary.force120.mean=500,r=>r[3].summary.peak2ms.mean=1000]) {
  const bad=structuredClone(rows);mutate(bad);assert.equal(forceAdmission(bad,'punch','directional').qualified,false);
 }
 const unmatched=structuredClone(rows);unmatched[0].summary.protocolMatch=false;
 assert.equal(forceAdmission(unmatched,'punch','directional').qualified,true);
 assert.equal(forceAdmission(unmatched,'punch','directional').parity,false);
 const weak=structuredClone(rows);weak[7].summary.impulse.mean=1;
 assert.equal(forceAdmission(weak,'punch','directional').parity,false);
 assert.equal(TRAINED_ATTACKS.kick.peakForce,5551);assert.equal(TRAINED_ATTACKS.punch.impulse,17.2);
});

test('the delivered torque audit distinguishes solver bounds from directional anatomy',()=>{
 const driver={channels:[{name:'test flexion'}],pulled:[10],activation:[1],speed:()=>0,strength:(i,sense)=>sense>0?8:3,
  bounds:{positive:[10],negative:[10]}};
 const audit=strikeEffort(driver);audit.sample(1,'swing');assert.equal(audit.state.steps,0);
 audit.sample(2,'swing');assert.equal(audit.state.motor.excess,0);assert.equal(audit.state.anatomy.excess,2);
 driver.pulled[0]=-9;audit.sample(3,'return');assert.equal(audit.state.anatomy.excess,6);
 assert.equal(audit.state.anatomy.witness.torque,-9);assert.equal(audit.state.anatomy.witness.bound,3);
 driver.pulled[0]=12;audit.sample(4,'swing');assert.equal(audit.state.motor.excess,2);
 assert.deepEqual(audit.state.drivenPeaks,{'test flexion':12});assert.equal(audit.state.drivenSteps,2);
 driver.pulled[0]=30;audit.sample(5,'swing',false);
 assert.deepEqual(audit.state.drivenPeaks,{'test flexion':12},'struck torque cannot inflate the driven peak');
 assert.equal(audit.state.motor.excess,20,'bound auditing continues through loaded contact');
});

test('an actual punch provides same-step torque witnesses and trial means without claiming matched human performance',async()=>{
 const r=await punchCalibration({seconds:6,hand:'right',family:'cross',armExtension:.5,execution:PLANTED_PUNCH_EXECUTION,
  matchedFeedback:true,pad:{face:'compliant'}}),summary=forceSummary(r,'punch');
 assert.ok(r.effort.steps>=4*120);assert.ok(r.effort.drivenSteps>0);
 assert.ok(r.effort.motor.relativeExcess<FORCE_PROTOCOL.boundRelativeTolerance);
 assert.equal(summary.protocolMatch,false);assert.equal(summary.peak2ms.mean,null);
 const first=r.impacts.filter(e=>e.eligible&&!e.preImpact.down).slice(0,3);
 assert.equal(summary.impulse.count,first.length);assert.equal(summary.impulse.mean,first.reduce((s,e)=>s+e.impulse,0)/first.length);
 for(const event of first){assert.equal(event.deliveredTorque.time,event.time);assert.equal(event.deliveredTorque.torques.length,r.impacts[0].preImpact.motorTorques.length);}
 const bad=structuredClone(r);bad.effort.anatomy.relativeExcess=1;
 assert.ok(forceSummary(bad,'punch').faults.includes('directional anatomical bound exceeded'));
});
