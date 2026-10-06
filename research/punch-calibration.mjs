import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { coreStand } from '../tests/harness/core-stand.mjs';
import { modelSpec } from '../src/core/human/spec.ts';
import { createBody, SERVO_SECONDS } from '../src/core/body.ts';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { GUARD_ACTION } from '../src/core/mind/intent.ts';
import { combatSkills } from '../src/core/skills/combat.ts';
import { ATTACK_PATH } from '../src/core/skills/attack-path.ts';
import { motionAtToRef, pointOfToRef } from '../src/core/control/support.ts';
import { rigidPoints } from '../src/core/build/rigid.ts';
import { contactMass } from '../src/core/build/contact-mass.ts';
import { combatFingerprint } from './arena-combat.mjs';
import { punchPad } from './punch-pad.mjs';

/** Maximum-effort dominant fists, 29 untrained men, padded fixed plate; Adamec Table 3. */
export const HUMAN_PUNCH = Object.freeze({source:'https://epub.ub.uni-muenchen.de/76042/1/76042.pdf',
  speed:8, speedSD:1.2, impulse:22.84, impulseSD:5.73, peakForce:1665, peakForceSD:401,
  duration:.027, durationSD:.005, effectiveMass:2.93, effectiveMassSD:.81,
  speedDistance:.1, samplingHz:10000, cameraHz:2000});

/** A driven pre-contact trace's most recent forward traversal of the stated distance. */
export function approachSpeed(history, distance = HUMAN_PUNCH.speedDistance) {
  if (!(distance>0) || !Number.isFinite(distance)) throw new Error('invalid approach distance');
  const end = history.at(-1);
  if (!end) return null;
  const start = end.point[2]-distance;
  for (let i=history.length-2;i>=0;i--) {
    const a=history[i],b=history[i+1];
    if (a.point[2]<=start && b.point[2]>start) {
      const time=a.time+(b.time-a.time)*(start-a.point[2])/(b.point[2]-a.point[2]);
      return distance/(end.time-time);
    }
  }
  return null;
}

