import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {lowsOf} from '../src/core/control/ground.ts';
import {pointOfToRef} from '../src/core/control/support.ts';
import {convexHull} from '../src/core/spec/hull.ts';

const facesOf=new WeakMap();

const inside=(p,b)=>p[0]>=b[0]&&p[0]<=b[1]&&p[1]>=b[2]&&p[1]<=b[3];
const interpolate=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

/** Clip convex combinations against the four sides of the pad's finite contact window. */
function clip(points,bounds) {
 for(const [axis,limit,sense] of [[0,bounds[0],1],[0,bounds[1],-1],[1,bounds[2],1],[1,bounds[3],-1]]) {
  const out=[];
  for(let i=0;i<points.length;i++) {
   const a=points[i],b=points[(i+1)%points.length],da=sense*(a[axis]-limit),db=sense*(b[axis]-limit);
   if(da>=0)out.push(a);
   if((da>=0)!==(db>=0)){const at=interpolate(a,b,da/(da-db));at[axis]=limit;out.push(at);}
  }
  points=out;if(!points.length)break;
 }
 return points.map(p=>[Math.max(bounds[0],Math.min(bounds[1],p[0])),Math.max(bounds[2],Math.min(bounds[3],p[1])),p[2]]);
}

/** Clip the actual convex hull's boundary triangles, including intersections in the middle of a face. */
function polytope(points,bounds,faces) {
 let best=null;
 const admit=p=>{if(inside(p,bounds)&&(!best||p[2]>best[2]))best=p;};
 points.forEach(admit);
 for(const indices of faces)for(const p of clip(indices.map(i=>points[i]),bounds))admit(p);
 return best;
}

/** Maximize the leading capsule surface over a rectangular window, including shaft and cap. */
function capsule(a,b,r,bounds) {
 const d=b.map((v,i)=>v-a[i]),cuts=[0,1];
 for(const axis of [0,1])for(const edge of bounds.slice(axis*2,axis*2+2)) {
  const t=(edge-a[axis])/d[axis];if(t>0&&t<1)cuts.push(t);
 }
 cuts.sort((x,y)=>x-y);let best=null;
 for(let i=0;i<cuts.length-1;i++) {
  let lo=cuts[i],hi=cuts[i+1];const mid=(lo+hi)/2,offset=[0,0],slope=[0,0];
  for(const axis of [0,1]) {
   const value=a[axis]+d[axis]*mid,min=bounds[axis*2],max=bounds[axis*2+1];
   if(value<min||value>max){offset[axis]=a[axis]-(value<min?min:max);slope[axis]=d[axis];}
  }
  const aa=slope[0]*slope[0]+slope[1]*slope[1],bb=2*(offset[0]*slope[0]+offset[1]*slope[1]),cc=offset[0]*offset[0]+offset[1]*offset[1]-r*r;
  if(aa) {
   const disc=bb*bb-4*aa*cc;if(disc<0)continue;
   const root=Math.sqrt(disc);lo=Math.max(lo,(-bb-root)/(2*aa));hi=Math.min(hi,(-bb+root)/(2*aa));
  }else if(cc>0)continue;
  if(lo>hi)continue;
  const point=t=>{
   const c=interpolate(a,b,t),x=Math.max(bounds[0],Math.min(bounds[1],c[0])),y=Math.max(bounds[2],Math.min(bounds[3],c[1]));
   return [x,y,c[2]+Math.sqrt(Math.max(0,r*r-(x-c[0])*(x-c[0])-(y-c[1])*(y-c[1])))];
  };
  // The leading surface is concave on each interval; bisection locates its stationary maximum.
  let l=lo,h=hi;
  for(let k=0;k<64;k++) {
   const t=(l+h)/2,x=offset[0]+slope[0]*t,y=offset[1]+slope[1]*t,q=Math.sqrt(Math.max(0,r*r-x*x-y*y));
   const derivative=d[2]-(x*slope[0]+y*slope[1])/(q||Number.MIN_VALUE);
   if(derivative>0)l=t;else h=t;
  }
  for(const t of [lo,(l+h)/2,hi]){const p=point(t);if(!best||p[2]>best[2])best=p;}
 }
 return best;
}

/** Actual live collision surfaces, clipped to the pad face; no decorative mesh or open-hand proxy. */
export function padSurface(segment,bounds,minZ=-Infinity) {
 const v=new Vector3();let best=null;
 for(const shape of segment.rigid.shapes) {
  const points=lowsOf(shape,segment.frame).map(p=>({at:pointOfToRef(segment,p.at,v).asArray(),radius:p.radius}));
  if([0,1].some(axis=>Math.max(...points.map(p=>p.at[axis]+p.radius))<bounds[axis*2]
    ||Math.min(...points.map(p=>p.at[axis]-p.radius))>bounds[axis*2+1]))continue;
  let foremost=null;
  for(const p of points){const q=[p.at[0],p.at[1],p.at[2]+p.radius];if(!foremost||q[2]>foremost[2])foremost=q;}
  if(foremost[2]<=minZ)continue;
  let point;
  if(inside(foremost,bounds))point=foremost;
  else switch(shape.kind) {
   case 'sphere': point=capsule(points[0].at,points[0].at,points[0].radius,bounds);break;
   case 'capsule': point=capsule(points[0].at,points[1].at,points[0].radius,bounds);break;
   case 'box': case 'hull': {
    let faces=facesOf.get(shape);
    if(!faces){faces=convexHull(lowsOf(shape,segment.frame).map(p=>p.at)).faces;facesOf.set(shape,faces);}
    point=polytope(points.map(p=>p.at),bounds,faces);break;
   }
   default: throw new Error(`unsupported pad surface ${shape.kind}`);
  }
  if(point&&(!best||point[2]>best[2]))best=point;
 }
 return best;
}
