import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {surface} from '../scripts/character-lab/contact.mjs';
import {skinRegions,wristAreaRatio,forearmExpansion,surfaceIndex,meshCrossesSurface,skinPart} from '../scripts/character-lab/validation.mjs';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';

for(const id of ['fighter','rogue'])test(`${id}: bow orientation is continuous between authored poses`,async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try {
  const asset=await LoadAssetContainerAsync(await readFile(new URL(`../public/assets/character-lab/${id}.glb`,import.meta.url)),scene,{pluginExtension:'.glb'});asset.addAllToScene();
  const hand=asset.transformNodes.find(n=>n.name==='hand_l');
  const clip=asset.animationGroups.find(a=>a.name==='loop-bow');clip.start(false);clip.pause();
  let last,peak=0,at=0;
  // Include half frames: checking only authored keys misses interpolation flips.
  for(let frame=0;frame<=720;frame+=.5){
   clip.goToFrame(frame);scene.incrementRenderId();for(const n of asset.transformNodes)n.computeWorldMatrix(true);
   const q=hand.absoluteRotationQuaternion.clone();
   if(last){const dot=Math.abs(q.x*last.x+q.y*last.y+q.z*last.z+q.w*last.w);const speed=2*Math.acos(Math.min(1,dot))*180/Math.PI*120;if(speed>peak){peak=speed;at=frame/60}}
   last=q;
  }
  assert.ok(peak<=180,`bow rotates ${peak.toFixed(1)} degrees/s at ${at.toFixed(3)}s`);
 }finally{scene.dispose();engine.dispose()}
});

for(const id of ['fighter','rogue'])test(`${id}: exported attack surfaces clear the head, body and opposite arm`,async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const asset=await LoadAssetContainerAsync(await readFile(new URL(`../public/assets/character-lab/${id}.glb`,import.meta.url)),scene,{pluginExtension:'.glb'});asset.addAllToScene();
  const mesh=name=>asset.meshes.find(m=>m.name===name),skin=mesh('base__skin');
  const head=skinPart(skin,n=>n==='head'||n==='neck_01');
  const torso=skinPart(mesh('base__jacket'),n=>/spine|pelvis|neck/.test(n));
  const hands=['l','r'].map(side=>skinPart(skin,n=>/lowerarm|forearm_twist|hand|thumb|index|middle|ring|pinky/.test(n)&&n.endsWith('_'+side)));
  const arms=Object.fromEntries(['l','r'].map(side=>[side,[skin,mesh('base__jacket')].map(m=>skinPart(m,n=>/arm|hand|thumb|index|middle|ring|pinky/.test(n)&&n.endsWith('_'+side)))]));
  const regions={l:skinRegions(skin,'l'),r:skinRegions(skin,'r')};
  const point=name=>asset.transformNodes.find(n=>n.name===name).getAbsolutePosition();
  for(const weapon of ['sword-shield','bow']){
   for(const c of asset.animationGroups)c.stop();const clip=asset.animationGroups.find(a=>a.name==='loop-'+weapon);clip.start(false);clip.pause();
   for(let frame=0;frame<=720;frame++){
    clip.goToFrame(frame);scene.incrementRenderId();for(const n of asset.transformNodes)n.computeWorldMatrix(true);for(const sk of asset.skeletons)sk.prepare(true);
    const at=`${id}/${weapon}/${(frame/60).toFixed(3)}s`,points=surface(skin),cache=new Map([[skin,points]]);
    if(weapon==='sword-shield'&&frame>=228&&frame<=243){
     const shoulder=point('upperarm_r'),wrist=point('hand_r');
     assert.ok(wrist.subtract(shoulder).length()>.34,`${at}: sword wind-up folds the hand against the shoulder`);
    }
    for(const side of ['l','r']){
     const axis=point('hand_'+side).subtract(point('lowerarm_'+side)).normalize();
     assert.ok(wristAreaRatio(regions[side],points,axis)>.65,`${at}/${side}: wrist collapses`);
     const expansion=forearmExpansion(regions[side],points,point('lowerarm_'+side),point('hand_'+side));
     assert.ok(expansion<1.5,`${at}/${side}: forearm bulges to ${expansion.toFixed(2)} times its rest radius`);
    }
    const skull=surfaceIndex([head],cache);
    if(frame===0){
     const headPoints=surface(head),ids=head.getIndices(),[a,b,c]=Array.from(ids.slice(0,3),i=>headPoints[i]);
     const centre=a.add(b).add(c).scale(1/3),normal=Vector3.Cross(b.subtract(a),c.subtract(a)).normalize().scale(.01);
     assert.ok(skull.intersects(centre.subtract(normal),centre.add(normal)),'control segment crossing an actual head triangle is detected');
     const axis=point('hand_r').subtract(point('lowerarm_r')).normalize(),origin=point('hand_r');
     const collapsed=points.map(p=>{const d=p.subtract(origin),long=axis.scale(Vector3.Dot(d,axis));return origin.add(long).add(d.subtract(long).scale(.1))});
     assert.ok(wristAreaRatio(regions.r,collapsed,axis)<.05,'collapsed wrist mutation is detected');
    }
    for(const side of ['l','r'])assert.equal(meshCrossesSurface(arms[side][0],skull,cache),false,`${at}/${side}: arm intersects head`);
    const chest=surfaceIndex([torso],cache);assert.equal(hands.some(m=>meshCrossesSurface(m,chest,cache)),false,`${at}: hand or forearm intersects torso`);
    const right=surfaceIndex(arms.r,cache);assert.equal(arms.l.some(m=>meshCrossesSurface(m,right,cache)),false,`${at}: arms intersect`);
    const body=surfaceIndex([mesh('base__jacket'),mesh('base__trousers'),head],cache);
    for(const name of weapon==='bow'?['bow__stave','bow__string','bow__arrow']:['sword__blade','shield__board'])assert.equal(meshCrossesSurface(mesh(name),body,cache),false,`${at}/${name}: equipment intersects body`);
   }
  }
 }finally{scene.dispose();engine.dispose()}
});
