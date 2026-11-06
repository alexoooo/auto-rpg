/** Passive-coordinate authority and whole-body ground-contact development screen. */
import {writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {isDeepStrictEqual} from 'node:util';
import {modelSpec} from '../../../src/core/bodies/models.ts';
import {bodyKey} from '../../../src/core/bodies/spec/body.ts';
import {derive} from '../../../src/core/bodies/spec/quantity.ts';
import {Vector3} from '../../../src/core/math/vector.ts';
import {driveMuscles} from '../../../src/core/bodies/muscle/driver.ts';
import {jointAngles} from '../../../src/core/bodies/build/joint-state.ts';
import {coreStand,saveStand,loadStand} from '../../../tests/harness/core-stand.mjs';
import {passiveToeBody} from './passive-toe-body.mjs';
import {guardPosture} from '../../../src/skills/guard/guard.ts';
import {commandedBody} from '../../../src/app/commanded-body.ts';
import {uprightness} from '../../../src/control/ground.ts';
import {walkRun} from '../../../src/skills/locomotion/walk-run.ts';
const {values:o}=parseArgs({options:{out:{type:'string'}}});
if(!o.out)throw Error('--out names the diagnostic record');
const original=modelSpec('workshop-fighter'),spec=passiveToeBody(original);
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
 const s=await coreStand(body,{ground:true,posture:guardPosture(body),engine:'rapier-coordinate'});
 try {
  const host=commandedBody(s.built,s.world,{servoSeconds:.1,measuring:true});
  const skill=walkRun(host.driver);
  let goal=null;
  host.drive((view,dt)=>{
   const d=skill.goal(view,{walk:null,face:0},dt);
   goal=d.goal??goal;
   return {posture:guardPosture(body),pushes:[],stance:view.time>0?goal:null};
  });
  const physical=uprightness(s.built),rows=[];
  for(let i=0;i<=120;i++) {
   if(i%12===0)rows.push({time:i/120,down:physical.fallen(),height:physical.height(),
    feet:[...s.built.segments.values()].filter(p=>p.spec.name.startsWith('foot.')||p.spec.name.startsWith('toe.')).map(p=>({name:p.spec.name,
     position:{...p.pose.position},speed:p.body.linearVelocityToRef(new Vector3()).length(),
     groundImpulse:s.world.physics.contactsOf(p.body).filter(c=>c.fixed!==null).reduce((sum,c)=>sum+c.impulse,0)})),
    toes:[...s.built.joints.values()].filter(j=>j.spec.name.startsWith('mtp.')).map(j=>({name:j.spec.name,angle:jointAngles(j)[0]}))});
   if(i<120)s.step();
  }
  ground.push({key:bodyKey(body),rows});
 }finally{s.dispose();}
}
const result={protocol:'passive authority and braced guard contact screen; no travel or recovery acceptance',
 body:{key:bodyKey(spec),segments:spec.segments.length,joints:spec.joints.length,mass:spec.segments.reduce((s,p)=>s+p.mass.value,0)},authority,ground};
writeFileSync(o.out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({authority,ground:ground.map(g=>({key:g.key,last:g.rows.at(-1)}))}));
