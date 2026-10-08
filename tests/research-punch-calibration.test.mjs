import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { createWorld } from '../src/core/world.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { saveStand, loadStand } from './harness/core-stand.mjs';
import { punchPad } from '../research/punch-pad.mjs';
import { punchCalibration, punchStand, approachSpeed, coarseForces } from '../research/punch-calibration.mjs';
import { modelSpec } from '../src/core/models.ts';
import { convexHull } from '../src/core/spec/hull.ts';
import { dot } from '../src/core/spec/vec.ts';
import { PLANTED_PUNCH_EXECUTION } from '../src/core/skills/combat.ts';

async function apparatus(hz, settings={}) {
  const rendering=new NullEngine(),scene=new Scene(rendering),world=createWorld(scene,await loadEngine(DEFAULT_ENGINE),{hz});
  const pad=punchPad(world,[0,1,0],settings);
  return {world,pad,scene,dispose(){pad.dispose();world.dispose();scene.dispose();rendering.dispose();}};
}

test('pad momentum excludes known mount loads, gravity and native substep count',async()=>{
  for(const hz of [120,960]) {
    const s=await apparatus(hz);
    try {
      s.pad.body.applyImpulse(new Vector3(0,0,8),s.pad.node.position);
      let maximum=0,compression=0;
      for(let i=0;i<hz/2;i++) {
        s.pad.prepare();s.world.step();const r=s.pad.read();
        maximum=Math.max(maximum,Math.abs(r.impulse));compression=Math.max(compression,r.displacement);
        assert.equal(r.contacts.length,0);assert.ok(Number.isFinite(r.force));
      }
      assert.ok(compression>.002,`${hz}: the mount actually moves`);
      assert.ok(maximum<1e-5,`${hz}: spurious contact impulse ${maximum}`);
      assert.equal(s.pad.node.position.y,1);assert.equal(s.pad.node.position.x,0);
    }finally{s.dispose();}
  }
});

test('complete collision impulse agrees with analytic reduced mass and both bodies momentum, in both directions',async()=>{
  for(const hz of [120,960])for(const sense of [-1,1]) {
    const s=await apparatus(hz,{stiffness:0}),node=new TransformNode('striker',s.scene);
    node.position.set(0,1,sense===1?-.3:.41);node.rotationQuaternion=Quaternion.Identity();
    const mass=3,speed=8;
    const body=s.world.physics.addBody(node,[{kind:'sphere',centre:[0,0,0],radius:.05}],
      {mass,centre:[0,0,0],moments:[.003,.003,.003],orientation:Quaternion.Identity()},{ccd:true});
    body.rigid.setGravityScale(0,true);body.applyImpulse(new Vector3(0,0,sense*mass*speed),node.position);
    const velocity=new Vector3();let impulse=0,native=0;
    try {
      for(let i=0;i<hz/10;i++){s.pad.prepare();s.world.step();const r=s.pad.read();impulse+=r.impulse;native+=r.narrowImpulse;}
      const expected=sense*mass*s.pad.config.mass/(mass+s.pad.config.mass)*speed;
      const lost=mass*(sense*speed-body.linearVelocityToRef(velocity).z);
      assert.ok(Math.abs(impulse-expected)<.001,`${hz}/${sense}: ${impulse} vs ${expected}`);
      assert.ok(Math.abs(impulse-lost)<.001,`${hz}/${sense}: sensor ${impulse}, striker loss ${lost}, narrow phase ${native}`);
      assert.ok(Math.abs(body.linearVelocityToRef(velocity).z-s.pad.body.linearVelocityToRef(new Vector3()).z)<.001);
    }finally{s.dispose();}
  }
});

test('approach speed measures the final distance traversal and coarse force integrates fine impulses',()=>{
  const history=[{time:0,point:[0,0,0]},{time:.01,point:[0,0,.04]},{time:.02,point:[0,0,.12]},{time:.03,point:[0,0,.2]}];
  assert.ok(Math.abs(approachSpeed(history)-8)<1e-12);
  assert.equal(approachSpeed(history.slice(0,2)),null);
  assert.throws(()=>approachSpeed(history,0),/distance/);
  const samples=Array.from({length:16},(_,i)=>({time:(i+1)/960,impulse:i===2?2:0}));
  assert.deepEqual(coarseForces(samples,960),[{time:1/120,impulse:2,force:240},{time:2/120,impulse:0,force:0}]);
  assert.throws(()=>coarseForces(samples,125),/nesting/);
});

