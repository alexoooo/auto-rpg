import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';

const data = JSON.parse(document.getElementById('recording').textContent);
const canvas = document.querySelector('canvas'), engine = new Engine(canvas, true), scene = new Scene(engine);
scene.clearColor = new Color4(.055, .07, .09, 1);
const camera = new ArcRotateCamera('camera', -Math.PI / 2.8, 1.14, 3.5, new Vector3(0, .6, 0), scene);
camera.attachControl(canvas, true); camera.lowerRadiusLimit = 1; camera.upperRadiusLimit = 15; camera.wheelPrecision = 40;
new HemisphericLight('light', new Vector3(.4, 1, .2), scene);
const material = (name, color) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor.set(.1,.1,.1); return m; };
const floor = CreateBox('floor', { width: 12, depth: 12, height: .04 }, scene); floor.position.y = -.02;
floor.material = material('floor', '#384450');
const mats = [material('body', '#d3dbe1'), material('left', '#69b9ce'), material('right', '#e7af70')];
const contactMat = material('loaded floor patches', '#f5e074'); contactMat.emissiveColor.set(.35,.3,.05);
const nodes = [], shapeGroups = [];
const sub = (a, b) => a.map((x,i) => x - b[i]);
const dot = (a, b) => a.reduce((s,x,i) => s + x*b[i], 0);
const local = (p,f) => [f.x,f.y,f.z].map(a => dot(sub(p,f.origin),a));

function hull(name, { positions, indices }) {
  indices = indices.flatMap((_,i) => i%3===0 ? [indices[i],indices[i+2],indices[i+1]] : []);
  const mesh=new Mesh(name,scene), normals=[]; VertexData.ComputeNormals(positions,indices,normals);
  const v=new VertexData(); Object.assign(v,{positions,indices,normals}); v.applyToMesh(mesh); mesh.material=mats[0]; return mesh;
}
function shape(s, frame, name) {
  let mesh;
  switch(s.kind) {
    case 'capsule': { const a=Vector3.FromArray(local(s.from.value,frame)), b=Vector3.FromArray(local(s.to.value,frame)), d=b.subtract(a);
      mesh=CreateCapsule(name,{radius:s.radius.value,height:d.length()+2*s.radius.value,tessellation:12,subdivisions:1,capSubdivisions:4},scene);
      mesh.position.copyFrom(a.add(b).scale(.5)); mesh.rotationQuaternion=new Quaternion(); Quaternion.FromUnitVectorsToRef(Vector3.Up(),d.normalize(),mesh.rotationQuaternion); break; }
    case 'box': mesh=CreateBox(name,{width:s.size.value[0],height:s.size.value[1],depth:s.size.value[2]},scene); mesh.position.set(...local(s.centre.value,frame)); break;
    case 'sphere': mesh=CreateSphere(name,{diameter:2*s.radius.value,segments:12},scene); mesh.position.set(...local(s.centre.value,frame)); break;
    case 'hull': mesh=hull(name,s.visual); break;
    default: throw new Error(`Unknown shape ${s.kind}`);
  }
  mesh.material=mats[name.includes('.left')?1:name.includes('.right')?2:0]; mesh.material.backFaceCulling=false; return mesh;
}
for(const g of data.geometry) {
  const node=new TransformNode(g.name,scene); node.rotationQuaternion=new Quaternion(); nodes.push(node);
  const groups={};
  for(const [pose,shapes] of Object.entries(g.poses??{default:g.shapes})) groups[pose]=shapes.map(s=>{const m=shape(s,g.frame,g.name);m.parent=node;return m;});
  shapeGroups.push(groups);
}
const patches=Array.from({length:80},()=>{const m=CreateSphere('contact',{diameter:.025,segments:6},scene);m.material=contactMat;return m;});
const select=document.querySelector('select'), slider=document.querySelector('#time'), play=document.querySelector('#play'), status=document.querySelector('#status');
data.records.forEach((r,i)=>select.add(new Option(r.label,i)));
let record=data.records[0], time=0, running=false, previous=performance.now(), rate=1;
const setRecord=()=>{record=data.records[+select.value];time=0;slider.max=(record.frames.length-1)/120;camera.setTarget(new Vector3(...record.frames[0].centre).add(new Vector3(0,.1,0))); show();};
function show() {
  const f=record.frames[Math.min(record.frames.length-1,Math.round(time*120))];
  camera.target.set(f.centre[0], .7, f.centre[2]);
  f.segments.forEach((s,i)=>{nodes[i].position.set(...s.position);nodes[i].rotationQuaternion.set(...s.rotation);
    for(const [pose,meshes] of Object.entries(shapeGroups[i])) meshes.forEach(m=>m.setEnabled(pose==='default'||pose===s.handPose));});
  patches.forEach((m,i)=>{m.setEnabled(i<f.contacts.length);if(i<f.contacts.length)m.position.set(...f.contacts[i]);});
  const elapsed=f.elapsed, handover=record.result.seconds;
  const phase=handover!==null&&elapsed>=handover?(elapsed>=handover+2?'Walking verification':'Standing verification'):'Recovery';
  status.textContent=record.component?`${elapsed.toFixed(3)} s · Standing component · Balance 0 · No recovery claim`
    :`${elapsed.toFixed(3)} s since takeover · ${phase} · Balance 0 · ${record.result.success?'Verified completion':'Failed'}${handover===null?'':` · handover ${handover.toFixed(3)} s`}`;
  slider.value=time; document.querySelector('#clock').textContent=`${elapsed.toFixed(3)} s`;
}
play.onclick=()=>{running=!running;play.textContent=running?'Pause':'Play';};
select.onchange=setRecord;
slider.oninput=()=>{time=+slider.value;running=false;play.textContent='Play';show();};
document.querySelector('#speed').onchange=e=>{rate=+e.target.value;};
document.querySelector('#restart').onclick=()=>{time=0;show();};
document.querySelector('#step').onclick=()=>{running=false;time=Math.min(+slider.max,time+1/120);play.textContent='Play';show();};
window.addEventListener('resize',()=>engine.resize());
window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();play.click();}});
setRecord();
engine.runRenderLoop(()=>{const now=performance.now();if(running){time=Math.min(+slider.max,time+(now-previous)/1000*rate);if(time>=+slider.max){running=false;play.textContent='Play';}show();}previous=now;scene.render();});
