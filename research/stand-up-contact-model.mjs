import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { CONTACT_FRICTION } from '../src/core/engine/engine.ts';
import { RISE } from '../src/core/mind/rise/stages.ts';

/** Static physical data for a detached policy; no engine or scene objects cross this boundary. */
export function contactModel(environment) {
  const data=value=>JSON.parse(JSON.stringify(value));
  const { built } = environment.stand, observation=environment.observe();
  const joints=[...built.joints.values()];
  const descendants=name=>[name,...joints.filter(j=>j.spec.parent===name).flatMap(j=>descendants(j.spec.child))];
  return {
    identity:environment.identity,
    gravity:[...environment.stand.world.physics.gravity],friction:CONTACT_FRICTION,
    standing:observation.height,rootRest:built.segments.get('lowerTrunk').rest.asArray(),
    referenceAngles:observation.joints.map(j=>j.angle),
    channels:environment.body.muscles.channels.map(c=>({name:c.name,min:c.dof.spec.min.value,max:c.dof.spec.max.value,
      bind:c.dof.spec.bind.value,positive:structuredClone(c.positive),negative:structuredClone(c.negative)})),
    segments:[...built.segments.values()].map(s=>({name:s.spec.name,mass:s.rigid.mass,
      referenceCentre:observation.segments.find(part=>part.name===s.spec.name).centre,
      frame:structuredClone(s.frame),rest:s.rest.asArray(),rigid:data(s.rigid),
      properties:{...structuredClone(s.body.massProperties),orientation:s.body.massProperties.orientation.asArray()}})),
    joints:joints.map(j=> {
      const f=j.parent.frame,d=j.spec.centre.value.map((v,i)=>v-f.origin[i]);
      return {parent:j.spec.parent,child:j.spec.child,spec:data(j.spec),dofs:data(j.dofs),axes:structuredClone(j.axes),
        parentRestInverse:Quaternion.Inverse(j.parent.rest).asArray(),
        pivot:[f.x,f.y,f.z].map(a=>a.reduce((s,v,i)=>s+v*d[i],0)),descendants:descendants(j.spec.child)};
    }),
    poses:structuredClone(RISE.rise.filter(s=>s.posture!=='reference').map(s=>({name:s.name,posture:s.posture}))),
  };
}
