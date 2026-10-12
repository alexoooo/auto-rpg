import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { pathPolicy } from '../research/stand-up-path-policy.mjs';
import { phaseFeatures } from '../research/stand-up-phase-features.mjs';
import { libraryPolicy, configuredPolicy } from '../research/stand-up-library-policy.mjs';
import { responseFeatures, responsePolicy } from '../research/stand-up-response-policy.mjs';
import { prefixPolicy } from '../research/stand-up-prefix-response-policy.mjs';
import { createHash } from 'node:crypto';
import { mirrorReference } from '../research/stand-up-mirror-reference.mjs';
import { retargetReference } from '../research/stand-up-retarget-reference.mjs';
import { ratesToRef } from '../src/core/build/joint-state.ts';
import { searchGuidance } from '../research/stand-up-search-guidance.mjs';
import { contactBalanceTarget } from '../research/stand-up-contact-policy.mjs';
import { contactEffort } from '../research/stand-up-contact-effort.mjs';

test('contact effort carries gravity and descendant ground forces in the muscle sense at speed',()=>{
  const side={peak:10,curve:{unloadedSpeed:10,curvature:.25,eccentricCeiling:1.5,eccentricSlopeRatio:2}};
  const model={gravity:[0,-10,0],segments:[{name:'root',mass:1},{name:'link',mass:1}],channels:[{positive:side,negative:side}],
    joints:[{parent:'root',dofs:[{sign:1}],axes:{x:[0,0,1],y:[1,0,0],z:[0,1,0]},
      parentRestInverse:[0,0,0,1],pivot:[0,0,0],descendants:['link']}]};
  const o={segments:[{name:'root',position:[0,0,0],centre:[0,0,0],rotation:[0,0,0,1]},
    {name:'link',centre:[.5,0,0]}],joints:[{angle:0,speed:0}]};
  const patches=[{at:new Vector3(1,0,0)},{at:new Vector3(-1,0,0)}],owners=['link','root'];
  const a=contactEffort(model,o,patches,owners,[0]);
  assert.deepEqual([...a.t0],[10]);assert.deepEqual([...a.C],[0,2,0,0,0,0,0,0,0,0,0,0]);
  assert.equal((a.t0[0]-a.C[1]*4)/a.scales[0],1);
  assert.equal(contactEffort(model,o,patches,owners,[.2]).t0[0],12);
  const fast=contactEffort(model,{...o,joints:[{angle:0,speed:10}]},patches,owners,[0]);
  assert.ok(fast.C[1]>a.C[1]&&[...fast.C,...fast.t0].every(Number.isFinite));
});

test('contact balance targets weight actual supports independently of patch count and fall back before preferred support exists',()=>{
  const patches=[{at:new Vector3(-1,0,0)},{at:new Vector3(1,0,0)},{at:new Vector3(3,0,0)}];
  const owners=['hand.left','foot.left','foot.left'],out=new Vector3();
  assert.deepEqual(contactBalanceTarget(patches,owners,undefined,out).asArray(),[1,0,0]);
  assert.deepEqual(contactBalanceTarget(patches,owners,{'hand.left':0,'foot.left':1},out).asArray(),[2,0,0]);
  assert.deepEqual(contactBalanceTarget(patches,owners,{'hand.left':1,'foot.left':1},out).asArray(),[.5,0,0]);
  assert.deepEqual(contactBalanceTarget(patches.slice(0,1),owners.slice(0,1),{'hand.left':0,'foot.left':1},out).asArray(),[-1,0,0]);
  assert.deepEqual(patches.map(p=>p.at.asArray()),[[-1,0,0],[1,0,0],[3,0,0]]);
  assert.throws(()=>contactBalanceTarget(patches,owners,{'hand.left':-1},out),/nonnegative/);
  assert.throws(()=>contactBalanceTarget(patches,owners,{'foot.left':Infinity},out),/finite/);
});