test('real Warrior punches register independent impulse, exclude misses and leave verified returns on both hands',async()=>{
  for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
    const r=await punchCalibration({hand,mode,seconds:6});
    assert.equal(r.harness.engine,DEFAULT_ENGINE);assert.equal(r.fell,false);assert.equal(r.floorContacts,0);
    assert.equal(r.cycles.failed,0);assert.ok(r.cycles.returned[hand]>=3);
    assert.equal(r.assist.force,0);assert.equal(r.assist.moment,0);
    if(mode==='miss'){assert.equal(r.impacts.length,0);assert.ok(r.unassignedImpulse<1e-5);continue;}
    assert.ok(r.impacts.length>=3);assert.ok(r.impacts.filter(e=>e.impulse>.5).length>=2);
    for(const e of r.impacts){assert.equal(e.eligible,true);assert.ok(e.impulse>.001);assert.ok(e.last10cmSpeed>2);
      assert.ok(e.peakStepForce>0);assert.ok(e.effectiveMass>0);assert.ok(e.freeJointMass>0);
      assert.equal(e.preImpact.motorTorques.length,Object.keys(r.preContactTorquePeaks).length);
      assert.ok(Math.abs(e.samples.reduce((sum,s)=>sum+s.impulse,0)-e.impulse)<1e-10);}
    assert.ok(r.maximumCompression<r.apparatus.size[2]);
  }
});

test('compliant faces resist the real hand, conserve applied contact impulse and avoid a rigid impact spike', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
  for(const hand of ['left','right']) {
    const r=await punchCalibration({hand,seconds:4,armExtension:1,contactSpeed:5,pad:{face:'compliant'}});
    assert.equal(r.fell,false);assert.equal(r.floorContacts,0);assert.equal(r.cycles.failed,0);
    assert.ok(r.cycles.returned[hand]>=1);assert.ok(r.impacts.length>=2);
    assert.ok(r.maximumFaceCompression>.01&&r.maximumFaceCompression<.07);
    for(const sample of r.samples) {
      const force=sample.materialContacts.reduce((sum,c)=>sum+c.force,0);
      assert.ok(Math.abs(sample.force-force)<.01,`force balance ${sample.force} vs ${force}`);
      assert.equal(sample.narrowImpulse,0);
    }
    for(const e of r.impacts){assert.equal(e.contacts.includes(`hand.${hand}`),true);
      assert.ok(e.peakStepForce>100&&e.peakStepForce<1000);assert.ok(e.impulse>1);}
  }
});

test('delivered torque peaks stop at first contact even when the same swing continues after separation', {
  todo: "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to",
}, async()=>{
  const s=await punchStand({armExtension:1,pad:{face:'compliant'}});
  try {
    while(!s.state.active&&s.world.time<4)s.step();
    assert.ok(s.state.active);
    const launch=s.state.launch;s.state.preContactTorquePeaks={};let separatedSwingSteps=0;
    while(s.state.launch===launch&&s.world.time<4) {
      s.step();
      if(s.state.launch!==launch)break;
      if(!s.state.active&&s.state.phase==='swing')separatedSwingSteps++;
      assert.deepEqual(s.state.preContactTorquePeaks,{});
    }
    assert.ok(separatedSwingSteps>0,'the fixture actually separates while its launched stroke continues');
  }finally{s.dispose();}
});

test('pad, controller and measurement histories replay a whole strike and return in a fresh world',async()=>{
 for(const face of ['rigid','compliant']) {
  const a=await punchStand({seconds:6,pad:{face}}),b=await punchStand({seconds:6,pad:{face}});
  const states=s=>({body:s.body.state,skills:s.skills.state,pad:s.sensor.state,calibration:s.state});
  try {
    while(!a.state.active&&a.world.time<4)a.step();
    assert.ok(a.state.active);loadStand(b.world,states(b),saveStand(a.world,states(a)));
    a.step(240);b.step(240);
    assert.deepEqual(a.reading(),b.reading());
    assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
  }finally{a.dispose();b.dispose();}
 }
});

/** How far a point stands outside a hull, m: its largest signed distance past a face's plane. */
const outsideHull=(shape,point)=>Math.max(...convexHull(shape.points.map(p=>p.value)).planes.map(({normal,offset})=>dot(normal,point)-offset));

test('the closed fist strikes the pad with its measured hull, within its penetration of the surface and away from its strike point',async()=>{
  const r=await punchCalibration({hand:'right',family:'straight',hz:120,seconds:8,armExtension:.5,actuation:'directional',ahead:.55,height:1.55,
    execution:PLANTED_PUNCH_EXECUTION,matchedFeedback:true,paths:{elbowExtension:.5},pad:{face:'compliant'}});
  assert.equal(r.fell,false);
  const fist=modelSpec('workshop-fighter').segments.find(s=>s.name==='hand.right').handPoses.fist;
  assert.equal(fist.kind,'hull');
  const clean=r.impacts.filter(e=>e.eligible);
  assert.ok(clean.length>=3);
  for(const e of clean){
    assert.equal(e.preImpact.pose,'fist');
    // The pad reads its deepest point, which the hull reaches by the face's penetration.
    const depth=Math.max(...e.samples.flatMap(s=>s.materialContacts.map(c=>c.penetration))),at=outsideHull(fist,e.contactGeometry.rest);
    assert.ok(at<.001&&at>-depth-.001,`contact ${e.contactGeometry.rest} ${at} m from the fist hull, penetration ${depth}`);
    assert.ok(e.contactGeometry.offset>.02,'the hull lands off the strike point');
  }
});
