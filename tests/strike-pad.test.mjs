import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {coreStand} from './harness/core-stand.mjs';
import {modelSpec} from '../src/core/models.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {GUARD} from '../src/core/skills/guard.ts';
import {lowsOf} from '../src/core/control/ground.ts';
import {handShapeAt} from '../src/core/spec/body.ts';
import {pointOfToRef} from '../src/core/control/support.ts';
import {punchPad} from '../research/punch-pad.mjs';
import {padSurface} from '../research/pad-surface.mjs';
const foremost=(segment,shape)=>lowsOf(shape,segment.frame).map(p=>{
 const v=pointOfToRef(segment,p.at,new Vector3());v.z+=p.radius;return v;
}).sort((a,b)=>b.z-a.z)[0];

test('the compliant pad cannot push the open fingertips of a physically closed hand',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE}),body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS});
 body.drive(()=>({posture:GUARD,pushes:[],stance:{feet:['left','right'],centre:null,height:1,heading:0}}));
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

test('a finite pad loads a rotated box face even when every leading corner misses its window',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,ground:false,gravity:false});
 const node=new TransformNode('clipped-box',s.scene);node.rotationQuaternion=Quaternion.RotationAxis(Vector3.Up(),Math.PI/6);
 const rigid=s.world.physics.addBody(node,[{kind:'box',centre:[0,0,0],size:[2,2,2]}],
  {mass:3,centre:[0,0,0],moments:[2,2,2],orientation:Quaternion.Identity()});
 const frame={origin:[0,0,0],x:[1,0,0],y:[0,1,0],z:[0,0,1]},shape={kind:'box',centre:{value:[0,0,0]},size:{value:[2,2,2]}};
 const segment={node,body:rigid,rest:Quaternion.Identity(),frame,rigid:{shapes:[shape],centre:[0,0,0]},spec:{name:'clipped-box'}};
 const xAxis=new Vector3(1,0,0).applyRotationQuaternionToRef(node.rotationQuaternion,new Vector3()),
   zAxis=new Vector3(0,0,1).applyRotationQuaternionToRef(node.rotationQuaternion,new Vector3());
 const bounds=[.78,.82,-.02,.02],surface=padSurface(segment,bounds),expected=zAxis.z+xAxis.z*(.78-zAxis.x)/xAxis.x;
 let pad;
 try {
  assert.ok(surface);assert.ok(Math.abs(surface[0]-.78)<1e-12);assert.ok(Math.abs(surface[2]-expected)<1e-12,JSON.stringify({surface,expected,xAxis,zAxis}));
  const front=foremost(segment,shape);assert.ok(front.x<bounds[0]);
  pad=punchPad(s.world,[.8,0,expected-.002],{face:'compliant',size:[.04,.04,.11],stiffness:0,faceDamping:0});
  pad.prepare();pad.load(segment);const contact=pad.state.materialContacts[0];assert.ok(contact);
  assert.ok(Math.abs(contact.force-20)<1e-10);s.step();
  assert.ok(Math.abs(pad.read().impulse-contact.force*s.world.dt)<1e-7);
  assert.equal(padSurface(segment,[3,4,3,4]),null);
 }finally{pad?.dispose();s.world.physics.removeBody(rigid);node.dispose();s.dispose();}
});

test('the clipped rounded surface includes a capsule shaft and a sphere beside the window',async()=>{
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,ground:false,gravity:false});
 const node=new TransformNode('rounded-window',s.scene);node.rotationQuaternion=Quaternion.Identity();
 const segment={node,rest:Quaternion.Identity(),frame:{origin:[0,0,0],x:[1,0,0],y:[0,1,0],z:[0,0,1]},rigid:{shapes:[]}};
 try {
  segment.rigid.shapes=[{kind:'capsule',from:{value:[-1,0,0]},to:{value:[1,0,0]},radius:{value:.1}}];
  const shaft=padSurface(segment,[-.02,.02,-.02,.02]);assert.ok(shaft);assert.ok(Math.abs(shaft[2]-.1)<1e-12);
  segment.rigid.shapes=[{kind:'sphere',centre:{value:[.06,0,0]},radius:{value:.1}}];
  const cap=padSurface(segment,[-.05,.05,-.05,.05]);assert.ok(cap);
  assert.ok(Math.abs(cap[0]-.05)<1e-12);assert.ok(Math.abs(cap[2]-Math.sqrt(.01-.0001))<1e-12);
  segment.rigid.shapes=[{kind:'hull',points:[[-1,-1,-1],[-1,1,1],[1,-1,1],[1,1,-1]].map(value=>({value}))}];
  const hull=padSurface(segment,[-.02,.02,-.02,.02]);assert.ok(hull);assert.ok(Math.abs(hull[2]-1)<1e-12);
 }finally{node.dispose();s.dispose();}
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