test('detached search guidance matches the target body and separates requests from physical measurements',()=>{
  const identity={model:'target',balance:0,channels:[{name:'joint'}]};
  const frame={kind:'muscles',angles:[.2],speeds:[.3],rootMotion:[1,2,3,4,5,6],gravity:[0,1,0],up:[0,1,0],height:.8,
    loads:{'foot.left':.2,'foot.right':.3,absent:.5},soleUp:[1,1],velocity:['+inf'],activation:[.5],handPoses:{left:'open'}};
  const reference={identity,frames:[frame,{...frame,kind:'host'}]},before=structuredClone(reference);
  const actual=searchGuidance(reference,identity,['foot.right','foot.left']);
  assert.deepEqual(reference,before);
  assert.deepEqual(actual.features[0],{angles:[.2],speeds:[.3],height:.8,up:[0,1,0],gravity:[0,1,0],
    loads:[.6,.4],spin:[1,2,3],velocity:[4,5,6],soleUp:null});
  assert.deepEqual(actual.actions,[{kind:'muscles',velocity:['+inf'],activation:[.5],handPoses:{left:'open'}},{kind:'host'}]);
  assert.throws(()=>searchGuidance(reference,{...identity,model:'other'},['foot.left']),/target physical body/);
  const bad=structuredClone(reference);bad.frames[0].assist={force:[0,1,0],moment:[0,0,0]};
  assert.throws(()=>searchGuidance(bad,identity,['foot.left']),/no assist request/);
  const nonfinite=structuredClone(reference);nonfinite.frames[0].rootMotion[0]=Infinity;
  assert.throws(()=>searchGuidance(nonfinite,identity,['foot.left']));
});

test('body guidance transfers anatomical rates, local frames and physical height without transferring response calibration',()=>{
  const channels=[0,1,2].map(i=>({name:`joint ${i}`,bind:.1*i,min:-2,max:2}));
  const source={identity:{channels},standingHeight:1,rootAcross:[1,0,0],rootUp:[0,1,0],rootFront:[0,0,1],
    joints:[{dofs:[{sign:1},{sign:-1},{sign:1}]}]};
  const target=structuredClone(source);target.standingHeight=.8;target.identity.channels[1].bind=.4;
  target.rootAcross=[0,1,0];target.rootUp=[-1,0,0];
  const frame={kind:'muscles',angles:[.3,.4,.5],speeds:[1,2,3],velocity:[3,1,2],activation:[.1,.2,.3],
    handPoses:{left:'open'},gravity:[1,2,3],height:.5,rootMotion:[1,2,3,4,5,6],up:[0,1,0],loads:{'foot.left':1}};
  const reference={...source,frames:[frame],release:1,responses:[{}],responseMeasurement:{},sourcePhysicalTraceSha256:'physical'};
  const before=structuredClone({reference,source,target}),adapted=retargetReference(reference,source,target),actual=adapted.frames[0];
  assert.deepEqual({reference,source,target},before);
  assert.deepEqual(actual.gravity,[-2,1,3]);assert.equal(actual.height,.4);
  assert.deepEqual(actual.rootMotion,[-2,1,3,-4,3.2,4.800000000000001]);
  actual.angles.forEach((v,i)=>assert.ok(Math.abs(v-[.3,.1,.5][i])<1e-12));
  for(const field of ['speeds','velocity']) {
    const a=ratesToRef(source.joints[0],frame.angles,frame[field],[]);
    const b=ratesToRef(target.joints[0],actual.angles,actual[field],[]);
    a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12));
  }
  assert.deepEqual(actual.activation,frame.activation);assert.deepEqual(actual.loads,frame.loads);
  assert.equal(adapted.responses,undefined);assert.equal(adapted.responseMeasurement,undefined);
  assert.equal(adapted.sourcePhysicalTraceSha256,undefined);assert.equal(adapted.transformation.measuredTrajectory,false);
  assert.equal(adapted.transformation.parentPhysicalTraceSha256,'physical');
  assert.deepEqual(retargetReference(reference,source,source).frames,reference.frames);
  const wrong=structuredClone(source);wrong.identity.channels[0].name='wrong';
  assert.throws(()=>retargetReference(reference,wrong,target),/source geometry/);
});

