import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {coreStand} from './harness/core-stand.mjs';
import {modelSpec} from '../src/core/human/spec.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {GUARD} from '../src/core/skills/guard.ts';
import {lowsOf} from '../src/core/control/ground.ts';
import {handShapeAt} from '../src/core/spec/body.ts';
import {pointOfToRef} from '../src/core/control/support.ts';
import {punchPad} from '../research/punch-pad.mjs';
const foremost=(segment,shape)=>lowsOf(shape,segment.frame).map(p=>{
 const v=pointOfToRef(segment,p.at,new Vector3());v.z+=p.radius;return v;
}).sort((a,b)=>b.z-a.z)[0];

test('the compliant pad cannot push the open fingertips of a physically closed hand',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE}),body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS});
 body.drive(()=>({posture:GUARD,hands:{left:null,right:null},pushes:[],stance:{feet:['left','right'],centre:null,height:1,heading:0}}));
 let pad;
 try {
  s.step(240);s.built.handPoses.request([{hand:'right',pose:'fist'}]);s.step();
  const hand=s.built.segments.get('hand.right');assert.equal(hand.handPose.applied,'fist');
  const closed=foremost(hand,handShapeAt(s.built.spec,hand.spec,'fist')),
    open=foremost(hand,handShapeAt(s.built.spec,hand.spec,'open'));
  assert.ok(open.z-closed.z>.03,'the fixture distinguishes the two real envelopes');
  pad=punchPad(s.world,[closed.x,closed.y,(open.z+closed.z)/2],{face:'compliant',stiffness:0});
  pad.prepare();pad.load(hand);
  assert.deepEqual(pad.state.materialContacts,[]);s.step();assert.ok(Math.abs(pad.read().impulse)<1e-12);
 }finally{pad?.dispose();body.dispose();s.dispose();}
});

test('box-foot compression loads the real surface and the independent pad momentum agrees',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,position:[0,1,0],ground:false,gravity:false});let pad;
 try {
  const foot=s.built.segments.get('foot.right');assert.equal(foot.spec.shape.kind,'box');
  const surface=foremost(foot,foot.spec.shape);
  pad=punchPad(s.world,[surface.x,surface.y,surface.z-.002],{face:'compliant',stiffness:0,faceDamping:0});
  pad.prepare();pad.load(foot);
  const contact=pad.state.materialContacts[0];assert.ok(contact);
  assert.deepEqual(contact.point,surface.asArray());assert.ok(Math.abs(contact.force-20)<1e-10);
  // Rapier stores velocity in float32; the balance permits its rounding of this 1/6 N s pulse.
  s.step();const reading=pad.read();assert.ok(Math.abs(reading.impulse-contact.force*s.world.dt)<1e-7,JSON.stringify({reading,contact,dt:s.world.dt}));
 }finally{pad?.dispose();s.dispose();}
});
