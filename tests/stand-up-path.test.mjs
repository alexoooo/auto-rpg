import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathPolicy } from '../research/stand-up-path-policy.mjs';
import { phaseFeatures } from '../research/stand-up-phase-features.mjs';

test('a recovery reference resumes muscle actions after a temporary host interval',()=>{
  const muscles={kind:'muscles',velocity:[1],activation:[.3],handPoses:{left:'open'}};
  const frame=action=>({...action,angles:[0],speeds:[0],up:[0,1,0]});
  const reference={rootUp:[0,1,0],release:3,frames:[frame(muscles),frame({kind:'host'}),frame(muscles)]};
  const policy=pathPolicy({channels:[{name:'knee.left flexion'}],reference,parameters:{}});
  const actions=[0,1,2,3].map(step=>policy({time:step/120,height:1,
    segments:[{name:'lowerTrunk',rotation:[0,0,0,1]}],joints:[{angle:0,speed:0}]}));
  assert.deepEqual(actions,[muscles,{kind:'host'},muscles,{kind:'host'}]);
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
