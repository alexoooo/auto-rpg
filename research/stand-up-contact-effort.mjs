import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { motionAxesToRef, turningToRef } from '../src/core/build/joint-state.ts';
import { forceVelocityFactor } from '../src/core/muscle/force-velocity.ts';
import { spinBetweenToRef } from '../src/core/math/turn.ts';

/** World-frame pose errors projected onto muscle axes, scaled by each muscle's own peak by the caller. */
export function contactFrameFeedback(model,o,{orientationTargets,positionTargets}={}) {
  if(orientationTargets===undefined&&positionTargets===undefined)return null;
  for(const targets of [orientationTargets,positionTargets])if(targets!==undefined&&(!targets||typeof targets!=='object'||Array.isArray(targets)))
    throw new Error('frame targets require named segment records');
  const byName=new Map(o.segments.map(s=>[s.name,s])),corrections=[];
  for(const [name,t] of Object.entries(orientationTargets??{})) {
    if(!model.joints.some(j=>j.descendants.includes(name))||!t||!Array.isArray(t.rotation)||t.rotation.length!==4
      ||t.rotation.some(v=>!Number.isFinite(v))||Math.abs(t.rotation.reduce((s,v)=>s+v*v,0)-1)>1e-8
      ||!Number.isFinite(t.gain)||t.gain<0||!Number.isFinite(t.damping)||t.damping<0)
      throw new Error('orientation target requires an actuated segment, unit quaternion and nonnegative gains');
    const body=byName.get(name),error=spinBetweenToRef(new Quaternion(...body.rotation),new Quaternion(...t.rotation),1,new Vector3());
    corrections.push({name,moment:error.scaleInPlace(t.gain).subtractInPlace(new Vector3(...body.spin).scaleInPlace(t.damping))});
  }
  for(const [name,t] of Object.entries(positionTargets??{})) {
    if(!model.joints.some(j=>j.descendants.includes(name))||!t
      ||[t.at,t.target].some(v=>!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)))
      ||!Number.isFinite(t.gain)||t.gain<0||!Number.isFinite(t.damping)||t.damping<0)
      throw new Error('position target requires an actuated segment, finite points and nonnegative gains');
    const body=byName.get(name),point=new Vector3(...t.at).applyRotationQuaternionToRef(new Quaternion(...body.rotation),new Vector3()).addInPlaceFromFloats(...body.position);
    const velocity=Vector3.Cross(new Vector3(...body.spin),point.subtract(new Vector3(...body.centre))).addInPlaceFromFloats(...body.velocity);
    const force=new Vector3(...t.target).subtractInPlace(point).scaleInPlace(t.gain).subtractInPlace(velocity.scaleInPlace(t.damping));
    corrections.push({name,point,force});
  }
  const result=new Float64Array(model.channels.length),axes=[],axis=new Vector3(),rotation=new Quaternion(),pivot=new Vector3(),arm=new Vector3(),moment=new Vector3();let start=0;
  for(const joint of model.joints) {
    const n=joint.dofs.length,angles=o.joints.slice(start,start+n).map(j=>j.angle),parent=byName.get(joint.parent);
    motionAxesToRef(joint,angles,axes);
    rotation.set(...parent.rotation).multiplyToRef(new Quaternion(...joint.parentRestInverse),rotation);
    if(positionTargets)pivot.set(...joint.pivot).applyRotationQuaternionToRef(new Quaternion(...parent.rotation),pivot).addInPlaceFromFloats(...parent.position);
    for(let k=0;k<n;k++) {
      axis.set(...axes[k]).applyRotationQuaternionToRef(rotation,axis);
      for(const c of corrections)if(joint.descendants.includes(c.name)) {
        if(c.moment)result[start+k]+=Vector3.Dot(axis,c.moment);
        else {arm.copyFrom(c.point).subtractInPlace(pivot);Vector3.CrossToRef(arm,c.force,moment);result[start+k]+=Vector3.Dot(axis,moment);}
      }
    }
    start+=n;
  }
  return result;
}

/** Weighted static muscle torques t0 - C f for the existing ground-wrench allocator. */
export function contactEffort(model,o,patches,owners,goals,p={}) {
  const feedback=contactFrameFeedback(model,o,p);
  const width=6*patches.length,count=model.channels.length,C=new Float64Array(count*width),t0=new Float64Array(count),scales=new Float64Array(count);
  const byName=new Map(o.segments.map(s=>[s.name,s])),gravity=new Vector3(...model.gravity);
  const weight=-model.segments.reduce((s,b)=>s+b.mass,0)*gravity.y;
  const rotation=new Quaternion(),axis=new Vector3(),pivot=new Vector3(),arm=new Vector3(),moment=new Vector3(),cross=new Vector3();
  const axes=[],turning=[];let start=0;
  for(const joint of model.joints) {
    const parent=byName.get(joint.parent),n=joint.dofs.length,angles=o.joints.slice(start,start+n).map(j=>j.angle);
    motionAxesToRef(joint,angles,axes);turningToRef(joint,angles,turning);
    rotation.set(...parent.rotation).multiplyToRef(new Quaternion(...joint.parentRestInverse),rotation);
    pivot.set(...joint.pivot).applyRotationQuaternionToRef(new Quaternion(...parent.rotation),pivot).addInPlaceFromFloats(...parent.position);
    moment.setAll(0);
    for(const name of joint.descendants) {
      const part=model.segments.find(s=>s.name===name),body=byName.get(name);
      arm.set(...body.centre).subtractInPlace(pivot);Vector3.CrossToRef(arm,gravity,cross);
      moment.addInPlace(cross.scaleInPlace(part.mass));
    }
    for(let j=0;j<n;j++) {
      const i=start+j,c=model.channels[i],speed=o.joints[i].speed;
      axis.set(...axes[j]).applyRotationQuaternionToRef(rotation,axis);
      let error=0;for(let k=0;k<n;k++)error+=turning[j][k]*(goals[start+k]-angles[k]);
      const peak=Math.min(c.positive.peak,c.negative.peak);
      const positive=c.positive.peak*forceVelocityFactor(speed,c.positive.curve);
      const negative=c.negative.peak*forceVelocityFactor(-speed,c.negative.curve);
      // The 5% normalization floor conditions this soft cost; actual activation retains the true capacity.
      const capacity=Math.max(.05*peak,Math.sqrt(positive*negative));
      const scale=capacity>0?(p.effortScale??1)*weight/capacity:0,feedforward=p.feedforward??1;
      scales[i]=scale;
      let torque=-Vector3.Dot(axis,moment)*feedforward+peak*((p.poseGains?.[c.name]??p.poseGain??.5)*error-(p.poseDamping??.06)*speed);
      if(feedback)torque+=peak*feedback[i];
      t0[i]=scale*torque;
      patches.forEach((patch,s)=>{
        if(!joint.descendants.includes(owners[s]))return;
        arm.copyFrom(patch.at).subtractInPlace(pivot);Vector3.CrossToRef(axis,arm,cross);
        const offset=i*width+6*s;
        C[offset]=scale*feedforward*cross.x;C[offset+1]=scale*feedforward*cross.y;C[offset+2]=scale*feedforward*cross.z;
      });
    }
    start+=n;
  }
  return {count,C,t0,scales};
}
