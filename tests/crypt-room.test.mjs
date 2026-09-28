import {CRYPT_FURNITURE} from '../src/dungeon/crypt-archetypes.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companionSpawn} from '../src/dungeon/party-placement.ts';
import {generateCryptRoom} from '../src/dungeon/crypt-room.ts';
import {walkable,findPath} from '../src/dungeon/map.ts';
import {createHeadlessArena} from './harness/golem-headless-arena.mjs';
import {buildDungeonWorld} from '../src/dungeon/world.ts';

const manifest=JSON.parse(readFileSync(new URL('../assets/crypt-kit/manifest.json',import.meta.url)));
test('100 crypt seeds are reproducible, varied, reachable and within the art budget',()=>{
  const shapes=new Set(),doors=new Set();
  for(let seed=0;seed<100;seed++){
    const p=generateCryptRoom(seed),m=p.map;
    assert.deepEqual(p,generateCryptRoom(seed));
    shapes.add(`${p.bounds.max.x},${p.bounds.max.z}`);doors.add(JSON.stringify(m.doors[0].point));
    assert.equal(m.spawns.length,3);assert.equal(p.torches.length,2);
    for(const at of [m.start,m.exit,...m.spawns]){
      assert.ok(walkable(m,at,.65),`${seed}: ${JSON.stringify(at)}`);
      assert.ok(findPath(m,m.start,at,.65).length);
    }
    const party=[m.start];for(let i=0;i<3;i++){const at=companionSpawn(m,party);assert.ok(at,`${seed}: companion ${i}`);party.push(at);}
    let triangles=0;
    for(const placement of p.placements){
      const pieces=Object.entries(manifest.pieces).filter(([name])=>name.startsWith(placement.piece+'__'));
      assert.ok(pieces.length,placement.piece);triangles+=pieces.reduce((n,[,v])=>n+v.triangles,0);
    }
    assert.ok(triangles<=130000,`${seed}: ${triangles} triangles`);
    const tomb=p.placements.find(p=>p.piece==='tomb'),o=m.obstacles[0];
    assert.equal(tomb.x,o.x);assert.equal(tomb.z,o.z);
    assert.equal(o.width,tomb.turn?1.15:2.5);assert.equal(o.depth,tomb.turn?2.5:1.15);
  }
  assert.equal(shapes.size,9);assert.ok(doors.size>20);
});

test('crypt kit has baked origins, valid normals, colours and a bounded tomb',()=>{
  const bytes=readFileSync(new URL('../public/assets/crypt-kit/kit.glb',import.meta.url));
  const n=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+n));
  const read=i=>{const a=g.accessors[i],v=g.bufferViews[a.bufferView],width={VEC2:2,VEC3:3,VEC4:4}[a.type];
    assert.ok([5126,5121].includes(a.componentType));
    const bytesPer=a.componentType===5126?4:1;
    return Array.from({length:a.count},(_,j)=>Array.from({length:width},(_,k)=>a.componentType===5126?bytes.readFloatLE(28+n+(v.byteOffset??0)+(a.byteOffset??0)+j*(v.byteStride??width*bytesPer)+k*bytesPer):bytes.readUInt8(28+n+(v.byteOffset??0)+(a.byteOffset??0)+j*(v.byteStride??width)+k)/255));};
  for(const node of g.nodes){
    assert.equal(node.rotation,undefined);assert.equal(node.translation,undefined);assert.equal(node.scale,undefined);
    for(const p of g.meshes[node.mesh].primitives){
      for(const normal of read(p.attributes.NORMAL))assert.ok(Math.abs(Math.hypot(...normal)-1)<.001);
      for(const colour of read(p.attributes.COLOR_0))assert.ok(colour.every(v=>v>=0&&v<=1));
      for(const uv of read(p.attributes.TEXCOORD_0))assert.ok(uv.every(Number.isFinite));
      const footprint=CRYPT_FURNITURE[node.name.split('__')[0]];
      if(footprint){
        const a=g.accessors[p.attributes.POSITION],[w,d,h]=footprint;
        assert.ok(a.min[0]>=-w/2-.001&&a.max[0]<=w/2+.001,node.name+' width');
        assert.ok(a.min[2]>=-d/2-.001&&a.max[2]<=d/2+.001,node.name+' depth');
        assert.ok(a.min[1]>=-.001&&a.max[1]<=h+.001,node.name+' height');
      }
      if(node.name==='tomb__tomb'){
        const a=g.accessors[p.attributes.POSITION];
        a.min.forEach((v,i)=>assert.ok(Math.abs(v-[-1.25,0,-.575][i])<.001));
        a.max.forEach((v,i)=>assert.ok(Math.abs(v-[1.25,1.1,.575][i])<.001));
      }
      if(node.name.startsWith('wall__')||node.name.startsWith('corner-')||node.name.startsWith('niche__')){
        const a=g.accessors[p.attributes.POSITION],half=node.name.startsWith('niche__')?1.5:.5;
        assert.ok(a.min[0]>=-half-.001&&a.max[0]<=half+.001,'wall module crosses its allocated cells');
        assert.ok(a.min[2]>=-.501&&a.max[2]<=.501,'solid wall ornament escapes its rock footprint');
      }
      if(node.name.startsWith('paving'))assert.ok(g.accessors[p.attributes.POSITION].max[1]<.005);
    }
  }
});

test('generated crypt doors open and decorative surfaces add no physics bodies',async()=>{
  const arena=await createHeadlessArena({populateDefaultGeometry:false});
  try{
    const counts=[];
    for(const visuals of [false,true]){
      const map=generateCryptRoom(12).map,world=buildDungeonWorld(arena.scene,map,visuals);
      counts.push(arena.scene.meshes.filter(m=>m.physicsBody).length);
      world.openNearby([map.doors[0].point]);assert.equal(map.doors[0].open,true);
      for(const leaf of world.doorVisuals)assert.equal(leaf.wood.isVisible,false);
      world.dispose();
    }
    assert.equal(counts[0],counts[1]);
  }finally{arena.dispose();}
});
