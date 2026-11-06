/**
 * Physical slab toes under a held foot carrying a selected share of the Warrior's weight. Dimensions come
 * from its current foot and toes; uniform volume splits the foot mass between the two boxes.
 * The remaining load is a point at the ankle. Its full parallel-axis inertia is retained.
 * An external angular constraint holds the foot, so this is a mechanical fixture, not a skill.
 *
 * node research/toe-support.mjs --out <file.json> [--pitches 0,0.5,1.45] [--seconds 6]
 * --load selects body-mass share (default 0.5). --sole-layer gives both sole parts the same
 * numerical contact layer; --contact-damping and --pgs are solver controls, not anatomy.
 * --frequency rocks the held foot by 0.25 rad using an external velocity drive. Its pitch
 * torque is metered separately; this driven fixture cannot establish unassisted movement.
 * --sole-layer --load 1 --contact-damping 12500 --pgs 8 --seconds 16 screens full-weight support.
 */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {loadEngine} from '../src/core/physics/engines.ts';
import {rapierModule} from '../src/core/physics/rapier.ts';
import {Quaternion,Vector3} from '../src/core/math/vector.ts';
import {sin,cos,atan2} from '../src/core/math/real.ts';
import {modelSpec} from '../src/core/bodies/models.ts';
import {frameOf} from '../src/core/bodies/spec/body.ts';
import {local} from '../src/core/bodies/build/collider.ts';
import {principalOf} from '../src/core/bodies/build/rigid.ts';
const sourceSha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');

const {values:o}=parseArgs({options:{out:{type:'string'},pitches:{type:'string',default:'0,0.5,1.45'},seconds:{type:'string',default:'6'},
  'contact-damping':{type:'string',default:'0'},pgs:{type:'string'},load:{type:'string',default:'0.5'},frequency:{type:'string',default:'0'},'sole-layer':{type:'boolean',default:false}}});
const seconds=Number(o.seconds),pitches=o.pitches.split(',').map(Number);
const contactDamping=Number(o['contact-damping']);
if(!Number.isFinite(contactDamping)||contactDamping<0)throw Error('--contact-damping is nonnegative N s/m');
const pgs=o.pgs===undefined?null:Number(o.pgs);
if(pgs!==null&&(!Number.isInteger(pgs)||pgs<1))throw Error('--pgs is a positive iteration count');
const loadShare=Number(o.load),frequency=Number(o.frequency),amplitude=.25;
if(!Number.isFinite(loadShare)||loadShare<=0||!Number.isFinite(frequency)||frequency<0)throw Error('--load is a positive body-mass share and --frequency is nonnegative Hz');
if(!o.out||!Number.isFinite(seconds)||seconds<2||pitches.some(p=>!Number.isFinite(p)||p<0||p>Math.PI/2))
  throw Error('--out names the reading; seconds is at least two and pitches lie in [0,pi/2]');
if(frequency&&pitches.some(p=>p-amplitude<0||p+amplitude>Math.PI/2))throw Error('rocking pitches retain the amplitude within [0,pi/2]');
const spec=modelSpec('workshop-fighter'),foot=spec.segments.find(s=>s.name==='foot.left');
const [width,length,height]=foot.shape.size.value,toeLength=foot.toes.length.value,thickness=foot.toes.thickness.value;
const toeMass=foot.mass.value*(toeLength*thickness)/(length*height+toeLength*thickness);
const footMass=foot.mass.value-toeMass,loadMass=spec.mass.value*loadShare-foot.mass.value,parentMass=footMass+loadMass;
if(loadMass<0)throw Error('--load must include the foot mass');
const frame=frameOf(foot),c=local(frame,foot.shape.centre.value);
const a=local(frame,spec.joints.find(j=>j.name==='ankle.left').centre.value);
const ankle=[a[0]-c[0],-(a[2]-c[2]-height/2),a[1]-c[1]-length/2],footCentre=[0,height/2,-length/2];
const parentCentre=ankle.map((v,i)=>(v*loadMass+footCentre[i]*footMass)/parentMass);
const moments=(mass,size)=>[mass*(size[1]**2+size[2]**2)/12,mass*(size[0]**2+size[2]**2)/12,mass*(size[0]**2+size[1]**2)/12];
const footMoments=moments(footMass,[width,height,length]);
const tensor=footMoments.map((v,i)=>[0,1,2].map(j=>i===j?v:0));
for(const part of [{mass:footMass,centre:footCentre},{mass:loadMass,centre:ankle}]) {
  const r=part.centre.map((v,i)=>v-parentCentre[i]),norm=r.reduce((s,v)=>s+v*v,0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)tensor[i][j]+=part.mass*((i===j?norm:0)-r[i]*r[j]);
}
const principal=principalOf([tensor[0][0],tensor[1][1],tensor[2][2],tensor[0][1],tensor[0][2],tensor[1][2]]);
const orientation=Quaternion.RotationQuaternionFromAxis(...principal.axes.map(axis=>new Vector3(...axis)));
const fixture=Object.freeze({width,length,height,toeLength,thickness,toeMass,footMass,loadMass,parentMass,parentCentre,
  parentTensor:tensor,parentMoments:principal.moments,parentOrientation:{...orientation},ankle,
  // Spring coefficients use SOURCES["falisse-2022-toes"]; contact coefficients are fixture controls.
  stiffness:25,damping:2,layer:Object.freeze([1e6,contactDamping,.0005]),soleLayer:o['sole-layer'],floorSide:200,clearance:.0005,seconds,loadShare,frequency,amplitude,friction:foot.surface.friction?.value});
