import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {surface} from './contact.mjs';

export function gripDistances(points,grip){
 const mean=a=>a.reduce((s,p)=>s.add(p),Vector3.Zero()).scale(1/a.length);
 const n=grip.length/2,a=mean(grip.slice(0,n)),b=mean(grip.slice(n)),axis=b.subtract(a).normalize(),length=b.subtract(a).length();
 const radius=grip.slice(0,n).reduce((s,p)=>s+p.subtract(a).length(),0)/n;
 return points.map(p=>{const d=p.subtract(a),t=Vector3.Dot(d,axis),radial=d.subtract(axis.scale(t)).length()-radius,axial=Math.max(-t,t-length);return Math.hypot(Math.max(radial,0),Math.max(axial,0))+Math.min(Math.max(radial,axial),0)});
}
export function contactPatch(distances){
 const ordered=distances.toSorted((a,b)=>a-b);
 return {minimum:ordered[0],patch:ordered[Math.min(ordered.length-1,Math.max(2,Math.floor(ordered.length*.1)))]};
}
export function skinRegions(mesh,side){
 const bones=mesh.skeleton.bones,indices=mesh.getVerticesData('matricesIndices'),weights=mesh.getVerticesData('matricesWeights'),positions=mesh.getVerticesData('position'),normals=mesh.getVerticesData('normal');
 const byIndex=new Map(bones.map(b=>[b.getIndex(),b.name]));
 const rest=name=>bones.find(b=>b.name===name).getAbsoluteInverseBindMatrix().clone().invert().getTranslation();
 const wrist=rest('hand_'+side),middle=rest('middle_01_'+side),long=middle.subtract(wrist).normalize(),proximal=rest('middle_02_'+side).subtract(middle),palm=proximal.subtract(long.scale(Vector3.Dot(proximal,long))).normalize();
 const handScale=middle.subtract(wrist).length()/.1209;
 const elbow=rest('lowerarm_'+side),fore=wrist.subtract(elbow),length=fore.length(),axis=fore.normalize();
 const result={palm:[],index:[],middle:[],ring:[],pinky:[],thumb:[],wrist:[],forearm:[],restPoints:[]};
 for(let i=0;i<positions.length/3;i++){
  const p=Vector3.FromArray(positions,i*3),n=Vector3.FromArray(normals,i*3),w={};
  for(let j=0;j<4;j++){const name=byIndex.get(indices[i*4+j]);w[name]=(w[name]??0)+weights[i*4+j]}
  result.restPoints.push(p);
  const v=Vector3.Dot(p.subtract(wrist),long),t=Vector3.Dot(p.subtract(elbow),axis)/length;
  if((w['hand_'+side]??0)>.6&&v>.055*handScale&&v<.115*handScale&&Vector3.Dot(n,palm)>.25)result.palm.push(i);
  for(const digit of ['index','middle','ring','pinky','thumb'])if((w[`${digit}_02_${side}`]??0)+(w[`${digit}_03_${side}`]??0)>.65&&Vector3.Dot(n,palm)>.05)result[digit].push(i);
  if(t>.72&&t<1.02&&p.subtract(elbow.add(axis.scale(t*length))).length()<.07)result.wrist.push({i,t});
  const radius=p.subtract(elbow.add(axis.scale(t*length))).length();
  if(t>.2&&t<.75&&radius>.015&&radius<.065)result.forearm.push({i,radius});
 }
 result.restFore=axis;return result;
}
export function forearmExpansion(regions,points,elbow,wrist){
 const axis=wrist.subtract(elbow).normalize();
 if(regions.forearm.length<12)throw Error('No forearm surface sampled');
 return Math.max(...regions.forearm.map(({i,radius})=>{const d=points[i].subtract(elbow);return d.subtract(axis.scale(Vector3.Dot(d,axis))).length()/radius}));
}
function sectionArea(points,axis){
 const reference=Math.abs(axis.y)<.9?Vector3.Up():new Vector3(1,0,0),u=Vector3.Cross(axis,reference).normalize(),v=Vector3.Cross(axis,u).normalize();
 const centre=points.reduce((s,p)=>s.add(p),Vector3.Zero()).scale(1/points.length);let xx=0,xy=0,yy=0;
 for(const p of points){const d=p.subtract(centre),x=Vector3.Dot(d,u),y=Vector3.Dot(d,v);xx+=x*x;xy+=x*y;yy+=y*y}
 return Math.sqrt(Math.max(0,xx*yy-xy*xy))/points.length;
}
export function wristAreaRatio(regions,points,axis){
 let minimum=Infinity;
 for(const t of [.77,.84,.91,.98]){
  const ids=regions.wrist.filter(v=>Math.abs(v.t-t)<.027).map(v=>v.i);if(ids.length<6)continue;
  const rest=sectionArea(ids.map(i=>regions.restPoints[i]),regions.restFore),posed=sectionArea(ids.map(i=>points[i]),axis);
  minimum=Math.min(minimum,posed/rest);
 }
 if(!Number.isFinite(minimum))throw Error('No wrist surface sections sampled');return minimum;
}