test('body guidance clamps legal target angles and explicitly preserves mixed torque commands',()=>{
  const source={identity:{channels:[{name:'a',bind:0,min:-2,max:2},{name:'b',bind:0,min:-2,max:2}]},
    standingHeight:1,rootAcross:[1,0,0],rootUp:[0,1,0],rootFront:[0,0,1],joints:[{dofs:[{sign:1},{sign:1}]}]};
  const target=structuredClone(source);target.identity.channels[0].max=.2;
  const frame={kind:'muscles',angles:[.5,.1],speeds:[1,2],velocity:['+inf',3],activation:[.4,.7],
    handPoses:{},gravity:[0,1,0],up:[0,1,0],height:.5,loads:{}};
  const adapted=retargetReference({...source,frames:[frame]},source,target);
  assert.deepEqual(adapted.frames[0].angles,[.2,.1]);assert.deepEqual(adapted.frames[0].velocity,['+inf',3]);
  assert.deepEqual(adapted.frames[0].activation,[.4,.7]);
  assert.deepEqual(adapted.transformation.clipped,[{frame:0,channel:'a',asked:.5,given:.2}]);
  assert.deepEqual(adapted.transformation.preservedTorqueJoints,[{frame:0,joint:0}]);
});

test('a recovery reference resumes muscle actions after a temporary host interval',()=>{
  const muscles={kind:'muscles',velocity:[1],activation:[.3],handPoses:{left:'open'}};
  const frame=action=>({...action,angles:[0],speeds:[0],up:[0,1,0]});
  const reference={rootUp:[0,1,0],release:3,frames:[frame(muscles),frame({kind:'host'}),frame(muscles)]};
  const policy=pathPolicy({channels:[{name:'knee.left flexion'}],reference,parameters:{}});
  const actions=[0,1,2,3].map(step=>policy({time:step/120,height:1,
    segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],joints:[{angle:0,speed:0}]}));
  assert.deepEqual(actions,[muscles,{kind:'host'},muscles,{kind:'host'}]);
});

test('body-specific recovery selection uses both model and loadout and preserves the default library',()=>{
  const channels=[{name:'knee.left flexion',min:0,max:2}];
  const frame=v=>({kind:'muscles',velocity:[v],activation:[.5],handPoses:{},angles:[0],speeds:[0],
    gravity:[0,1,0],height:1,up:[0,1,0],loads:{}});
  const ref=v=>({identity:{channels},rootUp:[0,1,0],release:3,frames:[frame(v),frame(v),frame(v)]});
  const references={default:{references:[ref(1)]},club:ref(2)};
  const specification={reference:'default',parameters:{},bodies:{'warrior/club':{kind:'path',reference:'club',parameters:{}}}};
  const before=structuredClone(specification),loadReference=file=>references[file];
  const observation={time:0,height:1,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],contacts:[],joints:[{angle:0,speed:0}]};
  for(const [model,held,expected] of [['warrior','club',2],['warrior','empty',1],['rogue','club',1]]) {
    const policy=configuredPolicy({channels,configuration:{model,held},specification,loadReference});
    assert.deepEqual(policy(observation).velocity,[expected]);
  }
  assert.deepEqual(specification,before);
  assert.throws(()=>configuredPolicy({channels:[{name:'wrong'}],configuration:{model:'warrior',held:'club'},specification,loadReference}),/muscle channels/);
});

test('terminal posture braking uses bounded muscles and leaves actual quiet handover to the environment',()=>{
  const reference={rootUp:[0,1,0],release:1,frames:[{kind:'muscles',angles:[.4],speeds:[1],
    velocity:['+inf'],activation:[.7],handPoses:{left:'open'},up:[0,1,0]}]};
  const parameters={releaseHeight:.8,releaseUp:.9,terminalGain:4,terminalDamping:2,terminalActivation:.5};
  const policy=pathPolicy({channels:[{name:'knee.left flexion'}],reference,parameters});
  const o={time:0,height:1,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],joints:[{angle:.2,speed:.3}]};
  assert.deepEqual(policy(o),{kind:'muscles',velocity:['+inf'],activation:[.7],handPoses:{left:'open'}});
  const actual=policy({...o,time:1/120});
  assert.equal(actual.kind,'muscles');assert.deepEqual(actual.activation,[.5]);
  assert.ok(Math.abs(actual.velocity[0]-.2)<1e-12);assert.equal(policy.state.settling,true);assert.equal(policy.state.released,false);
  const ordinary=pathPolicy({channels:[{name:'knee.left flexion'}],reference,parameters:{...parameters,terminalGain:0}});
  ordinary(o);assert.deepEqual(ordinary({...o,time:1/120}),{kind:'host'});
  const own=pathPolicy({channels:[{name:'knee.left flexion',min:0,max:.5}],reference,
    parameters:{...parameters,terminalAngles:[.8]}});
  own(o);const clamped=own({...o,time:1/120});
  assert.ok(Math.abs(clamped.velocity[0]-.6)<1e-12);
  assert.deepEqual(clamped.activation,[.5]);assert.equal(own.state.settling,true);
  assert.throws(()=>pathPolicy({channels:[{name:'knee.left flexion',min:0,max:.5}],reference,
    parameters:{...parameters,terminalAngles:[]}}));
  const deferred=pathPolicy({channels:[{name:'knee.left flexion'}],reference,
    parameters:{...parameters,terminalAfter:1}});
  deferred(o);assert.deepEqual(deferred({...o,time:1/120}),{kind:'host'});
  assert.deepEqual(deferred({...o,time:.5,height:.7}),{kind:'host'});
  assert.equal(deferred({...o,time:1}).kind,'muscles');
  assert.equal(deferred.state.settling,true);assert.equal(deferred.state.released,false);
});

