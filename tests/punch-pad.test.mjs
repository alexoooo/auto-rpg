/**
 * **The punch pad as an instrument** (`research/punch-pad.mjs`, `research/punch-calibration.mjs`):
 * the impulse it reads is the contact's alone, agrees with momentum, and the readings derived from
 * a strike's history.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { createWorld } from '../src/core/world.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { punchPad } from '../research/punch-pad.mjs';
import { approachSpeed, coarseForces } from '../research/punch-calibration.mjs';

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
