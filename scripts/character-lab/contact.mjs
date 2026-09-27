import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
export function surface(mesh, sampleFaces=false) {
 const a=mesh.getPositionData(true,true); const w=mesh.computeWorldMatrix(true);
 const points=[]; for(let i=0;i<a.length;i+=3)points.push(Vector3.TransformCoordinates(Vector3.FromArray(a,i),w));
 if(sampleFaces) {
   const indices=mesh.getIndices(); const vertices=points.slice();
   for(let i=0;i<indices.length;i+=3) {
     const [a,b,c]=Array.from(indices.slice(i,i+3),j=>vertices[j]);
     points.push(a.add(b).add(c).scale(1/3),a.add(b).scale(.5),b.add(c).scale(.5),c.add(a).scale(.5));
   }
 }
 return points;
}
export function gripGap(points,grip) {
 // Exported cylindrical grip: two equal vertex rings. Infer its actual axis and radius.
 const n=grip.length/2;
 const mean=a=>a.reduce((s,p)=>s.add(p),Vector3.Zero()).scale(1/a.length);
 const a=mean(grip.slice(0,n)), b=mean(grip.slice(n)); const length=b.subtract(a).length(); const axis=b.subtract(a).normalize();
 const radius=grip.slice(0,n).reduce((s,p)=>s+p.subtract(a).length(),0)/n;
 return Math.min(...points.map(p=>{
   const d=p.subtract(a), t=Vector3.Dot(d,axis);
   const radial=d.subtract(axis.scale(t)).length()-radius, axial=Math.max(-t,t-length);
   return Math.hypot(Math.max(radial,0),Math.max(axial,0))+Math.min(Math.max(radial,axial),0);
 }));
}
