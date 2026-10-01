import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {visiblePart,clipFor} from '../src/character-lab/catalog.ts';
import {surface} from '../scripts/character-lab/contact.mjs';
import {skinRegions,gripDistances,gripGap,contactPatch} from '../scripts/character-lab/validation.mjs';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
for(const id of ['fighter','rogue']) test(`character workshop: ${id} loadouts and real motion`,async()=>{
 const engine=new NullEngine();const scene=new Scene(engine);
 try{
  const bytes=await readFile(new URL(`../public/assets/character-lab/${id}.glb`,import.meta.url));
  const asset=await LoadAssetContainerAsync(bytes,scene,{pluginExtension:'.glb'});asset.addAllToScene();
  const meshes=asset.meshes.filter(m=>m.getTotalVertices());
  assert.ok(meshes.every(m=>m.skeleton),'every visible part has skin bindings');
  for(const boots of [false,true])for(const armour of [false,true])for(const weapon of ['empty','sword','shield','sword-shield','bow']){
   const kit={boots,armour,weapon};const actual=new Set(meshes.filter(m=>visiblePart(m.name,kit)).map(m=>m.name.split('__')[0]));
   const expected=new Set(['base',boots?'boots':'bare',...(armour?['armour']:[]),...(weapon==='empty'?[]:weapon==='sword-shield'?['sword','shield']:[weapon])]);assert.deepEqual(actual,expected);
   for(const pose of ['inspection','loop'])assert.ok(asset.animationGroups.some(a=>a.name===clipFor(pose,kit)));
  }
  const point=name=>{const n=asset.transformNodes.find(n=>n.name===name);assert.ok(n,name);n.computeWorldMatrix(true);return n.getAbsolutePosition().clone()};
  function sample(weapon,t){for(const a of asset.animationGroups)a.stop();const a=asset.animationGroups.find(a=>a.name==='loop-'+weapon);a.start(false);a.pause();a.goToFrame(t*60);for(const n of asset.transformNodes)n.computeWorldMatrix(true);return {root:point('pelvis'),left:point('foot_l'),right:point('hand_r')};}
  for(const weapon of ['empty','sword','shield','sword-shield','bow']){
   const start=sample(weapon,0),advanced=sample(weapon,3.1),end=sample(weapon,12);
   assert.ok(advanced.root.subtract(start.root).length()>1.5,'walk advances through world');
   assert.ok(end.root.subtract(start.root).length()<.005,'loop returns to origin');
   const guard=sample(weapon,3.1),strike=sample(weapon,4.5);
   const moved=weapon==='shield'?point('hand_l'):strike.right;
   sample(weapon,3.1);const previous=weapon==='shield'?point('hand_l'):guard.right;
   assert.ok(moved.subtract(previous).length()>.08,`${weapon} attack moves its active hand`);
  }
  const stanceA=sample('empty',.8),stanceB=sample('empty',1.0);
  assert.ok(stanceA.left.subtract(stanceB.left).length()<.012,'stance foot stays planted while pelvis advances');
  assert.ok(stanceA.root.subtract(stanceB.root).length()>.1,'fixture actually advances');
  const bow=meshes.find(m=>m.name==='bow__stave');assert.ok(bow.morphTargetManager);
  sample('bow',3.1);const rest=bow.morphTargetManager.getTarget(0).influence;
  sample('bow',4.6);assert.ok(bow.morphTargetManager.getTarget(0).influence-rest>.9,'bow actually flexes during draw');
  sample('bow',5);assert.ok(bow.morphTargetManager.getTarget(0).influence<.01,'bow returns after release');
  // These read exported bone transforms, not the generator's target positions.
  for(const weapon of ['empty','sword','shield','sword-shield','bow'])for(let t=0;t<12;t+=.2){
   sample(weapon,t);
   for(const side of ['l','r']){
    const fore=point('hand_'+side).subtract(point('lowerarm_'+side)).normalize();
    const palm=point('middle_01_'+side).subtract(point('hand_'+side)).normalize();
    assert.ok(Vector3.Dot(fore,palm)>Math.cos(Math.PI/3),`${weapon}/${t}/${side}: wrist exceeds 60 degrees`);
   }
   if(weapon==='bow'){
    const pelvis=point('pelvis'),neck=point('neck_01');const up=neck.subtract(pelvis).normalize();const across=point('upperarm_l').subtract(point('upperarm_r')).normalize();let front=Vector3.Cross(up,across).normalize();if(Vector3.Dot(front,point('ball_l').subtract(point('foot_l')))<0)front=front.scale(-1);
    const centre=pelvis.add(neck).scale(.5);const height=neck.subtract(pelvis).length()*.52;
    const inside=p=>{const d=p.subtract(centre);return (Vector3.Dot(d,across)/.16)**2+(Vector3.Dot(d,up)/height)**2+(Vector3.Dot(d,front)/.13)**2<1;};
    assert.equal(inside(centre),true,'torso fixture can detect an internal point');
    for(const name of ['hand_r','middle_01_r','hand_l','middle_01_l'])assert.equal(inside(point(name)),false,`${t}/${name}: hand enters torso envelope`);
   }
  }
  const skin=meshes.find(m=>m.name==='base__skin'),jointIndices=skin.getVerticesData('matricesIndices'),jointWeights=skin.getVerticesData('matricesWeights');
  const byIndex=new Map(skin.skeleton.bones.map(b=>[b.getIndex(),b.name]));
  const regions={l:skinRegions(skin,'l'),r:skinRegions(skin,'r')};
  for(const weapon of ['sword','shield','bow']){
   sample(weapon,0);scene.incrementRenderId();for(const n of asset.transformNodes)n.computeWorldMatrix(true);for(const skeleton of asset.skeletons)skeleton.prepare(true);
   const points=surface(skin),grip=surface(meshes.find(m=>m.name===weapon+'__grip')),side=weapon==='sword'?'r':'l';
   for(const label of ['palm','index','middle','ring','pinky','thumb']){
    const patch=regions[side][label].map(i=>points[i]);assert.ok(patch.length>8,`${label}: contact region exists`);
    const contact=contactPatch(gripDistances(patch,grip));
    assert.ok(contact.minimum>-.0015&&contact.patch<.004,`${weapon}/${label}: distributed contact ${JSON.stringify(contact)}`);
    assert.ok(contactPatch(gripDistances(patch.map(p=>p.add(new Vector3(.1,0,.1))),grip)).patch>.02,'detached contact patch fails');
   }
   for(const digit of ['index','middle','ring','pinky','thumb']){
    const belongs=i=>[0,1,2,3].some(j=>{const name=byIndex.get(jointIndices[i*4+j]);return name?.startsWith(digit+'_')&&name.endsWith('_'+side)&&jointWeights[i*4+j]>.25});
    const subset=points.filter((_,i)=>belongs(i));assert.ok(subset.length>8);
    const gap=gripGap(subset,grip);assert.ok(gap>-.0015&&gap<.003,`${weapon}/${digit}: skin contact gap ${gap}m`);
    assert.ok(gripGap(subset.map(p=>p.add(new Vector3(1,1,1))),grip)>.1,'detached hand fails contact');
   }
  }
 }finally{scene.dispose();engine.dispose();}
});
