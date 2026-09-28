import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCryptDungeon} from '../src/dungeon/crypt-dungeon.ts';
import {CRYPT_PAVING} from '../src/dungeon/crypt-room.ts';
import {canSee,walkable} from '../src/dungeon/map.ts';
import {revealScenery} from '../src/dungeon/scenery-visibility.ts';
import {fogMask,fogSample} from '../src/dungeon/fog.ts';
import {EnemyHover} from '../src/dungeon/hover.ts';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';

test('mixed paving covers each floor cell exactly once, including the reported seed',()=>{
  for(const seed of [2124530852,...Array.from({length:30},(_,i)=>i)]){
    const p=generateCryptDungeon(seed),coverage=new Uint8Array(p.map.floor.length),types=new Set();
    for(const tile of p.placements){
      if(!CRYPT_PAVING[tile.piece])continue;
      types.add(tile.piece);let [w,d]=CRYPT_PAVING[tile.piece];if(Math.abs(Math.sin(tile.turn))>.5)[w,d]=[d,w];
      for(let z=tile.z-(d-1)/2;z<=tile.z+(d-1)/2;z++)for(let x=tile.x-(w-1)/2;x<=tile.x+(w-1)/2;x++)coverage[z*p.map.size+x]++;
    }
    assert.deepEqual(coverage,p.map.floor,`seed ${seed}`);
    for(const kind of ['slabs-long','slabs-large','slabs-broken'])assert.ok(types.has(kind));
    assert.ok(p.placements.some(p=>p.piece==='wall-panel'));assert.ok(p.placements.some(p=>p.piece==='wall-pier'));
  }
});

test('open racks block movement but not sight; columns remain opaque',()=>{
  const m=generateCryptDungeon(2124530852).map;
  for(const kind of ['rack','column']){
    const o=m.obstacles.find(o=>o.id.includes(`.${kind}.`));
    const a={x:o.x,z:o.z-o.depth/2-.3},b={x:o.x,z:o.z+o.depth/2+.3};
    assert.equal(walkable(m,o,0),false);
    assert.equal(canSee(m,a,b),kind==='rack');
  }
});

function room(){const size=11,floor=new Uint8Array(size*size);
  for(let z=1;z<10;z++)for(let x=1;x<10;x++)floor[z*size+x]=1;
  return {size,floor,rooms:[{id:0,min:{x:1,z:1},max:{x:9,z:9},centre:{x:5,z:5}}],doors:[],obstacles:[],start:{x:1,z:1}};}
test('scenery fills a small enclosed gap but not a room edge or opaque obstacle',()=>{
  const m=room(),gap=5*m.size+5,edge=1*m.size+5;
  const explored=new Set([...m.floor.keys()].filter(i=>m.floor[i]&&i!==gap&&i!==edge)),before=new Set(explored);
  // Observer outside range isolates gap filling from coverage sampling.
  const memory=revealScenery(m,{x:100,z:100},new Set(),explored,new Set());
  assert.ok(memory.has(gap));assert.ok(!memory.has(edge));assert.deepEqual(explored,before);
  m.obstacles=[{x:5,z:5,width:1,depth:1,height:3,blocksSight:true}];
  assert.ok(!revealScenery(m,{x:100,z:100},new Set(),explored,new Set()).has(gap));
});
test('coverage sampling preserves memory and does not reveal through a closed door',()=>{
  const m=room();for(let z=1;z<10;z++)m.floor[z*m.size+5]=0;
  for(let z=4;z<=6;z++)m.floor[z*m.size+5]=1;
  m.doors=[{id:0,point:{x:5,z:5},axis:'x',open:false}];
  const explored=new Set(),visible=new Set(),memory=new Set();
  revealScenery(m,{x:3,z:5},visible,explored,memory);
  assert.ok(memory.has(5*m.size+3));assert.ok(!memory.has(5*m.size+7));
  assert.equal(explored.size,0);assert.equal(visible.size,0);
  m.doors[0].open=true;revealScenery(m,{x:3,z:5},visible,explored,memory);
  assert.ok(memory.has(5*m.size+7));
  revealScenery(m,{x:100,z:100},visible,explored,memory);assert.ok(memory.has(5*m.size+7));
});
test('hover highlights visible costume only and releases its layer on teardown',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  try{const a=MeshBuilder.CreateBox('body',{},scene),b=MeshBuilder.CreateBox('hidden',{},scene),hover=new EnemyHover();
    b.isVisible=false;const material=a.material;
    hover.show({meshes:[{mesh:a,visible:true},{mesh:b,visible:false}]});
    const layer=scene.getHighlightLayerByName('dungeon.enemy-hover');
    assert.ok(layer.hasMesh(a));assert.equal(layer.hasMesh(b),false);assert.equal(a.material,material);
    a.isVisible=false;hover.show({meshes:[{mesh:a,visible:true}]});assert.equal(layer.hasMesh(a),false);assert.equal(layer.isEnabled,false);
    a.isVisible=true;hover.show({meshes:[{mesh:a,visible:true}]});hover.clear();
    assert.equal(layer.hasMesh(a),false);assert.equal(layer.isEnabled,false);
    hover.dispose();assert.equal(scene.getHighlightLayerByName('dungeon.enemy-hover'),null);
  }finally{scene.dispose();engine.dispose();}
});

test('fog darkens smoothly inside the known edge without drawing unexplored tiles',()=>{
  const m=room(),known=new Set();for(let z=1;z<10;z++)for(let x=1;x<=5;x++)known.add(z*m.size+x);
  const mask=fogMask(m,known,known),samples=[5,5.1,5.2,5.3,5.4,5.49].map(x=>fogSample(m,mask,x,5));
  assert.equal(samples[0].edge,1);assert.ok(samples.at(-1).edge<.01);
  for(let i=1;i<samples.length;i++)assert.ok(samples[i].edge<=samples[i-1].edge);
  assert.equal(fogSample(m,mask,5.51,5).drawn,false);
});

test('an opaque column is drawn beside seen floor instead of leaving a black square',()=>{
  const m=room(),key=5*m.size+5;m.obstacles=[{x:5,z:5,width:.8,depth:.8,height:2.65,blocksSight:true}];
  const seen=new Set([key-1]),mask=fogMask(m,seen,seen);
  assert.equal(mask[key],255);assert.equal(seen.has(key),false);
  assert.equal(canSee(m,{x:4,z:5},{x:6,z:5}),false);
  assert.equal(fogMask(m,new Set(),new Set())[key],0);
});