test('reflected guidance swaps anatomical limbs and hand poses, preserves limits, and treats angular motion as axial',()=>{
  const identity={channels:[{name:'neck rotation right',bind:.1,min:-2,max:2},
    {name:'hip.left flexion',bind:.2,min:-2,max:2},{name:'hip.right flexion',bind:.3,min:-2,max:2}]};
  const frame={kind:'muscles',angles:[.4,.5,.8],speeds:[1,2,3],velocity:['+inf',2,'-inf'],activation:[.1,.2,.3],
    handPoses:{left:'open',right:'fist'},gravity:[1,2,3],up:[1,2,3],rootMotion:[1,2,3,4,5,6],loads:{'foot.left':.7,'foot.right':.3}};
  const reference={identity,rootAcross:[0,0,1],frames:[frame],responses:[{}],responseMeasurement:{},sourcePhysicalTraceSha256:'source'};
  const before=structuredClone(reference),mirrored=mirrorReference(reference),actual=mirrored.frames[0];
  assert.deepEqual(reference,before);assert.equal(mirrored.responses,undefined);assert.equal(mirrored.responseMeasurement,undefined);
  assert.equal(mirrored.sourcePhysicalTraceSha256,undefined);assert.equal(mirrored.transformation.measuredTrajectory,false);
  assert.equal(mirrored.transformation.parentPhysicalTraceSha256,'source');
  actual.angles.forEach((v,i)=>assert.ok(Math.abs(v-[-.6,.9,.4][i])<1e-12));
  assert.deepEqual(actual.speeds,[-1,3,2]);assert.deepEqual(actual.velocity,['-inf','-inf',2]);
  assert.deepEqual(actual.activation,[.1,.3,.2]);assert.deepEqual(actual.handPoses,{right:'open',left:'fist'});
  assert.deepEqual(actual.gravity,[1,2,-3]);assert.deepEqual(actual.up,[-1,2,3]);
  assert.deepEqual(actual.rootMotion,[-1,-2,3,4,5,-6]);assert.deepEqual(actual.loads,{'foot.right':.7,'foot.left':.3});
  mirrorReference(mirrored).frames[0].angles.forEach((v,i)=>assert.ok(Math.abs(v-frame.angles[i])<1e-12));
  const restricted=structuredClone(reference);restricted.identity.channels[1].max=.6;
  const limited=mirrorReference(restricted);assert.equal(limited.frames[0].angles[1],.6);
  assert.equal(limited.transformation.clipped.length,1);assert.equal(limited.transformation.clipped[0].channel,'hip.left flexion');
});

test('recovery phase features preserve tilt across world headings and exclude self-contact loads',()=>{
  const observation={height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},
    {name:'foot.left'},{name:'foot.right'}],contacts:[{segment:'foot.left',fixed:0,impulse:2},
    {segment:'foot.right',fixed:0,impulse:6},{segment:'lowerTrunk',fixed:null,impulse:99}]};
  const before=structuredClone(observation),features=phaseFeatures(observation);
  assert.deepEqual(observation,before);
  assert.deepEqual(features.loads,{'lowerTrunk':0,'foot.left':.25,'foot.right':.75});
  assert.equal(features.height,.5);
  for(let i=0;i<3;i++)assert.ok(Math.abs(features.gravity[i]-[1,0,0][i])<1e-12);
  observation.segments[0].rotation=[.5,.5,.5,.5];
  assert.deepEqual(phaseFeatures(observation),{gravity:[1,0,0],loads:features.loads,height:.5});
  observation.contacts=[];
  assert.deepEqual(phaseFeatures(observation).loads,{'lowerTrunk':0,'foot.left':0,'foot.right':0});
});