// Narrow phase uses deformed garment triangles, not a guessed torso ellipsoid.
function segmentTriangle(a,b,p,q,r){
 const d=b.subtract(a),e1=q.subtract(p),e2=r.subtract(p),h=Vector3.Cross(d,e2),det=Vector3.Dot(e1,h);if(Math.abs(det)<1e-10)return false;
 const inv=1/det,s=a.subtract(p),u=inv*Vector3.Dot(s,h);if(u<0||u>1)return false;
 const cross=Vector3.Cross(s,e1),v=inv*Vector3.Dot(d,cross);if(v<0||u+v>1)return false;
 const t=inv*Vector3.Dot(e2,cross);return t>.0001&&t<.9999;
}
function sampledSurface(mesh,cache){
 if(!cache)return surface(mesh);
 const source=mesh.source??mesh;
 if(!cache.has(source))cache.set(source,surface(source));
 return cache.get(source);
}
export function surfaceIndex(meshes,cache){
 const cells=new Map(),step=.12;let lastTriangle;
 function keys(points){let lo=points[0].clone(),hi=lo.clone();for(const p of points){lo=Vector3.Minimize(lo,p);hi=Vector3.Maximize(hi,p)}const out=[];for(let x=Math.floor(lo.x/step);x<=Math.floor(hi.x/step);x++)for(let y=Math.floor(lo.y/step);y<=Math.floor(hi.y/step);y++)for(let z=Math.floor(lo.z/step);z<=Math.floor(hi.z/step);z++)out.push(`${x},${y},${z}`);return out}
 for(const mesh of meshes){const p=sampledSurface(mesh,cache),indices=mesh.getIndices();for(let i=0;i<indices.length;i+=3){const triangle=[p[indices[i]],p[indices[i+1]],p[indices[i+2]]];for(const k of keys(triangle)){if(!cells.has(k))cells.set(k,[]);cells.get(k).push(triangle)}}}
 return {get lastTriangle(){return lastTriangle},intersects(a,b){const seen=new Set();for(const key of keys([a,b]))for(const triangle of cells.get(key)??[]){if(seen.has(triangle))continue;seen.add(triangle);if(segmentTriangle(a,b,...triangle)){lastTriangle=triangle;return true}}return false}};
}
export function meshCrossesSurface(mesh,index,cache,onHit){
 const points=sampledSurface(mesh,cache),ids=mesh.getIndices(),seen=new Set();
 for(let i=0;i<ids.length;i+=3)for(let j=0;j<3;j++){const a=ids[i+j],b=ids[i+(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);if(index.intersects(points[a],points[b])){onHit?.({edge:[points[a],points[b]],triangle:index.lastTriangle,vertexIds:[a,b]});return true}}return false;
}
export function skinPart(mesh,acceptBone){
 const indices=mesh.getVerticesData('matricesIndices'),weights=mesh.getVerticesData('matricesWeights'),names=new Map(mesh.skeleton.bones.map(b=>[b.getIndex(),b.name]));
 const belongs=i=>{let sum=0;for(let j=0;j<4;j++)if(acceptBone(names.get(indices[i*4+j])??''))sum+=weights[i*4+j];return sum>.65};
 const source=mesh.getIndices(),selected=[];for(let i=0;i<source.length;i+=3)if(belongs(source[i])&&belongs(source[i+1])&&belongs(source[i+2]))selected.push(...source.slice(i,i+3));
 return {source:mesh,getPositionData:(...args)=>mesh.getPositionData(...args),computeWorldMatrix:(...args)=>mesh.computeWorldMatrix(...args),getIndices:()=>selected};
}
