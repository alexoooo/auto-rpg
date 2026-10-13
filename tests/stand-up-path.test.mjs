import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
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
import { contactBalanceTarget, contactPolicy } from '../research/stand-up-contact-policy.mjs';
import { contactEffort, contactFrameFeedback } from '../research/stand-up-contact-effort.mjs';

test('explicit contact postures blend reference coordinates through bounded muscle commands',()=>{
  const side={peak:10,curve:{unloadedSpeed:10,curvature:.25,eccentricCeiling:1.5,eccentricSlopeRatio:2}};
  const model={gravity:[0,-10,0],rootRest:[0,0,0,1],referenceAngles:[0],standing:1,friction:.8,
    segments:[{name:'lowerTrunk',mass:1},{name:'foot.left',mass:1,rest:[0,0,0,1]}],
    channels:[{name:'joint',min:-1,max:1,bind:.3,positive:side,negative:side}],
    joints:[{parent:'lowerTrunk',dofs:[{sign:1}],axes:{x:[0,0,1],y:[1,0,0],z:[0,1,0]},
      parentRestInverse:[0,0,0,1],pivot:[0,0,0],descendants:['foot.left']}]};
  const o={time:0,centre:[.25,0,0],contacts:[],
    segments:[{name:'lowerTrunk',position:[0,0,0],centre:[0,0,0],rotation:[0,0,0,1],velocity:[0,0,0],spin:[0,0,0]},
      {name:'foot.left',centre:[.5,0,0],velocity:[0,0,0],rotation:[0,0,0,1]}],joints:[{angle:0,speed:0}]};
  const parameters={postureTarget:{joint:.2},postureSeconds:1},before=structuredClone(parameters);
  const policy=contactPolicy({model,parameters}),ordinary=contactPolicy({model});
  assert.deepEqual(policy(o),ordinary(o));
  assert.deepEqual(policy({...o,time:.5}).activation,[.55]);
  assert.deepEqual(policy({...o,time:1}).activation,[.6]);
  assert.deepEqual(policy({...o,time:2}).velocity,['+inf']);
  assert.deepEqual(parameters,before);
  for(const target of [{joint:2},{other:.2},{joint:NaN},{}])
    assert.throws(()=>contactPolicy({model,parameters:{postureTarget:target}}),/every bounded channel/);
  assert.throws(()=>contactPolicy({model,parameters:{...parameters,postureTo:'reference'}}),/no named destination/);
  assert.throws(()=>contactPolicy({model,parameters:{...parameters,postureSeconds:0}}),/positive finite time/);
  assert.throws(()=>contactPolicy({model,parameters:{centreTarget:[0,NaN,0]}}),/finite coordinates/);
  assert.throws(()=>contactPolicy({model,parameters:{rootTarget:[0,0,0,2]}}),/unit quaternion/);
  const loaded={...o,contacts:[{segment:'foot.left',fixed:'floor',impulse:1,normal:[0,-1,0],point:[.5,0,0]}]};
  const requested={...parameters,centreTarget:[.5,.1,0],rootTarget:[0,0,.6,.8]};
  const a=contactPolicy({model,parameters:requested});
  const b=contactPolicy({model,parameters:{...requested,rootTarget:requested.rootTarget.map(v=>-v)}});
  for(const time of [0,.5,1])assert.deepEqual(a({...loaded,time}),b({...loaded,time}));
  assert.deepEqual(a.state.requestedForce,[4,26,0]);
  assert.deepEqual(loaded.centre,[.25,0,0]);
  const strong=contactPolicy({model,parameters:{...parameters,poseGains:{joint:10}}});
  strong(o);assert.deepEqual(strong({...o,time:1}).activation,[1]);
  const observed=contactPolicy({model,parameters:{...parameters,posture:'observed'}});
  const displaced={...o,joints:[{angle:.4,speed:0}]};
  assert.deepEqual(observed(displaced).activation,[.5]);
  assert.ok(Math.abs(observed({...displaced,time:.5}).activation[0]-.45)<1e-12);
  assert.deepEqual(observed.state.initialAngles,[.4]);
  assert.deepEqual(observed({...displaced,time:1}).activation,[.4]);
  const held=contactPolicy({model,parameters:{posture:'observed'}});
  assert.deepEqual(held(displaced).activation,[.5]);
  assert.ok(Math.abs(held({...displaced,time:1,joints:[{angle:.5,speed:0}]}).activation[0]-.45)<1e-12);
  const bounded=contactPolicy({model,parameters:{posture:'observed'}});
  bounded({...o,joints:[{angle:2,speed:0}]});assert.deepEqual(bounded.state.initialAngles,[1]);
  assert.equal(displaced.joints[0].angle,.4);
  const sequence=contactPolicy({model,parameters:{sequence:[
    {parameters:{posture:'observed',centreTarget:[.25,0,0]},advance:{after:.5,foot:'foot.left',centreTolerance:.05,hold:.2,loadFraction:.2}},
    {parameters:{...parameters,posture:'observed'}}]}});
  sequence(loaded);
  const edge={...loaded,time:.5,segments:loaded.segments.map(s=>s.name==='foot.left'?{...s,rotation:[1,0,0,0]}:s)};
  sequence(edge);assert.equal(sequence.state.readySince,null);
  sequence({...loaded,time:.6});assert.equal(sequence.state.readySince,.6);
  sequence({...loaded,time:.7,centre:[.4,0,0]});assert.equal(sequence.state.readySince,null);
  sequence({...loaded,time:.8});
  sequence({...loaded,time:.9,contacts:[]});assert.equal(sequence.state.readySince,null);
  sequence({...loaded,time:.95,contacts:loaded.contacts.map(c=>({...c,impulse:.001}))});assert.equal(sequence.state.readySince,null);
  sequence({...loaded,time:1});sequence({...loaded,time:1.21});
  assert.equal(sequence.state.stageIndex,1);assert.equal(sequence.state.stageStarted,1.21);
  assert.deepEqual(sequence.state.switches,[{time:1.21,stage:1}]);
  assert.deepEqual(sequence.state.stages[1].initialAngles,[0]);
  assert.throws(()=>contactPolicy({model,parameters:{sequence:[]}}),/requires stages/);
  assert.throws(()=>contactPolicy({model,parameters:{sequence:[{parameters:{sequence:[]}}]}}),/cannot nest/);
  assert.throws(()=>contactPolicy({model,parameters:{sequence:[{parameters:{},advance:{after:0}}]}}),/bounded timing/);
  assert.throws(()=>contactPolicy({model,parameters:{sequence:[{parameters:{},advance:{after:1,loadFraction:.2}}]}}),/defined support target/);
  assert.throws(()=>contactPolicy({model,parameters:{poseGains:{absent:1}}}),/known channels/);
  assert.throws(()=>contactPolicy({model,parameters:{poseGains:{joint:-1}}}),/nonnegative/);
  assert.throws(()=>contactPolicy({model,parameters:{additionalSupports:['absent']}}),/known body segments/);
  assert.throws(()=>contactPolicy({model,parameters:{additionalSupports:'foot.left'}}),/known body segments/);
  const rootContact={segment:'lowerTrunk',fixed:'floor',impulse:1,normal:[0,-1,0],point:[0,0,0]};
  const propped={...loaded,contacts:[...loaded.contacts,rootContact]},saved=structuredClone(propped);
  const defaults=contactPolicy({model}),explicit=contactPolicy({model,parameters:{additionalSupports:[]}});
  assert.deepEqual(defaults(propped),explicit(propped));
  assert.deepEqual(defaults.state.contacts,['foot.left']);
  const admitted=contactPolicy({model,parameters:{additionalSupports:['lowerTrunk']}});
  const action=admitted(propped);
  assert.deepEqual(admitted.state.contacts,['foot.left','lowerTrunk']);
  assert.notDeepEqual(action,defaults(propped),'the observed extra support changes the muscle reaction allocation');
  for(const absent of [{...rootContact,impulse:0},{...rootContact,fixed:null},{...rootContact,normal:[0,1,0]}]) {
    admitted({...propped,contacts:[loaded.contacts[0],absent]});
    assert.deepEqual(admitted.state.contacts,['foot.left'],'naming a segment cannot manufacture support');
  }
  assert.deepEqual(propped,saved,'allocation does not change the physical observation');
  const transfer=contactPolicy({model,parameters:{sequence:[
    {parameters:{additionalSupports:['lowerTrunk']},advance:{after:.5,contact:'lowerTrunk',loadFraction:.2,hold:.1}},
    {parameters:{posture:'observed'}}]}});
  transfer(propped);
  transfer({...propped,time:.5,contacts:[loaded.contacts[0],{...rootContact,impulse:.001}]});
  assert.equal(transfer.state.readySince,null,'positive contact below the load threshold cannot advance');
  transfer({...propped,time:.6});assert.equal(transfer.state.readySince,.6);
  transfer({...propped,time:.65,contacts:loaded.contacts});assert.equal(transfer.state.readySince,null);
  transfer({...propped,time:.7});transfer({...propped,time:.81});
  assert.deepEqual(transfer.state.switches,[{time:.81,stage:1}]);
  assert.throws(()=>contactPolicy({model,parameters:{sequence:[{parameters:{},advance:{after:1,contact:'absent'}}]}}),/defined support target/);
  const turned=structuredClone(o),q=Quaternion.RotationAxis(Vector3.Forward(),.2);
  turned.joints[0]={angle:.2,speed:0};
  turned.segments[1].rotation=q.asArray();turned.segments[1].spin=[0,0,0];
  turned.segments[1].centre=new Vector3(.5,0,0).applyRotationQuaternion(q).asArray();
  turned.centre=turned.segments[1].centre.map(v=>v/2);
  const orientationTargets={'foot.left':{rotation:[0,0,0,1],gain:2,damping:.1}};
  const oriented=contactPolicy({model,parameters:{feedforward:0,poseGain:0,poseDamping:0,orientationTargets}});
  const correction=oriented(turned);
  assert.ok(Math.abs(oriented.state.frameTorque[0]+4)<1e-12);
  assert.deepEqual(correction.velocity,['-inf']);assert.ok(Math.abs(correction.activation[0]-.4)<1e-12);
  const allocator=contactEffort(model,turned,[],[],[.2],{feedforward:0,poseGain:0,poseDamping:0,orientationTargets});
  assert.ok(Math.abs(allocator.t0[0]/allocator.scales[0]-oriented.state.torque[0])<1e-12);
  const spinning={...turned,segments:turned.segments.map(s=>s.name==='foot.left'?{...s,spin:[0,0,3]}:s)};
  assert.ok(Math.abs(contactFrameFeedback(model,spinning,{orientationTargets})[0]+.7)<1e-12);
  const worldTurn=Quaternion.RotationAxis(Vector3.Up(),.9),rotated=structuredClone(turned);
  for(const s of rotated.segments) {
    s.rotation=worldTurn.multiply(new Quaternion(...s.rotation)).asArray();
    s.centre=new Vector3(...s.centre).applyRotationQuaternion(worldTurn).asArray();
  }
  const global={'foot.left':{...orientationTargets['foot.left'],rotation:worldTurn.asArray()}};
  assert.ok(Math.abs(contactFrameFeedback(model,rotated,{orientationTargets:global})[0]+.4)<1e-12);
  const opposite={'foot.left':{...global['foot.left'],rotation:global['foot.left'].rotation.map(v=>-v)}};
  assert.deepEqual(contactFrameFeedback(model,rotated,{orientationTargets:global}),contactFrameFeedback(model,rotated,{orientationTargets:opposite}));
  for(const bad of [{absent:orientationTargets['foot.left']},{'foot.left':{rotation:[0,0,0,2],gain:1,damping:0}},{'foot.left':{rotation:[0,0,0,1],gain:-1,damping:0}}])
    assert.throws(()=>contactFrameFeedback(model,turned,{orientationTargets:bad}),/actuated segment/);
  turned.segments[1].position=[0,0,0];
  const positionTargets={'foot.left':{at:[.5,0,0],target:[.5,0,0],gain:2,damping:0}};
  const displacement=contactFrameFeedback(model,turned,{positionTargets})[0];
  assert.ok(Math.abs(displacement+.5*Math.sin(.2))<1e-12,'the point Jacobian corrects the displaced point through the hinge');
  const settings={feedforward:0,poseGain:0,poseDamping:0,orientationTargets,positionTargets};
  const positioned=contactPolicy({model,parameters:settings});positioned(turned);
  const combined=contactEffort(model,turned,[],[],[.2],settings);
  assert.ok(Math.abs(combined.t0[0]/combined.scales[0]-positioned.state.torque[0])<1e-12);
  assert.ok(Math.abs(positioned.state.frameTorque[0]-10*(displacement-.4))<1e-12);
  const fastPoint={...turned,segments:turned.segments.map(s=>s.name==='foot.left'?{...s,velocity:[0,1,0]}:s)};
  const damped={'foot.left':{...positionTargets['foot.left'],gain:0,damping:1}};
  assert.ok(Math.abs(contactFrameFeedback(model,fastPoint,{positionTargets:damped})[0]+.5*Math.cos(.2))<1e-12);
  const strongPoint={'foot.left':{...positionTargets['foot.left'],gain:1000}};
  assert.deepEqual(contactPolicy({model,parameters:{...settings,positionTargets:strongPoint}})(turned).activation,[1]);
  assert.throws(()=>contactFrameFeedback(model,turned,{positionTargets:{'foot.left':{...positionTargets['foot.left'],at:[0]}}}),/finite points/);
  assert.throws(()=>contactPolicy({model,parameters:{linearInertia:1}}),/must be boolean/);
  const inertial=contactPolicy({model,parameters:{linearInertia:true,poseGain:0,poseDamping:0,effortScale:1}});
  assert.deepEqual(inertial(o),{kind:'muscles',activation:[0],velocity:[0],handPoses:{left:'open',right:'open'}},
    'a freely falling joint needs no torque to counter uniform gravity');
  assert.deepEqual(inertial.state.linearAcceleration,[0,-10,0]);
  assert.deepEqual(inertial.state.gravityTorque,[5]);assert.deepEqual(inertial.state.inertiaTorque,[-5]);
  for(const supported of [loaded,propped]) {
    const moving=contactPolicy({model,parameters:{linearInertia:true,poseGain:0,poseDamping:0,effortScale:1,additionalSupports:['lowerTrunk']}});
    const command=moving(supported);
    assert.ok(moving.state.effortPredictionError<1e-12,'the coupled allocation predicts the delivered command');
    assert.ok(command.activation.every(v=>v>=0&&v<=1));
    const expected=.5*(moving.state.linearAcceleration[1]+10);
    assert.ok(Math.abs(moving.state.gravityTorque[0]+moving.state.inertiaTorque[0]-expected)<1e-12);
  }
  const disabled=contactPolicy({model,parameters:{linearInertia:false}});
  assert.deepEqual(disabled(loaded),contactPolicy({model})(loaded));
});

