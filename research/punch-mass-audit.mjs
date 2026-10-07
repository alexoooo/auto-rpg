import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {coreStand} from '../tests/harness/core-stand.mjs';
import {modelSpec} from '../src/core/models.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {contactMass} from '../src/core/build/contact-mass.ts';
import {motionAtToRef,pointOfToRef} from '../src/core/control/support.ts';
import {rigidPoints} from '../src/core/build/rigid.ts';
import {combatSkills} from '../src/core/skills/combat.ts';
import {standIntent} from '../src/core/mind/intent.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
async function pulse(mode,hand,impulse,hz){
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,hz,gravity:mode==='grounded',ground:mode==='grounded'});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS}),skills=combatSkills(body);
 body.drive((view,dt)=>mode==='grounded'?{...skills.command(view,standIntent(),dt),handPoses:{left:'fist',right:'fist'}}:
  {posture:{},pushes:[],stance:null,handPoses:{left:'fist',right:'fist'}});
 try{s.step(mode==='grounded'?2*hz:2);if(mode==='free')body.setLevel('limp');
 const segment=s.built.segments.get(`hand.${hand}`),point=pointOfToRef(segment,rigidPoints(s.built.spec,segment.spec).get('strike').value,new Vector3()),
  v=new Vector3(),spin=new Vector3(),mass=contactMass(s.built);mass.update();
 const model=mass.along(segment,point.asArray(),[0,0,1]);motionAtToRef(segment,point,v,spin);const before=v.asArray();
 segment.body.applyImpulse(new Vector3(0,0,impulse),point);s.step(hz/120);
 motionAtToRef(segment,point,v,spin);const after=v.asArray();
 return {mode,hand,impulse,hz,revision:s.world.physics.revision,model,before,after,assists:{force:body.assist.meter.force,moment:body.assist.meter.moment},
  floorImpulse:[...s.built.segments.values()].reduce((sum,p)=>sum+s.world.physics.contactsOf(p.body).filter(c=>c.fixed!==null).reduce((a,c)=>a+c.impulse,0),0)};
 }finally{body.dispose();s.dispose();}
}
/** Matched no-pulse controls subtract background motor/gravity motion over the same physical window. */
export async function auditPunchMass({rates=[120,960]}={}){
const rows=[];
for(const hz of rates)for(const mode of ['free','braced','grounded'])for(const hand of ['left','right']){
 const reference=await pulse(mode,hand,0,hz);
 for(const impulse of [.1,1]){const row=await pulse(mode,hand,impulse,hz);const dv=row.after[2]-reference.after[2];rows.push({...row,reference,deltaVelocity:dv,measuredWindowMass:dv>0?impulse/dv:null});}
}
return {harness:{kind:'Node Warrior impulse-response stand',engine:DEFAULT_ENGINE,revision:rows[0].revision,balance:0},windowSeconds:1/120,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const record=await auditPunchMass();writeFileSync(process.argv[2]??'docs/reference/punch-mass-audit.json',JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify(record.rows.map(r=>({mode:r.mode,hand:r.hand,hz:r.hz,impulse:r.impulse,model:r.model,measured:r.measuredWindowMass}))));
}
