/** Passive-coordinate authority and whole-body ground-contact development screen. */
import {writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {isDeepStrictEqual} from 'node:util';
import {modelSpec} from '../../../src/core/bodies/models.ts';
import {derive} from '../../../src/core/quantity.ts';
import {Vector3} from '../../../src/core/math/vector.ts';
import {driveMuscles} from '../../../src/core/bodies/muscle/driver.ts';
import {jointAngles} from '../../../src/core/bodies/build/joint-state.ts';
import {coreStand,saveStand,loadStand} from '../../../tests/harness/core-stand.mjs';
import {passiveToeBody} from './passive-toe-body.mjs';
import {guardPosture} from '../../../src/skills/guard/guard.ts';
import {stockBody} from '../../../src/app/stock-body.ts';
import {uprightness} from '../../../src/control/ground.ts';
import {walkRun} from '../../../src/skills/locomotion/walk-run.ts';
import {rapierModule} from '../../../src/core/physics/rapier.ts';
import {pointOfToRef} from '../../../src/core/bodies/read-motion.ts';
const {values:o}=parseArgs({options:{out:{type:'string'},'sole-layer':{type:'boolean'},physical:{type:'boolean'},pgs:{type:'string'},seconds:{type:'string',default:'1'},hz:{type:'string',default:'120'}}});
if(!o.out)throw Error('--out names the diagnostic record');
const seconds=Number(o.seconds),pgs=o.pgs===undefined?null:Number(o.pgs);
const hz=Number(o.hz);
if(![120,480].includes(hz))throw Error('ground screen runs at 120 or 480 Hz');
if(!Number.isFinite(seconds)||seconds<=0||pgs!==null&&(!Number.isInteger(pgs)||pgs<1))throw Error('seconds and PGS are positive');
const R=await rapierModule(),layer=Object.freeze([1e6,12500,.0005]);
const original=modelSpec('man'),spec=passiveToeBody(original);
const segments=spec.segments.filter(s=>s.name==='foot.left'||s.name==='toe.left');
const foot={...spec,segments,joints:spec.joints.filter(j=>j.name==='mtp.left'),held:[],ends:[],effectors:[],
 mass:derive('kg','isolated foot mass',segments.map(s=>s.mass),(...m)=>m.reduce((a,b)=>a+b,0))};
const stand=await coreStand(foot,{gravity:false,ground:false,pinned:'foot.left',engine:'rapier-coordinate'});
const muscles=driveMuscles(stand.built,stand.world,driver=>{driver.activation.fill(1);driver.velocity.fill(Infinity);});
const toe=stand.built.segments.get('toe.left'),axis=stand.built.joints.get('mtp.left').spec.dofs[0].axis.value;
const torque=new Vector3(...axis).scale(2),dt=1/stand.world.hz;
const step=()=>{toe.body.applyTorque(torque);stand.step();};
const reading=()=>({angle:muscles.angle(0),speed:muscles.speed(0),bias:muscles.dynamics.bias[0],strength:muscles.strength(0,1),pulled:muscles.pulled[0],
 pose:{position:{...toe.pose.position},rotation:{...toe.pose.rotation}}});
let authority;
try {
 for(let i=0;i<480;i++)step();
 const full=reading(),saved=saveStand(stand.world,{muscles:muscles.state});
 for(let i=0;i<60;i++)step();const first=reading();
 loadStand(stand.world,{muscles:muscles.state},saved);for(let i=0;i<60;i++)step();const replay=reading();
 if(!isDeepStrictEqual(first,replay))throw Error('passive fork differs');
 muscles.setLevel('limp');for(let i=0;i<240;i++)step();
 const joint=stand.built.joints.get('mtp.left');
 const readSpring=()=>({angle:jointAngles(joint)[0],springTorque:joint.joint.motorStepImpulse(0)/dt});
 const limp=readSpring();
 muscles.dispose();for(let i=0;i<240;i++)step();
 authority={harness:'Node core stand, 120 Hz, Rapier coordinate, no gravity, pinned foot, 2 Nm applied toe torque',
 expectedAngle:2/25,full,forkExact:true,limp,disposed:readSpring()};
}finally{muscles.dispose();stand.dispose();}
const ground=[];
for(const body of [original,spec]) {
 const s=await coreStand(body,{ground:true,posture:guardPosture(body),engine:'rapier-coordinate',hz});
 try {
  const raw=s.world.physics.raw;
  if(pgs!==null)raw.numInternalPgsIterations=pgs;
  if(o['sole-layer']) {
   const handles=new Set();
   for(const part of s.built.segments.values())if(part.spec.name.startsWith('foot.')||part.spec.name.startsWith('toe.'))
    for(let k=0;k<part.body.rigid.numColliders();k++) {
     const collider=part.body.rigid.collider(k);
     handles.add(collider.handle);collider.setActiveHooks(collider.activeHooks()|R.ActiveHooks.MODIFY_SOLVER_CONTACTS);
    }
   const step=raw.step.bind(raw);
   raw.step=(events,hooks)=>step(events,{...hooks,contactLayer:(a,b)=>handles.has(a)||handles.has(b)?layer:null});
  }
  const host=stockBody(s.built,s.world,{servoSeconds:.1,measuring:true});
  const skill=walkRun(host.commanded);
  const physical=uprightness(s.built),runView=Object.create(host.view,{down:{get:()=>physical.fallen()}});
  let goal=null;
  host.drive((view,dt)=>{
   const d=skill.goal(o.physical?runView:view,{walk:null,face:0},dt);
   goal=d.goal??goal;
   return {posture:guardPosture(body),pushes:[],stance:view.time>0?goal:null};
  });
  const rows=[];
  for(let i=0;i<=seconds*hz;i++) {
   if(i%(hz/10)===0)rows.push({time:i/hz,down:physical.fallen(),height:physical.height(),
    feet:[...s.built.segments.values()].filter(p=>p.spec.name.startsWith('foot.')||p.spec.name.startsWith('toe.')).map(p=>({name:p.spec.name,
     position:{...p.pose.position},speed:p.body.linearVelocityToRef(new Vector3()).length(),
     groundImpulse:s.world.physics.contactsOf(p.body).filter(c=>c.fixed!==null).reduce((sum,c)=>sum+c.impulse,0)})),
    toes:[...s.built.joints.values()].filter(j=>j.spec.name.startsWith('mtp.')).map(j=>({name:j.spec.name,angle:jointAngles(j)[0],
     anchorError:pointOfToRef(j.parent,j.spec.centre.value,new Vector3()).subtract(pointOfToRef(j.child,j.spec.centre.value,new Vector3())).length()}))});
   if(i<seconds*hz)s.step();
  }
  ground.push({key:body.model,rows});
 }finally{s.dispose();}
}
const result={protocol:'passive authority and braced guard contact screen; no travel or recovery acceptance',
 conditioning:{soleLayer:o['sole-layer']?layer:null,physicalFallRule:o.physical===true,pgs,seconds,hz,groundImpulseReading:'last native step, not rate aligned'},
 body:{key:spec.model,segments:spec.segments.length,joints:spec.joints.length,mass:spec.segments.reduce((s,p)=>s+p.mass.value,0)},authority,ground};
writeFileSync(o.out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({authority,ground:ground.map(g=>({key:g.key,last:g.rows.at(-1)}))}));