/** The real unassisted Warrior executor, with a detached target and an independent impulse sensor. */
export async function punchStand({hand='right',family='straight',hz=120,seconds=6,ahead=.6,height=1.63,
  contactSpeed=5,armExtension=0,mode='hit',pad={},paths={},execution,matchedFeedback=false} = {}) {
  if (!['left','right'].includes(hand) || !['straight','cross'].includes(family) || !['hit','miss'].includes(mode)
    || ![120,240,480,960,1920].includes(hz) || ![seconds,ahead,height,contactSpeed,armExtension].every(Number.isFinite)
    || seconds<=2 || ahead<=0 || contactSpeed<=0 || armExtension<0 || armExtension>1) throw new Error('invalid punch calibration');
  const config={hand,family,hz,seconds,ahead,height,contactSpeed,armExtension,mode,pad,paths,execution,matchedFeedback};
  const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE,hz});
  let sensor;
  const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,handFeedback:true,
    ...(matchedFeedback?{contactIdentity:other=>other===sensor?.body?{kind:'object',id:'punch-pad'}:other?null:{kind:'world'},
      materialContacts:h=>(sensor?.state.materialContacts??[]).filter(c=>c.segment===`hand.${h}`).map(c=>({target:{kind:'object',id:'punch-pad'},
        point:c.point,normal:[0,0,1],impulse:c.force*s.world.dt}))}: {})});
  const skills=combatSkills(body,{...ATTACK_PATH,...paths,contactSpeed},null,undefined,false,undefined,undefined,false,execution);
  const target=[hand==='right'?.1:-.1,height,ahead];
  sensor=punchPad(s.world,[target[0]+(mode==='miss'?1:0),target[1],target[2]],pad);
  const limb=s.built.segments.get(`hand.${hand}`),knuckles=rigidPoints(s.built.spec,limb.spec).get(execution?.physicalFists?'strike':'knuckles').value;
  const names=new Map([...s.built.segments.values()].map(segment=>[segment.body,segment.spec.name]));
  const masses=contactMass(s.built),point=new Vector3(),velocity=new Vector3(),spin=new Vector3();
  const state={history:[],samples:[],impacts:[],active:null,phase:'guard',launch:0,launchTime:0,previousPhase:null,
    witness:null,fell:false,floorContacts:0,unassignedImpulse:0,preContactTorquePeaks:{},seenLaunch:0};
  body.drive((view,dt)=>skills.command(view,{move:null,face:0,hands:{left:GUARD_ACTION,right:GUARD_ACTION},
    combat:view.time>=2?{hand,target,family,armExtension,targetId:'punch-pad'}:null},dt));
  const before=s.world.beforeStep(()=>{
    pointOfToRef(limb,knuckles,point);motionAtToRef(limb,point,velocity,spin);
    const phase=skills.report.strike.phase;
    if(phase==='swing'&&state.previousPhase!=='swing'){state.launch++;state.launchTime=s.world.time;}
    state.previousPhase=phase;state.phase=phase;
    state.history.push({time:s.world.time,point:point.asArray()});
    state.witness={point:point.asArray(),velocity:velocity.asArray(),speed:velocity.length(),
      relativeSpeed:velocity.subtract(body.view.stance.velocity).length(),
      motorTorques:Array.from(body.muscles.pulled),
      pose:limb.handPose.applied,angles:structuredClone(body.view.angles),centre:body.view.stance.centre.asArray(),
      centreVelocity:body.view.stance.velocity.asArray(),activation:Array.from(body.muscles.activation),
      bounds:{positive:Array.from(body.muscles.bounds.positive),negative:Array.from(body.muscles.bounds.negative)},
      anchorErrors:[...s.built.joints.values()].filter(j=>[j.parent,j.child].includes(limb)||j.spec.name===`elbow.${hand}`).map(j=>({name:j.spec.name,
        error:Vector3.Distance(pointOfToRef(j.parent,j.spec.centre.value,new Vector3()),pointOfToRef(j.child,j.spec.centre.value,new Vector3()))}))};
    sensor.prepare();
    for(const segment of s.built.segments.values())sensor.load(segment);
  });
  const after=s.world.afterStep(()=>{
    const reading=sensor.read(),segments=[...new Set([...reading.contacts.map(c=>names.get(c.other)??'other'),
      ...reading.materialContacts.map(c=>c.segment)])];
    const sample={...reading,contacts:segments,phase:state.phase,launch:state.launch};
    state.samples.push(sample);state.fell ||= body.down;
    if(['head','upperTrunk','middleTrunk','lowerTrunk'].some(n=>s.world.physics.contactsOf(s.built.segments.get(n).body)
      .some(c=>c.fixed===s.floor.id&&c.impulse>0)))state.floorContacts++;
    if(state.active && (state.launch!==state.active.launch || s.world.time-state.active.lastPush>.025)) {
      state.impacts.push(state.active);state.active=null;
    }
    const pushed=reading.impulse>sensor.config.quietImpulse;
    if(pushed&&!state.active&&state.phase==='swing'&&state.launch!==state.seenLaunch) {
      const contact=reading.contacts.find(c=>c.other===limb.body),material=reading.materialContacts.find(c=>c.segment===limb.spec.name);
      masses.update();
      state.active={launch:state.launch,time:s.world.time,lastPush:s.world.time,impulse:0,peakStepForce:0,
        positiveSteps:0,contacts:[],preImpact:structuredClone(state.witness),
        last10cmSpeed:approachSpeed(state.history.filter(sample=>sample.time>=state.launchTime)),
        freeJointMass:contact?masses.along(limb,contact.point,contact.normal):material?masses.along(limb,material.point,[0,0,1]):null,samples:[],
        contactGeometry:{point:contact?.point??material?.point??null,normal:contact?.normal??[0,0,1],
          offset:Vector3.Distance(point,new Vector3(...(contact?.point??material?.point??point.asArray())))},truncated:false};
      state.seenLaunch=state.launch;
    }
    if(state.active) {
      state.active.samples.push(sample);
      if(pushed){state.active.lastPush=s.world.time;state.active.positiveSteps++;}
      state.active.impulse+=reading.impulse;
      state.active.peakStepForce=Math.max(state.active.peakStepForce,reading.force);
      for(const name of segments)if(!state.active.contacts.includes(name))state.active.contacts.push(name);
    } else if(Math.abs(reading.impulse)>sensor.config.quietImpulse)state.unassignedImpulse+=Math.abs(reading.impulse);
    if(state.phase==='swing'&&!state.active&&!pushed&&state.launch!==state.seenLaunch)body.muscles.channels.forEach((c,i)=>{
      state.preContactTorquePeaks[c.name]=Math.max(state.preContactTorquePeaks[c.name]??0,Math.abs(body.muscles.pulled[i]));
    });
  });
  return {...s,body,skills,sensor,state,config,target,
    reading() {
      const impacts=[...state.impacts,...(state.active?[{...state.active,truncated:true}]:[])].map(event=>{
        const duration=event.lastPush-event.time+s.world.dt;
        return {...structuredClone(event),duration,meanForce:event.impulse/duration,
          effectiveMass:event.last10cmSpeed?event.impulse/event.last10cmSpeed:null,
          eligible:!event.truncated&&event.contacts.length>0&&event.contacts.every(n=>n===`hand.${hand}`),
          waveform120:coarseForces(event.samples,hz,120)};
      });
      const maximumCompression=Math.max(0,...state.samples.map(s=>s.displacement)),
        maximumFaceCompression=Math.max(0,...state.samples.flatMap(s=>s.materialContacts.map(c=>c.penetration)));
      const clean=impacts.filter(e=>e.eligible&&e.last10cmSpeed!==null),faults=[];
      if(state.fell)faults.push('fall');if(state.floorContacts)faults.push('trunk-floor contact');
      if(skills.report.strike.pointCycle.failed)faults.push('failed strike/return cycle');
      if(clean.length<3)faults.push('fewer than three complete measured hand impacts');
      if(skills.report.strike.pointCycle.returned[hand]<3)faults.push('fewer than three verified returns');
      if(maximumCompression>sensor.config.size[2]||maximumFaceCompression>sensor.config.size[2])faults.push('pad stroke exceeded');
      if(body.assist.meter.force||body.assist.meter.moment)faults.push('assistance');
      const best=clean.length>=3?clean.slice(0,3).reduce((a,b)=>a.impulse>=b.impulse?a:b):null;
      return {config,target,harness:{kind:'Node unpinned core stand',engine:DEFAULT_ENGINE,revision:s.world.physics.revision,
        hz,actuation:s.world.actuation,model:'workshop-fighter',held:'empty',balance:0},
        apparatus:{...sensor.config,damping:sensor.damping,normal:[0,0,1],gravity:false,rotation:'locked',translation:'normal only'},
        human:HUMAN_PUNCH,impacts,samples:structuredClone(state.samples),fell:state.fell,floorContacts:state.floorContacts,
        cycles:structuredClone(skills.report.strike.pointCycle),head:body.view.head.asArray(),
        maximumCompression,maximumFaceCompression,qualification:{accepted:faults.length===0,faults},
        bestOfThree:best?{time:best.time,speed:best.last10cmSpeed,impulse:best.impulse,peakStepForce:best.peakStepForce,effectiveMass:best.effectiveMass}:null,
        unassignedImpulse:state.unassignedImpulse,preContactTorquePeaks:state.preContactTorquePeaks,
        impactResponse:structuredClone(skills.state.impacts),
        assist:{force:body.assist.meter.force,moment:body.assist.meter.moment}};
    },
    dispose(){before.dispose();after.dispose();sensor.dispose();body.dispose();s.dispose();},
  };
}

