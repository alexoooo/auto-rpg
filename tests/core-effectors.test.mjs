import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { modelSpec } from '../src/core/human/spec.ts';
import { motorControl } from '../src/core/control/motor.ts';
import { bodyEffectors } from '../src/core/control/effectors.ts';
import { pointAtToRef, rotationAtToRef } from '../src/core/control/kinematics.ts';
import { spinBetweenToRef } from '../src/core/math/turn.ts';
import { driveMuscles } from '../src/core/muscle/driver.ts';
import { createBody } from '../src/core/body.ts';
import { createPolicyBody } from '../src/core/mind/direct.ts';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';

const spec = () => modelSpec('workshop-fighter');
const options = {engine:'rapier-coordinate',gravity:false,ground:false,pinned:'lowerTrunk',hz:960};

function rig(s) {
 const motor=motorControl(s.built,.1),driver=driveMuscles(s.built,s.world,motor.control);
 return {motor,driver,dispose:()=>driver.dispose()};
}
function target(d) {
 const pose={};
 for(const f of d.free)pose[f.name]=Math.max(f.min,Math.min(f.max,.2));
 const angles=d.chain.map(j=>j.dofs.map(f=>pose[`${j.spec.name} ${f.spec.positive}`]??0));
 const position=pointAtToRef(d.chain,angles,d.points.get(d.model.point),new Vector3());
 const rotation=new Quaternion(),part=new Quaternion();
 for(let j=0;j<d.chain.length;j++)rotation.multiplyInPlace(rotationAtToRef(d.chain[j],angles[j],part));
 return {pose,goal:{places:[{point:d.model.point,position:position.asArray()}],seconds:.3,
  initialVelocity:[0,0,0],terminalVelocity:[0,0,0],orientation:{target:rotation.asArray(),seconds:.3}}};
}

test('the same bounded tracker places and orients each hand and foot through physical joint chains',async()=>{
 for(const name of ['hand.left','hand.right','foot.left','foot.right']){
  const s=await coreStand(spec(),options),r=rig(s),d=bodyEffectors(s.built).find(d=>d.model.segment===name),t=target(d);
  try{
   assert.ok(Object.isFrozen(d.model));assert.ok(Object.isFrozen(d.model.points[d.model.point]));
   assert.equal(d.model.channels.length,name.startsWith('hand')?7:6);
   r.motor.setPosture(t.pose);r.motor.reachEffector(name,t.goal);s.step(1920);
   const at=r.motor.effectorPointToRef(name,d.model.point,new Vector3());
   assert.ok(Vector3.Distance(at,new Vector3(...t.goal.places[0].position))<.002,`${name}: ${at.asArray()}`);
   const part=s.built.segments.get(name),turn=part.node.rotationQuaternion.multiply(Quaternion.Inverse(part.rest));
   assert.ok(spinBetweenToRef(turn,new Quaternion(...t.goal.orientation.target),1,new Vector3()).length()<.01,name);
   assert.ok(Array.from(r.driver.pulled).every(Number.isFinite));
  }finally{r.dispose();s.dispose();}
 }
});

test('a moving oriented foot path forks into a fresh world and reset releases every endpoint',async()=>{
 const a=await coreStand(spec(),options),b=await coreStand(spec(),options),ra=rig(a),rb=rig(b);
 try{
  const t=target(bodyEffectors(a.built).find(d=>d.model.segment==='foot.left'));
  ra.motor.setPosture(t.pose);ra.motor.reachEffector('foot.left',t.goal);a.step(120);
  const states=r=>({motor:r.motor.state,driver:r.driver.state});
  loadStand(b.world,states(rb),saveStand(a.world,states(ra)));a.step(240);b.step(240);
  assert.deepEqual(saveStand(a.world,states(ra)).state,saveStand(b.world,states(rb)).state);
  assert.deepEqual(a.built.segments.get('foot.left').node.position.asArray(),b.built.segments.get('foot.left').node.position.asArray());
  ra.motor.reset();assert.ok(Object.values(ra.motor.state.effectors).every(m=>m.goal===null));
 }finally{ra.dispose();rb.dispose();a.dispose();b.dispose();}
});

