import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { motionAxesToRef, turningToRef } from '../src/core/build/joint-state.ts';
import { forceVelocityFactor } from '../src/core/muscle/force-velocity.ts';

/** Weighted static muscle torques t0 - C f for the existing ground-wrench allocator. */
export function contactEffort(model,o,patches,owners,goals,p={}) {
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
      t0[i]=scale*(-Vector3.Dot(axis,moment)*feedforward+peak*((p.poseGain??.5)*error-(p.poseDamping??.06)*speed));
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
