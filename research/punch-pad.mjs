import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { lowsOf } from '../src/core/control/ground.ts';
import { pointOfToRef, motionAtToRef } from '../src/core/control/support.ts';

/** A research apparatus, not human anatomy; assumptions and sensitivity: docs/reference/punch-calibration.md. */
export const PUNCH_PAD = Object.freeze({ mass: 8, size: Object.freeze([.2, .4, .11]),
  stiffness: 40000, dampingRatio: .35, quietImpulse: 1e-4,
  face:'rigid', faceStiffness:10000, faceDamping:20 });

/** Sliding, rotation-locked pad; momentum balance includes every native solver/CCD substep. */
export function punchPad(world, front, settings = {}) {
  const config = {...PUNCH_PAD, ...settings};
  if (!(config.mass > 0) || !(config.stiffness >= 0) || !(config.dampingRatio >= 0)
    || !(config.quietImpulse > 0) || !['rigid','compliant'].includes(config.face)
    || !(config.faceStiffness>0) || !(config.faceDamping>=0)
    || ![config.mass, config.stiffness, config.dampingRatio, config.quietImpulse, config.faceStiffness,config.faceDamping,...front, ...config.size].every(Number.isFinite)
    || config.size.length !== 3 || config.size.some(v=>v<=0)) throw new Error('invalid punch pad');
  const node = new TransformNode('punch-pad', world.scene);
  node.position.set(front[0], front[1], front[2] + config.size[2]/2);
  node.rotationQuaternion = Quaternion.Identity();
  const [x,y,z] = config.size, m = config.mass;
  const body = world.physics.addBody(node, [{kind:'box', centre:[0,0,0], size:config.size}],
    {mass:m, centre:[0,0,0], moments:[m*(y*y+z*z)/12,m*(x*x+z*z)/12,m*(x*x+y*y)/12], orientation:Quaternion.Identity()}, {ccd:true});
  if (!body.rigid) throw new Error('the punch apparatus requires the Rapier research binding');
  body.rigid.setGravityScale(0, true);
  body.rigid.setEnabledTranslations(false, false, true, true);
  body.rigid.setEnabledRotations(false, false, false, true);
  if(config.face==='compliant')body.rigid.collider(0).setSensor(true);
  const damping = 2*config.dampingRatio*Math.sqrt(config.stiffness*m), rest = node.position.z;
  const velocity = new Vector3(), force = new Vector3(),from=new Vector3(),to=new Vector3(),at=new Vector3(),speed=new Vector3(),spin=new Vector3();
  const state = {velocity:0, force:0,materialContacts:[]};
  return {body, node, config, damping, state,
    prepare() {
      state.velocity = body.linearVelocityToRef(velocity).z;
      state.force = -config.stiffness*(node.position.z-rest)-damping*state.velocity;
      state.materialContacts=[];
      body.applyForce(force.set(0,0,state.force), node.position);
    },
    load(segment) {
      if(config.face!=='compliant')return;
      const shape=segment.rigid.shapes[0];
      if(shape.kind==='capsule') {
        pointOfToRef(segment,shape.from.value,from);pointOfToRef(segment,shape.to.value,to);
        at.copyFrom(from.z>to.z?from:to);at.z+=shape.radius.value;
      } else {
        let front=-Infinity;
        for(const point of lowsOf(shape,segment.frame)) {
          pointOfToRef(segment,point.at,from);from.z+=point.radius;
          if(from.z>front){front=from.z;at.copyFrom(from);}
        }
      }
      const penetration=at.z-(node.position.z-config.size[2]/2);
      if(penetration<=0||Math.abs(at.x-node.position.x)>config.size[0]/2||Math.abs(at.y-node.position.y)>config.size[1]/2)return;
      motionAtToRef(segment,at,speed,spin);
      const load=Math.max(0,config.faceStiffness*penetration+config.faceDamping*(speed.z-state.velocity));
      if(!load)return;
      segment.body.applyForce(force.set(0,0,-load),at);
      body.applyForce(force.set(0,0,load),node.position);
      state.materialContacts.push({segment:segment.spec.name,point:at.asArray(),force:load,penetration});
    },
    read() {
      const speed = body.linearVelocityToRef(velocity).z;
      const impulse = m*(speed-state.velocity)-state.force*world.dt;
      const contacts = world.physics.contactsOf(body).filter(c=>c.impulse>0);
      return {time:world.time, impulse, force:impulse/world.dt, mountForce:-state.force,
        displacement:node.position.z-rest, speed, contacts,
        materialContacts:structuredClone(state.materialContacts),
        narrowImpulse:contacts.reduce((sum,c)=>sum+c.impulse*c.normal[2]*-1,0)};
    },
    dispose() {world.physics.removeBody(body);node.dispose();},
  };
}