test('ownership refuses a reach on a bearing foot before accepting commands and policy capabilities are detached',async()=>{
 const s=await coreStand(spec(),{engine:'rapier-coordinate'});
 let body,policy,model;
 try{
  policy=createPolicyBody(s.built,s.world,m=>{model=m;return {name:'capabilities',state:{},step:()=>({kind:'torque',torque:m.channels.map(()=>0)})};});
  assert.deepEqual(model.effectors.map(e=>e.segment),['hand.left','foot.left','hand.right','foot.right']);
  assert.ok(model.effectors.every(e=>Object.isFrozen(e)&&!('body' in e)));
  policy.dispose();policy=null;
  body=createBody(s.built,s.world,{servoSeconds:.1,handFeedback:true});
  const point=body.view.effectors['foot.left'].points.strike.asArray();
  body.drive(()=>({posture:{},pushes:[],hands:{left:null,right:null},
   stance:{feet:['left','right'],centre:null,height:.8,heading:0},effectors:{'foot.left':{places:[{point:'strike',position:point}],seconds:.3}}}));
  assert.throws(()=>s.step(),/two controllers own foot.left/);
  assert.deepEqual(body.view.effectors['foot.left'].points.strike.asArray(),point);
 }finally{policy?.dispose();body?.dispose();s.dispose();}
});

test('named effector memory changes the continuation and body observations survive a load',async()=>{
 for(const name of ['hand.left','foot.left']){
  const s=await coreStand(spec(),options),r=rig(s);
  try{
   const t=target(bodyEffectors(s.built).find(d=>d.model.segment===name));
   r.motor.setPosture(t.pose);r.motor.reachEffector(name,t.goal);s.step(120);
   const states={motor:r.motor.state,driver:r.driver.state},saved=saveStand(s.world,states);
   s.step(32);const expected=s.built.segments.get(name).node.position.asArray();
   const changes={goal:m=>{m.goal=null;},from:m=>{m.from[0][2]+=.02;},time:m=>{m.time+=.1;},
    fromRotation:m=>{m.fromRotation=[.1,0,0,Math.sqrt(.99)];}};
   for(const [field,change]of Object.entries(changes)){
    loadStand(s.world,states,saved);change(r.motor.state.effectors[name]);s.step(32);
    assert.notDeepEqual(s.built.segments.get(name).node.position.asArray(),expected,`${name} ${field}`);
   }
   loadStand(s.world,states,saved);r.motor.reachEffector(name,{...t.goal,orientation:undefined});s.step(16);
   const loose=saveStand(s.world,states);s.step(1);const unaltered=r.motor.state.effectors[name].angles;
   loadStand(s.world,states,loose);r.motor.state.effectors[name].angles.at(-1)[0]+=.1;s.step(1);
   assert.notDeepEqual(r.motor.state.effectors[name].angles,unaltered,`${name} solve seed`);
  }finally{r.dispose();s.dispose();}
 }
 const a=await coreStand(spec(),options),b=await coreStand(spec(),options);
 const ba=createBody(a.built,a.world,{servoSeconds:.1,measuring:true}),bb=createBody(b.built,b.world,{servoSeconds:.1,measuring:true});
 try{
  const t=target(bodyEffectors(a.built).find(d=>d.model.segment==='foot.left'));
  const command={posture:t.pose,pushes:[],hands:{left:null,right:null},stance:null,effectors:{'foot.left':t.goal}};
  ba.drive(()=>command);bb.drive(()=>command);a.step(120);
  const saved=saveStand(a.world,{body:ba.state});loadStand(b.world,{body:bb.state},saved);
  assert.deepEqual(bb.view.effectors,ba.view.effectors);a.step(32);b.step(32);
  assert.deepEqual(saveStand(a.world,{body:ba.state}).state,saveStand(b.world,{body:bb.state}).state);
  loadStand(b.world,{body:bb.state},saved);bb.state.mind.host.effectorGoals['foot.left']=null;b.step(32);
  assert.notDeepEqual(b.built.segments.get('foot.left').node.position.asArray(),a.built.segments.get('foot.left').node.position.asArray());
 }finally{ba.dispose();bb.dispose();a.dispose();b.dispose();}
});