test('contact effort carries gravity and descendant ground forces in the muscle sense at speed',()=>{
  const side={peak:10,curve:{unloadedSpeed:10,curvature:.25,eccentricCeiling:1.5,eccentricSlopeRatio:2}};
  const model={gravity:[0,-10,0],segments:[{name:'root',mass:1},{name:'link',mass:1}],channels:[{name:'joint',positive:side,negative:side}],
    joints:[{parent:'root',dofs:[{sign:1}],axes:{x:[0,0,1],y:[1,0,0],z:[0,1,0]},
      parentRestInverse:[0,0,0,1],pivot:[0,0,0],descendants:['link']}]};
  const o={segments:[{name:'root',position:[0,0,0],centre:[0,0,0],rotation:[0,0,0,1]},
    {name:'link',centre:[.5,0,0]}],joints:[{angle:0,speed:0}]};
  const patches=[{at:new Vector3(1,0,0)},{at:new Vector3(-1,0,0)}],owners=['link','root'];
  const a=contactEffort(model,o,patches,owners,[0]);
  assert.deepEqual([...a.t0],[10]);assert.deepEqual([...a.C],[0,2,0,0,0,0,0,0,0,0,0,0]);
  assert.equal((a.t0[0]-a.C[1]*4)/a.scales[0],1);
  assert.equal(contactEffort(model,o,patches,owners,[.2]).t0[0],12);
  assert.equal(contactEffort(model,o,patches,owners,[.2],{poseGains:{joint:2}}).t0[0],18);
  const fast=contactEffort(model,{...o,joints:[{angle:0,speed:10}]},patches,owners,[0]);
  assert.ok(fast.C[1]>a.C[1]&&[...fast.C,...fast.t0].every(Number.isFinite));
  const inertial=contactEffort(model,o,patches,owners,[0],{linearInertia:true});
  assert.deepEqual([...inertial.t0],[0]);
  assert.deepEqual([...inertial.C],[0,1.5,0,0,0,0,0,-.5,0,0,0,0]);
  const torque=(left,right)=>(inertial.t0[0]-inertial.C[1]*left-inertial.C[7]*right)/inertial.scales[0];
  assert.equal(torque(4,16),1,'weight-balanced reactions recover the static joint torque');
  assert.equal(torque(4,0),-3,'partial support includes the downward acceleration of the descendant mass');
  assert.equal(torque(0,40),10,'a reaction outside this joint subtree accelerates its descendant');
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
