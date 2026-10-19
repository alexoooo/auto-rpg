import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { saveStand, loadStand } from './harness/core-stand.mjs';
import { punchCalibration, punchStand } from '../research/punch-calibration.mjs';
import { modelSpec } from '../src/core/models.ts';
import { convexHull } from '../src/core/spec/hull.ts';
import { dot } from '../src/core/spec/vec.ts';
import { PLANTED_PUNCH_EXECUTION } from '../src/core/skills/combat.ts';

test('real Warrior punches register independent impulse and exclude misses on both hands',async()=>{
  for(const hand of ['left','right'])for(const mode of ['hit','miss']) {
    const r=await punchCalibration({hand,mode,seconds:6});
    assert.equal(r.harness.engine,DEFAULT_ENGINE);assert.equal(r.assist.force,0);assert.equal(r.assist.moment,0);
    if(mode==='miss'){assert.equal(r.impacts.length,0);assert.ok(r.unassignedImpulse<1e-5);continue;}
    assert.ok(r.impacts.length>0,`${hand}: no punch met the pad: the fixture did not reach its case`);
    for(const e of r.impacts){assert.ok(e.impulse>.001);
      assert.ok(e.peakStepForce>0);assert.ok(e.effectiveMass>0);assert.ok(e.freeJointMass>0);
      assert.equal(e.preImpact.motorTorques.length,Object.keys(r.preContactTorquePeaks).length);
      assert.ok(Math.abs(e.samples.reduce((sum,s)=>sum+s.impulse,0)-e.impulse)<1e-10);}
    assert.ok(r.maximumCompression<r.apparatus.size[2]);
  }
});

test('delivered torque peaks stop at first contact even when the same swing continues after separation', async()=>{
  const s=await punchStand({armExtension:1,pad:{face:'compliant'}});
  try {
    while(!s.state.active&&s.world.time<4)s.step();
    assert.ok(s.state.active&&s.state.phase==='swing','no swing met the pad: the fixture did not reach its case');
    // The pad is knocked away as the fist meets it, so the fist leaves it while its swing goes on.
    s.sensor.body.applyImpulse(new Vector3(0,0,s.sensor.config.mass*10),s.sensor.node.position);
    const launch=s.state.launch;s.state.preContactTorquePeaks={};let separatedSwingSteps=0;
    while(s.state.launch===launch&&s.world.time<4) {
      s.step();
      if(s.state.launch!==launch)break;
      if(!s.state.active&&s.state.phase==='swing')separatedSwingSteps++;
      assert.deepEqual(s.state.preContactTorquePeaks,{});
    }
    assert.ok(separatedSwingSteps>0,'the fist never left the pad while swinging: the fixture did not reach its case');
  }finally{s.dispose();}
});

test('pad, controller and measurement histories replay a whole strike and return in a fresh world',async()=>{
 for(const face of ['rigid','compliant']) {
  const a=await punchStand({seconds:6,pad:{face}}),b=await punchStand({seconds:6,pad:{face}});
  const states=s=>({body:s.body.state,skills:s.skills.state,pad:s.sensor.state,calibration:s.state});
  try {
    while(!a.state.active&&a.world.time<4)a.step();
    assert.ok(a.state.active,`${face}: no punch met the pad: the fixture did not reach its case`);loadStand(b.world,states(b),saveStand(a.world,states(a)));
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
  assert.ok(clean.length>0,'no clean impact: the fixture did not reach its case');
  for(const e of clean){
    assert.equal(e.preImpact.pose,'fist');
    // The pad reads its deepest point, which the hull reaches by the face's penetration.
    const depth=Math.max(...e.samples.flatMap(s=>s.materialContacts.map(c=>c.penetration))),at=outsideHull(fist,e.contactGeometry.rest);
    assert.ok(at<.001&&at>-depth-.001,`contact ${e.contactGeometry.rest} ${at} m from the fist hull, penetration ${depth}`);
    assert.ok(e.contactGeometry.offset>.02,'the hull lands off the strike point');
  }
});