test('library feedback blends muscle commands between poses and preserves an exact reference',()=>{
  const channels=[{name:'knee.left flexion'}];
  const reference=(angle,velocity,activation)=>({rootUp:[0,1,0],release:3,
    frames:Array.from({length:3},()=>({kind:'muscles',velocity:[velocity],activation:[activation],handPoses:{left:'open'},
      angles:[angle],speeds:[0],up:[0,1,0],gravity:[0,1,0],height:.5,loads:{lowerTrunk:0}}))});
  const library={references:[reference(-1,-2,.2),reference(1,4,.8)]};
  const observation={time:0,height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],
    contacts:[],joints:[{angle:0,speed:0}]};
  const before=structuredClone({library,observation});
  const policy=libraryPolicy({channels,reference:library,parameters:{blend:2}});
  assert.deepEqual(policy(observation),{kind:'muscles',velocity:[1],activation:[.5],handPoses:{left:'open'}});
  assert.deepEqual({library,observation},before);
  const exact=libraryPolicy({channels,reference:library,parameters:{blend:2}});
  assert.deepEqual(exact({...observation,joints:[{angle:-1,speed:0}]}),
    {kind:'muscles',velocity:[-2],activation:[.2],handPoses:{left:'open'}});
  assert.deepEqual(exact({...observation,time:3/120}),{kind:'host'});
  assert.deepEqual(exact({...observation,time:4/120}),{kind:'host'});
});

test('velocity-aware phase matching distinguishes equal poses moving in opposite directions',()=>{
  const frame=(speed,velocity)=>({kind:'muscles',velocity:[velocity],activation:[.4],handPoses:{},
    angles:[0],speeds:[speed],up:[0,1,0]});
  const policy=pathPolicy({channels:[{name:'knee.left flexion'}],
    reference:{rootUp:[0,1,0],release:2,frames:[frame(-2,1),frame(2,2)]},
    parameters:{window:.1,phaseVelocityWeight:1,finiteDamping:.5}});
  assert.deepEqual(policy({time:0,height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],joints:[{angle:0,speed:1}]}),
    {kind:'muscles',velocity:[2.5],activation:[.4],handPoses:{}});
  assert.equal(policy.state.phase,1);
});

test('a recovery library selects measured-response feedback by body-relative motion and retains its controller',()=>{
  const frame=(angle,velocity,spin)=>({kind:'muscles',velocity:[velocity],activation:[.4],handPoses:{left:'open'},
    angles:[angle],speeds:[0],up:[0,1,0],gravity:[0,1,0],height:.5,loads:{lowerTrunk:0},rootMotion:[spin,0,0,0,0,0]});
  const reference={references:[{rootUp:[0,1,0],release:3,frames:Array(3).fill(frame(0,-2,-1))},
    {rootUp:[0,1,0],release:3,frames:Array(3).fill(frame(1,4,1)),responseMeasurement:{configuration:{rootMotion:true}},
      responses:[{step:0,columns:[[0,0,0,0,1,0,0,0,0,0,0,0]]}]}]};
  const parameters={initialOnly:true,rootMotionWeight:1,controllers:[{kind:'path'},
    {kind:'response',parameters:{ridge:1,responseGain:1,pathGain:0}}]};
  const channels=[{name:'knee.left flexion'}],o={time:0,height:.5,contacts:[],joints:[{angle:0,speed:0}],
    segments:[{name:'lowerTrunk',rotation:[0,0,0,1],spin:[1,0,0],velocity:[0,0,0]}]};
  const before=structuredClone({reference,parameters,o}),policy=libraryPolicy({channels,reference,parameters});
  assert.deepEqual(policy(o),{kind:'muscles',velocity:[4.5],activation:[.4],handPoses:{left:'open'}});
  assert.equal(policy.state.reference,1);
  assert.deepEqual(policy({...o,time:1/120,segments:[{...o.segments[0],spin:[-1,0,0]}]}),
    {kind:'muscles',velocity:[4.5],activation:[.4],handPoses:{left:'open'}});
  assert.equal(policy.state.reference,1);assert.equal(policy.state.switches,0);
  assert.deepEqual({reference,parameters,o},before);
  assert.throws(()=>libraryPolicy({channels,reference,parameters:{controllers:[{kind:'unknown'}]}}),/unknown reference controller/);
});

