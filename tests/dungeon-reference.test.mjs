import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { createHash } from 'node:crypto';
import { referenceChamber } from '../src/dungeon/reference.ts';
import { walkable, clearSegment, canSee, findPath } from '../src/dungeon/map.ts';
import { buildDungeonWorld } from '../src/dungeon/world.ts';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { DungeonRun } from '../src/dungeon/run.ts';
import { freshIntent } from '../src/action-primitives.ts';
import { CONFIG } from '../src/config.ts';

function exportedChamber() {
  const bytes=readFileSync(new URL('../public/assets/dungeon-reference/chamber.glb',import.meta.url));
  const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
  const read=index=>{
    const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView],count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const size=a.componentType===5123?2:4,offset=28+length+(view.byteOffset??0)+(a.byteOffset??0);
    const method=a.componentType===5126?'readFloatLE':a.componentType===5123?'readUInt16LE':'readUInt32LE';
    return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,c)=>bytes[method](offset+i*(view.byteStride??size*count)+c*size)));
  };
  return {gltf,read};
}

test('exported stone colours are valid greys and authored maps match their provenance hashes',()=>{
  const {gltf,read}=exportedChamber();
  for(const mesh of gltf.meshes) for(const p of mesh.primitives) {
    assert.notEqual(p.attributes.COLOR_0,undefined,mesh.name);
    for(const [r,g,b] of read(p.attributes.COLOR_0)) {
      assert.ok(r>=0 && r<=1,`${mesh.name}: invalid colour ${r}`);
      assert.equal(r,g);assert.equal(g,b); // Also catches Blender UV writes corrupting corner colours.
    }
  }
  const manifest=JSON.parse(readFileSync(new URL('../assets/dungeon-reference/manifest.json',import.meta.url)));
  assert.ok(manifest.triangles<130848,'art refinement must stay below the previous triangle count');
  for(const map of manifest.textures) {
    const bytes=readFileSync(new URL('../public/assets/dungeon-reference/'+map.file,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),map.sha256);
  }
});

test('exported blind arches have actual depth and the working portal preserves its clearance',()=>{
  const {gltf,read}=exportedChamber(),triangles=[];
  for(const node of gltf.nodes) {
    if(!['reference.wall','reference.trim','reference.iron'].includes(node.name))continue;
    assert.equal(node.rotation,undefined);assert.equal(node.scale,undefined);
    for(const p of gltf.meshes[node.mesh].primitives) {
      const vertices=read(p.attributes.POSITION).map(v=>Vector3.FromArray(v.map((x,i)=>x+(node.translation?.[i]??0))));
      const indices=read(p.indices).flat();
      for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(j=>vertices[j]));
    }
  }
  const distance=(origin,direction)=>{
    const ray=new Ray(Vector3.FromArray(origin),Vector3.FromArray(direction));let nearest=Infinity;
    for(const t of triangles){const hit=ray.intersectsTriangle(...t);if(hit && hit.distance>=0)nearest=Math.min(nearest,hit.distance);}
    return nearest;
  };
  const recess=distance([4.5,1.15,6],[-1,0,0]),pier=distance([4.5,1.15,6.95],[-1,0,0]);
  assert.ok(Number.isFinite(recess) && recess-pier>.3,`recess ${recess}, pier ${pier}`);
  const eastFace=distance([15,1.195,7],[1,0,0]),eastJoint=distance([15,1.365,7],[1,0,0]);
  assert.ok(eastJoint-eastFace>.03,'opposite-wall masonry must project in front of its mortar core');
  // Cast short rays through the aperture: the far corridor wall is allowed, a false arch header is not.
  for(const x of [7.55,9,10.45])for(const y of [.2,1.2,2.48])
    assert.ok(distance([x,y,13.45],[0,0,1])>1.1,`portal obstruction at ${x}, ${y}`);
});

test('rotated arch stones retain two-dimensional texture coordinates',()=>{
  const {gltf,read}=exportedChamber();
  const node=gltf.nodes.find(n=>n.name==='reference.trim');
  for(const p of gltf.meshes[node.mesh].primitives) {
    const positions=read(p.attributes.POSITION).map(v=>Vector3.FromArray(v)),uvs=read(p.attributes.TEXCOORD_0),indices=read(p.indices).flat();
    for(let i=0;i<indices.length;i+=3) {
      const [a,b,c]=indices.slice(i,i+3),area=Vector3.Cross(positions[b].subtract(positions[a]),positions[c].subtract(positions[a])).length();
      if(area<1e-7)continue;
      const [u,v,w]=[uvs[a],uvs[b],uvs[c]],uvArea=Math.abs((v[0]-u[0])*(w[1]-u[1])-(w[0]-u[0])*(v[1]-u[1]));
      assert.ok(uvArea>1e-10,`trim triangle ${i/3} collapses to a texture stripe`);
    }
  }
});

test('door presentation references are the meshes hidden by authoritative opening',async()=>{
  const arena=await createHeadlessArena({populateDefaultGeometry:false});
  try {
    const map=referenceChamber(),world=buildDungeonWorld(arena.scene,map,true);
    assert.equal(world.doorVisuals.length,1);
    const {wood,iron}=world.doorVisuals[0];assert.ok(wood.isVisible && iron.isVisible);
    world.openNearby([{x:9,z:13}]);assert.equal(map.doors[0].open,true);
    assert.equal(wood.isVisible,false);assert.equal(iron.isVisible,false);
    world.dispose();
  }finally {arena.dispose();}
});

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


test('flat moss patches face the room lights rather than the underside of the floor',()=>{
  const {gltf,read}=exportedChamber();
  const node=gltf.nodes.find(n=>n.name==='reference.earth'); let samples=0;
  for(const p of gltf.meshes[node.mesh].primitives) {
    const positions=read(p.attributes.POSITION),normals=read(p.attributes.NORMAL);
    positions.forEach((v,i)=>{
      if(Math.abs(v[1]-.005)<1e-6 || Math.abs(v[1]-2.856)<1e-6) {
        samples++; assert.ok(normals[i][1]>.99,`downward patch at ${v}`);
      }
    });
  }
  assert.ok(samples>100,'must inspect actual exported surface patches');
});
