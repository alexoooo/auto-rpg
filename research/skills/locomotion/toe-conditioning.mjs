/** Solver override for development stands without save/load; articulated replacements are diagnostic only. */
import {rapierModule} from '../../../src/core/physics/rapier.ts';
import {local} from '../../../src/core/bodies/build/collider.ts';
import {Vector3} from '../../../src/core/math/vector.ts';
export async function conditionToeStand(stand,configuration) {
 const {pgs=32,stiffness=1e6,damping=12500,depth=.0005,articulated=false,soleLayer=true}=configuration;
 if(typeof articulated!=='boolean'||typeof soleLayer!=='boolean')throw Error('articulation and sole-layer selectors are boolean');
 if(!Number.isInteger(pgs)||pgs<1||![stiffness,depth].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(damping)||damping<0)
  throw Error('toe contact conditioning requires positive PGS, stiffness and depth, and nonnegative damping');
 const R=await rapierModule(),raw=stand.world.physics.raw,handles=new Set(),layer=Object.freeze([stiffness,damping,depth]);
 if(articulated)for(const joint of stand.built.joints.values())if(joint.spec.dofs[0]?.passive) {
  if(joint.spec.dofs.length!==1)throw Error('toe articulation screen needs one passive freedom');
  const p=joint.parent,c=joint.child,centre=joint.spec.centre.value,spec=joint.spec.dofs[0],spring=spec.passive;
  const a=local(p.frame,centre),b=local(c.frame,centre),axis=spec.axis.value;
  const x=new Vector3(...axis),direction=new Vector3(Vector3.Dot(x,new Vector3(...p.frame.x)),Vector3.Dot(x,new Vector3(...p.frame.y)),Vector3.Dot(x,new Vector3(...p.frame.z)));
  const xyz=v=>({x:v[0],y:v[1],z:v[2]});
  joint.joint.release();
  const hinge=raw.createMultibodyJoint(R.JointData.revolute(xyz(a),xyz(b),direction),p.body.rigid,c.body.rigid,true);
  hinge.setContactsEnabled(false);
  raw.multibodyJoints.raw.jointSetLimits(hinge.handle,R.JointAxis.AngX,spec.min.value,spec.max.value);
  const motor=raw.createImpulseJoint(R.JointData.generic(xyz(a),xyz(b),direction,0),p.body.rigid,c.body.rigid,true);
  motor.setContactsEnabled(false);
  const native=raw.impulseJoints.raw;
  native.jointConfigureMotorModel(motor.handle,R.JointAxis.AngX,R.MotorModel.ForceBased);
  native.jointConfigureMotorPosition(motor.handle,R.JointAxis.AngX,spring.rest.value,spring.stiffness.value,spring.damping.value);
  // A diagnostic replacement: no save/load or release trials use this stand.
  joint.joint={get attached(){return hinge.isValid();},motorStepImpulse:()=>-native.jointMotorStepImpulse(motor.handle,R.JointAxis.AngX),
   setMotor(){throw Error('a passive diagnostic hinge cannot be actuated');},release(){throw Error('diagnostic hinge release is not implemented');}};
  joint.attached=()=>hinge.isValid();
 }
 raw.numInternalPgsIterations=pgs;
 if(soleLayer)for(const part of stand.built.segments.values())if(part.spec.name.startsWith('foot.')||part.spec.name.startsWith('toe.'))
  for(let k=0;k<part.body.rigid.numColliders();k++) {
   const collider=part.body.rigid.collider(k);
   handles.add(collider.handle);collider.setActiveHooks(collider.activeHooks()|R.ActiveHooks.MODIFY_SOLVER_CONTACTS);
  }
 if(soleLayer) {
  const step=raw.step.bind(raw);
  raw.step=(events,hooks)=>step(events,{...hooks,contactLayer:(a,b)=>handles.has(a)||handles.has(b)?layer:null});
 }
 return Object.freeze({pgs,stiffness,damping,depth,articulated,soleLayer});
}
