import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {linearWork,solveLinearTo} from '../src/core/math/flat.ts';
import {phaseFeatures} from './stand-up-phase-features.mjs';
import {pathPolicy} from './stand-up-path-policy.mjs';

/** Heading-independent posture and joint motion for a measured local actuator response. */
export function responseFeatures(observation,withMotion=false) {
  const {gravity,height}=phaseFeatures(observation);
  const features=[...gravity,height,...observation.joints.map(j=>j.angle),...observation.joints.map(j=>j.speed)];
  if(withMotion) {
    const root=observation.segments.find(s=>s.name==='lowerTrunk'),q=root.rotation;
    const norm=q.reduce((s,v)=>s+v*v,0),[x,y,z,w]=q.map((v,i)=>(i===3?v:-v)/norm);
    for(const [a,b,c] of [root.spin,root.velocity]) {
      const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
      features.push(a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx);
    }
  }
  return features;
}

/** A regularized local inverse maps feature error to bounded changes in muscle speed requests. */
export function responsePolicy({channels,reference,parameters:p={}}) {
  const path=pathPolicy({channels,reference,parameters:{...p,gain:p.pathGain??0}}),n=channels.length;
  const withMotion=reference.responseMeasurement?.configuration.rootMotion??false;
  const weights=[...Array(3).fill(p.responseRootWeight??2),p.responseHeightWeight??4,
    ...Array(n).fill((p.responsePoseWeight??1)/n),...Array(n).fill((p.responseSpeedWeight??.01)/n),
    ...(withMotion?[...Array(3).fill(p.responseSpinWeight??.05),...Array(3).fill(p.responseLinearWeight??.1)]:[])];
  const inverses=reference.responses.map(sample=>{
    const B=sample.columns,H=new Float64Array(n*n),rhs=new Float64Array(n),x=new Float64Array(n),work=linearWork(n);
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)H[i*n+j]=B[i].reduce((s,v,k)=>s+v*weights[k]*B[j][k],0)+(i===j?(p.ridge??.0001):0);
    const inverse=Array.from({length:n},()=>[]);
    for(let k=0;k<weights.length;k++) {
      for(let i=0;i<n;i++)rhs[i]=B[i][k]*weights[k];
      solveLinearTo(work,H,rhs,n,x);
      for(let i=0;i<n;i++)inverse[i][k]=x[i];
    }
    if(inverse.some(row=>row.some(v=>!Number.isFinite(v))))throw new Error('nonfinite measured response inverse');
    return inverse;
  });
  const state={phase:path.state.phase,sample:0,correction:[],released:false};
  const policy=o=>{
    const action=path(o);state.phase=path.state.phase;state.released=path.state.released;
    if(action.kind!=='muscles')return action;
    let selected=0;
    for(let i=1;i<reference.responses.length;i++)if(Math.abs(reference.responses[i].step-state.phase)<Math.abs(reference.responses[selected].step-state.phase))selected=i;
    state.sample=selected;
    const f=reference.frames[Math.max(0,Math.min(reference.frames.length-1,Math.round(state.phase)))];
    const target=[...f.gravity,f.height,...f.angles,...f.speeds.map(v=>v*(p.motionRate??1)),
      ...(withMotion?f.rootMotion.map(v=>v*(p.motionRate??1)):[])],observed=responseFeatures(o,withMotion),cap=p.responseCap??4;
    let error=target.map((v,i)=>v-observed[i]);
    if(p.coastGain>0&&selected>0) {
      const previous=reference.responses[selected-1];
      if(previous.coastColumns) {
        const coefficients=inverses[selected-1].map(row=>row.reduce((s,v,i)=>s+v*error[i],0));
        error=error.map((v,i)=>v+p.coastGain*previous.columns.reduce((s,column,j)=>s+
          (previous.coastColumns[j][i]-column[i])*coefficients[j],0));
      }
    }
    state.correction=inverses[selected].map(row=>Math.max(-cap,Math.min(cap,(p.responseGain??.5)*row.reduce((s,v,i)=>s+v*error[i],0))));
    return {...action,velocity:action.velocity.map((v,i)=>typeof v==='number'?v+state.correction[i]:v)};
  };
  policy.state=state;return policy;
}

/** The frozen action interface supplies only detached observations and channel metadata. */
export function createPolicy({channels}) {
  const c=JSON.parse(readFileSync(process.env.STAND_UP_RESPONSE_CONFIG));
  return responsePolicy({channels,reference:JSON.parse(gunzipSync(readFileSync(c.reference))),parameters:c.parameters});
}
