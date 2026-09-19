import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/glTFFileLoader.js';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { Golem } from '../src/golem/golem.ts';
import { defaultGolemSetup } from '../src/golem/build.ts';
import { proofIntent, stepProofGolem } from '../src/art-proof/motion.ts';
import { dressGolem } from '../src/art-proof/presenter.ts';
import { validateRoomPlacements } from '../src/arena-room.ts';
const manifest=JSON.parse(await readFile(new URL('../public/assets/art-proof/manifest.json',import.meta.url),'utf8'));
const source=JSON.parse(await readFile(new URL('../assets/art-proof/source.json',import.meta.url),'utf8'));
const glb=await readFile(new URL('../public/assets/art-proof/golem.glb',import.meta.url));

async function fixture(upgraded) {
  const arena=await createHeadlessArena();const {scene}=arena;
  let clock=0;
  const golem=new Golem(scene,{side:'left',origin:Vector3.Zero(),facing:Math.PI,setup:defaultGolemSetup(),
    mind:{name:'proof',decide:()=>proofIntent(clock)},controlPolicies:[]});
  const container=await LoadAssetContainerAsync(new Uint8Array(glb),scene,{pluginExtension:'.glb'});
  container.addAllToScene();
  const templates=new Map();
  for(const mesh of container.meshes) {
    if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
    mesh.bakeTransformIntoVertices(mesh.computeWorldMatrix(true).clone());mesh.parent=null;
    mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();mesh.setEnabled(false);
    templates.set(mesh.name,mesh);
  }
  const materials=Object.fromEntries(['stone','bronze','steel','rune','wood'].map(k=>[k,new StandardMaterial(k,scene)]));
  const casters=new Set();const shadows={addShadowCaster:m=>casters.add(m),removeShadowCaster:m=>casters.delete(m)};
  const before=scene.getPhysicsEngine().getPhysicsPlugin().numBodies;
  const presenter=dressGolem(golem,templates,manifest,materials,shadows);presenter.show(upgraded);
  scene.onBeforePhysicsObservable.add(()=>{stepProofGolem(golem,1/240,clock);clock+=1/240;});
  const run=seconds=>{for(let i=0;i<Math.round(seconds*60);i++){scene._renderId++;scene._advancePhysicsEngineStep(1000/60);}};
  return {...arena,golem,templates,presenter,materials,shadows,before,run,
    dispose(){presenter.dispose();golem.dispose();arena.dispose();}};
}

test('modeled assets cover registered parts and preserve physical state over the whole motion sequence',async()=>{
  const runs=[];
  for(const upgraded of [false,true]) {
    const f=await fixture(upgraded);
    try {
      assert.equal(f.scene.getPhysicsEngine().getPhysicsPlugin().numBodies,f.before);
      const bindings=f.golem.visualParts();assert.equal(bindings.length,f.golem.limbs.length);
      assert.ok(Object.isFrozen(bindings));assert.ok(bindings.every(Object.isFrozen));
      assert.equal(f.presenter.meshes.length,manifest.parts.length);
      for(const binding of bindings) {
        assert.ok(f.golem.limbs.some(l=>l.part.mesh===binding.host&&l===binding.damage));
        assert.ok(binding.host.isEnabled());
      }
      // Import handedness and modelling must preserve the original local envelope, not just counts.
      for(const row of source.parts){
        const mesh=f.templates.get(row.asset), box=mesh.getBoundingInfo().boundingBox;
        const ext=box.extendSize.scale(2).asArray();
        for(let axis=0;axis<3;axis++) {
          assert.ok(ext[axis]<=row.extents[axis]+.012,`${row.asset} expands outside source on ${axis}`);
          assert.ok(ext[axis]>=row.extents[axis]*.75,`${row.asset} collapsed on ${axis}`);
        }
      }
      const samples=[];
      for(let i=0;i<16;i++) {
        f.run(1);
        samples.push(f.golem.limbs.map(l=>({key:l.key,p:l.part.mesh.position.asArray(),q:l.part.mesh.rotationQuaternion.asArray(),health:l.health,
          membership:l.part.shape.filterMembershipMask,collides:l.part.shape.filterCollideMask})));
      }
      runs.push(samples);
      const positions=samples.map(s=>s[0].p);
      assert.ok(Math.max(...positions.map(p=>p[2]))-Math.min(...positions.map(p=>p[2]))>.1,'fixture must actually walk');
      const settled=f.golem.limbs[0].part.mesh.position.clone();
      f.run(32);
      assert.ok(Vector3.Distance(settled,f.golem.limbs[0].part.mesh.position)<.05,'completed demo must stay in frame');
      f.presenter.show(!upgraded);f.presenter.show(upgraded);
      assert.equal(f.scene.getPhysicsEngine().getPhysicsPlugin().numBodies,f.before);
    } finally {f.dispose();}
  }
  assert.deepEqual(runs[1],runs[0],'graphics may not change a physical sample');
});

test('presenter refuses incomplete assets and cleans up its partial attachment',async()=>{
  const f=await fixture(true);
  try {
    f.presenter.dispose();
    const count=f.scene.meshes.length;
    const broken={...manifest,parts:manifest.parts.slice(0,-1)};
    assert.throws(()=>dressGolem(f.golem,f.templates,broken,f.materials,f.shadows),/Missing modeled part/);
    assert.equal(f.scene.meshes.length,count);
    assert.equal(f.scene.getPhysicsEngine().getPhysicsPlugin().numBodies,f.before);
    const one=f.golem.visualParts()[0];const limb=f.golem.limbs.find(l=>l.part.mesh===one.host);
    limb.health*=.5;assert.equal(one.damage.health,limb.health,'damage binding must be live');
  } finally {f.dispose();}
});

test('proof scenery requires explicit collider registration',()=>{
  const group={role:'wall',metresPerRepeat:1,placements:[{name:'forge',role:'wall',position:[0,1,0],halfExtent:[1,1,1],rotationY:0,solid:true,collider:'proof.wall'}]};
  assert.deepEqual(validateRoomPlacements([group],new Set(['proof.wall'])),[]);
  assert.match(validateRoomPlacements([group],new Set()).join(','),/missing collider/);
  assert.match(validateRoomPlacements([{...group,placements:[{...group.placements[0],collider:null}]}],new Set()).join(','),/below reach/);
});