test('phase matching respects elapsed time when a distant reference pose is closer',()=>{
  const frames=Array.from({length:30},(_,i)=>({kind:'muscles',velocity:[i],activation:[.4],handPoses:{},
    angles:[i],speeds:[0],up:[0,1,0]}));
  const policy=pathPolicy({channels:[{name:'knee.left flexion'}],reference:{rootUp:[0,1,0],release:30,frames},
    parameters:{window:1,minRate:.5,maxRate:1.5}});
  const observation={height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],joints:[{angle:20,speed:0}]};
  const actual=[0,1,2].map(step=>{
    const action=policy({...observation,time:step/120});return {phase:policy.state.phase,action};
  });
  assert.deepEqual(actual,[0,1.5,3].map((phase,i)=>({phase,
    action:{kind:'muscles',velocity:[[0,2,3][i]],activation:[.4],handPoses:{}}})));
});

test('measured coupled responses distribute a posture correction and retain muscle command bounds',()=>{
  const channels=[{name:'hip.left flexion'},{name:'knee.left flexion'}];
  const reference={rootUp:[0,1,0],release:1,frames:[{kind:'muscles',velocity:[1,2],activation:[.4,.6],handPoses:{},
    angles:[1,0],speeds:[0,0],gravity:[0,1,0],height:.5}],
    responses:[{step:0,columns:[[0,0,0,0,1,1,0,0],[0,0,0,0,1,-1,0,0]]}]};
  const observation={time:0,height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],contacts:[],joints:[{angle:0,speed:0},{angle:0,speed:0}]};
  const parameters={ridge:1,responseGain:1,responseCap:2,responseRootWeight:0,responseHeightWeight:0,responseSpeedWeight:0};
  const before=structuredClone({reference,observation});
  const policy=responsePolicy({channels,reference,parameters});
  assert.deepEqual(policy(observation),{kind:'muscles',velocity:[1.25,2.25],activation:[.4,.6],handPoses:{}});
  assert.deepEqual({reference,observation},before);
  const bounded=responsePolicy({channels,reference,parameters:{...parameters,responseCap:.1}});
  assert.deepEqual(bounded(observation),{kind:'muscles',velocity:[1.1,2.1],activation:[.4,.6],handPoses:{}});
  const exact=responsePolicy({channels,reference,parameters});
  assert.deepEqual(exact({...observation,joints:[{angle:1,speed:0},{angle:0,speed:0}]}),
    {kind:'muscles',velocity:[1,2],activation:[.4,.6],handPoses:{}});
});

test('measured response momentum is local to the root and invariant to world heading',()=>{
  const observation={height:.5,contacts:[],joints:[{angle:0,speed:0}],
    segments:[{name:'lowerTrunk',rotation:[0,0,0,1],spin:[1,2,3],velocity:[-2,0,1]}]};
  const before=structuredClone(observation),features=responseFeatures(observation,true);
  assert.deepEqual(features.slice(-6),[1,2,3,-2,0,1]);assert.deepEqual(observation,before);
  const turned={...observation,segments:[{name:'lowerTrunk',rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2],
    spin:[3,2,-1],velocity:[1,0,2]}]};
  const actual=responseFeatures(turned,true);
  assert.equal(actual.length,features.length);
  actual.forEach((v,i)=>assert.ok(Math.abs(v-features[i])<1e-12));
});

