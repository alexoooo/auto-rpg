import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CRYPT_FURNITURE} from '../src/dungeon/crypt-archetypes.ts';
import {generateCryptDungeon} from '../src/dungeon/crypt-dungeon.ts';
import {CRYPT_PAVING} from '../src/dungeon/crypt-room.ts';

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
      if(node.name.startsWith('wall')||node.name.startsWith('corner-')||node.name.startsWith('niche__')){
        const a=g.accessors[p.attributes.POSITION],half=node.name.startsWith('niche__')?1.5:.5;
        assert.ok(a.min[0]>=-half-.001&&a.max[0]<=half+.001,'wall module crosses its allocated cells');
        assert.ok(a.min[2]>=-.501&&a.max[2]<=.501,'solid wall ornament escapes its rock footprint');
      }
      const paving=CRYPT_PAVING[node.name.split('__')[0]];
      if(paving){
        const a=g.accessors[p.attributes.POSITION];
        assert.ok(a.max[1]<=.01&&a.min[1]>=-.07,node.name+' shallow relief');
        assert.ok(a.min[0]>=-paving[0]/2-.001&&a.max[0]<=paving[0]/2+.001,node.name+' paving width');
        assert.ok(a.min[2]>=-paving[1]/2-.001&&a.max[2]<=paving[1]/2+.001,node.name+' paving depth');
      }
    }
  }
});

/** The most triangles a generated crypt may place, measured over these seeds (docs/art/crypt.md, Random Crypt). */
const TRIANGLE_BUDGET = 420000;

test('a generated crypt places only pieces the kit has, within the triangle budget', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/crypt-kit/manifest.json', import.meta.url)));
  const trianglesOf = new Map();
  for (const [name, part] of Object.entries(manifest.pieces)) {
    const piece = name.split('__')[0];
    trianglesOf.set(piece, (trianglesOf.get(piece) ?? 0) + part.triangles);
  }
  for (let seed = 0; seed < 100; seed++) {
    let triangles = 0;
    for (const placement of generateCryptDungeon(seed).placements) {
      assert.ok(trianglesOf.has(placement.piece), `seed ${seed} places '${placement.piece}', which the kit lacks`);
      triangles += trianglesOf.get(placement.piece);
    }
    assert.ok(triangles <= TRIANGLE_BUDGET, `seed ${seed} places ${triangles} triangles, over the budget`);
  }
});
