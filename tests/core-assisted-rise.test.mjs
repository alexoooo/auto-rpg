import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryEnvironment} from '../research/stand-up-environment.mjs';
import {ASSISTED_RECOVERY as preset,assistedPosture} from '../src/core/control/recovery-posture.ts';
import {assistControl} from '../research/stand-up-assist.mjs';

test('recovery guard targets use measured joint coordinates without a second bind offset',async()=>{
 const e=await recoveryEnvironment({balance:100});
 try{
  const command=assistControl(e,{supportedRelease:true})(e.measure());
  assert.equal(command.kind,'targets');
  const actual=e.observe().joints.map(j=>j.angle);
  command.angles.forEach((x,i)=>assert.ok(Math.abs(x-actual[i])<1e-12,e.channels[i].name));
 }finally{e.dispose();}
});

test('runtime assisted rise follows the research feedback on an actual Front fall',async()=>{
 const settings={balance:100,host:'simbicon'},a=await recoveryEnvironment(settings),b=await recoveryEnvironment({...settings,baseline:'assisted-rise'});
 try{
  const control=assistControl(a,{...preset.settings,angles:a.channels.map(c=>assistedPosture(a.stand.built.spec)[c.name]??0)});
  await a.fall();await b.fall();assert.deepEqual(a.observe(),b.observe());
  for(let i=0;i<720;i++){
   const x=a.step(control(a.measure()),{automaticHandover:true}),y=b.step();
   assert.equal(JSON.stringify(y.action),JSON.stringify(x.action),`action step ${i}`);
   assert.equal(JSON.stringify(y.observation),JSON.stringify(x.observation),`physical step ${i}`);
   if(x.result.handover!==null){assert.equal(y.result.handover,x.result.handover);break;}
  }
  assert.ok(b.result().handover!==null);
 }finally{a.dispose();b.dispose();}
});


test('assisted recovery restores contact continuation and clears help when withdrawn',async()=>{
 const e=await recoveryEnvironment({balance:100,host:'simbicon',baseline:'assisted-rise',held:'club'});
 try{
  await e.fall({degrees:90});for(let i=0;i<60;i++)e.step();
  assert.equal(e.legacy.state.phase,'assist');assert.equal(e.legacy.state.attempts,1);
  const saved=e.save(),expected=Array.from({length:20},()=>e.step());
  e.restore(saved);assert.deepEqual(Array.from({length:20},()=>e.step()),expected);
  assert.equal(e.observe().handPoses.right.applied,'grip');
  e.body.assist.withdraw();e.step();
  assert.equal(e.legacy.state.phase,'fallback');
  assert.deepEqual(e.body.assist.given.force.asArray(),[0,0,0]);
  assert.deepEqual(e.body.assist.given.moment.asArray(),[0,0,0]);
 }finally{e.dispose();}
});

test('without its required allowance assisted rise uses the unchanged recovery',async()=>{
 const a=await recoveryEnvironment(),b=await recoveryEnvironment({baseline:'assisted-rise'});
 try{
  await a.fall({degrees:90});await b.fall({degrees:90});
  assert.equal(b.legacy.state.phase,'fallback');
  assert.deepEqual(a.observe(),b.observe());
  for(let i=0;i<90;i++)assert.deepEqual(a.step().observation,b.step().observation);
 }finally{a.dispose();b.dispose();}
});


test('the Lab actor and timed shove controls execute the complete assisted recovery',async()=>{
 const {labAddress,recoveryAddress}=await import('../src/lab/scenarios.ts');
 const {loadoutSpec}=await import('../src/lab/loadout.ts');
 const {labActor}=await import('../src/lab/actor.ts');
 const {startStance}=await import('../src/lab/stance-mode.ts');
 const {coreStand}=await import('./harness/core-stand.mjs');
 const {guardPosture}=await import('../src/core/skills/guard.ts');
 const {balanceCeiling,balancePercent,rulebook}=await import('../src/core/rules/rulebook.ts');
 const address=recoveryAddress(labAddress('')),spec=loadoutSpec(address);
 const stand=await coreStand(spec,{engine:'rapier-coordinate',groundSize:40,posture:guardPosture(spec)});
 const actor=labActor(stand.built,stand.world,{mind:address.mind,assist:balanceCeiling(address.balance,balancePercent(rulebook('arena')))});
 const stance=startStance(actor,undefined,address.recoveryPush);
 const e=await recoveryEnvironment({balance:100,host:'simbicon',baseline:'assisted-rise'});
 const pose=b=>[...b.segments].map(([name,s])=>[name,s.node.position.asArray(),s.node.rotationQuaternion.asArray()]);
 try{
  await e.fall();stand.step(e.stand.world.steps);assert.deepEqual(pose(stand.built),pose(e.stand.built));
  while(e.result().handover===null && e.result().elapsed<12){
   e.step();stand.step();assert.deepEqual(pose(stand.built),pose(e.stand.built));
  }
  assert.ok(e.result().handover!==null);assert.equal(actor.body.has,'command');
  assert.deepEqual(actor.body.assist.given.force.asArray(),e.body.assist.given.force.asArray());
  assert.deepEqual(actor.body.assist.given.moment.asArray(),e.body.assist.given.moment.asArray());
  assert.equal(e.legacy.state.phase,'idle');
 }finally{e.dispose();stance.dispose();stand.dispose();}
});
