import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { referenceChamber } from '../src/dungeon/reference.ts';
import { walkable, clearSegment, canSee, findPath } from '../src/dungeon/map.ts';
import { buildDungeonWorld } from '../src/dungeon/world.ts';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { DungeonRun } from '../src/dungeon/run.ts';
import { freshIntent } from '../src/action-primitives.ts';
import { CONFIG } from '../src/config.ts';

test('exported tomb fits its gameplay box and flagstone crowns stay on the support plane', () => {
  const bytes=readFileSync(new URL('../public/assets/dungeon-reference/chamber.glb',import.meta.url));
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const bounds=name=>{
    const node=gltf.nodes.find(n=>n.name===name);assert.ok(node,name);
    assert.equal(node.rotation,undefined);assert.equal(node.scale,undefined);
    const primitive=gltf.meshes[node.mesh].primitives[0],accessor=gltf.accessors[primitive.attributes.POSITION];
    return {min:accessor.min.map((v,i)=>v+(node.translation?.[i]??0)),max:accessor.max.map((v,i)=>v+(node.translation?.[i]??0))};
  };
  const tomb=bounds('reference.tomb'),o=referenceChamber().obstacles[0];
  for(const [actual,expected] of [[tomb.min,[o.x-o.width/2,0,o.z-o.depth/2]],[tomb.max,[o.x+o.width/2,o.height,o.z+o.depth/2]]])
    actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<.001,`${value} != ${expected[i]}`));
  const floor=bounds('reference.floor');assert.ok(floor.max[1]>=0 && floor.max[1]<.005);
});

test('reference chamber routes around its tomb, sees over it, and keeps the exit door authoritative', () => {
  const map=referenceChamber();
  for(const p of [map.start,map.exit,...map.spawns]) assert.ok(walkable(map,p,.5),JSON.stringify(p));
  const a={x:10,z:6.6},b={x:15,z:6.6};
  assert.equal(clearSegment(map,a,b,.35),false);
  assert.equal(canSee(map,a,b),true);
  const route=findPath(map,a,b,.35);assert.ok(route.length>1);
  let last=a;for(const next of route){assert.ok(clearSegment(map,last,next,.35));last=next;}
  map.obstacles[0].blocksSight=true;assert.equal(canSee(map,a,b),false);
  map.obstacles=[];assert.equal(clearSegment(map,a,b,.35),true);
  assert.ok(findPath(map,map.start,map.exit,.5).length);
  assert.equal(canSee(map,{x:9,z:13},{x:9,z:15}),false);
  map.doors[0].open=true;assert.equal(canSee(map,{x:9,z:13},{x:9,z:15}),true);
});

test('reference tomb blocks physical rays below its lid equally with and without visual surfaces', async () => {
  const arena=await createHeadlessArena({populateDefaultGeometry:false});
  try {
    let expected;
    for(const visuals of [false,true]) {
      const world=buildDungeonWorld(arena.scene,referenceChamber(),visuals);
      arena.scene._renderId++;arena.scene._advancePhysicsEngineStep(1000/60);
      const bodies=arena.scene.meshes.filter(m=>m.physicsBody).map(m=>m.name).sort();
      if(expected)assert.deepEqual(bodies,expected);else expected=bodies;
      const physics=arena.scene.getPhysicsEngine();
      const low=physics.raycast(new Vector3(10,.6,6.6),new Vector3(15,.6,6.6));
      assert.ok(low.hasHit);assert.equal(low.body.transformNode.name,'reference.sarcophagus');
      assert.equal(physics.raycast(new Vector3(10,1.3,6.6),new Vector3(15,1.3,6.6)).hasHit,false);
      world.dispose();
      assert.equal(arena.scene.meshes.filter(m=>m.physicsBody).length,0);
    }
  } finally {arena.dispose();}
});

test('reference geometry permits a real rogue shot against controlled non-attacking targets', async () => {
  const arena=await createHeadlessArena({populateDefaultGeometry:false});
  let run;
  try {
    const map=referenceChamber();map.spawns=[{x:map.start.x,z:map.start.z+3.8}];
    run=new DungeonRun(arena.scene,271828,'workshop-rogue',false,map,undefined,[],()=> 'human-unarmed');
    for(const enemy of run.enemies) enemy.policy={name:'idle',decide:()=>freshIntent()};
    run.commands.order={kind:'lock',target:'enemy-0'};run.commands.revision++;
    arena.scene.onBeforePhysicsObservable.add(()=>run.step(1/CONFIG.world.physicsHz));
    const shots=()=>run.hero.body.strikers.filter(s=>s.kind==='arrow').reduce((sum,s)=>sum+s.shotSerial,0);
    assert.equal(shots(),0,'preallocated arrows are not released shots');
    for(let i=0;i<1200 && shots()===0;i++) {arena.scene._renderId++;arena.scene._advancePhysicsEngineStep(1000/60);}
    assert.ok(shots()>0,'the encounter must exercise a bow release, not just its carry pose');
  } finally {run?.dispose();arena.dispose();}
});
