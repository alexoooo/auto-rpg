import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathPolicy } from '../research/stand-up-path-policy.mjs';
import { phaseFeatures } from '../research/stand-up-phase-features.mjs';
import { libraryPolicy } from '../research/stand-up-library-policy.mjs';
import { responseFeatures, responsePolicy } from '../research/stand-up-response-policy.mjs';
import { prefixPolicy } from '../research/stand-up-prefix-response-policy.mjs';
import { createHash } from 'node:crypto';
import { mirrorReference } from '../research/stand-up-mirror-reference.mjs';

test('a recovery reference resumes muscle actions after a temporary host interval',()=>{
  const muscles={kind:'muscles',velocity:[1],activation:[.3],handPoses:{left:'open'}};
  const frame=action=>({...action,angles:[0],speeds:[0],up:[0,1,0]});
  const reference={rootUp:[0,1,0],release:3,frames:[frame(muscles),frame({kind:'host'}),frame(muscles)]};
  const policy=pathPolicy({channels:[{name:'knee.left flexion'}],reference,parameters:{}});
  const actions=[0,1,2,3].map(step=>policy({time:step/120,height:1,
    segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],joints:[{angle:0,speed:0}]}));
  assert.deepEqual(actions,[muscles,{kind:'host'},muscles,{kind:'host'}]);
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
