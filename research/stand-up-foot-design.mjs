import assert from 'node:assert/strict';
import {derive,sourced} from '../src/core/spec/quantity.ts';
import {frameOf} from '../src/core/spec/body.ts';

/** Explicit foot-proportion experiments preserve total mass and the original muscle envelopes. */
export function recoveryFeet(spec,{width=1,length=1,height=1}={}) {
  const values=[width,length,height];
  assert.ok(values.every(v=>Number.isFinite(v)&&v>=.5&&v<=1.5),'foot scales lie within the declared exploratory bounds');
  if(values.every(v=>v===1))return spec;
  const scales=values.map((v,i)=>sourced(v,'1','owner-physique',`owner-authorized recovery foot experiment: ${['width','length','height'][i]}`));
  return {...spec,segments:spec.segments.map(s=>{
    if(!s.name.startsWith('foot.'))return s;
    assert.equal(s.shape.kind,'box');const frame=frameOf(s),axes=[frame.x,frame.y,frame.z];
    const ankle=spec.joints.find(j=>j.child===s.name);assert.ok(ankle);
    const anchor=derive('m','the ankle projected to the existing sole plane',[ankle.centre,s.points.sole],(a,p)=>[a[0],p[1],a[2]]);
    const point=p=>derive('m','foot point scaled in its segment axes about the ankle projection',[p,anchor,...scales],(p,a,...scales)=>{
      const offset=p.map((v,i)=>v-a[i]),local=axes.map(axis=>axis.reduce((sum,v,i)=>sum+v*offset[i],0));
      return a.map((v,i)=>v+axes.reduce((sum,axis,k)=>sum+axis[i]*local[k]*scales[k],0));
    });
    const inertia=derive('kg m2','fixed-mass affine foot deformation scales each second mass moment',[s.inertia,...scales],(moments,...scales)=>{
      const second=moments.map((v,i)=>(moments[(i+1)%3]+moments[(i+2)%3]-v)/2*scales[i]*scales[i]);
      return second.map((_,i)=>second[(i+1)%3]+second[(i+2)%3]);
    });
    return {...s,proximal:point(s.proximal),distal:point(s.distal),centreOfMass:point(s.centreOfMass),inertia,
      shape:{...s.shape,centre:point(s.shape.centre),size:derive('m','foot box dimensions times their declared proportions',[s.shape.size,...scales],(size,...scales)=>size.map((v,i)=>v*scales[i]))},
      points:Object.fromEntries(Object.entries(s.points).map(([name,p])=>[name,point(p)]))};
  })};
}
