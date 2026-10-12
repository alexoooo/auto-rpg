import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { groundWrenchWork, shareGroundWrench } from '../src/core/control/contact-wrench.ts';
import { motionAxesToRef, turningToRef } from '../src/core/build/joint-state.ts';
import { forceVelocityFactor } from '../src/core/muscle/force-velocity.ts';
import { spinBetweenToRef, turnAboutToRef } from '../src/core/math/turn.ts';
import { atan2 } from '../src/core/math/real.ts';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Desired ground reactions are converted to internal joint torques, never applied to a rigid body. */
export function contactPolicy({model,parameters:p={}}) {
  const state={phase:p.phase??'hold',started:null,heading:null,held:0,released:false,
    contacts:[],requestedForce:[0,0,0],miss:[0,0,0],saturated:0,gravityTorque:[],contactTorque:[],torque:[]};
  const mass=model.segments.reduce((s,b)=>s+b.mass,0), gravity=new Vector3(...model.gravity),weight=-mass*gravity.y;
  const work=groundWrenchWork(0,24), shares=Array.from({length:24},()=>({force:new Vector3(),moment:new Vector3()}));
  const rest=new Quaternion(...model.rootRest), inverseRest=Quaternion.Inverse(rest), relative=new Quaternion(), rotation=new Quaternion();
  const target=new Quaternion(),yaw=new Quaternion(),pitch=new Quaternion(),turnError=new Vector3(),up=new Vector3(),across=new Vector3();
  const point=new Vector3(),axis=new Vector3(),pivot=new Vector3(),arm=new Vector3(),force=new Vector3(),moment=new Vector3();
  const axes=[],turning=[],velocity=model.channels.map(()=>0),activation=model.channels.map(()=>0);
  const postureAngles=name=>name==='reference'?model.referenceAngles:model.channels.map(c=>{
    const pose=model.poses.find(s=>s.name===name);if(!pose)throw new Error(`unknown contact posture ${name}`);
    return clamp((pose.posture[c.name]??0)-c.bind,c.min,c.max);
  });
  const goals=postureAngles(p.posture??'reference');
  const policy=o=> {
    if(state.released)return {kind:'host'};
    state.started??=o.time;
    const byName=new Map(o.segments.map(s=>[s.name,s])),root=byName.get('lowerTrunk');
    relative.set(...root.rotation).multiplyToRef(inverseRest,relative);
    up.set(0,1,0).applyRotationQuaternionToRef(relative,up);
    across.set(1,0,0).applyRotationQuaternionToRef(relative,across);
    state.heading??=atan2(-across.z,across.x);
    const loaded=o.contacts.filter(c=>c.fixed!==null&&c.impulse>0&&-c.normal[1]>.9
      && /^(foot|hand|shank)\./.test(c.segment));
    const patches=[],owners=[];
    for(const c of loaded) {
      const raw=(c.patch??[]).filter(pt=>pt.distance<=0&&-pt.normal[1]>.9).map(pt=>pt.point);
      const points=raw.length?raw:[c.point];
      for(const pt of points) {
        if(patches.length===24)break;
        if(patches.some((p,i)=>owners[i]===c.segment&&p.at.subtractFromFloats(...pt).lengthSquared()<1e-8))continue;
        patches.push({kind:'point',at:new Vector3(...pt)});owners.push(c.segment);
      }
    }
    state.contacts=[...new Set(owners)];
    const centre=new Vector3(...o.centre),comVelocity=new Vector3();
    for(const part of model.segments)comVelocity.addInPlaceFromFloats(...byName.get(part.name).velocity.map(v=>v*part.mass/mass));
    if(patches.length) {
      point.setAll(0);for(const patch of patches)point.addInPlace(patch.at);point.scaleInPlace(1/patches.length);
      const ground=point.y,height=(p.height??1)*model.standing;
      force.set(mass*((p.horizontal??8)*(point.x-centre.x)-(p.linearDamping??4)*comVelocity.x),
        clamp(weight+mass*((p.vertical??30)*(ground+height-centre.y)-(p.verticalDamping??8)*comVelocity.y),0,weight*(p.maxLoad??2)),
        mass*((p.horizontal??8)*(point.z-centre.z)-(p.linearDamping??4)*comVelocity.z));
      turnAboutToRef(Vector3.UpReadOnly,state.heading,yaw);
      turnAboutToRef(Vector3.RightReadOnly,p.pitch??0,pitch);
      yaw.multiplyToRef(pitch,target);target.multiplyInPlace(rest);
      spinBetweenToRef(new Quaternion(...root.rotation),target,1,turnError);
      moment.set(...turnError.asArray().map((v,i)=>weight*((p.orientation??.15)*v-(p.angularDamping??.04)*root.spin[i])));
      const miss={force:new Vector3(),moment:new Vector3()};
      shareGroundWrench(work,patches,centre,force,moment,model.friction,.3,shares,miss);
      state.requestedForce=force.asArray();state.miss=miss.force.asArray();
    }else {state.requestedForce=[0,0,0];state.miss=[0,0,0];}
    let start=0;state.saturated=0;
    for(const joint of model.joints) {
      const parent=byName.get(joint.parent),n=joint.dofs.length;
      const angles=o.joints.slice(start,start+n).map(j=>j.angle);
      motionAxesToRef(joint,angles,axes);turningToRef(joint,angles,turning);
      rotation.set(...parent.rotation).multiplyToRef(new Quaternion(...joint.parentRestInverse),rotation);
      pivot.set(...joint.pivot).applyRotationQuaternionToRef(new Quaternion(...parent.rotation),pivot).addInPlaceFromFloats(...parent.position);
      moment.setAll(0);
      for(const name of joint.descendants) {
        const part=model.segments.find(s=>s.name===name),body=byName.get(name);
        arm.set(...body.centre).subtractInPlace(pivot);
        Vector3.CrossToRef(arm,gravity,point);moment.addInPlace(point.scaleInPlace(part.mass));
      }
      const gravityMoment=moment.clone();
      for(let i=0;i<patches.length;i++)if(joint.descendants.includes(owners[i])) {
        arm.copyFrom(patches[i].at).subtractInPlace(pivot);
        Vector3.CrossToRef(arm,shares[i].force,point);moment.addInPlace(point);
      }
      for(let j=0;j<n;j++) {
        const i=start+j,c=model.channels[i],obs=o.joints[i];
        axis.set(...axes[j]).applyRotationQuaternionToRef(rotation,axis);
        const supportTorque=-Vector3.Dot(axis,moment)*(p.feedforward??1);
        let error=0;for(let k=0;k<n;k++)error+=turning[j][k]*(goals[start+k]-angles[k]);
        const scale=Math.min(c.positive.peak,c.negative.peak);
        const torque=supportTorque+scale*((p.poseGain??.5)*error-(p.poseDamping??.06)*obs.speed);
        state.gravityTorque[i]=-Vector3.Dot(axis,gravityMoment);
        state.contactTorque[i]=-Vector3.Dot(axis,moment)-state.gravityTorque[i];
        state.torque[i]=torque;
        const side=torque>=0?c.positive:c.negative;
        const capacity=side.peak*forceVelocityFactor((torque>=0?1:-1)*obs.speed,side.curve);
        activation[i]=capacity>0?Math.min(1,Math.abs(torque)/capacity):0;
        velocity[i]=torque>0?'+inf':torque<0?'-inf':0;
        if(activation[i]===1)state.saturated++;
      }
      start+=n;
    }
    if([...activation].some(v=>!Number.isFinite(v)))throw new Error('nonfinite contact-policy command');
    return {kind:'muscles',activation:[...activation],velocity:[...velocity],handPoses:{left:'open',right:'open'}};
  };
  policy.state=state;return policy;
}
