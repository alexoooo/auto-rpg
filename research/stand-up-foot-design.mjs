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

/** Both controllers use this same explicitly altered body through the unchanged frozen environment. */
export async function bodyEnvironment(configuration,{feet={},weight=1}={}) {
  const frozen=new URL('../.tools/stand-up-frozen/',import.meta.url);
  const [{recoveryDesign},{recoveryEnvironment},{feedbackRecipe},{default:seed}]=await Promise.all([
    import(new URL('research/stand-up-design.mjs',frozen)),import(new URL('research/stand-up-environment.mjs',frozen)),
    import(new URL('src/lab/recovery-recipe.ts',frozen)),import(new URL('research/stand-up-feedback-seed.json',frozen),{with:{type:'json'}})]);
  const original=recoveryDesign(configuration),weighted=weight===1?original:recoveryDesign({...configuration,weight}),spec=recoveryFeet(weighted,feet);
  const muscleData=spec=>JSON.parse(JSON.stringify(spec.joints.flatMap(j=>j.dofs.map(d=>({name:j.name+' '+d.positive,muscle:d.muscle}))),
    (_,v)=>v?.provenance?v.value:v));
  assert.deepEqual(muscleData(spec),muscleData(original),'body experiments retain every muscle strength and speed parameter');
  const physical=v=>JSON.parse(JSON.stringify(v,(_,v)=>v?.provenance?v.value:v));
  assert.deepEqual(physical(spec.joints),physical(original.joints),'joint coordinates and limits remain unchanged');
  if(weight===1)assert.equal(spec.mass.value,original.mass.value);
  const compact=s=>s.segments.filter(s=>s.name.startsWith('foot.')).map(s=>({name:s.name,mass:s.mass.value,centreOfMass:s.centreOfMass.value,
    inertia:s.inertia.value,proximal:s.proximal.value,distal:s.distal.value,box:{centre:s.shape.centre.value,size:s.shape.size.value},sole:s.points.sole.value}));
  const bodyTable=spec=>spec.segments.map(s=>({name:s.name,mass:s.mass.value,centreOfMass:s.centreOfMass.value,inertia:s.inertia.value,
    shape:physical(s.shape),...(s.handPoses?{handPoses:physical(s.handPoses)}:{})}));
  const design={feet,weight,before:compact(original),after:compact(spec),beforeMass:original.mass.value,afterMass:spec.mass.value,
    ...(weight!==1?{wholeBodyBefore:bodyTable(original),wholeBodyAfter:bodyTable(spec)}:{}),
    muscles:muscleData(spec),musclesChanged:false,jointsChanged:false};
  const environment=await recoveryEnvironment({...configuration,spec,baseline:'support-recovery',balance:0,
    host:'stance',recipe:feedbackRecipe(spec,seed.feedback.u),comparison:true});
  return {environment,design};
}