const engine=await loadEngine('rapier-coordinate'),R=await rapierModule(),rows=[];
const corners=(centre,size)=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>
  [centre[0]+x*size[0]/2,centre[1]+y*size[1]/2,centre[2]+z*size[2]/2])));
const toeCentre=[0,thickness/2,toeLength/2],toeSize=[width,thickness,toeLength],footSize=[width,height,length];
const toeCorners=corners(toeCentre,toeSize),footCorners=corners(footCentre,footSize),allCorners=[...toeCorners,...footCorners];

for(const hz of [120,480])for(const pitch of pitches) {
  const physics=engine.createPhysics({hz,gravity:true});
  try {
    const q=new Quaternion(sin(pitch/2),0,0,cos(pitch/2));
    const minY=Math.min(...allCorners.map(p=>new Vector3(...p).applyRotationQuaternionToRef(q,new Vector3()).y));
    const pose=name=>({name,position:new Vector3(0,fixture.clearance-minY,0),rotation:q.clone()});
    const materials=[{friction:fixture.friction}];
    const parent=physics.addBody(pose('loaded-foot'),[{kind:'box',centre:footCentre,size:footSize}],
      {mass:parentMass,centre:parentCentre,moments:principal.moments,orientation},{materials});
    const child=physics.addBody(pose('toe'),[{kind:'box',centre:toeCentre,size:toeSize}],
      {mass:toeMass,centre:toeCentre,moments:moments(toeMass,toeSize),orientation:Quaternion.Identity()},{materials});
    physics.addFixedBox([0,-.5,0],[fixture.floorSide,1,fixture.floorSide]);
    const raw=physics.raw,zero={x:0,y:0,z:0},axis={x:1,y:0,z:0};
    if(pgs!==null)raw.numInternalPgsIterations=pgs;
    const anchor=raw.createRigidBody(R.RigidBodyDesc.fixed());
    const held=raw.createImpulseJoint(R.JointData.generic(zero,zero,axis,
      (frequency?0:R.JointAxesMask.AngX)|R.JointAxesMask.AngY|R.JointAxesMask.AngZ),anchor,parent.rigid,true);
    held.setLocalFrame1(zero,q);held.setLocalFrame2(zero,Quaternion.Identity());
    const hinge=raw.createMultibodyJoint(R.JointData.revolute(zero,zero,axis),parent.rigid,child.rigid,true);
    hinge.setContactsEnabled(false);
    raw.multibodyJoints.raw.jointSetLimits(hinge.handle,R.JointAxis.AngX,-Math.PI/2,Math.PI/2);
    const motor=raw.createImpulseJoint(R.JointData.generic(zero,zero,axis,0),parent.rigid,child.rigid,true);
    motor.setContactsEnabled(false);
    const set=raw.impulseJoints.raw;
    if(frequency) {
      set.jointConfigureMotorModel(held.handle,R.JointAxis.AngX,R.MotorModel.AccelerationBased);
      set.jointSetMotorMaxForce(held.handle,R.JointAxis.AngX,1e6);
    }
    set.jointConfigureMotorModel(motor.handle,R.JointAxis.AngX,R.MotorModel.ForceBased);
    set.jointConfigureMotorPosition(motor.handle,R.JointAxis.AngX,0,fixture.stiffness,fixture.damping);
    const handles=[child.rigid.collider(0),...(fixture.soleLayer?[parent.rigid.collider(0)]:[])].map(collider=>{
      collider.setActiveHooks(collider.activeHooks()|R.ActiveHooks.MODIFY_SOLVER_CONTACTS);return collider.handle;
    }),step=raw.step.bind(raw);
    raw.step=(events,hooks)=>step(events,{...hooks,contactLayer:(a,b)=>handles.includes(a)||handles.includes(b)?fixture.layer:null});
    let impulse=0,groundImpulse=0,totalGroundImpulse=0,driveImpulse=0,leftFloorAt=null;
    const whole={maxToeDepth:0,maxFootDepth:0,maxAnchorError:0,maxFootAngleError:0,maxPitchDriveTorque:frequency?0:null};
    const samples=[],every=hz/120;
    for(let i=1;i<=seconds*hz;i++) {
      if(frequency) {
        const moving=pitch+amplitude*Math.min(1,i/hz)*sin(2*Math.PI*frequency*i/hz);
        const current=2*atan2(parent.pose.rotation.x,parent.pose.rotation.w);
        // Drive the interval's rotation continuously instead of teleporting a locked frame.
        set.jointConfigureMotorVelocity(held.handle,R.JointAxis.AngX,(moving-current)*hz,Infinity);
      }
      physics.step(1/hz);
      if(frequency)driveImpulse+=set.jointMotorStepImpulse(held.handle,R.JointAxis.AngX);
      impulse-=set.jointMotorStepImpulse(motor.handle,R.JointAxis.AngX);
      const toeImpulse=physics.contactsOf(child).reduce((s,c)=>s+c.impulse,0);
      groundImpulse+=toeImpulse;
      totalGroundImpulse+=toeImpulse+physics.contactsOf(parent).reduce((s,c)=>s+c.impulse,0);
      if(i%every!==0)continue;
      if(frequency)whole.maxPitchDriveTorque=Math.max(whole.maxPitchDriveTorque,Math.abs(driveImpulse*120));
      if(Math.max(Math.abs(parent.pose.position.x),Math.abs(parent.pose.position.z))>fixture.floorSide/2-Math.max(width,length))leftFloorAt??=i/hz;
      const depthOf=(points,body)=>Math.max(0,...points.map(p=>-new Vector3(...p).applyRotationQuaternionToRef(body.pose.rotation,new Vector3()).add(body.pose.position).y));
      const depth=depthOf(toeCorners,child),footDepth=depthOf(footCorners,parent);
      const anchorError=parent.pose.position.subtract(child.pose.position).length();
      const requested=pitch+(frequency?amplitude*Math.min(1,i/hz)*sin(2*Math.PI*frequency*i/hz):0);
      const footAngle=2*atan2(parent.pose.rotation.x,parent.pose.rotation.w);
      whole.maxToeDepth=Math.max(whole.maxToeDepth,depth);whole.maxFootDepth=Math.max(whole.maxFootDepth,footDepth);
      whole.maxAnchorError=Math.max(whole.maxAnchorError,anchorError);whole.maxFootAngleError=Math.max(whole.maxFootAngleError,Math.abs(footAngle-requested));
      if(i/hz>seconds-1) {
        const rel=Quaternion.Inverse(parent.pose.rotation).multiply(child.pose.rotation),angle=2*atan2(rel.x,rel.w);
        const pv=parent.rigid.linvel(),ps=parent.rigid.angvel(),cs=child.rigid.angvel();
        samples.push({angle,depth,spring:impulse*120,law:-fixture.stiffness*angle-fixture.damping*(cs.x-ps.x),
          toeLoad:groundImpulse*120,footAngle,
          groundLoad:totalGroundImpulse*120,
          requested,anchorError,speed:Math.hypot(pv.x,pv.y,pv.z),
          position:[parent.pose.position.x,parent.pose.position.y,parent.pose.position.z]});
      }
      impulse=0;groundImpulse=0;totalGroundImpulse=0;driveImpulse=0;
    }
    const mean=key=>samples.reduce((s,row)=>s+row[key],0)/samples.length;
    const row={hz,pitch,pgs:raw.numInternalPgsIterations,samples:samples.length,angle:mean('angle'),spring:mean('spring'),law:mean('law'),toeLoad:mean('toeLoad'),
      maxDepth:Math.max(...samples.map(s=>s.depth)),maxAnchorError:Math.max(...samples.map(s=>s.anchorError)),
      maxFootAngleError:Math.max(...samples.map(s=>Math.abs(s.footAngle-s.requested))),maxSpeed:Math.max(...samples.map(s=>s.speed)),
      groundLoad:mean('groundLoad'),supportShare:samples.filter(s=>s.groundLoad>0).length/samples.length,leftFloorAt,
      status:leftFloorAt!==null?'left floor':mean('groundLoad')===0?'lost support':'measured',whole,finalPosition:samples.at(-1).position,
      angleRange:Math.max(...samples.map(s=>s.angle))-Math.min(...samples.map(s=>s.angle))};
    rows.push(row);console.log(JSON.stringify(row));
  }finally{physics.dispose();}
}
mkdirSync(dirname(o.out),{recursive:true});
writeFileSync(o.out,JSON.stringify({question:'Does a volume-derived physical slab toe support the selected body load?',
  harness:{name:'Node core stand',engine:engine.name,revision:engine.revision,rates:[120,480],readHz:120},
  model:spec.model,node:process.version,sourceSha256,fixture,
  reading:'Last-second means and extremes, plus whole-run extremes, at 120 Hz spacing. Integrated torque and ground impulse over each 1/120 s interval. No contact-centroid moment inference. Status measured records a reached case, not a pass.',rows},null,2)+'\n');