test('measured disturbance growth increases feedback before the next reference transition',()=>{
  const frame={kind:'muscles',velocity:[0],activation:[.4],handPoses:{},angles:[1],speeds:[0],gravity:[0,1,0],height:.5};
  const reference={rootUp:[0,1,0],release:3,frames:[frame,frame,frame],responses:[
    {step:0,columns:[[0,0,0,0,1,0]],coastColumns:[[0,0,0,0,3,0]]},
    {step:1,columns:[[0,0,0,0,1,0]]}]};
  const policy=responsePolicy({channels:[{name:'knee.left flexion'}],reference,parameters:{ridge:1,responseGain:1,coastGain:1}});
  const observation={time:0,height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],contacts:[],joints:[{angle:1,speed:0}]};
  assert.deepEqual(policy(observation),{kind:'muscles',velocity:[0],activation:[.4],handPoses:{}});
  assert.deepEqual(policy({...observation,time:1/120,joints:[{angle:0,speed:0}]}),
    {kind:'muscles',velocity:[1],activation:[.4],handPoses:{}});
});

test('trajectory retiming scales commanded speed and velocity feedback without raising activation',()=>{
  const policy=pathPolicy({channels:[{name:'knee.left flexion'}],
    reference:{rootUp:[0,1,0],release:1,frames:[{kind:'muscles',velocity:[2],activation:[.4],handPoses:{},angles:[0],speeds:[3]}]},
    parameters:{motionRate:1.5,finiteDamping:.5}});
  assert.deepEqual(policy({time:0,height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],joints:[{angle:0,speed:1}]}),
    {kind:'muscles',velocity:[4.75],activation:[.4],handPoses:{}});
});

test('a measured continuation starts at its declared reference phase and advances by observed time',()=>{
  const frames=[0,1,2,3].map(v=>({kind:'muscles',velocity:[v],activation:[.4],handPoses:{},angles:[0],speeds:[0],gravity:[0,1,0],height:.5}));
  const policy=responsePolicy({channels:[{name:'knee.left flexion'}],
    reference:{rootUp:[0,1,0],release:4,frames,responses:[{step:0,columns:[[0,0,0,0,0,0]]},{step:2,columns:[[0,0,0,0,0,0]]}]},
    parameters:{startPhase:2,ridge:1}});
  const observation={time:100,height:.5,segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],contacts:[],joints:[{angle:0,speed:0}]};
  assert.equal(policy.state.phase,2);
  assert.deepEqual(policy(observation),{kind:'muscles',velocity:[2],activation:[.4],handPoses:{}});
  assert.equal(policy.state.sample,1);
  assert.deepEqual(policy({...observation,time:100+1/120}),{kind:'muscles',velocity:[3],activation:[.4],handPoses:{}});
  assert.ok(Math.abs(policy.state.phase-3)<1e-10);
  assert.deepEqual(policy({...observation,time:100+1/40}),{kind:'host'});
});

test('a saved prefix preserves the observation clock and verifies every step before feedback',()=>{
  const digest=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
  const channels=[{name:'knee.left flexion'}],initial={time:10,angle:0},middle={time:10+1/120,angle:1},end={time:10+2/120,angle:2};
  const action={kind:'muscles',velocity:[1],activation:[.4],handPoses:{}};
  const prefix={channels,actions:[action,action],initialObservationSha256:digest(initial),endpointObservationSha256:digest(end),
    traceSha256:createHash('sha256').update(JSON.stringify(middle)).update(JSON.stringify(end)).digest('hex')};
  const observed=[],continuation=o=>{observed.push(o);return {kind:'host'};},fallback=()=>action;
  const policy=prefixPolicy({channels,prefix,continuation,fallback});
  assert.deepEqual(policy(initial),action);assert.deepEqual(observed,[]);
  assert.deepEqual(policy(middle),action);assert.deepEqual(observed,[]);
  assert.deepEqual(policy(end),{kind:'host'});assert.deepEqual(observed,[end]);
  const later={...end,time:end.time+1/120};policy(later);assert.deepEqual(observed,[end,later]);
  assert.deepEqual(policy.state,{matched:true,steps:2,stage:'continuation'});
  const invalid=prefixPolicy({channels,prefix,continuation,fallback});invalid(initial);invalid(middle);
  assert.throws(()=>invalid({...end,angle:3}));
  const drifted=prefixPolicy({channels,prefix,continuation,fallback});drifted(initial);drifted({...middle,angle:9});
  assert.throws(()=>drifted(end),/complete physical prefix/);
  const other=prefixPolicy({channels,prefix,continuation,fallback});assert.deepEqual(other({...initial,time:11}),action);
  assert.deepEqual(other.state,{matched:false,steps:0,stage:'fallback'});
});
