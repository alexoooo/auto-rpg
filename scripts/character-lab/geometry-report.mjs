import{readFile}from'node:fs/promises';import{NullEngine}from'@babylonjs/core/Engines/nullEngine.js';import{Scene}from'@babylonjs/core/scene.js';import{LoadAssetContainerAsync}from'@babylonjs/core/Loading/sceneLoader.js';import'@babylonjs/loaders/glTF/index.js';
import{surface}from'./contact.mjs';import{skinRegions,wristAreaRatio,gripDistances,contactPatch,surfaceIndex,meshCrossesSurface,skinPart}from'./validation.mjs';
const id=process.argv[2]??'fighter',e=new NullEngine(),s=new Scene(e),a=await LoadAssetContainerAsync(await readFile(`public/assets/character-lab/${id}.glb`),s,{pluginExtension:'.glb'});a.addAllToScene();const skin=a.meshes.find(m=>m.name==='base__skin'),regions={l:skinRegions(skin,'l'),r:skinRegions(skin,'r')};
const point=name=>a.transformNodes.find(n=>n.name===name).getAbsolutePosition();
const head=skinPart(skin,n=>n==='head'||n==='neck_01');
const arms=Object.fromEntries(['l','r'].map(side=>[side,[skin,a.meshes.find(m=>m.name==='base__jacket')].map(m=>skinPart(m,n=>/arm|hand|thumb|index|middle|ring|pinky/.test(n)&&n.endsWith('_'+side)))]));
function sample(weapon,t){for(const c of a.animationGroups)c.stop();const c=a.animationGroups.find(c=>c.name==='loop-'+weapon);c.start(false);c.pause();c.goToFrame(t*60);s.incrementRenderId();for(const n of a.transformNodes)n.computeWorldMatrix(true);for(const sk of a.skeletons)sk.prepare(true)}
for(const weapon of ['sword','shield','bow']){
 sample(weapon,0);const points=surface(skin),grip=surface(a.meshes.find(m=>m.name===weapon+'__grip')),side=weapon==='sword'?'r':'l';let report={weapon};
 for(const label of ['palm','index','middle','ring','pinky','thumb']){const p=regions[side][label].map(i=>points[i]);const result=contactPatch(gripDistances(p,grip));report[label]={count:p.length,...Object.fromEntries(Object.entries(result).map(([k,v])=>[k,Math.round(v*1e4)/10]))}}
 console.log('GRIP',report);
}
for(const weapon of ['sword-shield','bow']){
 let area=Infinity,bend=0,bad=[],areaAt,bendAt;
 const mark=(t,name)=>{if(bad.filter(b=>b.name===name).length<3)bad.push({t,name})};
 for(let frame=0;frame<=720;frame+=6){const t=frame/60;sample(weapon,t);const points=surface(skin);
  for(const side of ['l','r']){const axis=point('hand_'+side).subtract(point('lowerarm_'+side)).normalize();const ratio=wristAreaRatio(regions[side],points,axis);if(ratio<area){area=ratio;areaAt={t,side}}const finger=point('middle_01_'+side).subtract(point('hand_'+side)).normalize();const angle=Math.acos(Math.max(-1,Math.min(1,axis.x*finger.x+axis.y*finger.y+axis.z*finger.z)))*180/Math.PI;if(angle>bend){bend=angle;bendAt={t,side}}}
  const cache=new Map([[skin,points]]),body=surfaceIndex([...a.meshes.filter(m=>['base__jacket','base__trousers'].includes(m.name)),head],cache);
  for(const name of weapon==='bow'?['bow__stave','bow__string','bow__arrow']:['sword__blade','shield__board'])if(meshCrossesSurface(a.meshes.find(m=>m.name===name),body,cache))mark(t,name);
  const skull=surfaceIndex([head],cache);for(const side of ['l','r'])if(meshCrossesSurface(arms[side][0],skull,cache))mark(t,'hand-head-'+side);
  const right=surfaceIndex(arms.r,cache);if(arms.l.some(m=>meshCrossesSurface(m,right,cache)))mark(t,'arm-arm');
 }
 console.log('MOTION',weapon,{area,areaAt,bend,bendAt,bad});
}
s.dispose();e.dispose();
