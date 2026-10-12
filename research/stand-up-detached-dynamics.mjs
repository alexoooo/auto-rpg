import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { forceVelocityFactor } from '../src/core/muscle/force-velocity.ts';

/** Read-only prediction bodies reconstructed from static anatomy and detached observations. */
export function detachedDynamics(model) {
  let observation;
  const segments=new Map(model.segments.map(s=>{
    const node={position:new Vector3(),rotationQuaternion:new Quaternion()};
    const state={velocity:new Vector3(),spin:new Vector3()};
    const body={node,massProperties:{...s.properties,orientation:new Quaternion(...s.properties.orientation)},
      linearVelocityToRef:out=>out.copyFrom(state.velocity),angularVelocityToRef:out=>out.copyFrom(state.spin)};
    return [s.name,{spec:{name:s.name},frame:s.frame,rigid:s.rigid,rest:new Quaternion(...s.rest),node,body,state}];
  }));
  const joints=new Map(model.joints.map(j=>[j.spec.name,{...j,parent:segments.get(j.parent),child:segments.get(j.child)}]));
  const channels=[...joints.values()].flatMap(joint=>joint.dofs.map((dof,index)=>({joint,dof,index})));
  channels.forEach((c,i)=>Object.assign(c,model.channels[i]));
  const muscles={channels,angle:i=>observation.joints[i].angle,rate:i=>observation.joints[i].rate,speed:i=>observation.joints[i].speed,
    strength:(i,sense)=>{const side=sense>0?channels[i].positive:channels[i].negative;
      return side.peak*forceVelocityFactor(sense*observation.joints[i].speed,side.curve);}};
  const names=new Map([...segments].map(([name,s])=>[s.body,name]));
  const physics={gravity:model.gravity,contactManifoldsOf:body=>observation.contacts
    .filter(c=>c.segment===names.get(body)&&c.fixed!==null)
    .flatMap(c=>(c.patch??[]).map(p=>{
      // The observation has no patch collider id. The nearest measured impulse pair estimates it.
      const pairs=[...c.pairs].sort((a,b)=>a.point.reduce((s,v,i)=>s+(v-p.point[i])**2,0)-b.point.reduce((s,v,i)=>s+(v-p.point[i])**2,0));
      return {mine:pairs[0]?.mine??0,normal:p.normal,points:[{point:p.point,distance:p.distance}]};
    }))};
  return {built:{segments,joints},muscles,physics,
    read(o) {observation=o;for(const s of o.segments) {
      const target=segments.get(s.name);target.node.position.set(...s.position);target.node.rotationQuaternion.set(...s.rotation);
      target.state.velocity.set(...s.velocity);target.state.spin.set(...s.spin);
    }},
  };
}