/** Average fine-step impulses in clock-aligned coarse bins; a fine spike is not a coarse force. */
export function coarseForces(samples,hz,coarseHz=120) {
  if (!(hz>=coarseHz) || !Number.isInteger(hz/coarseHz)) throw new Error('force rates need integer nesting');
  const bins=new Map();
  for(const sample of samples){const step=Math.round(sample.time*hz),bin=Math.floor((step-1)/(hz/coarseHz));
    bins.set(bin,(bins.get(bin)??0)+sample.impulse);}
  return [...bins].map(([bin,impulse])=>({time:(bin+1)/coarseHz,impulse,force:impulse*coarseHz}));
}

export async function punchCalibration(config={}) {
  const s=await punchStand(config);
  try{s.step(Math.round(s.config.seconds*s.world.hz));return s.reading();}finally{s.dispose();}
}

/** Complete retained profiles include failed/missed punches; optional requests change no muscle strength. */
export async function calibratePunches({seconds=6}={}) {
  const fingerprint=combatFingerprint(),rows=[];
  const profiles=[{name:'reference',contactSpeed:5,armExtension:0},
    {name:'extended',contactSpeed:5,armExtension:1},
    {name:'faster-extended',contactSpeed:8,armExtension:1}];
  for(const profile of profiles)for(const hand of ['left','right']) {
    const result=await punchCalibration({hand,seconds,contactSpeed:profile.contactSpeed,armExtension:profile.armExtension});
    rows.push({profile:profile.name,result});
    process.stderr.write(`${profile.name}/${hand}/120: ${result.impacts.length} impacts, falls ${result.fell}\n`);
  }
  for(const hz of [480,960])for(const profile of [profiles[0],profiles[2]]) {
    const result=await punchCalibration({hand:'right',seconds,hz,contactSpeed:profile.contactSpeed,armExtension:profile.armExtension});
    rows.push({profile:profile.name,result});process.stderr.write(`${profile.name}/right/${hz}: ${result.impacts.length} impacts\n`);
  }
  for(const stiffness of [10000,80000]) {
    const result=await punchCalibration({seconds,contactSpeed:8,armExtension:1,pad:{stiffness}});
    rows.push({profile:'faster-extended/pad-sensitivity',result});process.stderr.write(`pad ${stiffness}: ${result.impacts.length} impacts\n`);
  }
  for(const profile of profiles)for(const hand of ['left','right']) {
    const result=await punchCalibration({hand,seconds,contactSpeed:profile.contactSpeed,armExtension:profile.armExtension,pad:{face:'compliant'}});
    rows.push({profile:profile.name,result});process.stderr.write(`compliant ${profile.name}/${hand}/120: ${result.impacts.length} impacts\n`);
  }
  for(const hz of [480,960,1920])for(const profile of [profiles[0],profiles[2]]) {
    const result=await punchCalibration({seconds,hz,contactSpeed:profile.contactSpeed,armExtension:profile.armExtension,pad:{face:'compliant'}});
    rows.push({profile:profile.name,result});process.stderr.write(`compliant ${profile.name}/right/${hz}: ${result.impacts.length} impacts\n`);
  }
  for(const faceStiffness of [5000,20000]) {
    const result=await punchCalibration({seconds,hz:960,contactSpeed:8,armExtension:1,pad:{face:'compliant',faceStiffness}});
    rows.push({profile:'faster-extended/face-sensitivity',result});process.stderr.write(`face ${faceStiffness}: ${result.impacts.length} impacts\n`);
  }
  if(combatFingerprint()!==fingerprint)throw new Error('source changed during punch calibration');
  return {version:1,fingerprint,profiles,rows};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let config,output;
  if(process.argv[2]?.startsWith('{')){config=JSON.parse(process.argv[2]);output=process.argv[3];}
  else {
    const {values}=parseArgs({options:{suite:{type:'boolean'},output:{type:'string'},hand:{type:'string',default:'right'},
      hz:{type:'string',default:'120'},seconds:{type:'string',default:'6'},speed:{type:'string',default:'5'},
      extension:{type:'string',default:'0'},face:{type:'string',default:'rigid'},mode:{type:'string',default:'hit'},
      'face-stiffness':{type:'string',default:'10000'},'pad-stiffness':{type:'string',default:'40000'}}});
    config={suite:values.suite,hand:values.hand,hz:Number(values.hz),seconds:Number(values.seconds),contactSpeed:Number(values.speed),
      armExtension:Number(values.extension),mode:values.mode,pad:{face:values.face,faceStiffness:Number(values['face-stiffness']),stiffness:Number(values['pad-stiffness'])}};
    output=values.output;
  }
  const record=config.suite?await calibratePunches(config):await punchCalibration(config);
  if(output)writeFileSync(output,output.endsWith('.gz')?gzipSync(JSON.stringify(record)):JSON.stringify(record,null,2));
  else console.log(JSON.stringify(record));
}
